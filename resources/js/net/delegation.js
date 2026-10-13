import { isAddress } from "ethers";
import { signature, signerOf } from "./signatures.js";
import { localSigner } from "./keys.js";
import { sameAddress } from "../game/wallet.js";

export const TYPES_DELEGATION = {
    Delegation: [
        { name: "wallet", type: "address" },
        { name: "session", type: "address" },
        { name: "expiry", type: "uint64" },
    ],
};

export const DELEGATION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function newDelegation(wallet, session, rightNow = Date.now()) {
    return {
        wallet,
        session: session,
        expiry: Math.floor((rightNow + DELEGATION_DURATION_MS) / 1000),
    };
}

export function verifyDelegation(delegation, signatureSerialized, rightNow = Date.now()) {
    if (!delegation || typeof delegation !== "object") return { ok: false, reason: "missing delegation" };
    if (!isAddress(delegation.wallet) || !isAddress(delegation.session)) return { ok: false, reason: "addresses" };
    if (!Number.isInteger(delegation.expiry)) return { ok: false, reason: "expiry" };
    if (delegation.expiry * 1000 <= rightNow) return { ok: false, reason: "expired" };

    const whoSignature = signerOf(TYPES_DELEGATION, delegation, signatureSerialized);
    if (!whoSignature) return { ok: false, reason: "unreadable signature" };
    if (!sameAddress(whoSignature, delegation.wallet)) return { ok: false, reason: "signed by someone else" };
    return { ok: true, reason: "" };
}

export function delegationLocale(rightNow = Date.now()) {
    const whoSignature = localSigner();
    if (whoSignature.type !== "guest") return null;
    const delegation = newDelegation(whoSignature.address, whoSignature.address, rightNow);
    return { delegation: delegation, signature: signature(whoSignature.key, TYPES_DELEGATION, delegation) };
}
