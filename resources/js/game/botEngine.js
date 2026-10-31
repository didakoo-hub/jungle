import { generator } from "./random.js";

export const VERSION_ENGINE = 1;

const PARAMETERS = Object.freeze({
    1: Object.freeze({
        depth: Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9 }),
        drawn: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
    }),
});

export const DEFAULT_LEVEL = 7;
export const BOT_FALLBACK_DEPTH = 2;

export const RANDOM = "random";
export const FIXED_LEVELS = Object.freeze([8, 9]);
const MODE_KEY = "botLevel";

export function levelsOf(version = VERSION_ENGINE) {
    return Object.keys(parametersOf(version).depth).map(Number);
}

export function drawnLevelsOf(version = VERSION_ENGINE) {
    return [...parametersOf(version).drawn];
}

export function depthOf(level = DEFAULT_LEVEL, version = VERSION_ENGINE) {
    const d = parametersOf(version).depth[level];
    if (!d) throw new Error(`unknown game level: ${level}`);
    return d;
}

export function levelOfDepth(depth, version = VERSION_ENGINE) {
    const table = parametersOf(version).depth;
    const level = Object.keys(table).find((l) => table[l] === depth);
    if (level === undefined) throw new Error(`no level at depth: ${depth}`);
    return Number(level);
}

export function levelFromSeed(seed, version = VERSION_ENGINE) {
    if (!seed) return DEFAULT_LEVEL;
    const levels = drawnLevelsOf(version);
    return levels[Math.floor(generator(seed, "level")() * levels.length)];
}

export function levelOf(game) {
    return game?.level ?? levelFromSeed(game?.seed ?? "");
}

export function botMode() {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === null) return RANDOM;
    const level = FIXED_LEVELS.find((l) => String(l) === raw);
    if (level !== undefined) return level;
    localStorage.removeItem(MODE_KEY);
    return RANDOM;
}

export function setBotMode(mode) {
    if (mode === RANDOM) return localStorage.removeItem(MODE_KEY);
    if (!FIXED_LEVELS.includes(mode)) throw new Error(`unknown bot mode: ${mode}`);
    localStorage.setItem(MODE_KEY, String(mode));
}

export function levelForNewGame(seed) {
    const mode = botMode();
    return mode === RANDOM ? levelFromSeed(seed) : mode;
}

function parametersOf(version) {
    const p = PARAMETERS[version];
    if (!p) throw new Error(`unknown engine version: ${version}`);
    return p;
}

export function botRoll(seed, move) {
    return generator(seed, `bot:${move}`);
}
