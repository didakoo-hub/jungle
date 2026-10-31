import { clearWalletAddress, getWalletAddress } from "../game/identity.js";
import { revokeAccounts, sameAddress } from "../game/wallet.js";
import { SigningKey, formatEther } from "ethers";
import { resetKeySession, keySessionSaved, addressOf } from "./keys.js";
import { forgetSeat, seatRemembered, seatGone } from "./pending.js";
import { readCache, ownerOf } from "./onlineCache.js";
import { seatOf, returnFloat, FLOAT_DUST_WEI } from "./chain.js";


const FLOAT_RETURNS = "floatReturns";
export const FLOAT_RETURNS_CAP = 8;

let floatNetwork = null;
let floatOptions = {};
const returning = new Set();

export function setFloatNetwork(network, options = {}) {
    floatNetwork = network;
    floatOptions = options;
}

export function clearSession({ to = null } = {}) {
    const key = keySessionSaved();
    const owner = keyOwner();
    forgetSeat();
    if (key && to && floatNetwork) keepForReturn(key.privateKey, owner ?? to);
    resetKeySession();
    if (!key || !to || !floatNetwork) return Promise.resolve(null);
    return deliverFloat(key.privateKey);
}

export async function settleFloat({ ended = false, rightNow = Date.now() } = {}) {
    const key = keySessionSaved();
    const owner = key ? keyOwner(rightNow) ?? getWalletAddress() : null;
    if (!key || !owner || !floatNetwork) return null;
    const session = addressOf(key);
    const balance = await floatNetwork.balance(session).catch(() => null);
    if (balance === null || balance < FLOAT_DUST_WEI) return null;
    if (!ended) {
        const seat = await seatOf(floatNetwork, owner);
        if (!seat || sameAddress(seat.session, session)) return null;
        const record = seatRemembered(session);
        if (record && !seatGone(record, seat, rightNow)) return null;
    }
    if (keySessionSaved()?.privateKey !== key.privateKey) return null;
    keepForReturn(key.privateKey, owner);
    return deliverFloat(key.privateKey);
}

export function renewKeyReturning(rightNow = Date.now()) {
    const key = keySessionSaved();
    if (!key || !floatReturns().some((r) => r.key === key.privateKey)) return false;
    const session = addressOf(key);
    if (readCache(session, rightNow) || seatRemembered(session)) return false;
    resetKeySession();
    return true;
}

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

export function sessionBusy() {
    const key = keySessionSaved();
    if (!key) return false;
    return seatRemembered(addressOf(key)) !== null;
}

export function gameInProgress(rightNow = Date.now()) {
    const key = keySessionSaved();
    if (!key) return false;
    const cache = readCache(addressOf(key), rightNow);
    return !!cache && !cache.finished;
}

export function keyOwner(rightNow = Date.now()) {
    const key = keySessionSaved();
    if (!key) return null;
    const session = addressOf(key);
    const cache = readCache(session, rightNow);
    if (cache) return ownerOf(cache);
    return seatRemembered(session)?.wallet ?? null;
}

export function leaveWarning(rightNow = Date.now()) {
    if (!getWalletAddress()) return null;
    if (gameInProgress(rightNow)) return "game";
    return sessionBusy() ? "start" : null;
}

export function warningText(kind, stake = null, button = "DISCONNECT") {
    if (kind === "game") return "Game in progress.";
    return "Seat open: a game can start at any moment.";
}

export async function leaveStake(network) {
    const who = getWalletAddress();
    const key = keySessionSaved();
    if (!who || !key) return null;
    const seat = await seatOf(network, who);
    if (!seat?.session || seat.gameId || seat.session.toLowerCase() !== addressOf(key).toLowerCase()) return null;
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
