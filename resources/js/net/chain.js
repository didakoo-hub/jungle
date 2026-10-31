import { AbiCoder, Interface, Transaction, computeAddress, isAddress, keccak256 } from "ethers";
import {
    CHAIN_ID, MATCH_ADDRESS, MEMENTO_ADDRESS, PASS_ADDRESS, PROTOCOL_V, STREAMR_REGISTRY,
} from "./constants.js";
import { CATEGORY, decodeMoves } from "./messages.js";

const ZERO = "0x0000000000000000000000000000000000000000";

export const OPEN_SIGNATURE = "jungledidakooOpen(address,uint8,address,uint16)";
export const JOIN_SIGNATURE = "jungledidakooJoin(address,address,bytes,uint16)";
export const LEAVE_SIGNATURE = "jungledidakooLeave()";
export const MOVE_SIGNATURE = "jungledidakooMove(uint256,uint32,uint8,uint8)";
export const RESIGN_SIGNATURE = "jungledidakooResign(uint256)";
export const CLOSE_SIGNATURE = "jungledidakooClose(uint256)";

const GAME_TUPLE =
    "tuple(address white,address black,address sessionWhite,address sessionBlack,"
    + "uint128 escrowWhite,uint128 escrowBlack,uint256 board,uint32 repetitions,uint8 turn,"
    + "uint8 penalized,uint32 seq,uint64 lastAt,uint8 repetitionLimit,uint8 colors,uint8 category,bytes32 seed,"
    + "uint8 status,uint64 seedBlock,address winner,uint8 endReason,bytes moves)";

export const MATCH_ABI = new Interface([
    `function ${OPEN_SIGNATURE} payable`,
    `function ${JOIN_SIGNATURE} payable`,
    `function ${LEAVE_SIGNATURE}`,
    `function ${MOVE_SIGNATURE}`,
    `function ${RESIGN_SIGNATURE}`,
    `function ${CLOSE_SIGNATURE}`,
    `function gameOf(uint256) view returns (${GAME_TUPLE})`,
    "function seats(address) view returns (address session, uint128 escrow, uint256 gameId, uint8 category, address invite, uint16 v)",
    "function sessionOf(address) view returns (address)",
    "function TURN_SECONDS() view returns (uint64)",
    "function PENALTY_SECONDS() view returns (uint64)",
    "function clockOf(uint256) view returns (uint8 turn, uint8 penalized, uint64 startedAt, uint64 deadline, uint8 skips)",
    "event Started(uint256 indexed gameId, address indexed white, address indexed black, uint8 category)",
]);

export const MEMENTO_ABI = new Interface([
    "function drawing(uint256) view returns (uint128 board,uint8 colors,uint8 category,uint8 endReason,"
    + "uint32 moveCount,uint64 mintedAt,address winner,address loser,bool winnerIsWhite,bytes32 seed)",
    "function tokensOf(address) view returns (uint256[])",
    "function totalMinted() view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const MATCH_PROBES = 24;

export const MATCH_ROUNDS = 12;

export const MATCHES_CHUNK = 100;

export function gameIdOf(n, { chainId = CHAIN_ID, match = MATCH_ADDRESS } = {}) {
    const encoded = AbiCoder.defaultAbiCoder().encode(["uint256", "address", "uint256"], [chainId, match, n]);
    return BigInt(keccak256(encoded)).toString();
}

async function aggregate(network, calls) {
    const data = await network.call(MULTICALL3, ABI_MULTICALL.encodeFunctionData("aggregate3", [calls]));
    const [outcomes] = ABI_MULTICALL.decodeFunctionResult("aggregate3", data);
    if (outcomes.length !== calls.length || outcomes.some((o) => !o.success)) throw new Error("multicall");
    return outcomes.map((o) => o.returnData);
}

async function matchesExist(network, ns, match) {
    const read = await aggregate(network, ns.map((n) =>
        [match, true, MATCH_ABI.encodeFunctionData("gameOf", [gameIdOf(n, { match })])]));
    return read.map((data) => Number(MATCH_ABI.decodeFunctionResult("gameOf", data)[0].status) !== 0);
}

function probesBetween(low, high) {
    const inside = new Set();
    for (let i = 1; i <= MATCH_PROBES; i++) inside.add(low + Math.round(((high - low) * i) / (MATCH_PROBES + 1)));
    return [...inside].filter((n) => n > low && n < high);
}

export async function lastMatch(network, hint = 0, match = MATCH_ADDRESS) {
    if (matchAbsent(match) || !network) return null;
    const powers = (from) => Array.from({ length: MATCH_PROBES }, (_, i) => from + 2 ** i);
    let low = 0;
    let high = null;
    let probes = Number.isSafeInteger(hint) && hint > 0 ? [hint, ...powers(hint)] : powers(0);
    try {
        for (let round = 0; round < MATCH_ROUNDS; round++) {
            const found = await matchesExist(network, probes, match);
            probes.forEach((n, i) => {
                if (found[i]) low = Math.max(low, n);
                else high = high === null ? n : Math.min(high, n);
            });
            if (high !== null && high <= low) return null;
            if (high === low + 1) return low;
            probes = high === null ? powers(low) : probesBetween(low, high);
        }
    } catch {
    }
    return null;
}

function drawingOf(gameId, data) {
    const d = MEMENTO_ABI.decodeFunctionResult("drawing", data);
    return {
        gameId: gameId.toString(),
        category: Number(d.category), endReason: Number(d.endReason),
        moveCount: Number(d.moveCount), mintedAt: Number(d.mintedAt),
        winner: d.winner, loser: d.loser, winnerIsWhite: d.winnerIsWhite,
    };
}

export async function mintedMatches(network, from, want, {
    chunk = MATCHES_CHUNK, match = MATCH_ADDRESS, memento = MEMENTO_ADDRESS,
} = {}) {
    if (matchAbsent(match) || !network || !isAddress(memento) || memento === ZERO) return null;
    const lines = [];
    let next = from;
    try {
        while (next > 0 && lines.length < want) {
            const ns = Array.from({ length: Math.min(chunk, next) }, (_, i) => next - i);
            const ids = ns.map((n) => gameIdOf(n, { match }));
            const read = await aggregate(network, ids.map((id) =>
                [memento, true, MEMENTO_ABI.encodeFunctionData("drawing", [id])]));
            for (let i = 0; i < ns.length && lines.length < want; i++) {
                next = ns[i] - 1;
                const d = drawingOf(ids[i], read[i]);
                if (d.mintedAt) lines.push(d);
            }
        }
    } catch {
        return null;
    }
    return { lines, next };
}

export async function mintedCount(network, memento = MEMENTO_ADDRESS) {
    if (!network || !isAddress(memento) || memento === ZERO) return null;
    try {
        const data = await network.call(memento, MEMENTO_ABI.encodeFunctionData("totalMinted", []));
        return Number(MEMENTO_ABI.decodeFunctionResult("totalMinted", data)[0]);
    } catch {
        return null;
    }
}

export async function tokensOf(network, address, memento = MEMENTO_ADDRESS) {
    if (!network || !isAddress(address) || !isAddress(memento) || memento === ZERO) return null;
    try {
        const data = await network.call(memento, MEMENTO_ABI.encodeFunctionData("tokensOf", [address]));
        return MEMENTO_ABI.decodeFunctionResult("tokensOf", data)[0].map((t) => t.toString());
    } catch {
        return null;
    }
}

export async function tokenListsOf(network, addresses, memento = MEMENTO_ADDRESS) {
    if (!network || !addresses.length || !isAddress(memento) || memento === ZERO) return null;
    try {
        const read = await aggregate(network, addresses.map((address) =>
            [memento, true, MEMENTO_ABI.encodeFunctionData("tokensOf", [address])]));
        return new Map(addresses.map((address, i) =>
            [address, MEMENTO_ABI.decodeFunctionResult("tokensOf", read[i])[0].map((t) => t.toString())]));
    } catch {
        return null;
    }
}

export async function arenaCountsOf(network, lists, { chunk = MATCHES_CHUNK, memento = MEMENTO_ADDRESS } = {}) {
    if (!network || !isAddress(memento) || memento === ZERO) return null;
    const ids = [...lists.values()].flat();
    const parts = [];
    for (let i = 0; i < ids.length; i += chunk) parts.push(ids.slice(i, i + chunk));
    try {
        const read = (await Promise.all(parts.map((part) => aggregate(network, part.map((id) =>
            [memento, true, MEMENTO_ABI.encodeFunctionData("drawing", [id])]))))).flat();
        const arena = new Set(ids.filter((id, i) => drawingOf(id, read[i]).category === CATEGORY.ARENA));
        return new Map([...lists].map(([address, own]) => [address, own.filter((id) => arena.has(id)).length]));
    } catch {
        return null;
    }
}

export const ABI_PASS = new Interface([
    "function balanceOf(address) view returns (uint256)",
    "function collection() view returns (address)",
]);

export const STAKE_WEI = 5n * 10n ** 18n;

export const CHAIN_START_S = 5;

export const SEED_BLOCKS = 256;

export const CHAIN_TURN_S = 20;

export const CHAIN_PENALTY_S = 10;

export const MOVE_MARGIN_S = 4;

export function durationOutOfRange(clock) {
    return clock.duration !== CHAIN_TURN_S && clock.duration !== CHAIN_PENALTY_S;
}

export function decodeClock(data) {
    const [turn, penalized, startedAt, deadline, skips] = MATCH_ABI.decodeFunctionResult("clockOf", data);
    return {
        turn: Number(turn), penalized: Number(penalized), lastAt: Number(startedAt),
        deadline: Number(deadline), skips: Number(skips), duration: Number(deadline - startedAt),
    };
}

export function clockInconsistent(g, clock, timeBlock) {
    if (!(clock.lastAt <= timeBlock + (g.seq === 0 ? CHAIN_START_S : 0))) return true;
    if (clock.turn !== (g.turn + clock.skips) % 2) return true;
    if (clock.skips === 0) return clock.lastAt !== g.lastAt || clock.penalized !== g.penalized;
    return clock.lastAt <= g.lastAt;
}

export function withClock(g, clock) {
    const ply = g.ply.slice();
    let turn = g.turn;
    for (let i = 0; i < clock.skips; i++) {
        ply.push({ color: turn === 1 ? "white" : "black", skipped: true, from: 63, a: 63 });
        turn = 1 - turn;
    }
    return { ...g, ply, turn: clock.turn, penalized: clock.penalized, lastAt: clock.lastAt };
}

export const STATUS = Object.freeze({ NO: 0, IN_PROGRESS: 1, FINISHED: 2 });

const NO_INVITE = ZERO;

export function calldataOpening(session, category, invite = NO_INVITE, v = PROTOCOL_V) {
    return MATCH_ABI.encodeFunctionData(OPEN_SIGNATURE, [session, category, invite, v]);
}

export function calldataJoining(host, session, signature, v = PROTOCOL_V) {
    return MATCH_ABI.encodeFunctionData(JOIN_SIGNATURE, [host, session, signature, v]);
}

export function inviteDigest(host, guest, { chainId = CHAIN_ID, match = MATCH_ADDRESS } = {}) {
    return keccak256(AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "address", "address"], [chainId, match, host, guest],
    ));
}

export function inviteSignature(inviteKey, host, guest, options) {
    return inviteKey.sign(inviteDigest(host, guest, options)).serialized;
}

export function calldataExit() {
    return MATCH_ABI.encodeFunctionData(LEAVE_SIGNATURE, []);
}

export function calldataMove(gameId, seq, from, a) {
    return MATCH_ABI.encodeFunctionData(MOVE_SIGNATURE, [gameId, seq, from, a]);
}

export function calldataResignation(gameId) {
    return MATCH_ABI.encodeFunctionData(RESIGN_SIGNATURE, [gameId]);
}

export function calldataClosing(gameId) {
    return MATCH_ABI.encodeFunctionData(CLOSE_SIGNATURE, [gameId]);
}

export function matchAbsent(match = MATCH_ADDRESS) {
    return !isAddress(match) || match === ZERO;
}

function decodeMatch(data) {
    const [g] = MATCH_ABI.decodeFunctionResult("gameOf", data);
    return {
        white: g.white, black: g.black,
        sessionWhite: g.sessionWhite, sessionBlack: g.sessionBlack,
        escrowWhite: g.escrowWhite, escrowBlack: g.escrowBlack,
        board: g.board.toString(), repetitions: Number(g.repetitions),
        turn: Number(g.turn), penalized: Number(g.penalized), seq: Number(g.seq), lastAt: Number(g.lastAt),
        repetitionLimit: Number(g.repetitionLimit), colors: Number(g.colors),
        category: Number(g.category), seed: g.seed,
        status: Number(g.status), seedBlock: Number(g.seedBlock), winner: g.winner, endReason: Number(g.endReason),
        moves: g.moves,
        ply: decodeMoves(g.moves),
    };
}

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const ABI_MULTICALL = new Interface([
    "function aggregate3((address target, bool allowFailure, bytes callData)[] calls)"
        + " view returns ((bool success, bytes returnData)[])",
    "function getCurrentBlockTimestamp() view returns (uint256)",
    "function getBlockNumber() view returns (uint256)",
]);

export const CLOCK_SKEW_S = 60;

export function clockFarOff(timeBlock, nowMs = Date.now(), deviation = CLOCK_SKEW_S) {
    return !Number.isFinite(timeBlock) || Math.abs(nowMs / 1000 - timeBlock) > deviation;
}

export const HEAD_STALLED_S = 8;
const heads = new WeakMap();
export function headStalled(network, timeBlock, nowMs = Date.now()) {
    if (!network || !Number.isFinite(timeBlock)) return false;
    const head = heads.get(network);
    if (!head || timeBlock > head.top) { heads.set(network, { top: timeBlock, since: nowMs }); return false; }
    if (nowMs - head.since < HEAD_STALLED_S * 1000) return false;
    head.since = nowMs;
    return true;
}

export const HEAD_WINDOW_S = 90;
export const HEAD_BEHIND_S = MOVE_MARGIN_S + 2;
export function headOffset(record, timeBlock, nowMs = Date.now()) {
    if (!Array.isArray(record) || !Number.isFinite(timeBlock)) return null;
    const kept = record.filter((o) => nowMs - o.at < HEAD_WINDOW_S * 1000);
    kept.push({ offset: timeBlock - nowMs / 1000, at: nowMs });
    record.splice(0, record.length, ...kept);
    return Math.max(...kept.map((o) => o.offset));
}
export function behindHead(record, timeBlock, nowMs = Date.now(), behindS = HEAD_BEHIND_S) {
    const best = headOffset(record, timeBlock, nowMs);
    return best !== null && best - (timeBlock - nowMs / 1000) > behindS;
}

export const ENDPOINTS_AGREE_S = 10;

export async function deviceClockWrong(network, { now = Date.now, deviation = CLOCK_SKEW_S, agree = ENDPOINTS_AGREE_S } = {}) {
    try {
        const another = network?.elsewhere?.();
        if (!another) return false;
        const [a, b] = await Promise.all([network.block("latest"), another.block("latest")]);
        if (!Number.isFinite(a?.time) || !Number.isFinite(b?.time) || Math.abs(a.time - b.time) > agree) return false;
        return clockFarOff(a.time, now(), deviation) && clockFarOff(b.time, now(), deviation);
    } catch {
        return false;
    }
}

export const CHAIN_HALT_S = 120;

export async function chainDown(network, { now = Date.now, halted = CHAIN_HALT_S } = {}) {
    const old = async (r) => {
        const b = await r.block("latest");
        return Number.isFinite(b?.time) && now() / 1000 - b.time > halted;
    };
    try {
        if (!network || !await old(network)) return false;
        const another = network.elsewhere?.();
        return another ? await old(another) : true;
    } catch {
        return false;
    }
}

export async function chainRead(network, gameId, match = MATCH_ADDRESS) {
    if (matchAbsent(match) || !network) return null;
    try {
        const data = await network.call(MULTICALL3, ABI_MULTICALL.encodeFunctionData("aggregate3", [[
            [match, false, MATCH_ABI.encodeFunctionData("gameOf", [gameId])],
            [match, false, MATCH_ABI.encodeFunctionData("clockOf", [gameId])],
            [MULTICALL3, false, ABI_MULTICALL.encodeFunctionData("getCurrentBlockTimestamp", [])],
            [MULTICALL3, true, ABI_MULTICALL.encodeFunctionData("getBlockNumber", [])],
        ]]));
        const [[game, clock, now, number]] = ABI_MULTICALL.decodeFunctionResult("aggregate3", data);
        if (!game.success || !clock.success || !now.success) return null;
        return {
            match: decodeMatch(game.returnData),
            clock: decodeClock(clock.returnData),
            timeBlock: Number(ABI_MULTICALL.decodeFunctionResult("getCurrentBlockTimestamp", now.returnData)[0]),
            blockNumber: number?.success ? Number(ABI_MULTICALL.decodeFunctionResult("getBlockNumber", number.returnData)[0]) : null,
        };
    } catch {
        return null;
    }
}

function decodeSeat(data) {
    const [session, escrow, gameId, category, invite, v] = MATCH_ABI.decodeFunctionResult("seats", data);
    return {
        session: session === ZERO ? null : session, escrow, gameId: gameId === 0n ? null : gameId.toString(),
        category: Number(category), invite: invite === ZERO ? null : invite, v: Number(v),
    };
}

export async function seatOf(network, wallet, match = MATCH_ADDRESS) {
    if (matchAbsent(match) || !network || !isAddress(wallet)) return null;
    try {
        return decodeSeat(await network.call(match, MATCH_ABI.encodeFunctionData("seats", [wallet])));
    } catch {
        return null;
    }
}

export async function sessionOf(network, session, match = MATCH_ADDRESS) {
    if (matchAbsent(match) || !network || !isAddress(session)) return null;
    try {
        const data = await network.call(match, MATCH_ABI.encodeFunctionData("sessionOf", [session]));
        const [who] = MATCH_ABI.decodeFunctionResult("sessionOf", data);
        return who === ZERO ? null : who;
    } catch {
        return null;
    }
}

export const REGISTRY_ABI = new Interface([
    "function hasPublicPermission(string streamId, uint8 permissionType) view returns (bool)",
    "function hasPermission(string streamId, address user, uint8 permissionType) view returns (bool)",
]);

export const PERMISSION = Object.freeze({ PUBLISH: 2, GRANT: 4 });

export async function publicationPublish(network, streamId, registry = STREAMR_REGISTRY) {
    if (!network || !streamId) return true;
    try {
        const data = await network.call(registry, REGISTRY_ABI.encodeFunctionData("hasPublicPermission", [streamId, PERMISSION.PUBLISH]));
        return REGISTRY_ABI.decodeFunctionResult("hasPublicPermission", data)[0];
    } catch {
        return true;
    }
}

export async function hasPermission(network, streamId, who, permission, registry = STREAMR_REGISTRY) {
    if (!network || !streamId || !isAddress(who)) return null;
    try {
        const data = await network.call(registry, REGISTRY_ABI.encodeFunctionData("hasPermission", [streamId, who, permission]));
        return REGISTRY_ABI.decodeFunctionResult("hasPermission", data)[0];
    } catch {
        return null;
    }
}

export async function hasThePass(network, wallet, pass = PASS_ADDRESS) {
    if (!network || !isAddress(wallet) || !isAddress(pass) || pass === ZERO) return false;
    try {
        const data = await network.call(pass, ABI_PASS.encodeFunctionData("balanceOf", [wallet]));
        return ABI_PASS.decodeFunctionResult("balanceOf", data)[0] > 0n;
    } catch {
        return null;
    }
}

export async function mementoOf(network, tokenId, memento = MEMENTO_ADDRESS) {
    if (!network || !isAddress(memento) || memento === ZERO) return null;
    try {
        return drawingOf(tokenId, await network.call(memento, MEMENTO_ABI.encodeFunctionData("drawing", [tokenId])));
    } catch {
        return null;
    }
}

export const MIN_TIP = 30_000_000_000n;
export const MAX_TIP = 60_000_000_000n;
export const BASE_CAP = 2n;
export const BASE_SPREAD = 3n;
export const REPLACEMENT_BUMP = 110n;
export const GAS_RESERVE = 1_200_000n;
export const FUNDS_FINISHED = "FUNDS";

export function fundsFinished(e) {
    return e?.code === FUNDS_FINISHED || /insufficient funds/i.test(e?.message ?? "");
}

export const NODE_REFUSAL = "The node refused the transaction.";

export function nodeWords(e) {
    const m = String(e?.message ?? e ?? "").toLowerCase();
    if (fundsFinished(e)) return "Funds finished.";
    if (/nonce too low|already known|underpriced/.test(m)) return "Transaction already sent.";
    if (/revert/.test(m)) return "The contract refused the transaction.";
    if (/timeout|timed out|abort|fetch|network/.test(m)) return "The node did not answer.";
    return NODE_REFUSAL;
}

const maxOf = (...vs) => vs.reduce((m, v) => (v > m ? v : m));
const tight = (v, minimum, maximum) => (v < minimum ? minimum : v > maximum ? maximum : v);

const baseFeeOf = async (network) => {
    if (typeof network?.block !== "function") return 0n;
    const b = await network.block().catch(() => null);
    return typeof b?.baseFee === "bigint" && b.baseFee > 0n ? b.baseFee : 0n;
};

async function pricesMove(network) {
    const other = typeof network.elsewhere === "function" ? network.elsewhere() : null;
    const [baseHere, baseThere, suggested] = await Promise.all([
        baseFeeOf(network),
        baseFeeOf(other),
        typeof network.tip === "function" ? network.tip().catch(() => null) : null,
    ]);
    const tip = tight(typeof suggested === "bigint" ? suggested : MIN_TIP, MIN_TIP, MAX_TIP);
    const [low, high] = baseHere < baseThere ? [baseHere, baseThere] : [baseThere, baseHere];
    const capOf = (base) => maxOf(base * BASE_CAP + tip, tip);
    if (high === 0n) {
        const cap = maxOf((await network.gas()) * BASE_CAP, tip);
        return { tip, cap, floor: cap, spread: cap };
    }
    return {
        tip, cap: capOf(high), floor: capOf(low > 0n ? low : high),
        spread: capOf(low > 0n ? tight(high, low, low * BASE_SPREAD) : high),
    };
}

export function createTransmitter(network, key, { a = MATCH_ADDRESS, chainId = CHAIN_ID } = {}) {
    const sender = computeAddress(key.publicKey);
    let nonce = null;
    let line = Promise.resolve();
    const rawOnes = new Map();
    const forgotten = new Map();

    async function nextNonce() {
        if (nonce === null) nonce = await network.count(sender);
        return nonce;
    }

    async function freshCount() {
        const others = (network.others?.() ?? []).filter((r) => typeof r.count === "function");
        const counts = await Promise.all([network.count(sender, "latest"), ...others.map((r) => r.count(sender, "latest").catch(() => -1))]);
        return Math.max(...counts);
    }

    async function occupyForgotten(prices) {
        const balance = typeof network.balance === "function" ? await network.balance(sender).catch(() => null) : null;
        const affordable = balance !== null && balance / TRANSFER_GAS < prices.cap ? balance / TRANSFER_GAS : prices.cap;
        let after = -1;
        for (const [n, old] of [...forgotten].sort((x, y) => x[0] - y[0])) {
            const tip = maxOf(prices.tip, old.tip * REPLACEMENT_BUMP / 100n + 1n);
            const cap = maxOf(affordable, old.cap * REPLACEMENT_BUMP / 100n + 1n, tip);
            const tx = Transaction.from({
                type: 2, chainId, nonce: n, to: sender, value: 0n,
                maxFeePerGas: cap, maxPriorityFeePerGas: tip, gasLimit: TRANSFER_GAS,
            });
            tx.signature = key.sign(tx.unsignedHash);
            try {
                rawOnes.set(await network.transmit(tx.serialized), tx.serialized);
            } catch (e) {
                if (!nonceOld(e)) {
                    console.warn("forgotten nonce not replaced", n, e?.message ?? e);
                    continue;
                }
            }
            forgotten.delete(n);
            after = n + 1;
        }
        if (after >= 0) {
            const counted = await network.count(sender);
            nonce = counted > after ? counted : after;
        }
    }

    async function dispatch(data) {
        const request = { from: sender, to: a, data: data, value: "0x0" };
        if (forgotten.size > 0) await occupyForgotten(await pricesMove(network));
        let [prices, estimate, balance, n] = await Promise.all([
            pricesMove(network),
            network.estimate(request).catch(() => GAS_RESERVE),
            typeof network.balance === "function" ? network.balance(sender).catch(() => null) : null,
            nextNonce(),
        ]);
        const limit = estimate * 120n / 100n;
        if (balance !== null && balance < prices.floor * limit) {
            throw Object.assign(new Error("funds finished"), { code: FUNDS_FINISHED });
        }
        if (balance !== null) prices = { ...prices, cap: tight(prices.cap, prices.floor, balance / limit) };
        for (let attempt = 0; ; attempt++) {
            const tx = Transaction.from({
                type: 2, chainId, nonce: n, to: a, data: data,
                maxFeePerGas: prices.cap, maxPriorityFeePerGas: prices.tip, gasLimit: limit,
            });
            tx.signature = key.sign(tx.unsignedHash);
            try {
                const hash = await network.transmit(tx.serialized);
                nonce = n + 1;
                forgotten.delete(n);
                rawOnes.set(hash, tx.serialized);
                return hash;
            } catch (e) {
                nonce = null;
                if (attempt === 0 && nonceOld(e)) {
                    n = await freshCount();
                    continue;
                }
                throw e;
            }
        }
    }

    return {
        sender,

        send(data) {
            const turn = line.then(() => dispatch(data));
            line = turn.catch(() => {});
            return turn;
        },

        forget(hash) {
            nonce = null;
            const rawOne = rawOnes.get(hash);
            if (!rawOne) return;
            const tx = Transaction.from(rawOne);
            forgotten.set(tx.nonce, { cap: tx.maxFeePerGas, tip: tx.maxPriorityFeePerGas });
        },

        async bump(hash) {
            const rawOne = rawOnes.get(hash);
            if (!rawOne) return null;
            const old = Transaction.from(rawOne);
            const [prices, balance] = await Promise.all([
                pricesMove(network),
                typeof network.balance === "function" ? network.balance(sender).catch(() => null) : null,
            ]);
            const tip = maxOf(old.maxPriorityFeePerGas * REPLACEMENT_BUMP / 100n + 1n, MAX_TIP);
            const least = maxOf(old.maxFeePerGas * REPLACEMENT_BUMP / 100n + 1n, tip);
            let cap = maxOf(least, prices.cap - prices.tip + tip);
            if (balance !== null && balance / old.gasLimit < cap) cap = balance / old.gasLimit;
            if (cap < least) return null;
            const tx = Transaction.from({
                type: 2, chainId, nonce: old.nonce, to: old.to, data: old.data, value: old.value,
                maxFeePerGas: cap, maxPriorityFeePerGas: tip, gasLimit: old.gasLimit,
            });
            tx.signature = key.sign(tx.unsignedHash);
            const another = network.elsewhere?.() ?? null;
            const sent = await Promise.allSettled([
                network.transmit(tx.serialized),
                another ? another.transmit(tx.serialized) : Promise.reject(new Error("no other endpoint")),
            ]);
            const taken = sent.find((r) => r.status === "fulfilled");
            if (!taken) return null;
            rawOnes.set(taken.value, tx.serialized);
            return taken.value;
        },

        async repeat(hash, another) {
            const rawOne = rawOnes.get(hash);
            if (!rawOne || typeof another?.transmit !== "function") return false;
            try {
                await another.transmit(rawOne);
                return true;
            } catch {
                return false;
            }
        },
    };
}

export const TRANSFER_GAS = 21_000n;
export const FLOAT_DUST_WEI = 10n ** 16n;

export async function returnFloat(network, key, wallet, { chainId = CHAIN_ID, dust = FLOAT_DUST_WEI, cap = RECEIPT_CAP_MS } = {}) {
    if (!isAddress(wallet)) return { hash: null, amount: 0n, landed: true };
    const sender = computeAddress(key.publicKey);
    const others = network.others?.() ?? [];
    const [balances, prices, counts, estimate] = await Promise.all([
        Promise.all([network.balance(sender), ...others.filter((r) => typeof r.balance === "function").map((r) => r.balance(sender).catch(() => null))]),
        pricesMove(network),
        Promise.all([network.count(sender), ...others.filter((r) => typeof r.count === "function").map((r) => r.count(sender).catch(() => -1))]),
        network.estimate({ from: sender, to: wallet, value: "0x1" }).catch(() => TRANSFER_GAS),
    ]);
    const balance = balances.filter((b) => typeof b === "bigint").reduce((x, y) => (y < x ? y : x));
    const limit = estimate > TRANSFER_GAS ? estimate : TRANSFER_GAS;
    const amount = balance - prices.spread * limit;
    if (amount < dust) return { hash: null, amount: 0n, landed: true };
    const tx = Transaction.from({
        type: 2, chainId, nonce: Math.max(...counts), to: wallet, value: amount,
        maxFeePerGas: prices.spread, maxPriorityFeePerGas: prices.tip, gasLimit: limit,
    });
    tx.signature = key.sign(tx.unsignedHash);
    const another = network.elsewhere?.() ?? null;
    const [here, there] = await Promise.allSettled([
        network.transmit(tx.serialized),
        another ? another.transmit(tx.serialized) : Promise.reject(new Error("no other endpoint")),
    ]);
    if (here.status === "rejected" && there.status === "rejected") throw here.reason;
    const hash = tx.hash;
    const landed = await awaitReceipt(network, hash, { cap }) ?? (another ? await awaitReceipt(another, hash, { cap }) : null);
    return { hash, amount, landed };
}

export function nonceOld(e) {
    return /nonce too low/i.test(e?.message ?? "");
}

export const RECEIPT_HEARTBEAT_MS = 2000;
export const RECEIPT_CAP_MS = 120000;

export async function awaitReceipt(network, hash, {
    heartbeat = RECEIPT_HEARTBEAT_MS,
    cap = RECEIPT_CAP_MS,
    final = false,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
    if (typeof hash !== "string" || typeof network?.receipt !== "function") return null;
    const end = now() + cap;
    let block = null;

    for (;;) {
        if (block === null) {
            const r = await network.receipt(hash).catch(() => null);
            if (r) {
                if (Number(r.status ?? 1) !== 1) return false;
                if (!final || typeof network.finalized !== "function") return true;
                block = Number(r.blockNumber);
                if (!Number.isInteger(block)) return true;
            }
        } else {
            const head = await network.finalized().catch(() => null);
            if (!Number.isInteger(head)) return true;
            if (head >= block) return true;
        }
        if (now() >= end) return null;
        await sleep(Math.min(heartbeat, Math.max(0, end - now())));
    }
}

export async function awaitBumping(reads, transmitter, hash, cap, {
    every = cap / 4,
    heartbeat = RECEIPT_HEARTBEAT_MS,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
    if (typeof hash !== "string") return { gone: null, hash };
    const hashes = [hash];
    const readers = [reads, reads.elsewhere?.()].filter((r) => typeof r?.receipt === "function");
    const end = now() + cap;
    let next = now() + every;
    for (;;) {
        for (const r of readers) {
            for (const h of hashes) {
                const receipt = await r.receipt(h).catch(() => null);
                if (receipt) return { gone: Number(receipt.status ?? 1) === 1, hash: h };
            }
        }
        if (now() >= end) return { gone: null, hash: hashes.at(-1) };
        if (now() >= next) {
            const bumped = typeof transmitter.bump === "function" ? await transmitter.bump(hashes.at(-1)).catch(() => null) : null;
            if (bumped && !hashes.includes(bumped)) hashes.push(bumped);
            next = now() + every;
        }
        await sleep(Math.min(heartbeat, Math.max(0, Math.min(end, next) - now())));
    }
}

export const REASONS = Object.freeze({
    CONTRACT: "contract missing",
    NETWORK: "wrong network",
    SENDER: "sender missing",
    SESSION: "session of another wallet",
    CLOCK: "device clock wrong",
    CHAIN: "chain unreadable",
});

export async function openSeat(network, reads, {
    from, session, category, invite = NO_INVITE, host = null, signature = null, match = MATCH_ADDRESS,
}) {
    if (matchAbsent(match)) return { ok: false, reason: REASONS.CONTRACT };
    if (!isAddress(from) || !isAddress(session)) return { ok: false, reason: REASONS.SENDER };
    const chain = await network.network();
    if (chain !== CHAIN_ID) return { ok: false, reason: REASONS.NETWORK, awaited: CHAIN_ID, found: chain };
    const who = await sessionOf(reads, session, match);
    if (who && who.toLowerCase() !== from.toLowerCase()) return { ok: false, reason: REASONS.SESSION };
    const data = host ? calldataJoining(host, session, signature) : calldataOpening(session, category, invite);
    return { ok: true, hash: await network.send(from, match, data, "0x" + STAKE_WEI.toString(16), CHAIN_ID) };
}

export const TOPUP_WEI = 10n ** 18n;

export async function topUpSession(network, { from, session, amount = TOPUP_WEI }) {
    if (!isAddress(from) || !isAddress(session)) return { ok: false, reason: REASONS.SENDER };
    const chain = await network.network();
    if (chain !== CHAIN_ID) return { ok: false, reason: REASONS.NETWORK, awaited: CHAIN_ID, found: chain };
    return { ok: true, hash: await network.send(from, session, "0x", "0x" + amount.toString(16), CHAIN_ID) };
}

export async function leaveSeat(network, { from, match = MATCH_ADDRESS }) {
    if (matchAbsent(match)) return { ok: false, reason: REASONS.CONTRACT };
    if (!isAddress(from)) return { ok: false, reason: REASONS.SENDER };
    const chain = await network.network();
    if (chain !== CHAIN_ID) return { ok: false, reason: REASONS.NETWORK, awaited: CHAIN_ID, found: chain };
    return { ok: true, hash: await network.send(from, match, calldataExit(), undefined, CHAIN_ID) };
}
