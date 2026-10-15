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
