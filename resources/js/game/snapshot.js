import { colorName } from "./colors.js";
import { NAME_ANIMAL } from "../engine/minimax.js";

const SNAPSHOT_KEY = "jungleGame";

export const OUTCOME_LIFE_MS = 15 * 60 * 1000;

export function loadGame(now = Date.now()) {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    try {
        const game = JSON.parse(raw);
        if (!validState(game?.state) || !game?.colors) {
            clearGame();
            return null;
        }
        if (game.turn !== undefined && game.turn !== "white" && game.turn !== "black") {
            clearGame();
            return null;
        }
        if (!colorName(game.colors.white) || !colorName(game.colors.black)) {
            clearGame();
            return null;
        }
        if (game.finished && now - (game.finished.t ?? 0) > OUTCOME_LIFE_MS) {
            clearGame();
            return null;
        }
        return game;
    } catch (e) {
        console.warn("snapshot unreadable, discarded", e);
        clearGame();
        return null;
    }
}

export function saveGame(game) {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(game));
}

export function patchGame(fields) {
    const game = loadGame();
    if (!game) return null;
    const updated = { ...game, ...fields };
    saveGame(updated);
    return updated;
}

export function clearGame() {
    localStorage.removeItem(SNAPSHOT_KEY);
}

function validState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return false;
    const codes = Object.keys(state);
    if (!codes.length) return false;
    const seen = new Set();
    for (const code of codes) {
        const content = state[code];
        if (!/^[A-G][1-9]$/.test(code)) return false;
        if (!content || typeof content !== "object") return false;
        if (content.color !== "white" && content.color !== "black") return false;
        if (!NAME_ANIMAL.includes(content.piece)) return false;
        const animal = content.color + ":" + content.piece;
        if (seen.has(animal)) return false;
        seen.add(animal);
    }
    return true;
}
