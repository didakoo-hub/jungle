import { PROTOCOL_V } from "./constants.js";
import { signature, signerOf, digest, MATCH_DOMAIN } from "./signatures.js";
import { verifyDelegation } from "./delegation.js";
import { sameAddress } from "../game/wallet.js";
import { randomSeed, xorSeeds } from "../game/random.js";
import { LOBBY_PARTITION } from "./lobby.js";
import {
    TYPES_COMMIT, TYPES_MATCH, TYPES_REVEAL, TYPES_READY,
    commitOf, commitGoesBack, newMatch, acceptableAgreement, sort, sidesFromSeed,
    partitionOf,
} from "./messages.js";

export const WAIT_MS = 40_000;

export const COMMIT_WAIT_MS = 20_000;

export const COMMIT_DRIFT_S = 60;

export const REPEAT_MS = 2000;

const STEP = { commit: 1, match: 2, reveal: 3, ready: 4 };

const QUEUE_READY = 5;

const ARRIVED_CAP = 32;

const seconds = (ms) => Math.floor(ms / 1000);

export function createEncounter({
    transport, me, delegation = null, opponent, category,
    verifySession = null, onAgreement = null, reveal = true, invite = null,
    partitionCommit = LOBBY_PARTITION,
    seed = randomSeed(), now = Date.now, v = PROTOCOL_V,
    waitingMs = WAIT_MS, waitingCommitMs = Math.min(waitingMs, COMMIT_WAIT_MS), repeatMs = REPEAT_MS,
    driftS = COMMIT_DRIFT_S,
}) {
    const arrived = [];
    const senders = new WeakMap();
    const excludedAll = new Set();
    const wakeMe = new Set();
    const closings = [];
    const fromRepeat = new Map();
    let heartbeat = null;
    let finished = false;
    let readyRepeating = false;
    let afterReady = null;
    const inWaiting = new Set();

    const key = (from) => String(from ?? "").toLowerCase();
    const exclude = (from) => { if (from) excludedAll.add(key(from)); };
    const excluded = (envelope) => excludedAll.has(key(senders.get(envelope)));

    function enqueue(envelope, from) {
        if (excludedAll.has(key(from))) return;
        senders.set(envelope, from);
        const its = STEP[envelope?.type] ?? 0;
        for (const step of [...fromRepeat.keys()]) {
            if (step < its) fromRepeat.delete(step);
        }
        arrived.push(envelope);
        const same = arrived.filter((b) => b?.type === envelope?.type);
        if (same.length > ARRIVED_CAP) arrived.splice(arrived.indexOf(same[0]), 1);
        for (const f of wakeMe) f();
        if (same.length > 1) nudge();
    }

    let lastSpit = 0;

    function spits() {
        lastSpit = now();
        for (const { partition, envelope } of fromRepeat.values()) {
            transport.publish(partition, envelope).catch(() => {});
        }
    }

    function nudge() {
        if (now() - lastSpit >= repeatMs) spits();
    }

    function transmit(partition, envelope) {
        fromRepeat.set(STEP[envelope.type], { partition, envelope });
        spits();
        heartbeat ??= setInterval(spits, repeatMs);
    }

    function awaitFor(worth, what, restMs = waitingMs, totalMs = waitingMs) {
        const already = arrived.find(worth);
        if (already) return Promise.resolve(already);
        return new Promise((ok, ko) => {
            const deadline = setTimeout(() => {
                wakeMe.delete(look);
                inWaiting.delete(letGo);
                ko(Object.assign(new Error(`no ${what} within ${totalMs / 1000}s`), { code: "WAITING", step: what }));
            }, Math.max(0, restMs));
            const look = () => {
                const found = arrived.find(worth);
                if (!found) return;
                clearTimeout(deadline);
                wakeMe.delete(look);
                inWaiting.delete(letGo);
                ok(found);
            };
            const letGo = (error) => {
                clearTimeout(deadline);
                wakeMe.delete(look);
                ko(Object.assign(error, { step: what }));
            };
            wakeMe.add(look);
            inWaiting.add(letGo);
        });
    }

    function swap(partition, envelope, worth, what) {
        transmit(partition, envelope);
        return awaitFor(worth, what);
    }

    const my = (types, data, domain) => ({ data, signature: signature(me.key, types, data, domain) });
    const fromHim = (types, envelope, session, domain) => {
        const who = signerOf(types, envelope?.data, envelope?.signature, domain);
        return who && sameAddress(who, session);
    };
    const judged = (worth) => {
        const verdicts = new WeakMap();
        return (b) => {
            if (!b || typeof b !== "object") return false;
            if (!verdicts.has(b)) verdicts.set(b, !!worth(b));
            return verdicts.get(b);
        };
    };

    return {
        cancel(reason = "opponent left", code = "EXIT") {
            for (const letGo of [...inWaiting]) {
                inWaiting.delete(letGo);
                letGo(Object.assign(new Error(reason), { code }));
            }
        },

        async close() {
            finished = true;
            if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
            fromRepeat.clear();
            afterReady?.();
            for (const f of closings.splice(0)) await f?.();
        },

        // My ready keeps going for its QUEUE_READY rounds: the other may have lost it.
        async closeAfterReady() {
            if (readyRepeating && !finished) await new Promise((r) => { afterReady = r; });
            await this.close();
        },

        async start() {
            closings.push(await transport.subscribe(partitionCommit, ({ from, envelope }) => {
                if (sameAddress(from, me.address)) return;
                if (envelope?.type === "commit" && sameAddress(envelope?.data?.to, me.wallet)) enqueue(envelope, from);
            }));

            const myCommit = {
                v, from: me.wallet, to: opponent,
                commit: commitOf(seed), t: seconds(now()),
            };
            const commitSide = (b) => {
                const from = senders.get(b);
                if (verifySession) {
                    const session = signerOf(TYPES_COMMIT, b.data, b.signature);
                    if (!session || !sameAddress(session, from)) return null;
                    return { wallet: opponent, session: session, delegation: null };
                }
                const sd = b.signedDelegation;
                if (!sd) return null;
                if (!sameAddress(sd?.delegation?.session, from)) return null;
                if (!sameAddress(sd?.delegation?.wallet, opponent)) return null;
                if (!verifyDelegation(sd.delegation, sd?.signature, now()).ok) return null;
                if (!fromHim(TYPES_COMMIT, b, sd.delegation.session)) return null;
                return { wallet: opponent, session: sd.delegation.session, delegation: sd };
            };
            const sidesOf = new WeakMap();
            const worthCommit = judged((b) => {
                if (b.type !== "commit" || !sameAddress(b.data?.from, opponent) || b.data?.v !== v) return false;
                const l = commitSide(b);
                if (l) sidesOf.set(b, l);
                else exclude(senders.get(b));
                return !!l;
            });
            transmit(partitionCommit, {
                type: "commit", ...my(TYPES_COMMIT, myCommit),
                ...(delegation ? { signedDelegation: delegation } : {}),
                ...(invite ? { invite: invite } : {}),
            });
            const end = now() + waitingCommitMs;
            let its, side;
            for (;;) {
                its = await awaitFor((b) => !excluded(b) && worthCommit(b), "commit", end - now(), waitingCommitMs);
                side = sidesOf.get(its);
                if (side.delegation || await verifySession(opponent, side.session)) break;
                exclude(senders.get(its));
            }
            if (String(its.data.commit).toLowerCase() === String(myCommit.commit).toLowerCase()) {
                throw Object.assign(new Error("their commit is a copy of mine"), { code: "COMMIT", step: "commit" });
            }
            if (!Number.isInteger(its.data.t) || Math.abs(its.data.t - seconds(now())) > driftS) {
                throw Object.assign(new Error("their commit clock is off"), { code: "COMMIT", step: "commit" });
            }

            const [first] = sort(me.wallet, opponent);
            const agreement = newMatch({
                v, a: me.wallet, b: opponent,
                commitA: myCommit.commit, commitB: its.data.commit,
                category: category,
                turnS: 15, penaltyS: 5, graceS: 1,
                t: sameAddress(first, me.wallet) ? myCommit.t : its.data.t,
            });
            const acceptable = acceptableAgreement(agreement, v, category);
            if (!acceptable.ok) throw Object.assign(new Error(acceptable.reason), { code: "AGREEMENT" });

            const partition = partitionOf(agreement.gameId);
            closings.push(await transport.subscribe(partition, ({ from, envelope }) => {
                if (!sameAddress(from, side.session)) return;
                if (envelope?.data?.gameId === agreement.gameId) enqueue(envelope, from);
            }));
            const amA = sameAddress(agreement.a, me.wallet);
            const mineEnvelope = my(TYPES_MATCH, agreement, MATCH_DOMAIN);
            const mineSignature = mineEnvelope.signature;
            onAgreement?.({
                match: agreement, side, mySeed: seed,
                signatures: amA ? { a: mineSignature, b: null } : { a: null, b: mineSignature },
            });
            const itsAgreement = await swap(
                partition,
                { type: "match", ...mineEnvelope },
                judged((b) => b.type === "match" && fromHim(TYPES_MATCH, b, side.session, MATCH_DOMAIN)),
                "match",
            );
            if (digest(TYPES_MATCH, itsAgreement.data, MATCH_DOMAIN)
                !== digest(TYPES_MATCH, agreement, MATCH_DOMAIN)) {
                throw Object.assign(new Error("the two agreements differ"), { code: "AGREEMENT" });
            }
            const signatures = amA
                ? { a: mineSignature, b: itsAgreement.signature }
                : { a: itsAgreement.signature, b: mineSignature };
            onAgreement?.({ match: agreement, side, signatures, mySeed: seed });

            let seedShared = null, seeds = null;
            if (reveal) {
                const myReveal = { gameId: agreement.gameId, seed: seed, t: seconds(now()) };
                const itsReveal = await swap(
                    partition,
                    { type: "reveal", ...my(TYPES_REVEAL, myReveal) },
                    judged((b) => b.type === "reveal" && fromHim(TYPES_REVEAL, b, side.session)),
                    "reveal",
                );
                if (!commitGoesBack(itsReveal.data.seed, its.data.commit)) {
                    throw Object.assign(new Error("the revealed seed does not match the commit"), { code: "COMMIT" });
                }
                seedShared = xorSeeds(seed, itsReveal.data.seed);
                seeds = amA ? { a: seed, b: itsReveal.data.seed } : { a: itsReveal.data.seed, b: seed };
            }

            const myReady = { gameId: agreement.gameId, t: seconds(now()) };
            await swap(
                partition,
                { type: "ready", ...my(TYPES_READY, myReady) },
                judged((b) => b.type === "ready" && fromHim(TYPES_READY, b, side.session)),
                "ready",
            );

            let rounds = QUEUE_READY;
            readyRepeating = true;
            const queue = setInterval(() => {
                if (finished || rounds-- <= 0) {
                    clearInterval(queue);
                    readyRepeating = false;
                    afterReady?.();
                    return;
                }
                spits();
            }, repeatMs);
            closings.push(() => clearInterval(queue));

            return {
                match: agreement,
                seed: seedShared,
                seeds,
                mySeed: seed,
                signatures,
                side,
                sides: seedShared ? sidesFromSeed(seedShared, agreement.a, agreement.b) : null,
                partition,
            };
        },
    };
}
