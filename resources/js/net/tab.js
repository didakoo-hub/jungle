export const CHANNEL_TAB = "jungle-online-tab";
export const TAB_WAIT_MS = 300;

const random = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function openChannelTab(name = CHANNEL_TAB) {
    try {
        return typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null;
    } catch {
        return null;
    }
}

export function createTabLock({ channel = openChannelTab(), waitingMs = TAB_WAIT_MS, id = random() } = {}) {
    let held = false;
    let inquiring = false;
    let response = null;
    let mode = null;
    let takenBy = null;

    if (channel) {
        channel.onmessage = (event) => {
            const m = event?.data;
            if (!m || typeof m !== "object" || m.id === id) return;
            if (m.type === "asking") {
                if (held || (inquiring && id < String(m.id))) channel.postMessage({ type: "holding", id, mode });
            } else if (m.type === "holding" && inquiring) {
                takenBy = typeof m.mode === "string" ? m.mode : null;
                response?.(false);
            }
        };
    }

    return {
        async take(my = null) {
            mode = my;
            if (held) return true;
            if (!channel) { held = true; return true; }
            inquiring = true;
            const freeOne = await new Promise((r) => {
                response = r;
                channel.postMessage({ type: "asking", id });
                setTimeout(() => r(true), waitingMs);
            });
            response = null;
            inquiring = false;
            held = freeOne;
            return freeOne;
        },
        leave() {
            held = false;
            inquiring = false;
            response = null;
            try { channel?.close?.(); } catch { }
        },
        held: () => held,
        takenBy: () => takenBy,
    };
}
