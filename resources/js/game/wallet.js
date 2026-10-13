import { CHAIN_ID } from "../net/constants.js";

const POPUP_KEY = "walletPopup";
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
export const POPUP_OPENED = "POPUP_OPENED";
const RESUMPTION_HEARTBEAT_MS = 2000;
// The extension and the in-app browser of MetaMask mobile; Flask stays out.
const METAMASK_RDNS = new Set(["io.metamask", "io.metamask.mobile"]);
const ANNOUNCE_WAIT_MS = 500;

let popupInProgress = null;
let releaseResumption = null;
const listenersPopup = new Set();
let metamask = null;
const listenersAccounts = new Set();
let detachAccounts = null;

// EIP-6963: the provider is the one MetaMask announces; window.ethereum is never read.
function adoptAnnounced(e) {
    const detail = e?.detail;
    if (!METAMASK_RDNS.has(detail?.info?.rdns) || detail.provider === metamask) return;
    detachAccounts?.();
    detachAccounts = null;
    metamask = detail.provider ?? null;
    const eth = getProvider();
    if (!eth || typeof eth.on !== "function") return;
    const handler = (accounts) => {
        for (const cb of listenersAccounts) cb(Array.isArray(accounts) ? accounts : []);
    };
    eth.on("accountsChanged", handler);
    detachAccounts = () => eth.removeListener?.("accountsChanged", handler);
}

const announced = new Promise((resolve) => {
    if (typeof globalThis.addEventListener !== "function" || typeof globalThis.dispatchEvent !== "function") return resolve();
    globalThis.addEventListener("eip6963:announceProvider", (e) => {
        adoptAnnounced(e);
        if (metamask) resolve();
    });
    globalThis.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(resolve, ANNOUNCE_WAIT_MS);
});

export function sharedOrigin() {
    const path = globalThis.location?.pathname;
    return typeof path === "string" && (path.startsWith("/ipfs/") || path.startsWith("/ipns/"));
}

export function framed() {
    try {
        const top = globalThis.top;
        return top !== undefined && top !== globalThis.self;
    } catch {
        return true;
    }
}

export function walletClosed() {
    if (sharedOrigin()) return "gateway";
    if (framed()) return "iframe";
    return null;
}

export function popupSuspended() {
    return readSuspended();
}

function readSuspended() {
    if (walletClosed()) return null;
    try {
        const raw = localStorage.getItem(POPUP_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeSuspended(suspended) {
    try {
        if (suspended) localStorage.setItem(POPUP_KEY, JSON.stringify(suspended));
        else localStorage.removeItem(POPUP_KEY);
    } catch {
    }
}

export function popupOpen() {
    return popupInProgress !== null || readSuspended() !== null;
}

export function onPopup(cb) {
    listenersPopup.add(cb);
    return () => listenersPopup.delete(cb);
}

function warnPopup() {
    const opened = popupOpen();
    for (const cb of listenersPopup) cb(opened);
}

async function withPopup(suspended, fn) {
    if (popupOpen()) throw Object.assign(new Error("A request is already open in the wallet"), { code: POPUP_OPENED });
    const record = { ...suspended, t: Date.now() };
    writeSuspended(record);
    const update = (extra) => writeSuspended(Object.assign(record, extra));
    popupInProgress = (async () => {
        try {
            return await fn(update);
        } finally {
            popupInProgress = null;
            writeSuspended(null);
            warnPopup();
        }
    })();
    warnPopup();
    return popupInProgress;
}

function awaitFor(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function awaitForResponse(eth, suspended, heartbeatMs, alive) {
    if (suspended.type === "login") {
        while (alive.self) {
            try {
                const accounts = await eth.request({ method: "eth_requestAccounts" });
                return { account: Array.isArray(accounts) ? accounts[0] ?? null : null };
            } catch (e) {
                if (e?.code !== -32002) return {};
            }
            await awaitFor(heartbeatMs);
        }
    }
    if (suspended.type === "chain" && suspended.chainId === CHAIN_HEX) {
        while (alive.self) {
            try {
                await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
                return {};
            } catch (e) {
                if (e?.code !== -32002) return {};
            }
            await awaitFor(heartbeatMs);
        }
    }
    if (suspended.type === "tx" && Number.isInteger(suspended.count)) {
        while (alive.self) {
            try {
                const n = Number(await eth.request({ method: "eth_getTransactionCount", params: [suspended.from, "latest"] }));
                if (n > suspended.count) return {};
            } catch {
            }
            await awaitFor(heartbeatMs);
        }
    }
    return {};
}

export function releasePopup() {
    writeSuspended(null);
    releaseResumption?.();
}

export async function resumePopup({ heartbeatMs = RESUMPTION_HEARTBEAT_MS } = {}) {
    const suspended = readSuspended();
    if (!suspended) return null;
    const eth = await providerSoon();
    if (!eth) {
        writeSuspended(null);
        return suspended;
    }
    const alive = { self: true };
    const release = new Promise((r) => { releaseResumption = r; });
    popupInProgress = (async () => {
        try {
            return await Promise.race([awaitForResponse(eth, suspended, heartbeatMs, alive), release.then(() => ({ refused: true }))]);
        } finally {
            alive.self = false;
            releaseResumption = null;
            popupInProgress = null;
            writeSuspended(null);
            warnPopup();
        }
    })();
    warnPopup();
    return { ...suspended, ...(await popupInProgress) };
}

export function getProvider() {
    if (walletClosed()) return null;
    return metamask && typeof metamask.request === "function" ? metamask : null;
}

// At boot: the provider once announced, or none after ANNOUNCE_WAIT_MS.
async function providerSoon() {
    await announced;
    return getProvider();
}

export function hasProvider() {
    return getProvider() !== null;
}

export function sameAddress(a, b) {
    return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

export async function requestAccounts() {
    const eth = getProvider();
    if (!eth) throw Object.assign(new Error("No injected wallet"), { code: "NO_PROVIDER" });
    const accounts = await withPopup({ type: "login" }, () => eth.request({ method: "eth_requestAccounts" }));
    const account = Array.isArray(accounts) ? accounts[0] : null;
    if (!account) throw Object.assign(new Error("No account"), { code: "NO_ACCOUNT" });
    return account;
}

export async function readAuthorizedAccounts() {
    const eth = await providerSoon();
    if (!eth) return [];
    try {
        const accounts = await eth.request({ method: "eth_accounts" });
        return Array.isArray(accounts) ? accounts : [];
    } catch {
        return [];
    }
}

export async function walletLocked() {
    const eth = getProvider();
    const ask = eth?._metamask?.isUnlocked;
    if (typeof ask !== "function") return null;
    try {
        const unlocked = await ask.call(eth._metamask);
        return typeof unlocked === "boolean" ? !unlocked : null;
    } catch {
        return null;
    }
}

export async function revokeAccounts() {
    const eth = getProvider();
    if (!eth) return;
    try {
        await eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
        return;
    }
}

export function onAccountsChanged(cb) {
    listenersAccounts.add(cb);
    return () => listenersAccounts.delete(cb);
}

export async function chainId() {
    const eth = getProvider();
    if (!eth) return null;
    try {
        const hex = await eth.request({ method: "eth_chainId" });
        const n = Number(hex);
        return Number.isInteger(n) ? n : null;
    } catch {
        return null;
    }
}

export async function switchChain(id) {
    const eth = getProvider();
    if (!eth) throw Object.assign(new Error("No injected wallet"), { code: "NO_PROVIDER" });
    const chainId = "0x" + Number(id).toString(16);
    return await withPopup({ type: "chain", chainId }, () => eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
    }));
}

export async function uponChain(id) {
    if (await chainId() === id) return true;
    try {
        await switchChain(id);
    } catch {
        return false;
    }
    return await chainId() === id;
}

export async function ethCall(to, data) {
    const eth = getProvider();
    if (!eth) throw Object.assign(new Error("No injected wallet"), { code: "NO_PROVIDER" });
    return await eth.request({ method: "eth_call", params: [{ to, data }, "latest"] });
}

export async function blockNumber() {
    const eth = getProvider();
    if (!eth) return null;
    try {
        const n = Number(await eth.request({ method: "eth_blockNumber" }));
        return Number.isInteger(n) ? n : null;
    } catch {
        return null;
    }
}

export async function getTransactionReceipt(hash) {
    const eth = getProvider();
    if (!eth) return null;
    try {
        return await eth.request({ method: "eth_getTransactionReceipt", params: [hash] });
    } catch {
        return null;
    }
}

export async function finalizedBlock() {
    const eth = getProvider();
    if (!eth) return null;
    try {
        const b = await eth.request({
            method: "eth_getBlockByNumber", params: ["finalized", false],
        });
        const n = Number(b?.number);
        return Number.isInteger(n) ? n : null;
    } catch {
        return null;
    }
}

async function transactionCount(eth, from) {
    try {
        const n = Number(await eth.request({ method: "eth_getTransactionCount", params: [from, "latest"] }));
        return Number.isInteger(n) ? n : null;
    } catch {
        return null;
    }
}

export async function sendTransaction(from, to, data, value, chain) {
    const eth = getProvider();
    if (!eth) throw Object.assign(new Error("No injected wallet"), { code: "NO_PROVIDER" });
    const tx = { from, to, data };
    if (value) tx.value = value;
    if (chain) tx.chainId = "0x" + Number(chain).toString(16);
    return await withPopup({ type: "tx", from: from }, async (update) => {
        update({ count: await transactionCount(eth, from) });
        return await eth.request({ method: "eth_sendTransaction", params: [tx] });
    });
}

export const WALLET_NETWORK = Object.freeze({
    network: chainId,
    call: ethCall,
    send: sendTransaction,
    receipt: getTransactionReceipt,
    finalized: finalizedBlock,
    height: blockNumber,
});
