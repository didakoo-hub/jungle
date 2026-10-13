import { clearWalletAddress, getWalletAddress } from "../game/identity.js";
import { revokeAccounts, sameAddress } from "../game/wallet.js";
import { SigningKey, formatEther } from "ethers";
import { resetKeySession, keySessionSaved, addressOf } from "./keys.js";
import { forgetAgreements, agreementsAlive, agreementsInSuspended } from "./pending.js";
import { readCache, ownerOf } from "./onlineCache.js";
import { seatOf, returnFloat } from "./chain.js";


const FLOAT_RETURNS = "floatReturns";
export const FLOAT_RETURNS_CAP = 8;

let floatNetwork = null;
let floatOptions = {};
const returning = new Set();

export function setFloatNetwork(network, options = {}) {
    floatNetwork = network;
    floatOptions = options;
}

// The key leaves at once; its float goes back in the background, and the key waits in
// `floatReturns` until the receipt.
export function clearSession({ to = null } = {}) {
    const key = keySessionSaved();
    const owner = keyOwner();
    forgetAgreements();
    if (key && to && floatNetwork) keepForReturn(key.privateKey, owner ?? to);
    resetKeySession();
    if (!key || !to || !floatNetwork) return Promise.resolve(null);
    return deliverFloat(key.privateKey);
}

// At boot: the returns without a receipt yet.
export function resumeFloatReturns() {
    if (!floatNetwork) return Promise.resolve([]);
    return Promise.all(floatReturns().map((r) => deliverFloat(r.key)));
}

export function floatReturns() {
    try {
        const list = JSON.parse(localStorage.getItem(FLOAT_RETURNS) ?? "[]");
        return Array.isArray(list) ? list.filter((r) => typeof r?.key === "string" && typeof r?.to === "string") : [];
    } catch {
        return [];
    }
}

function keepForReturn(priv, to) {
    const list = floatReturns().filter((r) => r.key !== priv);
    list.push({ key: priv, to });
    localStorage.setItem(FLOAT_RETURNS, JSON.stringify(list.slice(-FLOAT_RETURNS_CAP)));
}

function dropReturn(priv) {
    const list = floatReturns().filter((r) => r.key !== priv);
    if (list.length) localStorage.setItem(FLOAT_RETURNS, JSON.stringify(list));
    else localStorage.removeItem(FLOAT_RETURNS);
}

async function deliverFloat(priv) {
    const entry = floatReturns().find((r) => r.key === priv);
    if (!entry || returning.has(priv)) return null;
    returning.add(priv);
    try {
        const outcome = await returnFloat(floatNetwork, new SigningKey(priv), entry.to, floatOptions);
        if (outcome.landed === true) dropReturn(priv);
        return outcome;
    } catch {
        return { failed: true };
    } finally {
        returning.delete(priv);
    }
}

export function sessionBusy(rightNow = Date.now()) {
    const key = keySessionSaved();
    if (!key) return false;
    return agreementsAlive(addressOf(key), rightNow).length > 0;
}

export function gameInProgress(rightNow = Date.now()) {
    const key = keySessionSaved();
    if (!key) return false;
    const cache = readCache(addressOf(key), rightNow);
    return !!cache && !cache.finished;
}

// The wallet the saved session key plays for, read from local data only: the cached game, then the agreements.
export function keyOwner(rightNow = Date.now()) {
    const key = keySessionSaved();
    if (!key) return null;
    const session = addressOf(key);
    const cache = readCache(session, rightNow);
    if (cache) return ownerOf(cache);
    const agreement = agreementsInSuspended(session)[0];
    return agreement ? ownerOf(agreement) : null;
}

export function leaveWarning(rightNow = Date.now()) {
    if (!getWalletAddress()) return null;
    if (gameInProgress(rightNow)) return "game";
    return sessionBusy(rightNow) ? "start" : null;
}

export function warningText(kind, stake = null, button = "DISCONNECT") {
    const amount = stake ? `${stake} ` : "";
    if (kind === "game") return `Game in progress. ${button} loses it, and the ${amount}stake.`;
    return `Game about to start. ${button} loses the ${amount}stake.`;
}

export async function leaveStake(network) {
    const who = getWalletAddress();
    const key = keySessionSaved();
    if (!who || !key) return null;
    const seat = await seatOf(network, who);
    if (!seat?.session || seat.session.toLowerCase() !== addressOf(key).toLowerCase()) return null;
    return `${Number(formatEther(seat.escrow)).toFixed(2)} POL`;
}

export function walletGone(accounts, locked = null, rightNow = Date.now()) {
    const saved = getWalletAddress();
    if (!saved) return false;
    if (accounts.some((a) => sameAddress(a, saved))) return false;
    if (accounts.length) return true;
    if (locked !== null) return !locked;
    return leaveWarning(rightNow) === null;
}

// At boot, as on accountsChanged: the key's owner selected is adopted back, another account is adopted
// while something is at stake. The key stays.
export function adoptedAtBoot(accounts, rightNow = Date.now()) {
    const saved = getWalletAddress();
    const owner = keyOwner(rightNow);
    if (saved && owner && sameAddress(accounts[0], owner) && !sameAddress(saved, owner)) return accounts[0];
    if (!accounts.length || !walletGone(accounts) || leaveWarning(rightNow) === null) return null;
    return accounts[0];
}

export function leaveWallet({ force = false } = {}) {
    const wallet = getWalletAddress();
    let returned = Promise.resolve(null);
    if (wallet) {
        returned = clearSession({ to: wallet });
        if (!force) revokeAccounts();
    }
    clearWalletAddress();
    return returned;
}
