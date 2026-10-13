import { PROTOCOL_V } from "./constants.js";
import { sameAddress } from "../game/wallet.js";
import {
    readsMatches, matchOf, seatOf, seatsOf, hasThePass, calldataStartup, calldataForfeit, STARTUP_GAS,
    STATUS, CHAIN_REVEAL_S, CHAIN_AGREEMENT_S, nodeWords, reverted, awaitAnywhere, awaitBumping, clockFarOff, headStalled,
} from "./chain.js";
import { END_REASON, commitGoesBack } from "./messages.js";
import { xorSeeds } from "../game/random.js";

const KEY = "pendingStarts";

export const SUSPENDED_CAP = 50;

export const SUSPENDED_HEARTBEAT_MS = 10_000;
export const SUSPENDED_REPEAT_MS = 60_000;
export const STARTUP_ATTEMPTS = 3;
export const RECEIPT_WAIT_MS = 20_000;
export const FORFEIT_LOSER_DELAY_S = 40;

export const NOT_STARTED = "The game did not start on the chain";
export const PASS_GONE = "You no longer hold the pass: the game cannot start.";
export const PASS_LOST = "You no longer hold the pass: the stake is lost.";
export const REVEALED_LATE = "The stake is lost: this seed was not revealed in time.";
const REFUSED = "The contract refused the transaction.";
const WITHOUT_SEATS = "a seat is missing.";

// The answer to the opponent's first seed has its own mark per revelation: the mark of a seed of
// mine that fell does not hold it back.
export function seedKind(g, my) {
    return g?.status === STATUS.REVEALING && g.revealed !== my ? `seed:${g.lastAt}` : "seed";
}

const UINT256_MAX = (1n << 256n) - 1n;

function readable(entry) {
    try {
        const id = BigInt(entry?.match?.gameId);
        return id >= 0n && id <= UINT256_MAX;
    } catch {
        return false;
    }
}

function read() {
    try {
        const entry = JSON.parse(localStorage.getItem(KEY) ?? "null");
        return entry?.v === PROTOCOL_V && Array.isArray(entry.entries) ? entry.entries.filter(readable) : [];
    } catch (e) {
        console.warn("pending starts unreadable, discarded", e);
        return [];
    }
}

function write(entries) {
    if (!entries.length) return localStorage.removeItem(KEY);
    localStorage.setItem(KEY, JSON.stringify({ v: PROTOCOL_V, entries: entries.slice(-SUSPENDED_CAP) }));
}

export function rememberAgreement({ match, side, session, signatures = null, mySeed = null, revealing = false, started = false }) {
    const before = read();
    const sent = before.find((v) => v?.match?.gameId === match.gameId)?.sent ?? {};
    const entries = before.filter((v) => v?.match?.gameId !== match.gameId);
    entries.push({ match, side, session, signatures, mySeed, revealing, started, sent });
    write(entries);
}

function claimSend(gameId, kind, repeatMs) {
    const entries = read();
    const entry = entries.find((v) => v?.match?.gameId === gameId);
    const rightNow = Date.now();
    if (!entry) return false;
    if (rightNow - (entry.sent?.[kind] ?? 0) < repeatMs) return false;
    entry.sent = { ...entry.sent, [kind]: rightNow };
    write(entries);
    return true;
}

function releaseSend(gameId, kind) {
    const entries = read();
    const entry = entries.find((v) => v?.match?.gameId === gameId);
    if (!entry?.sent?.[kind]) return;
    const { [kind]: _, ...rest } = entry.sent;
    entry.sent = rest;
    write(entries);
}

export function forfeitDue(g, my, timeBlock, revelationS = CHAIN_REVEAL_S) {
    const delay = g.revealed === my ? 0 : FORFEIT_LOSER_DELAY_S;
    return timeBlock !== null && timeBlock > g.lastAt + revelationS + delay;
}

export function seedGoesBack(entry, g, wallet) {
    if (!entry?.mySeed) return true;
    const its = sameAddress(entry.match.a, wallet) ? entry.match.commitB : entry.match.commitA;
    return commitGoesBack(xorSeeds(g.seed, entry.mySeed), its);
}

export function agreementsInSuspended(session) {
    const lives = read().filter((v) => v?.match?.gameId && v?.side?.session);
    return session ? lives.filter((v) => sameAddress(v.session, session)) : lives;
}

export function forgetAgreement(gameId) {
    write(read().filter((v) => v?.match?.gameId !== gameId));
}

export function forgetAgreements() {
    localStorage.removeItem(KEY);
}

export function agreementAlive(entry, rightNowS, { agreementS = CHAIN_AGREEMENT_S, revelationS = CHAIN_REVEAL_S } = {}) {
    if (entry?.revealing === true || entry?.started === true) return true;
    const t = entry?.match?.t;
    return Number.isFinite(t) && rightNowS <= t + agreementS + revelationS;
}

export function agreementsAlive(session, rightNow = Date.now(), window) {
    const rightNowS = Math.floor(rightNow / 1000);
    return agreementsInSuspended(session).filter((v) => agreementAlive(v, rightNowS, window));
}

export function createSentinel({
    chain, me,
    onStarted = () => {}, onClosed = () => {}, onError = () => {},
    excluded = () => null, active = () => true,
    heartbeatMs = SUSPENDED_HEARTBEAT_MS, repeatMs = SUSPENDED_REPEAT_MS, heartbeatChainMs = 2000,
    revelationS = CHAIN_REVEAL_S, agreementS = CHAIN_AGREEMENT_S, waitingReceiptMs = RECEIPT_WAIT_MS,
    now = Date.now,
}) {
    let patrolWork = null, patrolling = false;
    const forfeitsForPass = new Set();
    const forfeitPayouts = new Map();
    const announced = new Set();

    const sideOf = (match) => (sameAddress(match.a, me.wallet) ? 1 : 2);

    async function check() {
        if (patrolling || !chain || !active()) return false;
        patrolling = true;
        let incoming = false;
        try {
            const entries = agreementsInSuspended(me.address).filter((v) => v.match.gameId !== excluded());
            if (!entries.length) return false;
            const haveRead = await readsMatches(chain.reads, entries.map((v) => v.match.gameId), chain.address);
            if (!haveRead) return false;
            if (clockFarOff(haveRead.timeBlock, now()) || headStalled(chain.reads, haveRead.timeBlock, now())) { chain.reads.discard?.(); return false; }
            for (const [i, entry] of entries.entries()) {
                let g = haveRead.matches[i];
                if (!g) continue;
                if (g.status === STATUS.NO) {
                    if (haveRead.timeBlock !== null && haveRead.timeBlock > entry.match.t + agreementS
                        && await confirmed(entry.match.gameId, STATUS.NO)) {
                        forgetAgreement(entry.match.gameId);
                    }
                    continue;
                }
                if (g.status === STATUS.REVEALING) {
                    const started = await startedElsewhere(entry);
                    if (!started) {
                        if (!entry.revealing) rememberAgreement({ ...entry, revealing: true });
                        await reply(entry, g, haveRead.timeBlock);
                        continue;
                    }
                    g = started;
                }
                if (g.status === STATUS.IN_PROGRESS && !seedGoesBack(entry, g, me.wallet)) {
                    chain.reads.discard?.();
                    continue;
                }
                if (g.status === STATUS.IN_PROGRESS) {
                    incoming = true;
                    // Alive until FINISHED: a page that never caches the game must not drop the key.
                    if (!entry.started) rememberAgreement({ ...entry, started: true });
                    if (announced.has(entry.match.gameId)) continue;
                    announced.add(entry.match.gameId);
                    await onStarted(entry, g);
                } else {
                    forgetAgreement(entry.match.gameId);
                    onClosed(entry, g);
                }
            }
            return incoming;
        } finally {
            patrolling = false;
        }
    }

    // The answer to its first seed has REVEAL_SECONDS: its mark cannot outlast the wait for
    // the receipt, or a refresh in that wait leaves the revelation without an answer.
    const repeatOf = (kind) => (kind.startsWith("seed:") ? Math.min(repeatMs, waitingReceiptMs) : repeatMs);

    async function reply(entry, g, timeBlock) {
        const my = sideOf(entry.match);
        const late = timeBlock !== null && timeBlock > g.lastAt + revelationS;
        if (late && !forfeitDue(g, my, timeBlock, revelationS)) return;
        const fromDispatch = late ? "forfeit" : (entry.mySeed ? seedKind(g, my) : null);
        if (!fromDispatch) return;
        if (!claimSend(entry.match.gameId, fromDispatch, repeatOf(fromDispatch))) return;
        if (fromDispatch !== "forfeit") await dispatchSeed(entry, fromDispatch);
        else await dispatchForfeit(entry.match, g.revealed === my && await hasThePass(chain.reads, entry.side.wallet) === false);
    }

    // Half the wait on the active endpoint, half on the others: the seed has REVEAL_SECONDS.
    const landed = (hash) => awaitAnywhere(chain.reads, chain.transmitter, hash, waitingReceiptMs / 2);
    const landedBumping = (hash) => awaitBumping(chain.reads, chain.transmitter, hash, waitingReceiptMs);

    // NO on the active endpoint alone may be a node behind: another endpoint that answers must
    // agree before the agreement is forgotten.
    async function confirmed(gameId, status) {
        const another = chain.reads.elsewhere?.();
        if (!another) return true;
        const g = await matchOf(another, gameId, chain.address);
        return !g || g.status === status;
    }

    // The active endpoint says the match is still to start: another one may see it started.
    async function startedElsewhere(entry) {
        const another = chain.reads.elsewhere?.();
        if (!another) return null;
        const g = await matchOf(another, entry.match.gameId, chain.address);
        if (g?.status !== STATUS.IN_PROGRESS || !seedGoesBack(entry, g, me.wallet)) return null;
        chain.reads.discard?.();
        return g;
    }

    // My seed is inside when the read shows it. "refused" is a revoked seed, false a seed the
    // nodes never took: only the latter is sent again at once.
    async function dispatchSeed(entry, kind = "seed") {
        const my = sideOf(entry.match);
        const inside = (g) => !!g && g.status !== STATUS.NO && !(g.status === STATUS.REVEALING && g.revealed !== my);
        // Before the first seed both seats must be there, with the sessions of the agreement: the
        // contract would refuse the seed, and a Leave of the opponent must not mark it refused.
        const expected = (w) => (sameAddress(w, me.wallet) ? me.address : entry.side.session);
        const seatsMissing = async (reads) => {
            const seats = await seatsOf(reads, [entry.match.a, entry.match.b], chain.address);
            if (!seats) return null;
            return [entry.match.a, entry.match.b].some((w, i) => !seats[i]?.session || !sameAddress(seats[i].session, expected(w)));
        };
        // A node behind the head may not have seen the opponent's Open: another endpoint that shows
        // both seats discards the active one.
        const seatsGone = async (g) => {
            if (g && g.status !== STATUS.NO) return false;
            if (await seatsMissing(chain.reads) !== true) return false;
            const another = chain.reads.elsewhere?.();
            if (!another || await seatsMissing(another) !== false) return true;
            chain.reads.discard?.();
            return false;
        };
        // Only a zero that was read is a lost pass: an unreadable one is left to the contract.
        const passGone = async () =>
            await hasThePass(chain.reads, me.wallet) === false
            && await hasThePass(chain.reads.elsewhere?.() ?? chain.reads, me.wallet) === false;
        // A stuck active endpoint hides a seed that is inside: any other endpoint may show it.
        const insideOnAnother = async () => {
            const readers = chain.reads.others?.() ?? [chain.reads.elsewhere?.()].filter(Boolean);
            const reads = await Promise.all(readers.map((r) => matchOf(r, entry.match.gameId, chain.address)));
            return reads.some(inside);
        };
        // After a receipt the read may lag a few blocks behind it, but not past the last useful resend.
        let windowEnd = Infinity;
        const readsInside = async () => {
            const end = Date.now() + Math.max(waitingReceiptMs / 8, Math.min(waitingReceiptMs / 4, windowEnd - waitingReceiptMs / 4 - Date.now()));
            for (;;) {
                if (inside(await matchOf(chain.reads, entry.match.gameId, chain.address))) return true;
                if (Date.now() >= end) return false;
                await new Promise((r) => setTimeout(r, heartbeatChainMs));
            }
        };
        let why = "not included.";
        for (let n = 1; n <= STARTUP_ATTEMPTS; n++) {
            try {
                const g = await matchOf(chain.reads, entry.match.gameId, chain.address);
                if (inside(g)) return true;
                if (g?.status === STATUS.REVEALING) windowEnd = Date.now() + (g.lastAt + revelationS) * 1000 - now();
                if (await passGone()) {
                    const lost = g?.status === STATUS.REVEALING && g.revealed !== my;
                    releaseSend(entry.match.gameId, kind);
                    onError(Object.assign(new Error(lost ? PASS_LOST : PASS_GONE), { code: lost ? "PASS_LOST" : "PASS" }));
                    return false;
                }
                if (await seatsGone(g)) {
                    why = WITHOUT_SEATS;
                    break;
                }
                const hash = await chain.transmitter.send(
                    calldataStartup(entry.match, entry.signatures?.a, entry.signatures?.b, entry.mySeed),
                    { gasMinimum: STARTUP_GAS, refuseOnRevert: true },
                );
                // The same bytes on another endpoint too: the active one may swallow them.
                chain.transmitter.repeat?.(hash, chain.reads.elsewhere?.());
                const { gone, hash: last } = await landedBumping(hash);
                if (gone === true && (await readsInside() || await insideOnAnother())) return true;
                if (gone === null) chain.transmitter.forget?.(last);
                why = gone === false ? REFUSED : "not included.";
                if (gone === false && inside(await matchOf(chain.reads, entry.match.gameId, chain.address))) break;
                if (gone !== true && await insideOnAnother()) return true;
            } catch (e) {
                why = reverted(e) ? REFUSED : nodeWords(e);
                if (n < STARTUP_ATTEMPTS) await new Promise((r) => setTimeout(r, heartbeatChainMs * n));
            }
        }
        // Inside without a receipt of mine: another tab, or a receipt the nodes lost.
        if (inside(await matchOf(chain.reads, entry.match.gameId, chain.address))) return true;
        // A revoked seed of mine keeps its mark: the next one waits for repeatMs.
        // The answer to its first seed, revoked, keeps nothing: with its seed inside, mine in
        // the clear is worth nothing more, and a revoking estimate sends no byte.
        if (why !== REFUSED || kind !== "seed") releaseSend(entry.match.gameId, kind);
        if (why !== WITHOUT_SEATS) onError(Object.assign(new Error(NOT_STARTED + ": " + why), { code: "STARTUP" }));
        return why === REFUSED ? "refused" : why === WITHOUT_SEATS ? "seats" : false;
    }

    async function dispatchForfeit(match, perPass = false) {
        for (let n = 1; n <= STARTUP_ATTEMPTS; n++) {
            try {
                const g = await matchOf(chain.reads, match.gameId, chain.address);
                if (g && g.status !== STATUS.REVEALING) return;
                const [a, b] = await Promise.all([seatOf(chain.reads, match.a, chain.address), seatOf(chain.reads, match.b, chain.address)]);
                if (a && b) forfeitPayouts.set(match.gameId, a.escrow + b.escrow);
                const hash = await chain.transmitter.send(calldataForfeit(match));
                if (perPass) forfeitsForPass.add(match.gameId);
                const gone = await landed(hash);
                if (gone === true) return;
                if (gone === null) chain.transmitter.forget?.(hash);
            } catch (e) {
                if (n === STARTUP_ATTEMPTS) console.warn("forfeit not sent", e?.message ?? e);
                else await new Promise((r) => setTimeout(r, heartbeatChainMs * n));
            }
        }
    }

    function closed(entry, g) {
        if (g.endReason !== END_REASON.FORFEITED) return;
        if (sameAddress(g.winner, me.wallet)) {
            const perPass = forfeitsForPass.has(entry.match.gameId);
            const payout = forfeitPayouts.get(entry.match.gameId) ?? null;
            forfeitPayouts.delete(entry.match.gameId);
            onError(Object.assign(new Error(perPass ? "Opponent has no pass." : "Opponent did not reveal."), { code: perPass ? "FORFEIT_PASS" : "FORFEIT", payout }));
        } else {
            onError(Object.assign(new Error(REVEALED_LATE), { code: "STARTUP" }));
        }
    }

    return {
        check, dispatchSeed, dispatchForfeit, closed, confirmed, startedElsewhere,

        claim: (gameId, kind) => claimSend(gameId, kind, repeatOf(kind)),

        start() {
            this.halt();
            patrolWork = setInterval(check, heartbeatMs);
        },

        halt() {
            if (patrolWork !== null) clearInterval(patrolWork);
            patrolWork = null;
        },
    };
}
