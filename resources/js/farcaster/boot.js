import { adoptHosted, sameAddress } from "../game/wallet.js";
import { currentIdentity, getWalletAddress, saveWalletAddress } from "../game/identity.js";
import store from "../store/index.js";
import { leaveWallet, leaveWarning, setFloatNetwork } from "../net/logout.js";
import { storageBlocked } from "../game/storage.js";
import { POLYGON_NETWORK } from "../net/rpc.js";
import { RPC_POLYGON } from "../net/constants.js";
import { mightBeHosted, openOutside, setMiniApp, setOpenUrl } from "./host.js";
import { BROWSER_URL, MINIAPP_ORIGIN } from "./constants.js";

const UNAVAILABLE = "Farcaster wallet not available.";

export async function enterTheHost() {
    const ownDomain = globalThis.location?.origin === MINIAPP_ORIGIN;
    const sdk = mightBeHosted() ? await loadSdk() : null;
    if (!sdk || !await sdk.isInMiniApp()) {
        if (!ownDomain) return true;
        location.replace(BROWSER_URL + location.hash);
        return false;
    }
    setMiniApp(true);
    readyWithTheLoader(sdk);
    openLinksOutside(sdk);
    keepClearOfInsets(sdk);
    if (storageBlocked()) return true;
    if (!await adoptTheAccount(sdk)) {
        unavailable();
        return false;
    }
    store.commit("SET_ALIAS", currentIdentity());
    return true;
}

async function loadSdk() {
    try {
        return (await import("@farcaster/miniapp-sdk")).sdk;
    } catch {
        return null;
    }
}

async function adoptTheAccount(sdk) {
    let provider = null;
    try {
        provider = await sdk.wallet.getEthereumProvider();
    } catch {
    }
    if (!provider || typeof provider.request !== "function") return false;
    adoptHosted(provider);
    let account = null;
    try {
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        account = Array.isArray(accounts) ? accounts[0] ?? null : null;
    } catch {
    }
    if (!account) return false;
    const saved = getWalletAddress();
    if (sameAddress(saved, account)) return true;
    if (saved && leaveWarning() !== null) return true;
    if (saved) {
        if (RPC_POLYGON.length) setFloatNetwork(POLYGON_NETWORK);
        leaveWallet({ force: true });
    }
    return saveWalletAddress(account) !== null;
}

function readyWithTheLoader(sdk) {
    const loader = document.getElementById("loader");
    const ready = () => sdk.actions.ready().catch(() => {});
    const hidden = () => !loader || loader.style.display === "none";
    if (hidden()) return ready();
    const watch = new MutationObserver(() => {
        if (!hidden()) return;
        watch.disconnect();
        ready();
    });
    watch.observe(loader, { attributes: true, attributeFilter: ["style"] });
}

function openLinksOutside(sdk) {
    setOpenUrl((url) => sdk.actions.openUrl(url).catch(() => {}));
    document.addEventListener("click", (e) => {
        const link = e.target?.closest?.("a[target=_blank]");
        if (!link?.href) return;
        e.preventDefault();
        openOutside(link.href);
    }, true);
}

async function keepClearOfInsets(sdk) {
    let insets = null;
    try {
        insets = (await sdk.context)?.client?.safeAreaInsets;
    } catch {
    }
    if (!insets) return;
    const px = (n) => `${Number(n) || 0}px`;
    document.body.style.padding = [insets.top, insets.right, insets.bottom, insets.left].map(px).join(" ");
}

function unavailable() {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
    const note = document.createElement("p");
    note.textContent = UNAVAILABLE;
    note.style.cssText = "color: white; font-family: monospace; text-align: center; margin-top: 40vh;";
    document.getElementById("app")?.replaceWith(note);
}
