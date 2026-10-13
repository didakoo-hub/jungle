import { signerOf } from "./signatures.js";
import { sameAddress } from "../game/wallet.js";
import { TYPES_DEPRECATION } from "./messages.js";
import { PROTOCOL_V, D_ADDRESS, DEPRECATION_URLS } from "./constants.js";

const KEY = "deprecation";

const TIMEOUT_MS = 8000;

let toShutdown = null;

export function uponShutdown(fn) {
    toShutdown = typeof fn === "function" ? fn : null;
}

export function announcementShutsDown(data, signature, rightNow = Date.now(), addressD = D_ADDRESS) {
    if (!data || !Number.isInteger(data.minVersion) || !Number.isInteger(data.notBefore)) return false;
    if (PROTOCOL_V >= data.minVersion) return false;
    if (rightNow < data.notBefore * 1000) return false;
    const who = signerOf(TYPES_DEPRECATION, data, signature);
    return !!who && sameAddress(who, addressD);
}

export function announcementSaved() {
    try {
        const entry = JSON.parse(localStorage.getItem(KEY) ?? "null");
        return entry?.data && entry?.signature ? entry : null;
    } catch (e) {
        return null;
    }
}

export function acceptAnnouncement(data, signature, rightNow = Date.now(), addressD = D_ADDRESS) {
    if (!announcementShutsDown(data, signature, rightNow, addressD)) return false;
    try {
        localStorage.setItem(KEY, JSON.stringify({ data, signature }));
    } catch (e) {
    }
    if (toShutdown) setTimeout(toShutdown, 0);
    return true;
}

export function clientOff(rightNow = Date.now(), addressD = D_ADDRESS) {
    const entry = announcementSaved();
    if (!entry) return false;
    return announcementShutsDown(entry.data, entry.signature, rightNow, addressD);
}

export function resetAnnouncement() {
    localStorage.removeItem(KEY);
}

export async function downloadAnnouncement({
    url = DEPRECATION_URLS,
    fetch: fetchImpl = globalThis.fetch,
    rightNow = Date.now(),
    addressD = D_ADDRESS,
    timeoutMs = TIMEOUT_MS,
} = {}) {
    if (typeof fetchImpl !== "function") return false;
    const list = (Array.isArray(url) ? url : [url]).filter(Boolean);
    for (const one of list) {
        if (await downloadFromOne(one, fetchImpl, rightNow, addressD, timeoutMs)) return true;
    }
    return false;
}

async function downloadFromOne(url, fetchImpl, rightNow, addressD, timeoutMs) {
    let cut = null;
    try {
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        if (ctrl) cut = setTimeout(() => ctrl.abort(), timeoutMs);
        const r = await fetchImpl(url, { cache: "no-store", signal: ctrl?.signal });
        if (!r?.ok) return false;
        const entry = await r.json();
        return acceptAnnouncement(entry?.data, entry?.signature, rightNow, addressD);
    } catch (e) {
        return false;
    } finally {
        if (cut !== null) clearTimeout(cut);
    }
}
