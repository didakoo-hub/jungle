import { isAddress } from "ethers";
import { BROWSER_URL, MINIAPP_ORIGIN } from "../../farcaster/constants.js";

const OFFICIAL_HOSTS = new Set([
    new URL(BROWSER_URL).hostname.replace(/\.limo$/, ""),
    new URL(BROWSER_URL).hostname,
    new URL(MINIAPP_ORIGIN).hostname,
]);

export function inviteOf(query) {
    return isAddress(query?.challenge) ? `${query.challenge}:${query.code ?? ""}` : "";
}

export function inviteBase(href) {
    const url = new URL(href);
    if (OFFICIAL_HOSTS.has(url.hostname)) return `${MINIAPP_ORIGIN}/`;
    url.hash = "";
    if (url.hostname.endsWith(".eth")) {
        url.hostname += ".limo";
        url.protocol = "https:";
        url.port = "";
    }
    return url.href.replace(/#$/, "");
}

export function inviteUrl(href, query) {
    const base = inviteBase(href);
    return base === `${MINIAPP_ORIGIN}/` ? `${base}invite/?${query}` : `${base}#/online?${query}`;
}
