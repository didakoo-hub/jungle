const WINS_KEY = "guestWins";

export function getWins() {
    const raw = parseInt(localStorage.getItem(WINS_KEY) ?? "0", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function addWin() {
    const total = getWins() + 1;
    localStorage.setItem(WINS_KEY, String(total));
    return total;
}
