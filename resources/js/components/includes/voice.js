import recording from "../../../sounds/ready.wav?inline";

export const VOICE_VOLUME = 0.5;

const GESTURES = ["pointerup", "mousedown", "touchend", "keydown"];

let context = null;
let voiced = null;

function audioContext() {
    if (context) return context;
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (typeof Context !== "function") return null;
    try {
        context = new Context();
    } catch {
        context = null;
    }
    return context;
}

export function unlockSound(page = globalThis.document) {
    if (typeof page?.addEventListener !== "function") return;
    const off = () => GESTURES.forEach((e) => page.removeEventListener(e, unlock, true));
    function unlock() {
        const ctx = audioContext();
        if (!ctx) return off();
        Promise.resolve(ctx.resume?.()).then(() => {
            if (ctx.state === "running") off();
        }).catch(() => {});
    }
    GESTURES.forEach((e) => page.addEventListener(e, unlock, true));
}

async function decode() {
    const Offline = globalThis.OfflineAudioContext;
    if (typeof Offline !== "function") return null;
    const text = atob(recording.slice(recording.indexOf(",") + 1));
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0)).buffer;
    return new Offline(1, 1, 16000).decodeAudioData(bytes);
}

export function prepareVoice() {
    voiced ??= decode().catch(() => null);
    return voiced;
}

export function sayReady() {
    const ctx = context;
    if (!ctx) return;
    prepareVoice().then((buffer) => {
        if (!buffer) return;
        const play = () => {
            const source = ctx.createBufferSource();
            const level = ctx.createGain();
            source.buffer = buffer;
            level.gain.value = VOICE_VOLUME;
            source.connect(level).connect(ctx.destination);
            source.start();
        };
        if (ctx.state === "running") return play();
        Promise.resolve(ctx.resume?.()).then(() => {
            if (ctx.state === "running") play();
        }).catch(() => {});
    });
}
