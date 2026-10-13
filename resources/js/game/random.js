export function randomSeed() {
    const b = globalThis.crypto.getRandomValues(new Uint8Array(32));
    return "0x" + [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

export function xorSeeds(a, b) {
    const x = byte(a), y = byte(b);
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = (x[i] ?? 0) ^ (y[i] ?? 0);
    return "0x" + [...out].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function byte(seed) {
    if (seed instanceof Uint8Array) return seed;
    const s = String(seed ?? "");
    if (/^0x[0-9a-fA-F]*$/.test(s)) {
        const hex = s.slice(2);
        const out = new Uint8Array(Math.ceil(hex.length / 2));
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
    }
    return new TextEncoder().encode(s);
}

export function generator(seed, domain = "") {
    if (seed === undefined || seed === null || seed === "") return Math.random;

    const w = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x85ebca6b];
    const bytes = [...byte(seed), 0, ...new TextEncoder().encode(domain)];
    bytes.forEach((n, i) => {
        const k = i & 3;
        w[k] = Math.imul(w[k] ^ n, 0x01000193) >>> 0;
    });

    let [a, b, c, d] = w;
    const rnd = () => {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 12; i++) rnd();
    return rnd;
}

export function shuffle(array, rnd = Math.random) {
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
