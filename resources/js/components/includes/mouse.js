export const KLASS_KEYBOARD = "keyboard";

let x = null;
let y = null;
const listeners = new Set();

function moved(event) {
    if (!event.isTrusted) return;
    const halted = x === null || (event.clientX === x && event.clientY === y);
    x = event.clientX;
    y = event.clientY;
    if (halted) return;
    document.documentElement.classList.remove(KLASS_KEYBOARD);
    for (const cb of listeners) cb();
}

function pressed(event) {
    if (event.isTrusted) document.documentElement.classList.add(KLASS_KEYBOARD);
}

let installed = false;
function install() {
    if (installed) return;
    installed = true;
    window.addEventListener("mousemove", moved, { passive: true });
    window.addEventListener("keydown", pressed, { capture: true, passive: true });
}

export function onMouseMove(cb) {
    install();
    listeners.add(cb);
    return () => listeners.delete(cb);
}
