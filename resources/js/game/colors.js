function rand(rnd, min, max) {
    return Math.floor(rnd() * (max - min + 1)) + min;
}

export function rollColors(rnd = Math.random) {
    let caseA;
    do {
        caseA = { black: rand(rnd, 5, 6), board: 1, white: rand(rnd, 5, 6) };
    } while (caseA.black === caseA.white);

    let caseB;
    do {
        caseB = { black: rand(rnd, 1, 4), board: 2, white: rand(rnd, 1, 4) };
    } while (
        caseB.black === caseB.white ||
        (caseB.white === 4 && caseB.black === 2) ||
        (caseB.black === 4 && caseB.white === 2)
    );

    return rand(rnd, 0, 1) ? caseA : caseB;
}

const NAMES_COLOR = Object.freeze({
    1: "yellow",
    2: "red",
    3: "blue",
    4: "pink",
    5: "black",
    6: "white",
});

export function colorName(id) {
    return NAMES_COLOR[id] ?? null;
}

const TINTS_COLOR = Object.freeze({
    1: "#e9e954",
    2: "#ed3634",
    3: "#3a60a3",
    4: "#ed5d80",
    5: "#000000",
    6: "#fefffe",
});

export const TINT_MOUSE_WATER = "#99b3e6";

export function tintColor(id) {
    return TINTS_COLOR[id] ?? null;
}

export const idColor = Object.keys(NAMES_COLOR).map(Number);
