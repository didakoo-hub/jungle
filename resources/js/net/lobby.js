import { PROTOCOL_V } from "./constants.js";

export const LOBBY_PARTITION = 0;
export const ANNOUNCEMENT_MS = 3000;
export const DEADLINE_MS = 10_000;

export function createLobby({ transport, me, onSwitch = () => {}, now = Date.now, v = PROTOCOL_V, announcementMs = ANNOUNCEMENT_MS, partition = LOBBY_PARTITION }) {
    const seen = new Map();
    const ignored = new Set();
    let heartbeat = null;
    let unsubscribe = null;
    let announcement = false;

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
        if (ignored.has(from.toLowerCase())) return;
        if (envelope?.type !== "announce" || envelope?.data?.v !== v) return;

        seen.set(from.toLowerCase(), { from, t: envelope.data.t, deadline: now() + DEADLINE_MS });
        onSwitch(listing());
    }

    function listing() {
        return [...seen.values()].filter((x) => x.deadline > now());
    }

    return {
        listing,
        partition,

        async open({ announcing = true } = {}) {
            unsubscribe = await transport.subscribe(partition, receive);
            announcement = announcing;
            const round = async () => {
                if (prune()) onSwitch(listing());
                if (announcement) {
                    await transport.publish(partition, {
                        type: "announce",
                        data: { v, t: Math.floor(now() / 1000) },
                    }).catch(() => {});
                }
            };
            round();
            heartbeat = setInterval(round, announcementMs);
        },

        withdraw() {
            announcement = false;
        },

        ignore(address) {
            ignored.add(String(address).toLowerCase());
            if (seen.delete(String(address).toLowerCase())) onSwitch(listing());
        },

        async close() {
            if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
            announcement = false;
            await unsubscribe?.();
            unsubscribe = null;
        },
    };
}
