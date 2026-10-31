import { generator } from "./random.js";

export const VERSION_ENGINE = 1;

const PARAMETERS = Object.freeze({
    1: Object.freeze({
        depth: Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7 }),
    }),
});

export const DEFAULT_LEVEL = 7;
export const BOT_FALLBACK_DEPTH = 2;

export function levelsOf(version = VERSION_ENGINE) {
    return Object.keys(parametersOf(version).depth).map(Number);
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
    const levels = levelsOf(version);
    return levels[Math.floor(generator(seed, "level")() * levels.length)];
}

function parametersOf(version) {
    const p = PARAMETERS[version];
    if (!p) throw new Error(`unknown engine version: ${version}`);
    return p;
}

export function botRoll(seed, move) {
    return generator(seed, `bot:${move}`);
}
