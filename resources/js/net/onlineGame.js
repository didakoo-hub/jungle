import { createClient, transportStreamr } from "./streamrTransport.js";
import { createLobby, LOBBY_PARTITION } from "./lobby.js";
import { createQueue, saltFromBlock } from "./arena.js";
import { channelsFor, PROTOCOL_V } from "./constants.js";
import { createEncounter, COMMIT_WAIT_MS } from "./handshake.js";
import { createSession } from "./session.js";
import { localSigner, stillTheSigner } from "./keys.js";
import { delegationLocale } from "./delegation.js";
import { index, sidesFromSeed, CATEGORY, END_REASON, invitePartition, inviteProof } from "./messages.js";
import {
    chainRead, withClock, seatOf, seatsOf, hasThePass,
    calldataMove, calldataResignation, calldataClosing,
    awaitBumping, STATUS, CHAIN_REVEAL_S, fundsFinished, clockFarOff, clockInconsistent, nodeWords, headStalled,
    headOffset, behindHead,
    durationOutOfRange,
} from "./chain.js";
import { sameAddress } from "../game/wallet.js";
import {
    rememberAgreement, forgetAgreement, createSentinel, forfeitDue, seedGoesBack, seedKind,
    NOT_STARTED, SUSPENDED_HEARTBEAT_MS, SUSPENDED_REPEAT_MS, STARTUP_ATTEMPTS,
} from "./pending.js";

export { SUSPENDED_HEARTBEAT_MS, SUSPENDED_REPEAT_MS, STARTUP_ATTEMPTS };
import { GRACE_SECONDS, PENALTY_SECONDS } from "../game/timer.js";
import { getBoardPossibleMoves } from "../engine/minimax.js";

const LOG_REPEAT_MS = 2000;
const RESYNC_HEARTBEAT_MS = 3000;
const RESYNC_ATTEMPTS = 10;
const FORK_DEPTH = 32;
// My last entry goes again every LOG_REPEAT_MS until the opponent answers with an entry of its
// own, at most for the turn it opens.
export const REPEAT_LAST_ATTEMPTS = 8;

export const CHAIN_HEARTBEAT_MS = 2000;
// The other endpoint is read for the head once at watch() and then every PROBE_HEAD_MS.
export const PROBE_HEAD_MS = 60_000;
export const STARTUP_WAIT_MS = 90_000;
export const MOVE_WAIT_MS = 20_000;
export const RESIGNATION_ATTEMPTS = 3;
const WITHOUT_SEAT = "Seat not opened.";
const WITHOUT_PASS = "You need a pass to play On-chain.";
const WITHOUT_CHAIN = "Wallets play on-chain only: this build has no contract.";
const ARENA_PER_WALLET = "Guest players can not play Arena mode.";
const KEY_ELSEWHERE = "The session key changed in another tab.";

export function plyLegal({ board, repetitions, turn }, p) {
    if (p.skipped) return p.from === 63 && p.a === 63 && p.color === turn;
    if (p.color !== turn || !(p.from >= 0 && p.from < 63) || !(p.a >= 0 && p.a < 63)) return false;
    return getBoardPossibleMoves(board, p.color, repetitions)
        .some((m) => m.fromRow * 7 + m.fromCol === p.from && m.toRow * 7 + m.toCol === p.a);
}

export const CONFIRM_WAIT_MS = 2500;

export function createMatchOnline({
    onList = () => {}, onQueue = () => {}, onSearch = () => {}, onHandshake = () => {},
    onMatch = () => {}, onMove = () => {}, onDeadline = () => {}, onOutcome = () => {},
    onSynced = () => {}, onError = () => {}, onChain = () => {}, onStarted = () => {},
    onHeld = () => {}, onLagging = () => {},
    onRebuild = (replay) => replay(),
    category = CATEGORY.PRIVATE, beforeSigning = null, openSeat = null,
    chain = null, reads = chain?.reads ?? null, givenTransport = null,
    heartbeatChainMs = CHAIN_HEARTBEAT_MS, waitingStartupMs = STARTUP_WAIT_MS, waitingMoveMs = MOVE_WAIT_MS, confirmWaitMs = CONFIRM_WAIT_MS,
    heartbeatSuspendedMs = SUSPENDED_HEARTBEAT_MS, repeatSuspendedMs = SUSPENDED_REPEAT_MS,
    revelationS = CHAIN_REVEAL_S, now = Date.now, seed = null,
    repeatLastMs = LOG_REPEAT_MS, resyncHeartbeatMs = RESYNC_HEARTBEAT_MS, resyncAttempts = RESYNC_ATTEMPTS,
} = {}) {
    let client = null, transport = null, lobby = null, encounter = null, session = null;
    // The encounter of the started game, until my ready stops repeating.
    let lingering = null;
    let queue = null, expectedChallenger = null, awaitMatched = null;
    let entered = null, agreementToForget = null;
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
    // The resync in progress: whether an entry of the opponent arrived, applied or held.
    let heardInRound = false, logAnswered = false, itsRest = 0;
    let repeating = null;
    let laggingAt = -1;
    let reading = false;
    // The block times seen, against the device clock: the node behind the head is found here.
    let headsSeen = [];
    let probedAt = -Infinity, probing = null;
    let finishedUponChain = false;
    let startupInProgress = null;
    // After close() the startup leaves the agreement to the sentinel of app.js.
    let closed = false;
    // A verdict shown is final: the channel no longer moves the board.
    let concluded = false;

    function switchOn() {
        if (client) return;
        if (givenTransport) {
            client = { destroy: async () => {} };
            transport = givenTransport;
        } else {
            client = createClient(me.key);
            transport = transportStreamr(client, { streamId: channels.P[0].streamId });
        }
        if (chain) patrol();
    }

    function note(ply) {
        plyLocal.push(ply);
        turnSince = now();
    }

    // The opponent's entry on the channel is its answer: my last one stops going again.
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

    // Silent: the round of requests ended without one entry of the opponent, applied or held;
    // answered, it sent at least a log. itsRest: what its own clock still gives it on the turn
    // my log request found it on, in ms.
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

    // Its log stops under my entries: they went again, and the page reopens its clock once per entry.
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
            // A move and a Timeout on the same seq: the Timeout wins, on both sides.
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
            // An answer to an older request, after a rebuild went back: ask again from here.
            if (entries[0].data.seq > session.seq + 1) return stepBack(session.seq + 1) || resyncFailed("gap");
        }
        // Giving way, the first Timeout is the turn I lost: it is ripe.
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

    // The index of the first Timeout of my turn that my clock does not allow yet, or -1. Only the
    // first entry can skip a turn I have lived: a later one skips a turn I have not seen begin.
    // With the turn start unknown (just resumed) only the last entry waits, on the turn clock, and
    // my skipped turns since the cache was written are at most one plus one per penalized turn.
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
        // The log says what my own clock still gives me on my turn: the other waits that long
        // before declaring it skipped.
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

    // Its Timeout on my turn wins over any move I make meanwhile: my hand stays closed until it applies.
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

    let seatHaveRead = null;
    async function verifySession(wallet, session) {
        const rightNow = Date.now();
        if (!seatHaveRead || !sameAddress(seatHaveRead.wallet, wallet) || rightNow - seatHaveRead.t >= heartbeatChainMs) {
            seatHaveRead = { wallet, t: rightNow, promise: seatOf(chain.reads, wallet, chain.address) };
        }
        const seat = await seatHaveRead.promise;
        return !!seat?.session && sameAddress(seat.session, session);
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
        const { gameId } = session;
        try {
            // The first read waits for the probe of the other endpoint, so that a node behind is found at once.
            await probing;
            const haveRead = await chainRead(chain.reads, session.gameId, chain.address);
            if (!session || !haveRead) return;
            if (headStalled(chain.reads, haveRead.timeBlock, now())) { chain.reads.discard?.(); return; }
            if (behindHead(headsSeen, haveRead.timeBlock, now())) { chain.reads.discard?.(); return; }
            // With the session alive the game has started: NO is a node behind.
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
                // The page caches the game after this read: the next one forgets the agreement.
                agreementToForget = gameId;
            } else {
                if (agreementToForget === gameId) forgetAgreement(gameId);
                agreementToForget = null;
                reconcile(g);
                if (plyLocal.length > g.ply.length && !inFlight.length) await verifyLonger(haveRead);
                if (!session) return;
            }
            const aligned = plyLocal.length === g.ply.length;
            onChain({
                type: "state", seq: g.seq, lastAt: g.lastAt, turn: g.turn, status: g.status, deadline: deadlineInLocale(haveRead),
                duration: clock.duration, timeBlock, penalized: penalized(g),
                stake: BigInt(g.escrowWhite) + BigInt(g.escrowBlack),
                escrows: { white: BigInt(g.escrowWhite), black: BigInt(g.escrowBlack) },
                aligned,
            });
            if (g.status === STATUS.FINISHED && !finishedUponChain) {
                finishedUponChain = true;
                haltWatching();
                onChain({ type: "end", winner: g.winner, endReason: g.endReason, payout: g.payout, sides: session.sides });
            }
        } finally {
            reading = false;
        }
    }

    // An endpoint on an older block cannot contradict the head: it counts as absent.
    const older = (other, head) => other.timeBlock < head.timeBlock;

    // A confirming endpoint that does not answer in time counts as absent.
    function confirmation(reads) {
        let timer;
        const late = new Promise((r) => { timer = setTimeout(() => r(null), confirmWaitMs); });
        return Promise.race([chainRead(reads, session.gameId, chain.address), late])
            .then((r) => { if (r) headOffset(headsSeen, r.timeBlock, now()); return r; })
            .finally(() => clearTimeout(timer));
    }

    // Another endpoint's head, so that an active one behind it is found.
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

    // In disagreement with elsewhere(), the active endpoint is believed only if another one agrees.
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

    // At the opponent's deadline the active endpoint may be hiding a move.
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

    function sideOf(match) {
        return sameAddress(match.a, me.wallet) ? 1 : 2;
    }

    const sentinel = chain ? createSentinel({
        chain, me,
        heartbeatMs: heartbeatSuspendedMs, repeatMs: repeatSuspendedMs, heartbeatChainMs, revelationS, now,
        excluded: () => startupInProgress,
        onStarted: (entry, g) => enterTheStarted(entry, g),
        onClosed: (entry, g) => { if (!session) sentinel.closed(entry, g); },
        onError,
    }) : null;

    function patrol() {
        sentinel?.start();
    }

    function haltPatrolWork() {
        sentinel?.halt();
    }

    async function enterTheStarted(entry, g) {
        // The agreement stays in the suspended until the page caches the game: the sentinel
        // must not announce it a second time while the page is on its way in.
        if (session || closed || entered === entry.match.gameId) return;
        entered = entry.match.gameId;
        clearTimeout(awaitMatched);
        awaitMatched = null;
        expectedChallenger = null;
        lobby?.withdraw();
        encounter?.cancel("game started on the chain", "STARTED");
        onStarted({ match: entry.match, seed: g.seed, side: entry.side, log: [] });
        // After the page is in: the leave on the arena channel must not keep it out.
        const leaving = queue;
        queue = null;
        await leaving?.close().catch((e) => console.warn("arena queue not closed", e?.message ?? e));
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

    async function startUponChain(outcome) {
        const entry = { match: outcome.match, side: outcome.side, signatures: outcome.signatures, mySeed: outcome.mySeed, session: me.address };
        const { gameId } = outcome.match;
        const my = sideOf(outcome.match);
        rememberAgreement(entry);
        startupInProgress = gameId;
        const beginning = Date.now();
        let dispatched = false, forfeited = false, reported = false;
        try {
            for (;;) {
                if (closed) return null;
                const haveRead = await chainRead(chain.reads, gameId, chain.address);
                if (closed) return null;
                const stale = !!haveRead && (clockFarOff(haveRead.timeBlock, now()) || headStalled(chain.reads, haveRead.timeBlock, now()));
                const lying = !stale && haveRead?.match?.status === STATUS.IN_PROGRESS && !seedGoesBack(entry, haveRead.match, me.wallet);
                if (stale || lying) chain.reads.discard?.();
                const g = stale || lying ? undefined : haveRead?.match;
                // Started: the agreement stays until the first read caches the game (readChain).
                if (g?.status === STATUS.IN_PROGRESS) { rememberAgreement({ ...entry, started: true }); return g; }
                if (g?.status === STATUS.FINISHED) {
                    forgetAgreement(gameId);
                    sentinel.closed(entry, g);
                    return null;
                }
                const myInside = g?.status === STATUS.REVEALING && g.revealed === my;
                const expired = g?.status === STATUS.REVEALING && haveRead.timeBlock > g.lastAt + revelationS;
                if (myInside) onChain({ type: "revelation", rest: Math.max(0, g.lastAt + revelationS - haveRead.timeBlock) });
                const forfeitNow = expired && !forfeited && forfeitDue(g, my, haveRead.timeBlock, revelationS);
                // Its first seed is answered whatever happened to mine: a seed of mine that fell
                // must not leave its revelation without an answer, nor the wait give up on it.
                const itsFirst = g?.status === STATUS.REVEALING && g.revealed !== my;
                const notStarted = !myInside && !itsFirst && !forfeited && Date.now() > beginning + waitingStartupMs;
                const givingUp = myInside && Date.now() > beginning + 2 * waitingStartupMs + revelationS * 1000;
                const started = forfeitNow || notStarted || givingUp ? await sentinel.startedElsewhere(entry) : null;
                if (closed) return null;
                if (started) { rememberAgreement({ ...entry, started: true }); return started; }
                if (forfeitNow) {
                    forfeited = true;
                    if (sentinel.claim(gameId, "forfeit")) {
                        const perPass = myInside && await hasThePass(chain.reads, entry.side.wallet) === false;
                        await sentinel.dispatchForfeit(entry.match, perPass);
                    }
                } else if (notStarted) {
                    if (!reported) onError(Object.assign(new Error(NOT_STARTED + "."), { code: "STARTUP" }));
                    return null;
                } else if (givingUp) {
                    if (!reported) onError(Object.assign(new Error(NOT_STARTED + "."), { code: "STARTUP" }));
                    return null;
                } else if ((!dispatched || itsFirst) && g?.status !== STATUS.FINISHED && !expired && !stale && !lying) {
                    const kind = seedKind(g, my);
                    // A claim another tab holds is not a seed of mine: the next round asks again.
                    const sent = sentinel.claim(gameId, kind) ? await sentinel.dispatchSeed(entry, kind) : null;
                    if (sent !== null) {
                        dispatched = sent === true || sent === "refused";
                        // A seat missing is a wait, not a line: the notice comes at notStarted.
                        reported ||= sent === false || sent === "refused";
                    }
                }
                await new Promise((r) => setTimeout(r, heartbeatChainMs));
            }
        } finally {
            startupInProgress = null;
        }
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

    // The move goes again at a higher price while it waits (awaitBumping); the version that
    // never landed, the last one, is the one to forget.
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

    async function genuineChallenge(opponent, code = null, partition = partitionLobby(opponent, code)) {
        let delegation = null;
        try {
            if (!stillTheSigner(me)) return onError(Object.assign(new Error(KEY_ELSEWHERE), { code: "KEY" }));
            if (chain) {
                if (await hasThePass(chain.reads, me.wallet) === false) return onError(Object.assign(new Error(WITHOUT_PASS), { code: "PASS" }));
                if (!await api.ensureSeat()) return onError(Object.assign(new Error(WITHOUT_SEAT), { code: "SEAT" }));
                if (!stillTheSigner(me)) return onError(Object.assign(new Error(KEY_ELSEWHERE), { code: "KEY" }));
            } else {
                delegation = delegationLocale();
                if (!delegation) return onError(Object.assign(new Error(WITHOUT_CHAIN), { code: "NO_CHAIN" }));
            }
        } catch (e) {
            return onError(e);
        }
        onHandshake(opponent);
        lobby?.withdraw();
        encounter = createEncounter({
            transport, me, delegation, opponent, category, now, ...(seed ? { seed } : {}),
            verifySession: chain ? verifySession : null,
            reveal: !chain,
            onAgreement: chain ? (entry) => rememberAgreement({ ...entry, session: me.address }) : null,
            invite: code ? inviteProof(code, me.wallet) : null,
            partitionCommit: partition,
        });
        try {
            const outcome = await encounter.start();
            if (chain) {
                const g = await startUponChain(outcome);
                letLinger();
                if (!g) return null;
                await enterTheStarted({ match: outcome.match, side: outcome.side }, g);
                return g;
            }
            const { sides, myColor } = api.sidesOf(outcome);
            const complete = { ...outcome, sides, myColor };
            onMatch(complete);
            return complete;
        } catch (e) {
            await encounter?.close();
            encounter = null;
            if (e?.code === "STARTED") return null;
            lobby?.ignore(opponent);
            if (!queue) onError(e);
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

    function reenterQueue() {
        clearTimeout(awaitMatched);
        awaitMatched = null;
        expectedChallenger = null;
        if (!queue) return;
        queue.resume();
        onSearch();
    }

    async function entriesWithSeat(list) {
        if (!list.length) return list;
        const seats = await seatsOf(chain.reads, list.map((x) => x.wallet));
        if (!seats) return null;
        return list.filter((x, i) => seats[i]?.session && !seats[i].gameId && sameAddress(seats[i].session, x.from));
    }

    async function challengeMatched(opponent) {
        if (await api.challenge(opponent)) return;
        reenterQueue();
    }

    const api = {
        me,
        get session() { return session; },
        get outcomes() { return { my: outcomeMy, its: outcomeIts }; },
        get ply() { return plyLocal.slice(); },
        get uponChain() { return !!chain; },

        checkSuspended() {
            return sentinel ? sentinel.check() : Promise.resolve(false);
        },

        async ensureSeat() {
            if (!chain) return false;
            const seat = await seatOf(chain.reads, me.wallet, chain.address);
            if (seat?.session && sameAddress(seat.session, me.address)) return true;
            if (!openSeat) return false;
            if (seatInFlight) return seatInFlight;
            seatInFlight = (async () => {
                if (beforeSigning) await beforeSigning();
                return await openSeat({ leave: !!seat?.session, session: me.address });
            })();
            try {
                return await seatInFlight;
            } finally {
                seatInFlight = null;
            }
        },

        async open({ announcing = true, inviter = me.wallet, code = null } = {}) {
            switchOn();
            lobby = createLobby({ transport, me, onSwitch: onList, partition: partitionLobby(inviter, code) });
            await lobby.open({ announcing });
        },

        async challenge(opponent, { code = null, partition = partitionLobby(opponent, code) } = {}) {
            if (challengeInProgress) return null;
            challengeInProgress = true;
            try {
                return await genuineChallenge(opponent, code, partition);
            } finally {
                challengeInProgress = false;
            }
        },

        async search() {
            if (queue) return;
            if (!channels.A) return onError(Object.assign(new Error(ARENA_PER_WALLET), { code: "ARENA" }));
            try {
                if (!stillTheSigner(me)) return onError(Object.assign(new Error(KEY_ELSEWHERE), { code: "KEY" }));
                if (chain) {
                    if (await hasThePass(chain.reads, me.wallet) === false) return onError(Object.assign(new Error(WITHOUT_PASS), { code: "PASS" }));
                    if (!await api.ensureSeat()) return onError(Object.assign(new Error(WITHOUT_SEAT), { code: "SEAT" }));
                } else if (!delegationLocale()) {
                    return onError(Object.assign(new Error(WITHOUT_CHAIN), { code: "NO_CHAIN" }));
                }
            } catch (e) {
                return onError(e);
            }
            if (queue) return;
            switchOn();
            queue = createQueue({
                transport: givenTransport ?? transportStreamr(client, { streamId: channels.A[0].streamId }),
                me,
                salt: reads ? saltFromBlock(reads) : null,
                verify: chain ? entriesWithSeat : null,
                onQueue,
                onPairing: async ({ opponent, initiative }) => {
                    if (session || encounter || challengeInProgress) return;
                    queue.withdraw();
                    expectedChallenger = { wallet: opponent };
                    if (initiative) return challengeMatched(opponent);
                    clearTimeout(awaitMatched);
                    awaitMatched = setTimeout(() => {
                        if (session || encounter || challengeInProgress) return;
                        reenterQueue();
                    }, COMMIT_WAIT_MS);
                },
                onExit: (wallet) => {
                    if (session || !sameAddress(wallet, expectedChallenger?.wallet)) return;
                    if (encounter) encounter.cancel();
                    else if (awaitMatched) reenterQueue();
                },
            });
            await queue.open();
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
            await queue?.close();
            queue = null;
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
            if (!chain) forgetAgreement(match.gameId);
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
                if (session || encounter || challengeInProgress) return;
                if (sameAddress(from, me.address)) return;
                if (envelope?.type !== "commit") return;
                if (!sameAddress(envelope?.data?.to, me.wallet)) return;
                if (category === CATEGORY.ARENA && !queue) return;
                if (!queue && codeInvite && envelope.invite !== inviteProof(codeInvite, envelope.data?.from)) return;
                if (queue && !sameAddress(envelope.data.from, expectedChallenger?.wallet)) return;
                if (queue) {
                    clearTimeout(awaitMatched);
                    awaitMatched = null;
                    challengeMatched(envelope.data.from);
                    return;
                }
                api.challenge(envelope.data.from, { partition });
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
            haltPatrolWork();
            clearTimeout(awaitMatched);
            awaitMatched = null;
            await queue?.announceExit();
            await listeningChallenges?.();
            listeningChallenges = null;
            await queue?.close();
            queue = null;
            expectedChallenger = null;
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
