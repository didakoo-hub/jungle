// Blocked site data: Chrome throws on the `localStorage` getter, Firefox leaves it null.
export function storageBlocked() {
    try {
        return !globalThis.localStorage;
    } catch {
        return true;
    }
}
