import { MINIAPP_LINK } from "./constants.js";

let miniApp = false;

export function inMiniApp() {
    return miniApp;
}

export function setMiniApp(on) {
    miniApp = !!on;
}

let openUrl = null;

export function setOpenUrl(open) {
    openUrl = open;
}

export function openOutside(url) {
    openUrl?.(url);
}

export function mightBeHosted() {
    try {
        return !!globalThis.ReactNativeWebView || globalThis.parent !== globalThis.self;
    } catch {
        return true;
    }
}

export function inMetaMaskBrowser() {
    return /MetaMaskMobile/.test(globalThis.navigator?.userAgent ?? "");
}

export function farcasterOffered() {
    return !miniApp && !inMetaMaskBrowser();
}

const STAY_MS = 1500;

function farcasterLink(query) {
    return MINIAPP_LINK + (query ? "?" + query : "");
}

export function openInFarcaster(query = "") {
    const page = globalThis.document;
    let behind = false;
    const hidden = () => { if (page.hidden) behind = true; };
    page.addEventListener("visibilitychange", hidden);
    globalThis.open?.(farcasterLink(query), "_blank", "noopener");
    return new Promise((resolve) => setTimeout(() => {
        page.removeEventListener("visibilitychange", hidden);
        resolve(behind || page.hidden);
    }, STAY_MS));
}

export function touchScreen() {
    return globalThis.matchMedia?.("(pointer: coarse)").matches === true;
}

export function handToFarcaster(query = "") {
    const page = globalThis.document;
    let away = false;
    const leave = () => { away = true; };
    const hidden = () => { if (page.hidden) leave(); };
    globalThis.addEventListener("pagehide", leave);
    page.addEventListener("visibilitychange", hidden);
    globalThis.location.assign(farcasterLink(query));
    return new Promise((resolve) => setTimeout(() => {
        globalThis.removeEventListener("pagehide", leave);
        page.removeEventListener("visibilitychange", hidden);
        resolve(!away && !page.hidden);
    }, STAY_MS));
}
