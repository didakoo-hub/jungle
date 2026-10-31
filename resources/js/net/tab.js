const CHANNEL_TAB = "jungle-online-tab";
const TAB_WAIT_MS = 300;

const random = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function openChannelTab(name = CHANNEL_TAB) {
    try {
        return typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null;
    } catch {
        return null;
    }
}

export function lockManager() {
    try {
        const locks = globalThis.navigator?.locks;
        return typeof locks?.request === "function" ? locks : null;
    } catch {
        return null;
    }
}

export function createTabLock({ channel = openChannelTab(), waitingMs = TAB_WAIT_MS, id = random(), locks = lockManager(), name = CHANNEL_TAB } = {}) {
    let held = false;
    let left = false;
    let inquiring = false;
    let learning = false;
    let response = null;
    let mode = null;
    let takenBy = null;
    let release = null;

    if (channel) {
        channel.onmessage = (event) => {
            const m = event?.data;
            if (!m || typeof m !== "object" || m.id === id) return;
            if (m.type === "asking") {
                if (held || (inquiring && id < String(m.id))) channel.postMessage({ type: "holding", id, mode });
            } else if (m.type === "holding" && (inquiring || learning)) {
                takenBy = typeof m.mode === "string" ? m.mode : null;
                response?.(false);
            }
        };
    }

    function ask(setFlag) {
        setFlag(true);
        return new Promise((r) => {
            response = r;
            channel.postMessage({ type: "asking", id });
            setTimeout(() => r(true), waitingMs);
        }).finally(() => {
            response = null;
            setFlag(false);
        });
    }

    function webLock() {
        return new Promise((resolve) => {
            locks.request(name, { ifAvailable: true }, (lock) => {
                if (!lock || left) return resolve(false);
                resolve(true);
                return new Promise((r) => { release = r; });
            }).catch(() => resolve(null));
        });
    }

    return {
        async take(my = null) {
            mode = my;
            if (held) return true;
            if (left) return false;
            const locked = locks ? await webLock() : null;
            if (left) return false;
            if (locked === true) {
                held = true;
                return true;
            }
            if (locked === false) {
                if (channel) await ask((v) => { learning = v; });
                return false;
            }
            if (!channel) { held = true; return true; }
            held = await ask((v) => { inquiring = v; }) && !left;
            return held;
        },
        leave() {
            left = true;
            held = false;
            inquiring = false;
            learning = false;
            response = null;
            release?.();
            release = null;
            try { channel?.close?.(); } catch { }
        },
        held: () => held,
        takenBy: () => takenBy,
    };
}
