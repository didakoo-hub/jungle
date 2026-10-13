const ID = "loader";

let held = false;

function element() {
    return typeof document === "undefined" ? null : document.getElementById(ID);
}

export function holdLoader() {
    held = true;
    const loader = element();
    if (loader) loader.style.display = "";
}

export function switchOffLoader() {
    held = false;
    const loader = element();
    if (loader) loader.style.display = "none";
}

export function switchOffFreeLoader() {
    if (!held) switchOffLoader();
}

export function loaderHeld() {
    return held;
}

export const PRELOAD_CAP_MS = 8000;

export function imagesPreloaded(capMs = PRELOAD_CAP_MS) {
    if (typeof document === "undefined") return Promise.resolve();
    const urls = [...document.querySelectorAll('link[rel="preload"][as="image"]')].map((link) => link.href);
    const loads = urls.map((url) => new Promise((resolve) => {
        const image = new Image();
        image.onload = image.onerror = resolve;
        image.src = url;
    }));
    return Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, capMs))]);
}
