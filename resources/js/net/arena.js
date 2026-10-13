import { isAddress, keccak256, toUtf8Bytes } from "ethers";
import { PROTOCOL_V } from "./constants.js";

export const QUEUE_PARTITION = 0;

export const ROUND_MS = 6000;

export const QUEUE_DEADLINE_MS = 2 * ROUND_MS;

export const MINIMUM_DEPTH = 2;

export const VERIFY_CAP = 50;

export function roundOf(now, roundMs = ROUND_MS) {
    return Math.floor(now / roundMs);
}

export function roundStart(round, roundMs = ROUND_MS) {
    return Math.floor((round * roundMs) / 1000);
}

export function ticketOf(round, wallet, salt = "") {
    return keccak256(toUtf8Bytes(`arena:${round}:${salt}:${String(wallet).toLowerCase()}`));
}

export const SALT_PAUSE_MS = 2000;
export const ATTEMPTS_SALT = 6;
export const SALT_STEPS = 30;

export function saltFromBlock(network, { pauseMs = SALT_PAUSE_MS, attempts = ATTEMPTS_SALT, steps = SALT_STEPS } = {}) {
    return async (t) => {
        try {
            let b = await network.block();
            for (let n = 0; !(b.time >= t); n++) {
                if (n >= attempts) return "";
                await new Promise((r) => setTimeout(r, pauseMs));
                b = await network.block();
            }
            for (let n = 0; b.number > 0; n++) {
                if (n >= steps) return "";
                const before = await network.block(b.number - 1);
                if (!(before?.time >= t)) break;
                b = before;
            }
            return typeof b.hash === "string" ? b.hash : "";
        } catch {
            return "";
        }
    };
}

function walletOf(x) {
    return String(typeof x === "string" ? x : x.wallet).toLowerCase();
}

export function pairing(round, me, pool, depthMinimum = MINIMUM_DEPTH, salt = "") {
    const my = walletOf(me);
    const seen = new Set([my, ...pool.map(walletOf)]);
    if (seen.size < depthMinimum) return null;

    const sorted = [...seen]
        .map((wallet) => ({ wallet, ticket: ticketOf(round, wallet, salt) }))
        .sort((a, b) => (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0));

    const i = sorted.findIndex((v) => v.wallet === my);
    const tied = i % 2 === 0;
    const other = sorted[tied ? i + 1 : i - 1];
    if (!other) return null;
    return { opponent: other.wallet, initiative: tied };
}

export function createQueue({ transport, me, onQueue = () => {}, onPairing = () => {}, onExit = () => {}, now = Date.now, v = PROTOCOL_V, roundMs = ROUND_MS, depthMinimum = MINIMUM_DEPTH, salt = null, verify = null, cap = VERIFY_CAP }) {
    const seen = new Map();
    const entryKey = (wallet, from) => `${wallet.toLowerCase()}:${from.toLowerCase()}`;
    const stillListed = (wallet) => {
        const rightNow = now();
        for (const entry of seen.values()) {
            if (entry.wallet.toLowerCase() === wallet.toLowerCase() && entry.deadline > rightNow) return true;
        }
        return false;
    };
    let heartbeat = null;
    let unsubscribe = null;
    let searching = false;
    let announced = false;
    let lastRound = null;
    let matching = false;

    function prune() {
        const rightNow = now();
        let changed = false;
        for (const [who, entry] of seen) {
            if (entry.deadline <= rightNow) { seen.delete(who); changed = true; }
        }
        return changed;
    }

    function receive({ from, envelope }) {
        if (!from || from.toLowerCase() === me.address.toLowerCase()) return;
        if (envelope?.type !== "queue" && envelope?.type !== "leave") return;
        if (envelope?.data?.v !== v) return;
        const wallet = envelope.data.wallet;
        if (typeof wallet !== "string" || !isAddress(wallet)) return;
        if (wallet.toLowerCase() === String(me.wallet).toLowerCase()) return;

        const key = entryKey(wallet, from);
        if (envelope.type === "leave") {
            if (!seen.has(key)) return;
            seen.delete(key);
            onQueue(listing());
            if (!stillListed(wallet)) onExit(wallet);
            return;
        }
        seen.set(key, { wallet, from, deadline: now() + QUEUE_DEADLINE_MS });
        onQueue(listing());
    }

    function entries() {
        const rightNow = now();
        return [...seen.values()].filter((x) => x.deadline > rightNow).map(({ wallet, from }) => ({ wallet, from }));
    }

    function unique(list) {
        const wallets = new Map();
        for (const { wallet } of list) {
            if (!wallets.has(wallet.toLowerCase())) wallets.set(wallet.toLowerCase(), { wallet });
        }
        return [...wallets.values()];
    }

    function listing() {
        return unique(entries());
    }

    function firstEntries(round, list, grain) {
        return list
            .map((x) => ({ x, ticket: ticketOf(round, x.wallet, grain) }))
            .sort((a, b) => (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0))
            .slice(0, cap)
            .map(({ x }) => x);
    }

    async function round() {
        if (prune()) onQueue(listing());
        if (!searching) return;

        await transport.publish(QUEUE_PARTITION, {
            type: "queue",
            data: { v, t: Math.floor(now() / 1000), wallet: me.wallet },
        }).catch(() => {});
        announced = true;

        const number = roundOf(now(), roundMs);
        if (number === lastRound || matching) return;
        lastRound = number;

        const list = entries();
        let grain = "", held = list;
        if (salt || verify) {
            matching = true;
            try {
                if (salt) grain = await salt(roundStart(number, roundMs));
                if (verify && searching) held = await verify(firstEntries(number, list, grain)).catch(() => null);
            } finally { matching = false; }
            if (!searching) return;
            if (!held) return;
        }
        let pair = null;
        try { pair = pairing(number, me.wallet, unique(held), depthMinimum, grain); } catch { pair = null; }
        if (pair) onPairing(pair);
    }

    async function announceExit() {
        if (!announced) return;
        announced = false;
        await transport.publish(QUEUE_PARTITION, {
            type: "leave",
            data: { v, t: Math.floor(now() / 1000), wallet: me.wallet },
        }).catch(() => {});
    }

    return {
        listing,
        round,

        async open() {
            unsubscribe = await transport.subscribe(QUEUE_PARTITION, receive);
            searching = true;
            round();
            heartbeat = setInterval(round, roundMs);
        },

        withdraw() {
            searching = false;
        },

        resume() {
            searching = true;
        },

        announceExit,

        async close() {
            if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
            searching = false;
            await announceExit();
            await unsubscribe?.();
            unsubscribe = null;
        },
    };
}
