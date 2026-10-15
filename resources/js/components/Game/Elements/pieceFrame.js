const ART_EXTENT = {
    cat: { center: 199, bottom: 304 },
    dog: { center: 192, bottom: 295 },
    elephant: { center: 202, bottom: 309 },
    leopard: { center: 185, bottom: 335 },
    lion: { center: 202, bottom: 329 },
    monkey: { center: 206, bottom: 312 },
    mouse: { center: 204, bottom: 304 },
    tiger: { center: 185, bottom: 335 },
};
const WINDOWS = { default: 370, mouse: 533, cat: 402, elephant: 360, monkey: 385, dog: 385 };
const BASE_GAP = 0.08;

export const ART_SIDE = 400;
export const PIECE_SCALE = 0.93;

export function pieceFrame(name) {
    const size = WINDOWS[name] ?? WINDOWS.default;
    const { center, bottom } = ART_EXTENT[name];
    return { x: center - size / 2, y: bottom + size * BASE_GAP - size, size, center, bottom };
}
