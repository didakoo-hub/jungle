import { RPC_POLYGON, RPC_ETHEREUM } from "./constants.js";

export const RPC_ATTEMPTS = 3;
export const RPC_PAUSE_MS = 500;
export const RPC_TIMEOUT_MS = 6000;
export const RPC_RETURN_MS = 60_000;
export const RPC_SLOW_MS = 2000;

const limited = (response, body) =>
    response?.status === 429 || /rate limit|too many requests/i.test(body?.error?.message ?? "");

class RefusalOfNode extends Error {}

// Answers about the call or the transaction; any other error is the endpoint's, and hands over.
const REFUSAL_WORDS = /revert|nonce too|already known|known transaction|underpriced|insufficient funds|replacement transaction|intrinsic gas|gas required exceeds|exceeds block gas limit|fee cap|less than block base fee|invalid sender|invalid signature/i;
const refusal = (error) => error?.code === 3 || REFUSAL_WORDS.test(error?.message ?? "");

const answered = (response) => response?.ok !== false && !(response?.status >= 300);

export function networkRpc(urls, {
    attempts = RPC_ATTEMPTS, pauseMs = RPC_PAUSE_MS, timeoutMs = RPC_TIMEOUT_MS,
    comebackMs = RPC_RETURN_MS, slowMs = RPC_SLOW_MS, now = Date.now,
} = {}) {
    const list = Object.freeze((Array.isArray(urls) ? urls : [urls]).filter((u) => typeof u === "string" && u));
    let active = 0;
    let releasedHead = 0;
    const failedAt = list.map(() => -Infinity);

    const askA = async (url, method, params) => {
        for (let n = 1; ; n++) {
            const response = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
                signal: AbortSignal.timeout?.(timeoutMs),
            });
            const body = await response.json().catch(() => null);
            if (limited(response, body)) {
                if (n >= attempts) throw new Error("rate limit exceeded");
                await new Promise((r) => setTimeout(r, pauseMs * n));
                continue;
            }
            if (!body || !answered(response)) throw new Error("endpoint down");
            if (body.error && refusal(body.error)) throw new RefusalOfNode(body.error.message);
            if (body.error || body.result === undefined) throw new Error(body.error?.message || "call refused");
            return body.result;
        }
    };

    const moveTo = (next) => {
        if (next === active) return;
        if (active === 0) releasedHead = now();
        active = next;
    };

    // The round starts from one endpoint and keeps to it: a call in flight must not follow
    // the active one that another call moves.
    const ask = async (method, params) => {
        if (list.length === 0) throw new Error("No endpoint");
        if (active !== 0 && now() - releasedHead >= comebackMs) active = 0;
        const start = active;
        const asked = new Set();
        let last;
        for (let k = 0; k < list.length; k++) {
            const i = (start + k) % list.length;
            if (asked.has(i)) continue;
            asked.add(i);
            try {
                const began = now();
                const { outcome, from } = k === 0 && readOnly(method)
                    ? await firstOf(i, method, params, asked)
                    : { outcome: await askA(list[i], method, params), from: i };
                // A slow endpoint keeps its answer and hands over, only if it was the first asked
                // and to one that has not failed recently.
                moveTo(from === i && k === 0 && now() - began > slowMs ? healthyAfter(i) : from);
                return outcome;
            } catch (e) {
                if (e instanceof RefusalOfNode) throw e;
                failedAt[i] = now();
                last = e;
            }
        }
        // The whole round failed: the next call starts past the endpoint that just timed out.
        if (active === start && list.length > 1) moveTo((start + 1) % list.length);
        throw last;
    };

    // Only the reads of the chain race: the nonce and the estimate of a node behind would send
    // the transaction to it, and the transaction itself would be a refusal on the other node.
    const RACING = new Set([
        "eth_call", "eth_blockNumber", "eth_getBlockByNumber", "eth_getTransactionReceipt",
        "eth_getBalance", "eth_gasPrice", "eth_maxPriorityFeePerGas",
    ]);
    const readOnly = (method) => RACING.has(method);

    // A read waiting past slowMs asks the next healthy endpoint too and keeps the first answer.
    const firstOf = (i, method, params, asked) => new Promise((resolve, reject) => {
        const j = healthyAfter(i);
        let pending = 1, settled = false, later = null;
        const settle = (f) => { if (settled) return; settled = true; clearTimeout(later); f(); };
        const won = (from) => (outcome) => settle(() => resolve({ outcome, from }));
        const lost = (from) => (e) => {
            if (e instanceof RefusalOfNode) return settle(() => reject(e));
            failedAt[from] = now();
            if (--pending === 0) settle(() => reject(e));
        };
        askA(list[i], method, params).then(won(i), lost(i));
        if (j === i) return;
        later = setTimeout(() => {
            if (settled) return;
            pending += 1;
            asked.add(j);
            askA(list[j], method, params).then(won(j), lost(j));
        }, slowMs);
    });

    const healthyAfter = (i) => {
        for (let k = 1; k < list.length; k++) {
            const j = (i + k) % list.length;
            if (now() - failedAt[j] >= comebackMs) return j;
        }
        return i;
    };

    const askElsewhere = async (method, params) => {
        const start = active;
        let last;
        for (let k = 1; k < list.length; k++) {
            try {
                return await askA(list[(start + k) % list.length], method, params);
            } catch (e) {
                if (e instanceof RefusalOfNode) throw e;
                last = e;
            }
        }
        throw last;
    };

    return Object.freeze({
        async call(to, data) {
            const outcome = await ask("eth_call", [{ to, data }, "latest"]);
            if (typeof outcome !== "string") throw new Error("call refused");
            return outcome;
        },
        discard() {
            if (list.length < 2) return false;
            if (active === 0) releasedHead = now();
            active = (active + 1) % list.length;
            return true;
        },
        elsewhere() {
            if (list.length < 2) return null;
            return Object.freeze({
                async call(to, data) {
                    const outcome = await askElsewhere("eth_call", [{ to, data }, "latest"]);
                    if (typeof outcome !== "string") throw new Error("call refused");
                    return outcome;
                },
                async transmit(rawOne) {
                    const hash = await askElsewhere("eth_sendRawTransaction", [rawOne]);
                    if (typeof hash !== "string") throw new Error("call refused");
                    return hash;
                },
                block: (number = "latest") => blockOf(askElsewhere, number),
                async receipt(hash) {
                    try {
                        const r = await askElsewhere("eth_getTransactionReceipt", [hash]);
                        return r && typeof r === "object" ? r : null;
                    } catch {
                        return null;
                    }
                },
            });
        },
        others() {
            return list.map((_, k) => (active + 1 + k) % list.length).slice(0, -1).map((i) => Object.freeze({
                async call(to, data) {
                    const outcome = await askA(list[i], "eth_call", [{ to, data }, "latest"]);
                    if (typeof outcome !== "string") throw new Error("call refused");
                    return outcome;
                },
                async count(address, tag = "pending") {
                    return parseInt(await askA(list[i], "eth_getTransactionCount", [address, tag]), 16);
                },
                async balance(address) {
                    return BigInt(await askA(list[i], "eth_getBalance", [address, "latest"]));
                },
            }));
        },
        async height() {
            return parseInt(await ask("eth_blockNumber", []), 16);
        },
        async count(address, tag = "pending") {
            return parseInt(await ask("eth_getTransactionCount", [address, tag]), 16);
        },
        async balance(address) {
            return BigInt(await ask("eth_getBalance", [address, "latest"]));
        },
        async gas() {
            return BigInt(await ask("eth_gasPrice", []));
        },
        async tip() {
            return BigInt(await ask("eth_maxPriorityFeePerGas", []));
        },
        async estimate(tx) {
            return BigInt(await ask("eth_estimateGas", [tx]));
        },
        async transmit(rawOne) {
            const hash = await ask("eth_sendRawTransaction", [rawOne]);
            if (typeof hash !== "string") throw new Error("call refused");
            return hash;
        },
        async receipt(hash) {
            try {
                const r = await ask("eth_getTransactionReceipt", [hash]);
                return r && typeof r === "object" ? r : null;
            } catch {
                return null;
            }
        },
        async finalized() {
            try {
                const b = await ask("eth_getBlockByNumber", ["finalized", false]);
                const n = Number(b?.number);
                return Number.isInteger(n) ? n : null;
            } catch {
                return null;
            }
        },
        block: (number = "latest") => blockOf(ask, number),
    });
}

async function blockOf(ask, number) {
    const tag = typeof number === "number" ? "0x" + number.toString(16) : number;
    const b = await ask("eth_getBlockByNumber", [tag, false]);
    let baseFee = 0n;
    try { baseFee = BigInt(b?.baseFeePerGas ?? 0); } catch { }
    return { number: Number(b?.number), time: Number(b?.timestamp), hash: typeof b?.hash === "string" ? b.hash : "", baseFee };
}

export const POLYGON_NETWORK = networkRpc(RPC_POLYGON);
export const ETHEREUM_NETWORK = networkRpc(RPC_ETHEREUM);

export function readsNetwork(wallet) {
    return RPC_POLYGON.length ? POLYGON_NETWORK : wallet;
}
