import { PROTOCOL_V } from "./constants.js";
import { sameAddress } from "../game/wallet.js";

const KEY = "onlineGame";

export const CACHE_LIFE_MS = 15 * 60 * 1000;

export function saveCache(entry) {
    localStorage.setItem(KEY, JSON.stringify({ ...entry, v: PROTOCOL_V, t: Date.now() }));
}

export function readCache(session, now = Date.now()) {
    let entry = null;
    try {
        entry = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch (e) {
        console.warn("online cache unreadable, discarded", e);
    }
    if (!entry) return resetCache(), null;
    const good =
        entry.v === PROTOCOL_V
        && entry.session === session
        && !!entry.match && !!entry.seed && !!entry.side?.wallet && !!entry.side?.session
        && Array.isArray(entry.log)
        && Number.isFinite(entry.t)
        && (!!entry.finished || now - entry.t < CACHE_LIFE_MS);
    if (!good) return resetCache(), null;
    return entry;
}

export function ownerOf(entry) {
    if (!entry?.match || !entry.side?.wallet) return null;
    return sameAddress(entry.match.a, entry.side.wallet) ? entry.match.b : entry.match.a;
}

export function resetCache() {
    localStorage.removeItem(KEY);
}

export function clearFinished() {
    try {
        if (JSON.parse(localStorage.getItem(KEY) ?? "null")?.finished) resetCache();
    } catch {
        resetCache();
    }
}
