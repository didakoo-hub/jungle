import { Buffer } from "buffer";

if (typeof globalThis.global === "undefined") globalThis.global = globalThis;

if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

if (typeof globalThis.process === "undefined") {
    globalThis.process = {
        env: {},
        browser: true,
        version: "",
        versions: {},
        platform: "browser",
        nextTick: (f, ...args) => queueMicrotask(() => f(...args)),
    };
}

// Read by the Streamr SDK logger: entrypoint and peer failures are routine mesh churn.
globalThis.process.env.LOG_LEVEL ??= "silent";

// The Streamr SDK registers an `unload` listener at import, which Chrome refuses by policy.
if (typeof window === "object") {
    const addEventListener = window.addEventListener;
    window.addEventListener = function (type, ...rest) {
        if (type === "unload") return;
        return addEventListener.call(this, type, ...rest);
    };
}
