import { SigningKey, computeAddress, keccak256, toUtf8Bytes, randomBytes, hexlify } from "ethers";
import { getGuestId, getWalletAddress } from "../game/identity.js";

export const GUEST_DOMAIN = "jungle-guest-key:v1";

const KEY_SESSION = "sessionKey";
const listenersKey = new Set();

export function addressOf(key) {
    return computeAddress(key.publicKey);
}

export function keyFromGuestId(guestId) {
    return new SigningKey(keccak256(toUtf8Bytes(GUEST_DOMAIN + guestId)));
}

export function keySession() {
    const saved = keySessionSaved();
    if (saved) return saved;
    const priv = hexlify(randomBytes(32));
    localStorage.setItem(KEY_SESSION, priv);
    warnKey();
    return new SigningKey(priv);
}

export function keySessionSaved() {
    const priv = localStorage.getItem(KEY_SESSION);
    if (!priv) return null;
    try {
        return new SigningKey(priv);
    } catch {
        return null;
    }
}

export function resetKeySession() {
    localStorage.removeItem(KEY_SESSION);
    warnKey();
}

// Born or gone; a key created in another tab does not warn.
export function onKeySession(cb) {
    listenersKey.add(cb);
    return () => listenersKey.delete(cb);
}

function warnKey() {
    for (const cb of listenersKey) cb();
}

// Another tab may have taken the wallet or the key away.
export function stillTheSigner(me) {
    if (me?.type !== "wallet") return true;
    return String(getWalletAddress() ?? "").toLowerCase() === String(me.wallet).toLowerCase()
        && keySessionSaved()?.privateKey === me.key.privateKey;
}

export function localSigner() {
    const wallet = getWalletAddress();
    if (wallet) {
        const key = keySession();
        return { type: "wallet", wallet, key, address: addressOf(key) };
    }
    const key = keyFromGuestId(getGuestId());
    const address = addressOf(key);
    return { type: "guest", wallet: address, key, address };
}
