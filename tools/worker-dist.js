import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider } from "ethers";
import { ENS_NAME, RPC_ETHEREUM } from "../resources/js/net/constants.js";
import { MINIAPP_ORIGIN } from "../resources/js/farcaster/constants.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const at = args.indexOf(name);
    return at < 0 ? fallback : args[at + 1];
};
const DIST = path.resolve(ROOT, flag("--dist", "dist"));
const NOT_SERVED = new Set(["_headers"]);

const cidV1 = (cid) => execFileSync("ipfs", ["cid", "format", "-v", "1", "-b", "base32", cid], { encoding: "utf8" }).trim();

function cidOfDist() {
    return execFileSync("ipfs", ["add", "-rQ", "--only-hash", "--cid-version", "1", DIST], { encoding: "utf8" }).trim();
}

async function cidOfEns() {
    for (const url of RPC_ETHEREUM) {
        try {
            const provider = new JsonRpcProvider(url, 1, { staticNetwork: true });
            const resolver = await provider.getResolver(ENS_NAME);
            const hash = await resolver?.getContentHash();
            provider.destroy();
            if (hash?.startsWith("ipfs://")) return cidV1(hash.slice("ipfs://".length));
        } catch {
        }
    }
    return null;
}

function filesOf(dir, base = dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? filesOf(full, base) : [path.relative(base, full).split(path.sep).join("/")];
    });
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function zipForWorker() {
    const out = path.resolve(ROOT, flag("--out", "../jungle-dist.zip"));
    const local = cidOfDist();
    const expected = flag("--cid", null) ? cidV1(flag("--cid")) : await cidOfEns();
    if (!expected) {
        console.log(`contenthash di ${ENS_NAME} non letto: riprova, o passa --cid`);
        process.exit(1);
    }
    console.log(`CID di dist/  ${local}`);
    console.log(`CID atteso    ${expected}${flag("--cid", null) ? " (--cid)" : ` (${ENS_NAME})`}`);
    if (local !== expected) {
        console.log("diversi: niente zip");
        process.exit(1);
    }
    fs.rmSync(out, { force: true });
    execFileSync("zip", ["-qr", out, "."], { cwd: DIST });
    console.log(`zip pronto: ${out}`);
}

async function checkServed() {
    const files = filesOf(DIST).filter((f) => !NOT_SERVED.has(f));
    let different = 0;
    for (const file of files) {
        const url = `${MINIAPP_ORIGIN}/${file === "index.html" ? "" : file}`;
        let served = null;
        try {
            const r = await fetch(url, { cache: "no-store" });
            served = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
        } catch {
        }
        const same = served !== null && sha256(served) === sha256(fs.readFileSync(path.join(DIST, file)));
        if (!same) different++;
        console.log(`${same ? "uguale  " : "DIVERSO "} ${file}`);
    }
    console.log(different ? `\n${different} file su ${files.length} diversi da dist/` : `\n${files.length} file, tutti uguali a dist/`);
    process.exit(different ? 1 : 0);
}

await (args.includes("--check") ? checkServed() : zipForWorker());
