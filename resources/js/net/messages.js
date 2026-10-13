import { AbiCoder, keccak256, getBytes, hexlify, toUtf8Bytes } from "ethers";
import { NAME_ANIMAL, boardFlat, REPETITION_LIMIT } from "../engine/minimax.js";
import { generator } from "../game/random.js";
import helper from "../components/Game/GameHelper.js";
import { digest } from "./signatures.js";
import { CHAIN_ID, P_CHANNELS, MATCH_ADDRESS } from "./constants.js";

const abi = AbiCoder.defaultAbiCoder();

export function u256(x) {
    return BigInt(x).toString();
}

export const TYPES_MATCH = {
    Match: [
        { name: "v", type: "uint16" },
        { name: "gameId", type: "uint256" },
        { name: "a", type: "address" },
        { name: "b", type: "address" },
        { name: "commitA", type: "bytes32" },
        { name: "commitB", type: "bytes32" },
        { name: "category", type: "uint8" },
        { name: "repetitionLimit", type: "uint8" },
        { name: "turnS", type: "uint8" },
        { name: "penaltyS", type: "uint8" },
        { name: "graceS", type: "uint8" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_COMMIT = {
    Commit: [
        { name: "v", type: "uint16" },
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "commit", type: "bytes32" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_READY = {
    Ready: [
        { name: "gameId", type: "uint256" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_REVEAL = {
    Reveal: [
        { name: "gameId", type: "uint256" },
        { name: "seed", type: "bytes32" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_STATE = {
    State: [
        { name: "gameId", type: "uint256" },
        { name: "seq", type: "uint32" },
        { name: "board", type: "uint256" },
        { name: "repetitions", type: "uint32" },
        { name: "turn", type: "uint8" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_MOVE = {
    Move: [
        { name: "gameId", type: "uint256" },
        { name: "seq", type: "uint32" },
        { name: "from", type: "uint8" },
        { name: "to", type: "uint8" },
        { name: "stateBefore", type: "bytes32" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_TIMEOUT = {
    Timeout: [
        { name: "gameId", type: "uint256" },
        { name: "seq", type: "uint32" },
        { name: "stateBefore", type: "bytes32" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_OUTCOME = {
    Outcome: [
        { name: "gameId", type: "uint256" },
        { name: "winner", type: "address" },
        { name: "loser", type: "address" },
        { name: "endReason", type: "uint8" },
        { name: "seed", type: "bytes32" },
        { name: "finalBoard", type: "uint256" },
        { name: "moveCount", type: "uint16" },
        { name: "moveLogHash", type: "bytes32" },
        { name: "t", type: "uint64" },
    ],
};

export const TYPES_DEPRECATION = {
    Deprecation: [
        { name: "minVersion", type: "uint16" },
        { name: "notBefore", type: "uint64" },
    ],
};

export const END_REASON = Object.freeze({ PYRAMID: 1, RESIGNED: 2, ABANDONED: 3, WIPEOUT: 4, FORFEITED: 5 });

export const CATEGORY = Object.freeze({ NONE: 0, BOT: 1, ARENA: 2, PRIVATE: 3 });


export function encodeBoard(board) {
    const flat = Array.isArray(board) ? boardFlat(board) : board;
    let out = 0n;
    for (let i = 0; i < 63; i++) {
        const piece = flat.piece[i];
        if (piece < 0) continue;
        const slot = flat.color[i] * 8 + piece;
        out |= BigInt(64 + i) << BigInt(slot * 7);
    }
    return out;
}

export function decodeBoard(value, codeFrom = (r, c) => helper.getSquareCode(r, c)) {
    const state = {};
    for (let slot = 0; slot < 16; slot++) {
        const cell = Number((BigInt(value) >> BigInt(slot * 7)) & 0x7fn);
        if (!(cell & 64)) continue;
        const i = cell & 63;
        state[codeFrom(Math.floor(i / 7), i % 7)] = {
            color: slot < 8 ? "black" : "white",
            piece: NAME_ANIMAL[slot % 8],
        };
    }
    return state;
}

export function encodeColors({ board, white, black }) {
    return ((board === 2 ? 1 : 0) << 6) | ((white & 7) << 3) | (black & 7);
}

export function decodeColors(value) {
    return { board: (value >> 6) & 1 ? 2 : 1, white: (value >> 3) & 7, black: value & 7 };
}

export function encodeRepetitions(repetitions) {
    if (!repetitions) return 0;
    const { last, count } = repetitions;
    return ((last[0] + 1) & 15)
        | ((count[0] & 15) << 4)
        | ((last[1] + 1) & 15) << 8
        | ((count[1] & 15) << 12);
}

export function decodeRepetitions(value) {
    return {
        last: Int8Array.from([(value & 15) - 1, ((value >> 8) & 15) - 1]),
        count: Int8Array.from([(value >> 4) & 15, (value >> 12) & 15]),
    };
}

export function index(row, col) {
    return row * 7 + col;
}

export function commitOf(seed) {
    return keccak256(getBytes(seed));
}

export function commitGoesBack(seed, commit) {
    try {
        return commitOf(seed).toLowerCase() === String(commit).toLowerCase();
    } catch {
        return false;
    }
}

export function gameIdOf(a, b, commitA, commitB, t, chainId = CHAIN_ID, contract = MATCH_ADDRESS) {
    return u256(keccak256(abi.encode(
        ["uint256", "address", "address", "address", "bytes32", "bytes32", "uint64"],
        [chainId, contract, a, b, commitA, commitB, t],
    )));
}

export function partitionOf(gameId, partitions = P_CHANNELS[0].partitions) {
    return Number(BigInt(gameId) % BigInt(partitions - 1)) + 1;
}

export function invitePartition(inviter, code, partitions = P_CHANNELS[0].partitions) {
    const key = `invite:${String(inviter).toLowerCase()}:${String(code).toLowerCase()}`;
    return Number(BigInt(keccak256(toUtf8Bytes(key))) % BigInt(partitions - 1)) + 1;
}

export function inviteProof(code, from) {
    return keccak256(toUtf8Bytes(`invite-proof:${String(code).toLowerCase()}:${String(from).toLowerCase()}`));
}

export function sort(x, y) {
    return x.toLowerCase() < y.toLowerCase() ? [x, y] : [y, x];
}

export function sidesFromSeed(seed, a, b) {
    const [first, second] = sort(a, b);
    return generator(seed, "sides")() < 0.5
        ? { white: first, black: second }
        : { white: second, black: first };
}

export function newMatch({ v, a, b, commitA, commitB, category, turnS, penaltyS, graceS, t, contract }) {
    const [first, second] = sort(a, b);
    const [c1, c2] = first === a ? [commitA, commitB] : [commitB, commitA];
    return {
        v, gameId: gameIdOf(first, second, c1, c2, t, CHAIN_ID, contract ?? MATCH_ADDRESS),
        a: first, b: second, commitA: c1, commitB: c2,
        category,
        repetitionLimit: REPETITION_LIMIT,
        turnS, penaltyS, graceS, t,
    };
}

export function acceptableAgreement(match, v, category = match?.category) {
    if (!match || match.v !== v) return { ok: false, reason: "version" };
    if (match.repetitionLimit !== REPETITION_LIMIT) return { ok: false, reason: "version" };
    if (match.category !== category) return { ok: false, reason: "category" };
    if (match.category !== CATEGORY.ARENA && match.category !== CATEGORY.PRIVATE) {
        return { ok: false, reason: "category" };
    }
    return { ok: true, reason: "" };
}

export const ABSENT_CELL = 63;

export function encodePly({ color, skipped = false, from = ABSENT_CELL, a = ABSENT_CELL }) {
    const white = color === "white" || color === 1;
    return ((white ? 1 : 0) << 15)
        | ((skipped ? 1 : 0) << 14)
        | ((skipped ? ABSENT_CELL : from) << 6)
        | (skipped ? ABSENT_CELL : a);
}

export function encodeMoves(ply) {
    const byte = new Uint8Array((ply?.length ?? 0) * 2);
    (ply ?? []).forEach((p, i) => {
        const v = encodePly(p);
        byte[i * 2] = v >> 8;
        byte[i * 2 + 1] = v & 255;
    });
    return hexlify(byte);
}

export function decodeMoves(moves) {
    const byte = getBytes(moves);
    const ply = [];
    for (let i = 0; i + 1 < byte.length; i += 2) {
        const v = (byte[i] << 8) | byte[i + 1];
        ply.push({
            color: v & 0x8000 ? "white" : "black",
            skipped: (v & 0x4000) !== 0,
            from: (v >> 6) & 63,
            a: v & 63,
        });
    }
    return ply;
}

export function digestState(state) {
    return digest(TYPES_STATE, state);
}

export function stateCanonical({ gameId, seq, board, repetitions, turn, t }) {
    return {
        gameId: u256(gameId),
        seq,
        board: u256(encodeBoard(board)),
        repetitions: encodeRepetitions(repetitions),
        turn: turn === "white" ? 1 : 0,
        t,
    };
}
