import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    RPC_POLYGON, RPC_ETHEREUM, DEPRECATION_URLS, STREAMR_NETWORK,
} from "../resources/js/net/constants.js";

const require = createRequire(import.meta.url);
const streamr = require("@streamr/config/config.json")[STREAMR_NETWORK];
const cdnLocation = readFileSync(require.resolve("@streamr/cdn-location"), "utf8").match(/https:\/\/[\w.-]+/g) ?? [];

export function originsNetwork() {
    const url = [
        ...RPC_POLYGON,
        ...RPC_ETHEREUM,
        ...DEPRECATION_URLS,
        streamr.theGraphUrl,
        ...streamr.rpcEndpoints.map((r) => r.url),
        ...cdnLocation,
    ];
    return [...new Set(url.map((u) => new URL(u).origin))];
}

export function cspContent() {
    return [
        "default-src 'self'",
        "script-src 'self'",
        "worker-src 'self' blob:",
        `connect-src 'self' ${originsNetwork().join(" ")} wss:`,
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ].join("; ");
}

export function metaCsp() {
    return `<meta http-equiv="Content-Security-Policy" content="${cspContent()}">`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const at = process.argv.indexOf("--check");
    if (at < 0) {
        console.log(cspContent());
    } else {
        const page = readFileSync(process.argv[at + 1] ?? "dist/index.html", "utf8");
        const ok = page.includes(metaCsp());
        console.log(ok ? "the page carries the policy" : "the page lacks the policy, or carries another");
        process.exit(ok ? 0 : 1);
    }
}
