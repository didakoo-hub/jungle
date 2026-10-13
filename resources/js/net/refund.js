export const REFUND_LIFE_MS = 10_000;

const MODES = ["private", "arena"];

let refund = null;

export function markRefund(mode, now = Date.now) {
    if (!MODES.includes(mode)) return;
    refund = { mode, t: now() };
}

export function takeRefund(now = Date.now) {
    const r = refund;
    refund = null;
    if (!r || now() - r.t > REFUND_LIFE_MS) return null;
    return r.mode;
}
