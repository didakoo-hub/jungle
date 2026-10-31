const ART_EXTENT = {
    cat: { top: 95, center: 199, bottom: 304, left: 70, right: 330 },
    dog: { top: 114, center: 192, bottom: 295, left: 57, right: 327 },
    elephant: { top: 95, center: 202, bottom: 309, left: 90, right: 315 },
    leopard: { top: 68, center: 185, bottom: 335, left: 87, right: 284 },
    lion: { top: 69, center: 202, bottom: 329, left: 93, right: 311 },
    monkey: { top: 61, center: 206, bottom: 312, left: 125, right: 289 },
    mouse: { top: 66, center: 204, bottom: 304, left: 34, right: 375 },
    tiger: { top: 68, center: 185, bottom: 335, left: 87, right: 284 },
};
const WINDOWS = { default: 370, mouse: 533, cat: 402, elephant: 360, monkey: 385, dog: 385 };
const BASE_GAP = 0.08;
const BADGE_RISE = Math.max(...Object.entries(ART_EXTENT)
    .map(([name, { top, bottom }]) => (bottom - top) / (WINDOWS[name] ?? WINDOWS.default)));

export const ART_SIDE = 400;
export const PIECE_SCALE = 0.93;

export function pieceFrame(name) {
    const size = WINDOWS[name] ?? WINDOWS.default;
    const { center, bottom } = ART_EXTENT[name];
    return { x: center - size / 2, y: bottom + size * BASE_GAP - size, size, center, bottom };
}

export function badgeFrame(name) {
    const size = (WINDOWS[name] ?? WINDOWS.default) * BADGE_RISE;
    const { left, right, bottom } = ART_EXTENT[name];
    return { x: left, y: bottom - size, size, width: right - left, height: size };
}

export function fittedFrame(name) {
    const { top, bottom, left, right } = ART_EXTENT[name];
    const size = Math.max(right - left, bottom - top);
    return { x: left, y: bottom - size, size, width: right - left, height: bottom - top };
}

export function boardFrame(name) {
    const { x, size, center } = pieceFrame(name);
    const { top, bottom } = ART_EXTENT[name];
    const middle = (top + bottom) / 2;
    return { x, y: middle - size / 2, size, center, middle };
}
