export function storageBlocked() {
    try {
        return !globalThis.localStorage;
    } catch {
        return true;
    }
}
