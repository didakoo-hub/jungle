import { signature, signerOf } from "./signatures.js";
import { verifyDelegation } from "./delegation.js";
import { sameAddress } from "../game/wallet.js";
import { getBoardPossibleMoves } from "../engine/minimax.js";
import {
    TYPES_MOVE, TYPES_TIMEOUT, TYPES_OUTCOME,
    digestState, stateCanonical, sidesFromSeed, partitionOf,
} from "./messages.js";

const TYPES = { move: TYPES_MOVE, timeout: TYPES_TIMEOUT };

export function createSession({ match, seed, me, side, state, now = () => Math.floor(Date.now() / 1000) }) {
    if (!side?.wallet || !side?.session) throw Object.assign(new Error("Opponent side missing"), { code: "DELEGATION" });
    if (side.delegation) {
        const outcomeDelegation = verifyDelegation(side.delegation.delegation, side.delegation.signature, now() * 1000);
        if (!outcomeDelegation.ok) throw Object.assign(new Error("Opponent delegation: " + outcomeDelegation.reason), { code: "DELEGATION" });
        if (!sameAddress(side.delegation.delegation.session, side.session)) throw Object.assign(new Error("Delegation of another session"), { code: "DELEGATION" });
    }

    const sides = sidesFromSeed(seed, match.a, match.b);
    const opponent = side.wallet;
    const sessionOpponent = side.session;
    const myColor = sameAddress(sides.white, me.wallet) ? "white" : "black";
    const itsColor = myColor === "white" ? "black" : "white";

    let lastSeq = 0;
    let lastT = match.t;
    let lastItsOwn = null;
    const log = [];

    function canonical({ board, repetitions, turn }) {
        return stateCanonical({ gameId: match.gameId, seq: lastSeq, board, repetitions, turn, t: lastT });
    }

    function stateNow() {
        return canonical(state());
    }

    function itsMoves({ board, repetitions }) {
        return new Set(getBoardPossibleMoves(board, itsColor, repetitions)
            .map((m) => (m.fromRow * 7 + m.fromCol) * 63 + m.toRow * 7 + m.toCol));
    }

    function legal(position, data) {
        if (!Number.isInteger(data.from) || !Number.isInteger(data.to)) return false;
        return itsMoves(position).has(data.from * 63 + data.to);
    }

    function signatureEEnqueue(type, data) {
        const envelope = { type, data, signature: signature(me.key, TYPES[type], data) };
        lastSeq = data.seq;
        lastT = data.t;
        log.push(envelope);
        return envelope;
    }

    function sameSeq(envelope, typeIts, typeMine) {
        const { type, data, signature: f } = envelope ?? {};
        if (type !== typeIts || !Number.isInteger(data?.seq) || data.gameId !== match.gameId) return null;
        const mine = log.find((b) => b.data.seq === data.seq);
        if (mine?.type !== typeMine || mine.data.stateBefore !== data.stateBefore) return null;
        if (!sameAddress(signerOf(TYPES[typeMine], mine.data, mine.signature), me.address)) return null;
        const who = signerOf(TYPES[typeIts], data, f);
        return who && sameAddress(who, sessionOpponent) ? mine : null;
    }

    return {
        sides, myColor, itsColor, opponent,
        sessionOpponent,
        gameId: match.gameId,
        partition: partitionOf(match.gameId),
        get seq() { return lastSeq; },
        get log() { return log.slice(); },

        get lastItsOwn() { return lastItsOwn; },
        digest: () => digestState(stateNow()),

        get last() { return log.at(-1) ?? null; },
        entryAt(seq) { return log.find((b) => b.data.seq === seq) ?? null; },
        entriesFrom(seq) { return log.filter((b) => b.data.seq >= seq); },
        logBelow(seq) { return log.filter((b) => b.data.seq < seq); },

        moveFromTransmit(from, a) {
            const before = stateNow();
            if (before.turn !== (myColor === "white" ? 1 : 0)) return null;
            return signatureEEnqueue("move", {
                gameId: match.gameId, seq: lastSeq + 1,
                from: from, to: a, stateBefore: digestState(before), t: now(),
            });
        },

        deadlineFromTransmit() {
            const before = stateNow();
            if (before.turn === (myColor === "white" ? 1 : 0)) return null;
            return signatureEEnqueue("timeout", {
                gameId: match.gameId, seq: lastSeq + 1,
                stateBefore: digestState(before), t: now(),
            });
        },

        hasTheEntry(envelope) {
            return log.some((b) => b.data.seq === envelope?.data?.seq && b.signature === envelope?.signature);
        },

        deadlineOverMine(envelope) {
            return !!sameSeq(envelope, "timeout", "move");
        },

        myDeadlineUnder(envelope) {
            return sameSeq(envelope, "move", "timeout");
        },

        signedByMe(envelope) {
            const { type, data, signature: f } = envelope ?? {};
            return !!TYPES[type] && sameAddress(signerOf(TYPES[type], data, f), me.address);
        },

        outcomeToTransmit({ endReason, winner }) {
            const final = stateNow();
            const data = {
                gameId: match.gameId,
                winner: sides[winner],
                loser: sides[winner === "white" ? "black" : "white"],
                endReason,
                seed: seed,
                finalBoard: final.board,
                moveCount: lastSeq,
                moveLogHash: digestState(final),
                t: lastT,
            };
            return { type: "outcome", data, signature: signature(me.key, TYPES_OUTCOME, data) };
        },

        accept(envelope) {
            const { type, data, signature: f } = envelope ?? {};
            if (type !== "move" && type !== "timeout") return { ok: false, reason: "type" };
            if (!data || data.gameId !== match.gameId) return { ok: false, reason: "game" };
            if (!Number.isInteger(data.seq)) return { ok: false, reason: "sequence" };
            if (data.seq <= lastSeq) return { ok: false, reason: "sequence" };
            if (data.seq > lastSeq + 1) return { ok: false, reason: "gap" };

            const haveRead = state();
            const before = canonical(haveRead);
            const whoTouches = type === "move" ? itsColor : myColor;
            if (before.turn !== (whoTouches === "white" ? 1 : 0)) return { ok: false, reason: "turn" };
            if (data.stateBefore !== digestState(before)) return { ok: false, reason: "position" };
            if (type === "move" && !legal(haveRead, data)) return { ok: false, reason: "illegal" };

            const who = signerOf(TYPES[type], data, f);
            if (!who || !sameAddress(who, sessionOpponent)) return { ok: false, reason: "signature" };

            lastSeq = data.seq;
            lastT = data.t;
            if (type === "move") lastItsOwn = { state: before, envelope: { type, data, signature: f } };
            log.push({ type, data, signature: f });
            return { ok: true, reason: "" };
        },

        acceptOutcome(envelope) {
            const data = envelope?.data;
            if (!data || data.gameId !== match.gameId) return { ok: false, reason: "game" };
            if (!sameAddress(data.loser, opponent)) return { ok: false, reason: "loser" };
            const who = signerOf(TYPES_OUTCOME, data, envelope?.signature);
            return who && sameAddress(who, sessionOpponent)
                ? { ok: true, reason: "" }
                : { ok: false, reason: "signature" };
        },

        resumeFromLog(entries, apply) {
            for (const envelope of entries ?? []) {
                const who = envelope?.type === "move" || envelope?.type === "timeout"
                    ? signerOf(TYPES[envelope.type], envelope.data, envelope.signature)
                    : null;
                const mine = who && sameAddress(who, me.address);
                const outcome = mine
                    ? verifyMine(envelope, stateNow(), lastSeq)
                    : this.accept(envelope);
                if (!outcome.ok) return { ok: false, reason: outcome.reason, until: lastSeq };
                if (mine) { lastSeq = envelope.data.seq; lastT = envelope.data.t; log.push(envelope); }
                apply(envelope);
            }
            return { ok: true, reason: "", until: lastSeq };
        },
    };
}

function verifyMine(envelope, before, lastSeq) {
    if (envelope.data.seq !== lastSeq + 1) return { ok: false, reason: "sequence" };
    if (envelope.data.stateBefore !== digestState(before)) return { ok: false, reason: "position" };
    return { ok: true, reason: "" };
}
