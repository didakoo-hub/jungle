const KEY = "seatRefusal";

function deposit() {
    try {
        return globalThis.sessionStorage ?? null;
    } catch {
        return null;
    }
}

export function rememberRefusal(reason) {
    try {
        deposit()?.setItem(KEY, JSON.stringify({ reason: typeof reason === "string" ? reason : "" }));
    } catch { }
}

export function refusalRemembered() {
    try {
        const entry = JSON.parse(deposit()?.getItem(KEY) ?? "null");
        return entry && typeof entry.reason === "string" ? entry.reason : null;
    } catch {
        return null;
    }
}

export function forgetRefusal() {
    try {
        deposit()?.removeItem(KEY);
    } catch { }
}
