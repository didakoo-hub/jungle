import { isAddress } from "ethers";

export function inviteOf(query) {
    return isAddress(query?.challenge) ? `${query.challenge}:${query.code ?? ""}` : "";
}

// A .eth host resolves only in ENS-aware browsers: the link goes out through eth.limo.
export function inviteBase(href) {
    const url = new URL(href);
    url.hash = "";
    if (url.hostname.endsWith(".eth")) {
        url.hostname += ".limo";
        url.protocol = "https:";
        url.port = "";
    }
    return url.href.replace(/#$/, "");
}
