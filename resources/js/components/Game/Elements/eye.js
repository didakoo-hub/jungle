export const PUPIL = { x: 1184, y: 1374, r: 100 };
export const GLINT = { reach: 115, direction: { x: 0.69, y: -0.72 }, rest: 47, looking: 41 };

export function glintOf(away = 0) {
    const r = GLINT.rest + (GLINT.looking - GLINT.rest) * away;
    const d = GLINT.reach - r;
    return { x: PUPIL.x + GLINT.direction.x * d, y: PUPIL.y + GLINT.direction.y * d, r };
}
