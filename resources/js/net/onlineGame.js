import { isAddress } from "ethers";
import { createClient, transportStreamr } from "./streamrTransport.js";
import { createLobby, LOBBY_PARTITION } from "./lobby.js";
import { channelsFor, PROTOCOL_V } from "./constants.js";
import { createEncounter } from "./handshake.js";
import { createSession } from "./session.js";
import { localSigner, stillTheSigner } from "./keys.js";
import { delegationLocale } from "./delegation.js";
import { signature } from "./signatures.js";
import { index, sidesFromSeed, END_REASON, invitePartition, inviteProof, TYPES_BUSY } from "./messages.js";
import {
    chainRead, withClock, seatOf,
    calldataMove, calldataResignation, calldataClosing,
    awaitBumping, STATUS, SEED_BLOCKS, fundsFinished, clockFarOff, clockInconsistent, nodeWords, headStalled,
    headOffset, behindHead,
    durationOutOfRange, mementoOf,
} from "./chain.js";
import { sameAddress } from "../game/wallet.js";
import { GRACE_SECONDS, PENALTY_SECONDS } from "../game/timer.js";
import { getBoardPossibleMoves } from "../engine/minimax.js";

const LOG_REPEAT_MS = 2000;
const RESYNC_HEARTBEAT_MS = 3000;
const RESYNC_ATTEMPTS = 10;
const FORK_DEPTH = 32;
export const REPEAT_LAST_ATTEMPTS = 8;

export const CHAIN_HEARTBEAT_MS = 2000;
export const OPENING_HEARTBEAT_MS = 500;
export const PROBE_HEAD_MS = 60_000;
export const MOVE_WAIT_MS = 20_000;
export const RESIGNATION_ATTEMPTS = 3;
const ZERO_SEED = "0x" + "0".repeat(64);
const WITHOUT_CHAIN = "Wallets play on-chain only: this build has no contract.";
const KEY_ELSEWHERE = "The session key changed in another tab.";
const SEAT_ELSEWHERE = "This wallet plays with another session key.";
const UNSEEDED = "Nobody moved in time: the game is closed and the stakes go back.";

export function plyLegal({ board, repetitions, turn }, p) {
    if (p.skipped) return p.from === 63 && p.a === 63 && p.color === turn;
    if (p.color !== turn || !(p.from >= 0 && p.from < 63) || !(p.a >= 0 && p.a < 63)) return false;
    return getBoardPossibleMoves(board, p.color, repetitions)
        .some((m) => m.fromRow * 7 + m.fromCol === p.from && m.toRow * 7 + m.toCol === p.a);
}

export const CONFIRM_WAIT_MS = 2500;

export function createMatchOnline({
    onList = () => {}, onHandshake = () => {},
    onMatch = () => {}, onMove = () => {}, onDeadline = () => {}, onOutcome = () => {},
    onSynced = () => {}, onError = () => {}, onChain = () => {}, onStarted = () => {}, onPairing = () => {},
    onHeld = () => {}, onLagging = () => {},
    onRebuild = (replay) => replay(),
    category, beforeSigning = null, openSeat = null,
    chain = null, givenTransport = null,
    heartbeatChainMs = CHAIN_HEARTBEAT_MS, heartbeatOpeningMs = OPENING_HEARTBEAT_MS, waitingMoveMs = MOVE_WAIT_MS, confirmWaitMs = CONFIRM_WAIT_MS,
    now = Date.now, seed = null,
    repeatLastMs = LOG_REPEAT_MS, resyncHeartbeatMs = RESYNC_HEARTBEAT_MS, resyncAttempts = RESYNC_ATTEMPTS,
} = {}) {
    let client = null, transport = null, lobby = null, encounter = null, session = null;
    let lingering = null;
    let entered = null;
    let seatWatching = null, checkingSeat = false;
    let codeInvite = null;
    let unsubscribe = null;
    let outcomeMy = null, outcomeIts = null;
    let matchCurrent = null, seedCurrent = null, sideCurrent = null;
    let lastRequest = 0, hooking = null, heartbeat = null, listeningChallenges = null;
    let lastAnswer = -Infinity, answerFrom = null, answerLater = null;
    let seatInFlight = null, challengeInProgress = false;
    const me = localSigner();
    const channels = channelsFor(me.type);

    let plyLocal = [];
    let watching = null;
    let stateCurrent = null;
    let retained = null;
    let waitingRetained = null;
    let turnSince = null;
    let savedAt = null;
    let inFlight = [];
    let toRebuild = false;
    let logExpected = false;
    let logRequestedFrom = 0;
    let heardInRound = false, logAnswered = false, itsRest = 0;
    let repeating = null;
    let laggingAt = -1;
    let reading = false;
    let headsSeen = [];
    let probedAt = -Infinity, probing = null;
    let finishedUponChain = false;
    let closed = false;
    let concluded = false;
    let busyFor = null;

    function switchOn() {
        if (client) return;
        if (givenTransport) {
            client = { destroy: async () => {} };
            transport = givenTransport;
        } else {
            client = createClient(me.key);
            transport = transportStreamr(client, { streamId: channels.P[0].streamId });
        }
    }

    function note(ply) {
        plyLocal.push(ply);
        turnSince = now();
    }

    function heardFromIt() {
        clearInterval(repeating);
        repeating = null;
    }

    function repeatLast() {
        heardFromIt();
        let attempts = REPEAT_LAST_ATTEMPTS;
        repeating = setInterval(() => {
            const last = session?.last;
            if (!last || concluded || !transport || !session.signedByMe(last) || --attempts < 0) return heardFromIt();
            transport.publish(session.partition, last).catch(onError);
        }, repeatLastMs);
    }

    function applyEntry(envelope, { live = false } = {}) {
        heardFromIt();
        const mine = session.signedByMe(envelope);
        if (!mine) heardInRound = true;
        if (envelope.type === "move") {
            const { from, to } = envelope.data;
            note({ color: mine ? session.myColor : session.itsColor, skipped: false, from: from, a: to });
            onMove({
                fromRow: Math.floor(from / 7), fromCol: from % 7,
                toRow: Math.floor(to / 7), toCol: to % 7,
                ...(live ? { sentAt: envelope.data.t } : {}),
            });
        } else {
            note({ color: mine ? session.itsColor : session.myColor, skipped: true, from: 63, a: 63 });
            onDeadline();
        }
    }

    function rebuild(log, { lost = false } = {}) {
        leaveRetained();
        plyLocal = [];
        session = createSession({ match: matchCurrent, seed: seedCurrent, me, side: sideCurrent, state: stateCurrent });
        let restored = null;
        onRebuild(() => { restored = session.resumeFromLog(log, applyEntry); }, { lost });
        if (!restored?.ok) console.warn("rebuild stopped", restored?.reason);
    }

    async function askLog(from = session?.seq, { immediately = false } = {}) {
        const rightNow = now();
        if (!session || (!immediately && rightNow - lastRequest < LOG_REPEAT_MS)) return;
        lastRequest = rightNow;
        logExpected = true;
        logRequestedFrom = from;
        await transport.publish(session.partition, {
            type: "getLog", gameId: session.gameId, from: from,
        }).catch(onError);
    }

    function stepBack(to = logRequestedFrom - 1) {
        if (to < 0 || to < session.seq - FORK_DEPTH) return false;
        askLog(to, { immediately: true });
        return true;
    }

    function haltHeartbeat() {
        if (heartbeat !== null) clearInterval(heartbeat);
        heartbeat = null;
    }

    function resyncDone() {
        haltHeartbeat();
        logExpected = false;
        const rest = itsRest;
        itsRest = 0;
        onSynced({ silent: !heardInRound, answered: logAnswered, itsRest: rest });
    }

    function resyncFailed(reason) {
        resyncDone();
        onError(Object.assign(new Error(reason), { code: "RESYNC" }));
    }

    function resyncHeartbeat(from = session.seq, { immediately = false } = {}) {
        haltHeartbeat();
        logExpected = true;
        heardInRound = false;
        logAnswered = false;
        itsRest = 0;
        logRequestedFrom = from;
        let attempts = resyncAttempts;
        heartbeat = setInterval(() => {
            if (!session || --attempts <= 0) return resyncDone();
            askLog(logRequestedFrom);
        }, resyncHeartbeatMs);
        askLog(from, { immediately });
    }

    function lagging(itsSeq) {
        const missing = session.entriesFrom(itsSeq + 1).filter((b) => session.signedByMe(b)).slice(-FORK_DEPTH);
        if (!missing.length || laggingAt === session.seq) return;
        laggingAt = session.seq;
        for (const b of missing) transport.publish(session.partition, b).catch(onError);
        onLagging();
    }

    function settleLog(newOnes, itsSeq, restIts = 0) {
        if (concluded) return resyncDone();
        if (Number.isInteger(itsSeq) && itsSeq < session.seq && !newOnes.length) lagging(itsSeq);
        if (!newOnes.length) {
            if (itsSeq === session.seq && Number.isFinite(restIts) && restIts > 0) itsRest = Math.max(itsRest, restIts);
            if (Number.isInteger(itsSeq) && itsSeq < logRequestedFrom && stepBack(itsSeq)) return;
            return resyncDone();
        }
        const first = newOnes[0];
        const seq = first.data.seq;
        let before = null;
        let entries = newOnes;
        const yielding = !!session.entryAt(seq) && session.deadlineOverMine(first);
        if (session.entryAt(seq)) {
            const mine = session.myDeadlineUnder(first);
            if (mine) {
                resyncDone();
                return transport.publish(session.partition, mine).catch(onError);
            }
            if (!yielding) return stepBack(seq - 1) || resyncFailed("position");
            before = session.logBelow(seq);
        } else {
            entries = newOnes.filter((b) => b.data.seq > session.seq);
            if (!entries.length) return resyncDone();
            if (entries[0].data.seq > session.seq + 1) return stepBack(session.seq + 1) || resyncFailed("gap");
        }
        const rest = yielding ? unripe(entries.slice(1)) : -1;
        const cut = !yielding ? unripe(entries) : rest >= 0 ? rest + 1 : -1;
        const held = cut >= 0 ? entries[cut] : null;
        const more = cut >= 0 && cut < entries.length - 1;
        if (held) entries = entries.slice(0, cut);
        if (before) {
            rebuild([...before, ...entries], { lost: true });
        } else {
            const beforeSeq = session.seq;
            const restored = session.resumeFromLog(entries, applyEntry);
            if (!restored.ok) {
                if (restored.reason === "position" && restored.until === beforeSeq && stepBack()) return;
                return resyncFailed(restored.reason);
            }
        }
        resyncDone();
        if (held) holdBack(held, more);
    }

    function unripe(entries) {
        const itsDeadline = (b) => b?.type === "timeout" && !session.signedByMe(b);
        if (turnSince === null) {
            let budget = savedAt === null ? Infinity : 1 + Math.floor((now() - savedAt) / ((PENALTY_SECONDS + GRACE_SECONDS) * 1000));
            for (const [i, b] of entries.entries()) {
                if (itsDeadline(b) && --budget < 0) return i;
            }
            return itsDeadline(entries.at(-1)) && !expiredInLocale() ? entries.length - 1 : -1;
        }
        for (const [i, b] of entries.entries()) {
            if (!itsDeadline(b)) continue;
            if (i === 0 && expiredInLocale()) continue;
            return i;
        }
        return -1;
    }

    function answerLog(from) {
        answerFrom = from;
        if (answerLater !== null) return;
        const wait = lastAnswer + LOG_REPEAT_MS - now();
        if (wait > 0) {
            answerLater = setTimeout(() => { answerLater = null; answerLog(answerFrom); }, wait);
            return;
        }
        lastAnswer = now();
        if (!session || !transport) return;
        if (outcomeMy) transport.publish(session.partition, outcomeMy).catch(onError);
        const local = stateCurrent?.();
        const rest = local?.turn === session.myColor && local.deadline > now() ? local.deadline - now() : 0;
        transport.publish(session.partition, {
            type: "log", gameId: session.gameId, seq: session.seq, entries: session.entriesFrom(from), rest,
        }).catch(onError);
    }

    function listen() {
        return transport.subscribe(session.partition, ({ from, envelope }) => {
            if (sameAddress(from, me.address)) return;
            if (!sameAddress(from, session.sessionOpponent)) return;
            if (chain && envelope?.type !== "outcome") return;
            if (envelope?.type === "outcome") {
                const judgment = session.acceptOutcome(envelope);
                if (!judgment.ok) return onError(new Error("Outcome refused: " + judgment.reason));
                outcomeIts = envelope;
                if (chain) { readChain(); return; }
                return onOutcome(envelope.data);
            }
            if (envelope?.type === "getLog") {
                if (envelope.gameId !== session.gameId) return;
                return answerLog(Number.isInteger(envelope.from) ? envelope.from : 0);
            }
            if (envelope?.type === "log") {
                if (envelope.gameId !== session.gameId) return;
                if (!Array.isArray(envelope.entries) || !logExpected) return;
                logAnswered = true;
                const newOnes = envelope.entries
                    .filter((b) => Number.isInteger(b?.data?.seq) && !session.hasTheEntry(b))
                    .sort((x, y) => x.data.seq - y.data.seq);
                return settleLog(newOnes, envelope.seq, envelope.rest);
            }
            if (envelope?.type !== "move" && envelope?.type !== "timeout") return;
            receive(envelope);
        });
    }

    function receive(envelope, { held = false } = {}) {
        if (!session || concluded || session.hasTheEntry(envelope)) return;
        if (!held && session.deadlineOverMine(envelope)) {
            rebuild([...session.logBelow(envelope.data.seq), envelope], { lost: true });
            return askLog(session.seq, { immediately: true });
        }
        if (envelope.type === "timeout" && !expiredInLocale()) return holdBack(envelope);
        const outcomeMove = session.accept(envelope);
        if (!outcomeMove.ok) {
            if (outcomeMove.reason === "gap") return askLog();
            const mine = session.myDeadlineUnder(envelope);
            if (mine) return transport.publish(session.partition, mine).catch(onError);
            return console.warn("channel entry refused", outcomeMove.reason);
        }
        applyEntry(envelope, { live: true });
    }

    function expiredInLocale() {
        const deadline = stateCurrent?.()?.deadline;
        return !(deadline > 0) || now() >= deadline - GRACE_SECONDS * 1000;
    }

    function holdBack(envelope, more = false) {
        leaveRetained();
        heardInRound = true;
        retained = envelope;
        onHeld(true);
        const rest = Math.max(0, stateCurrent().deadline - GRACE_SECONDS * 1000 - now());
        waitingRetained = setTimeout(() => {
            const b = retained;
            retained = null;
            waitingRetained = null;
            if (!b) return;
            onHeld(false);
            receive(b, { held: true });
            if (more && session) resyncHeartbeat(session.seq, { immediately: true });
        }, rest + 1);
    }

    function leaveRetained() {
        clearTimeout(waitingRetained);
        waitingRetained = null;
        if (retained) onHeld(false);
        retained = null;
    }

    function reconcile(g) {
        const itsMany = g.ply.map((p) => ({
            color: p.color, skipped: p.skipped, from: p.from, a: p.a,
        }));
        const common = Math.min(itsMany.length, plyLocal.length);
        let k = 0;
        while (k < common && equalPly(itsMany[k], plyLocal[k])) k++;
        if (k < common) {
            const myOwn = plyLocal.slice(k).some((p) => p.color === session.myColor && !p.skipped);
            plyLocal = itsMany.slice();
            inFlight = [];
            onChain({ type: "reconstruction", ply: itsMany, lost: myOwn });
            return;
        }
        for (let i = plyLocal.length; i < itsMany.length; i++) {
            const p = itsMany[i];
            if (stateCurrent && !plyLegal(stateCurrent(), p)) {
                diverged();
                break;
            }
            note(p);
            if (p.skipped) onDeadline({ color: p.color });
            else onMove({
                fromRow: Math.floor(p.from / 7), fromCol: p.from % 7,
                toRow: Math.floor(p.a / 7), toCol: p.a % 7,
            });
        }
        inFlight = inFlight.filter((m) => m.index >= itsMany.length);
    }

    function diverged() {
        chain?.reads.discard?.();
        toRebuild = true;
    }

    function penalized(g) {
        return { white: ((g.penalized >> 1) & 1) === 1, black: (g.penalized & 1) === 1 };
    }

    function equalPly(x, y) {
        return x.color === y.color && x.skipped === y.skipped && x.from === y.from && x.a === y.a;
    }

    async function readChain() {
        if (!session || !chain || reading) return;
        reading = true;
        try {
            await probing;
            const haveRead = await chainRead(chain.reads, session.gameId, chain.address);
            if (!session || !haveRead) return;
            if (headStalled(chain.reads, haveRead.timeBlock, now())) { chain.reads.discard?.(); return; }
            if (behindHead(headsSeen, haveRead.timeBlock, now())) { chain.reads.discard?.(); return; }
            if (haveRead.match.status === STATUS.NO) { chain.reads.discard?.(); return; }
            if (clockFarOff(haveRead.timeBlock, now())) { chain.reads.discard?.(); return; }
            if (String(haveRead.match.seed).toLowerCase() !== String(seedCurrent).toLowerCase()) { chain.reads.discard?.(); return; }
            const { timeBlock, clock } = haveRead;
            const running = haveRead.match.status === STATUS.IN_PROGRESS;
            if (running && (clockInconsistent(haveRead.match, clock, timeBlock) || durationOutOfRange(clock))) { chain.reads.discard?.(); return; }
            const g = running ? withClock(haveRead.match, clock) : haveRead.match;
            if (toRebuild) {
                toRebuild = false;
                plyLocal = g.ply.map((p) => ({ color: p.color, skipped: p.skipped, from: p.from, a: p.a }));
                inFlight = [];
                onChain({
                    type: "reconstruction", ply: plyLocal.slice(), lost: false, penalized: penalized(g),
                    block: running ? { seq: g.seq, turn: g.turn, lastAt: g.lastAt, duration: clock.duration, timeBlock, deadline: deadlineInLocale(haveRead) } : null,
                });
                onSynced();
            } else {
                reconcile(g);
                if (plyLocal.length > g.ply.length && !inFlight.length) await verifyLonger(haveRead);
                if (!session) return;
            }
            const aligned = plyLocal.length === g.ply.length;
            onChain({
                type: "state", seq: g.seq, lastAt: g.lastAt, turn: g.turn, status: g.status, deadline: deadlineInLocale(haveRead),
                duration: clock.duration, timeBlock, penalized: penalized(g),
                escrows: { white: BigInt(g.escrowWhite), black: BigInt(g.escrowBlack) },
                aligned,
            });
            if (g.status === STATUS.FINISHED && !finishedUponChain) {
                finishedUponChain = true;
                haltWatching();
                const { gameId, sides } = session;
                const won = !!g.winner && !/^0x0{40}$/i.test(g.winner);
                const token = won ? await mementoOf(chain.reads, gameId) : null;
                onChain({
                    type: "end", winner: g.winner, endReason: g.endReason, sides,
                    escrows: { white: BigInt(g.escrowWhite), black: BigInt(g.escrowBlack) },
                    minted: token ? token.mintedAt > 0 : null,
                });
            }
        } finally {
            reading = false;
        }
    }

    const older = (other, head) => other.timeBlock < head.timeBlock;

    function confirmation(reads) {
        let timer;
        const late = new Promise((r) => { timer = setTimeout(() => r(null), confirmWaitMs); });
        return Promise.race([chainRead(reads, session.gameId, chain.address), late])
            .then((r) => { if (r) headOffset(headsSeen, r.timeBlock, now()); return r; })
            .finally(() => clearTimeout(timer));
    }

    function probeHead() {
        probedAt = now();
        const another = chain.reads.elsewhere?.();
        probing = another && session ? confirmation(another).catch(() => null).finally(() => { probing = null; }) : null;
        return probing;
    }

    async function verifyHead() {
        const another = chain.reads.elsewhere?.();
        if (!another || !session) return;
        const [head, other] = await Promise.all([
            chainRead(chain.reads, session.gameId, chain.address),
            confirmation(another),
        ]);
        if (!head || !other || older(other, head) || sameHead(head, other)) return;
        if (pliesOf(head) <= pliesOf(other) || !await anotherShows((r) => sameHead(r, head))) chain.reads.discard?.();
        toRebuild = true;
    }

    const sameHead = (x, y) => x.match.seq === y.match.seq && x.match.board === y.match.board
        && x.clock.skips === y.clock.skips && x.clock.turn === y.clock.turn;

    async function anotherShows(test) {
        const readers = chain.reads.others?.() ?? [chain.reads.elsewhere?.()].filter(Boolean);
        const reads = await Promise.all(readers.map(confirmation));
        return reads.some((r) => r && test(r));
    }

    function pliesOf(haveRead) {
        const skips = haveRead.match.status === STATUS.IN_PROGRESS ? haveRead.clock.skips : 0;
        return haveRead.match.ply.length + skips;
    }

    async function verifyLonger(head) {
        const another = chain.reads.elsewhere?.();
        if (!another) return;
        const other = await confirmation(another);
        if (!other || !session || older(other, head)) return;
        if (pliesOf(other) >= plyLocal.length) { chain.reads.discard?.(); return; }
        if (pliesOf(other) === pliesOf(head)) toRebuild = true;
    }

    async function aheadElsewhere() {
        const another = chain.reads.elsewhere?.();
        if (!another || !session) return;
        const [head, other] = await Promise.all([
            chainRead(chain.reads, session.gameId, chain.address),
            confirmation(another),
        ]);
        if (!other || !session || clockFarOff(other.timeBlock, now())) return;
        if (head && other.match.ply.length <= head.match.ply.length) return;
        chain.reads.discard?.();
    }

    const deadlineInLocale = (haveRead) => now() + (haveRead.clock.deadline - haveRead.timeBlock) * 1000;

    function entryOf(gameId, g) {
        const white = sameAddress(g.white, me.wallet);
        return {
            match: { gameId, a: g.white, b: g.black, category: g.category, t: g.lastAt },
            seed: g.seed,
            side: white ? { wallet: g.black, session: g.sessionBlack } : { wallet: g.white, session: g.sessionWhite },
        };
    }

    function enterTheStarted(entry) {
        if (session || closed || entered === entry.match.gameId) return;
        entered = entry.match.gameId;
        haltSeat();
        onStarted({ ...entry, log: [] });
    }

    function watchSeat() {
        haltSeat();
        seatWatching = setInterval(checkSeat, heartbeatChainMs);
        checkSeat();
    }

    function haltSeat() {
        if (seatWatching !== null) clearInterval(seatWatching);
        seatWatching = null;
    }

    async function checkSeat() {
        if (checkingSeat || session || closed) return;
        checkingSeat = true;
        try {
            const seat = await seatOf(chain.reads, me.wallet, chain.address);
            if (!seat?.gameId || !sameAddress(seat.session, me.address)) return;
            await enterPaired(seat.gameId);
        } finally {
            checkingSeat = false;
        }
    }

    async function enterPaired(gameId) {
        for (;;) {
            if (session || closed) return;
            const [haveRead, final] = await Promise.all([
                chainRead(chain.reads, gameId, chain.address),
                chain.reads.finalized ? chain.reads.finalized().catch(() => null) : null,
            ]);
            const g = haveRead?.match;
            const stale = !!haveRead && (clockFarOff(haveRead.timeBlock, now()) || headStalled(chain.reads, haveRead.timeBlock, now()));
            if (stale) chain.reads.discard?.();
            const over = g?.status === STATUS.FINISHED;
            if (over && !stale && g.seed === ZERO_SEED) return endUnseeded();
            if ((g?.status === STATUS.IN_PROGRESS || over) && !stale) {
                if (g.seed === ZERO_SEED && haveRead.blockNumber > g.seedBlock + SEED_BLOCKS) return closeUnseeded(gameId);
                const opensAt = now() + (g.lastAt - haveRead.timeBlock) * 1000;
                if (!over) onPairing({ opensAt });
                const seeded = g.seed !== ZERO_SEED && (!Number.isInteger(final) || final >= g.seedBlock);
                if (seeded && (over || now() >= opensAt)) {
                    const mine = sameAddress(g.white, me.wallet) ? g.sessionWhite : g.sessionBlack;
                    if (!sameAddress(mine, me.address)) return onError(Object.assign(new Error(SEAT_ELSEWHERE), { code: "KEY" }));
                    return enterTheStarted(entryOf(gameId, g));
                }
            }
            await new Promise((r) => setTimeout(r, heartbeatOpeningMs));
        }
    }

    function watch() {
        haltWatching();
        headsSeen = [];
        probeHead();
        watching = setInterval(() => {
            if (now() - probedAt >= PROBE_HEAD_MS) probeHead();
            readChain();
        }, heartbeatChainMs);
    }

    function haltWatching() {
        if (watching !== null) clearInterval(watching);
        watching = null;
    }

    function endUnseeded() {
        haltSeat();
        onError(Object.assign(new Error(UNSEEDED), { code: "UNSEEDED" }));
    }

    async function closeUnseeded(gameId) {
        endUnseeded();
        await chain.transmitter.send(calldataClosing(gameId)).catch((e) =>
            onError(Object.assign(new Error("Close not sent: " + nodeWords(e)), { code: "CHAIN" })));
    }

    async function transmitResignation() {
        for (let n = 1; n <= RESIGNATION_ATTEMPTS && !finishedUponChain; n++) {
            try {
                const hash = await chain.transmitter.send(calldataResignation(session.gameId));
                const { gone, hash: last } = await awaitBumping(chain.reads, chain.transmitter, hash, waitingMoveMs);
                if (gone === null) chain.transmitter.forget?.(last);
                if (gone !== null) { await readChain(); return; }
            } catch (e) {
                if (n === RESIGNATION_ATTEMPTS) return console.warn("resignation not sent", e?.message ?? e);
            }
            await new Promise((r) => setTimeout(r, heartbeatChainMs * n));
        }
    }

    async function transmitMove(indexPly, data) {
        let hash;
        try {
            hash = await chain.transmitter.send(data);
        } catch (e) {
            const funds = fundsFinished(e);
            onChain({ type: "lost", index: indexPly, refused: true, reason: nodeWords(e), funds });
            if (!funds) await verifyHead();
            return;
        }
        chain.transmitter.repeat?.(hash, chain.reads.elsewhere?.());
        inFlight.push({ index: indexPly, hash });
        onChain({ type: "pending", index: indexPly, hash });
        followMove(indexPly, hash);
    }

    async function followMove(indexPly, first) {
        const { gone, hash } = await awaitBumping(chain.reads, chain.transmitter, first, waitingMoveMs);
        if (gone === null) {
            chain.transmitter.forget?.(hash);
            onChain({ type: "lost", index: indexPly, hash });
        } else if (gone === false) {
            onChain({ type: "lost", index: indexPly, hash, refused: true });
            await verifyHead();
        } else if (gone === true) {
            onChain({ type: "confirm", index: indexPly, hash });
            await readChain();
        }
    }

    function partitionLobby(inviter, code) {
        if (chain || !code || !inviter) return LOBBY_PARTITION;
        return invitePartition(inviter, code);
    }

    function answerBusy(partition, { from, commit }) {
        if (busyFor === commit || !isAddress(from) || !/^0x[0-9a-f]{64}$/i.test(String(commit))) return;
        const delegation = delegationLocale();
        if (!delegation) return;
        busyFor = commit;
        const data = { v: PROTOCOL_V, from: me.wallet, to: from, commit };
        transport.publish(partition, {
            type: "busy", data, signature: signature(me.key, TYPES_BUSY, data), signedDelegation: delegation,
        }).catch(() => {});
    }

    async function genuineChallenge(opponent, code = null, partition = partitionLobby(opponent, code), answering = false) {
        if (!stillTheSigner(me)) return onError(Object.assign(new Error(KEY_ELSEWHERE), { code: "KEY" }));
        const delegation = delegationLocale();
        if (!delegation) return onError(Object.assign(new Error(WITHOUT_CHAIN), { code: "NO_CHAIN" }));
        if (answering) onHandshake(opponent);
        lobby?.withdraw();
        encounter = createEncounter({
            transport, me, delegation, opponent, category, now, ...(seed ? { seed } : {}),
            invite: code ? inviteProof(code, me.wallet) : null,
            partitionCommit: partition,
            ...(answering ? {} : { onCommit: () => onHandshake(opponent) }),
        });
        try {
            const outcome = await encounter.start();
            const { sides, myColor } = api.sidesOf(outcome);
            const complete = { ...outcome, sides, myColor };
            onMatch(complete);
            return complete;
        } catch (e) {
            await encounter?.close();
            encounter = null;
            lobby?.ignore(opponent);
            onError(e);
            return null;
        }
    }

    function letLinger() {
        const done = encounter;
        encounter = null;
        if (!done) return;
        lingering?.close();
        lingering = done;
        done.closeAfterReady().finally(() => { if (lingering === done) lingering = null; });
    }

    const api = {
        me,
        get session() { return session; },
        get outcomes() { return { my: outcomeMy, its: outcomeIts }; },
        get ply() { return plyLocal.slice(); },
        get uponChain() { return !!chain; },

        async ensureSeat(request) {
            if (!chain) return false;
            const seat = await seatOf(chain.reads, me.wallet, chain.address);
            const mine = !!seat?.session && sameAddress(seat.session, me.address);
            if (seat?.gameId) {
                if (mine) return true;
                throw Object.assign(new Error(SEAT_ELSEWHERE), { code: "SEAT" });
            }
            const fits = mine && !request.host && seat.category === request.category && seat.v === PROTOCOL_V
                && (!seat.invite || sameAddress(seat.invite, request.invite));
            if (fits) return true;
            if (!openSeat) return false;
            if (seatInFlight) return seatInFlight;
            seatInFlight = (async () => {
                if (beforeSigning) await beforeSigning();
                return await openSeat({ ...request, leave: !!seat?.session, session: me.address });
            })();
            try {
                return await seatInFlight;
            } finally {
                seatInFlight = null;
            }
        },

        watchSeat,

        async open({ announcing = true, inviter = me.wallet, code = null } = {}) {
            switchOn();
            lobby = createLobby({ transport, me, onSwitch: onList, partition: partitionLobby(inviter, code) });
            await lobby.open({ announcing });
        },

        async challenge(opponent, { code = null, partition = partitionLobby(opponent, code), answering = false } = {}) {
            if (closed || challengeInProgress) return null;
            challengeInProgress = true;
            try {
                return await genuineChallenge(opponent, code, partition, answering);
            } finally {
                challengeInProgress = false;
            }
        },

        async startSession(outcome, state) {
            matchCurrent = outcome.match;
            seedCurrent = outcome.seed;
            sideCurrent = outcome.side;
            stateCurrent = state;
            leaveRetained();
            heardFromIt();
            laggingAt = -1;
            plyLocal = [];
            inFlight = [];
            finishedUponChain = false;
            concluded = false;
            outcomeMy = outcomeIts = null;
            session = createSession({
                match: outcome.match, seed: outcome.seed, me, side: outcome.side, state,
            });
            turnSince = now();
            unsubscribe = await listen();
            letLinger();
            return session;
        },

        sidesOf({ match, seed }) {
            const sides = sidesFromSeed(seed, match.a, match.b);
            return { sides, myColor: sameAddress(sides.white, me.wallet) ? "white" : "black" };
        },

        async resume({ match, seed, side, log, t }, state, settle = () => {}) {
            switchOn();
            matchCurrent = match;
            seedCurrent = seed;
            sideCurrent = side;
            stateCurrent = state;
            leaveRetained();
            heardFromIt();
            laggingAt = -1;
            plyLocal = [];
            inFlight = [];
            finishedUponChain = false;
            concluded = false;
            outcomeMy = outcomeIts = null;
            session = createSession({ match, seed, me, side, state });
            const restored = chain ? { ok: true } : session.resumeFromLog(log, applyEntry);
            turnSince = null;
            savedAt = Number.isFinite(t) ? t : null;
            settle();
            if (!restored.ok) {
                session = null;
                onError(Object.assign(new Error(restored.reason), { code: "CACHE" }));
                return null;
            }
            hooking = (async () => {
                unsubscribe = await listen();
                if (!chain) resyncHeartbeat();
            })();
            hooking.catch(onError);
            if (chain) {
                toRebuild = true;
                watch();
                readChain();
            }
            return session;
        },

        resumeFinished({ match, seed, side, log, outcomes }, state, settle = () => {}) {
            matchCurrent = match;
            seedCurrent = seed;
            sideCurrent = side;
            session = createSession({ match, seed, me, side, state });
            const restored = session.resumeFromLog(log, applyEntry);
            settle();
            if (!restored.ok) {
                session = null;
                return null;
            }
            outcomeMy = outcomes?.my ?? null;
            outcomeIts = outcomes?.its ?? null;
            return session;
        },

        get snapshot() {
            if (!session) return null;
            return {
                session: me.address,
                match: matchCurrent,
                seed: seedCurrent,
                side: sideCurrent,
                log: session.log,
            };
        },

        async sendMove(move) {
            if (!session) return;
            const from = index(move.fromRow, move.fromCol);
            const a = index(move.toRow, move.toCol);
            if (chain) return transmitMove(plyLocal.length, calldataMove(session.gameId, plyLocal.length, from, a));
            const envelope = session.moveFromTransmit(from, a);
            if (!envelope) return;
            note({ color: session.myColor, skipped: false, from, a });
            repeatLast();
            await transport.publish(session.partition, envelope).catch(onError);
        },

        async sendDeadline() {
            if (!session) return;
            if (!chain) {
                const envelope = session.deadlineFromTransmit();
                if (!envelope) return;
                note({ color: session.itsColor, skipped: true, from: 63, a: 63 });
                repeatLast();
                await transport.publish(session.partition, envelope).catch(onError);
                return;
            }
            await aheadElsewhere();
            await readChain();
        },

        resync() {
            if (session) resyncHeartbeat();
        },

        get resyncing() { return heartbeat !== null; },

        resendLast() {
            const last = session?.last;
            if (!last || !transport || !session.signedByMe(last)) return;
            transport.publish(session.partition, last).catch(onError);
        },

        conclude() {
            concluded = true;
            heardFromIt();
            leaveRetained();
        },

        async sendOutcome({ endReason, winner }) {
            if (!session) return null;
            const outcome = session.outcomeToTransmit({ endReason, winner });
            outcomeMy = outcome;
            if (chain && endReason === END_REASON.RESIGNED) transmitResignation();
            await transport.publish(session.partition, outcome);
            return outcome;
        },

        async closeForInactivity() {
            if (!session || !chain) return;
            await chain.transmitter.send(calldataClosing(session.gameId)).catch((e) =>
                onError(Object.assign(new Error("Close not sent: " + nodeWords(e)), { code: "CHAIN" })));
        },

        async listenForChallenges({ code = null } = {}) {
            codeInvite = code;
            if (listeningChallenges) return;
            const partition = partitionLobby(me.wallet, code);
            if (lobby && lobby.partition !== partition) {
                transport.publish(partition, {
                    type: "announce", data: { v: PROTOCOL_V, t: Math.floor(Date.now() / 1000) },
                }).catch(() => {});
            }
            listeningChallenges = await transport.subscribe(partition, ({ from, envelope }) => {
                if (sameAddress(from, me.address)) return;
                if (envelope?.type !== "commit") return;
                if (!sameAddress(envelope?.data?.to, me.wallet)) return;
                if (codeInvite && envelope.invite !== inviteProof(codeInvite, envelope.data?.from)) return;
                if (session) return answerBusy(partition, envelope.data);
                if (encounter || challengeInProgress) return;
                api.challenge(envelope.data.from, { partition, answering: true });
            });
        },

        get invite() { return me.wallet; },

        diverged,

        async close() {
            closed = true;
            haltHeartbeat();
            heardFromIt();
            clearTimeout(answerLater);
            answerLater = null;
            haltWatching();
            haltSeat();
            await listeningChallenges?.();
            listeningChallenges = null;
            await hooking?.catch(() => {});
            hooking = null;
            await unsubscribe?.();
            await encounter?.close();
            await lingering?.close();
            lingering = null;
            await lobby?.close();
            await client?.destroy();
            leaveRetained();
            unsubscribe = encounter = lobby = transport = session = null;
            outcomeMy = outcomeIts = null;
            matchCurrent = seedCurrent = sideCurrent = stateCurrent = null;
            plyLocal = [];
            inFlight = [];
            client = null;
        },
    };
    return api;
}
