import { KLASS_KEYBOARD } from "./mouse.js";


const BUTTONS = { 0: "Enter", 1: "Escape", 12: "ArrowUp", 13: "ArrowDown", 14: "ArrowLeft", 15: "ArrowRight" };
const STICK_DEAD_ZONE = 0.5;
const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 150;

const SCROLL_STEP_PX = 40;
const NATIVE_SCROLL = { ArrowUp: -SCROLL_STEP_PX, ArrowDown: SCROLL_STEP_PX };

function press(key) {
    document.documentElement.classList.add(KLASS_KEYBOARD);
    const target = document.activeElement || document.body;
    const event = new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true });
    if (!target.dispatchEvent(event)) return;
    if (key in NATIVE_SCROLL) window.scrollBy({ top: NATIVE_SCROLL[key] });
    else if (key === "Enter" && target.matches("a[href], button")) target.click();
}

function stickKey(pad) {
    const [x = 0, y = 0] = pad.axes;
    if (Math.max(Math.abs(x), Math.abs(y)) < STICK_DEAD_ZONE) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "ArrowRight" : "ArrowLeft";
    return y > 0 ? "ArrowDown" : "ArrowUp";
}

function heldKeys(pad) {
    const keys = new Set();
    for (const [index, key] of Object.entries(BUTTONS)) {
        if (pad.buttons[index]?.pressed) keys.add(key);
    }
    const stick = stickKey(pad);
    if (stick) keys.add(stick);
    return keys;
}

const ARROW = /^Arrow/;

export function createGamepadReader({ getGamepads, onKey, now = () => performance.now() }) {
    const held = new Map();
    return function read() {
        const seen = new Set();
        for (const pad of getGamepads()) {
            if (!pad || !pad.connected) continue;
            seen.add(pad.index);
            const keys = heldKeys(pad);
            const before = held.get(pad.index);
            const after = new Map();
            for (const key of keys) {
                const due = before?.get(key);
                if (due === undefined) {
                    onKey(key);
                    after.set(key, ARROW.test(key) ? now() + REPEAT_DELAY_MS : Infinity);
                } else if (now() >= due) {
                    onKey(key);
                    after.set(key, now() + REPEAT_EVERY_MS);
                } else {
                    after.set(key, due);
                }
            }
            held.set(pad.index, after);
        }
        for (const index of held.keys()) if (!seen.has(index)) held.delete(index);
        return seen.size > 0;
    };
}

function gamepads() {
    try {
        return navigator.getGamepads();
    } catch {
        return [];
    }
}

function pollGamepads() {
    const read = createGamepadReader({ getGamepads: gamepads, onKey: press });
    let polling = false;
    const frame = () => {
        polling = read();
        if (polling) requestAnimationFrame(frame);
    };
    const start = () => {
        if (polling) return;
        polling = true;
        requestAnimationFrame(frame);
    };
    window.addEventListener("gamepadconnected", start);
    if ([...gamepads()].some((pad) => pad?.connected)) start();
}

export function installControllers() {
    // Edge on Xbox: the controller reaches the Gamepad API.
    if ("gamepadInputEmulation" in navigator) navigator.gamepadInputEmulation = "gamepad";
    if (typeof navigator.getGamepads === "function") pollGamepads();
}
