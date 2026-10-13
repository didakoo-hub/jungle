import { isAddress } from "ethers";

const GUEST_ID_KEY = "guestId";
const WALLET_KEY = "walletAddress";

function newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hasGuest() {
    return !!localStorage.getItem(GUEST_ID_KEY);
}

export function getGuestId() {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
        id = newId();
        localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
}

export function getAlias() {
    return "Guest-" + getGuestId().slice(0, 4).toUpperCase();
}

export function isWalletAlias(alias) {
    return typeof alias === "string" && alias.length === 42 && isAddress(alias);
}

export function abbreviate(address) {
    return address.slice(0, 6) + "…" + address.slice(-4);
}

export function getWalletAddress() {
    const raw = localStorage.getItem(WALLET_KEY);
    return isWalletAlias(raw) ? raw : null;
}

export function saveWalletAddress(address) {
    if (!isWalletAlias(address)) return null;
    localStorage.setItem(WALLET_KEY, address);
    return address;
}

export function clearWalletAddress() {
    localStorage.removeItem(WALLET_KEY);
}

export function currentIdentity() {
    return getWalletAddress() ?? (hasGuest() ? getAlias() : null);
}

export function ensureIdentity() {
    return getWalletAddress() ?? getAlias();
}
