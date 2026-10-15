import mouseBlueWater from "../../../../images/board/animals/mouse_3_acqua.svg";

const ID_BLUE = 3;

const ANIMAL_URLS = import.meta.glob(
    "../../../../images/board/animals/{cat,dog,elephant,leopard,lion,monkey,mouse,tiger}_[1-6].svg",
    { eager: true, import: "default" }
);

const PYRAMID_URLS = import.meta.glob(
    "../../../../images/board/piramids/piramid_[1-6].svg",
    { eager: true, import: "default" }
);

function basename(path) {
    return path.slice(path.lastIndexOf("/") + 1, -".svg".length);
}

const byName = (urls) =>
    Object.fromEntries(Object.entries(urls).map(([p, url]) => [basename(p), url]));

const animals = byName(ANIMAL_URLS);
const pyramids = byName(PYRAMID_URLS);

export function animalSrc(name, colorId, inWater = false) {
    if (inWater && name === "mouse" && colorId === ID_BLUE) return mouseBlueWater;
    return animals[`${name}_${colorId}`];
}

const PYRAMID_RIMS = {
    1: { fill: "#e9e854", line: "#040402" },
    2: { fill: "#ed3534", line: "#040202" },
    3: { fill: "#395fa2", line: "#020203" },
    4: { fill: "#ed5c80", line: "#040303" },
    5: { fill: "#000000", line: null, wide: true },
    6: { fill: "#fefefe", line: "#040404" },
};

export function pyramidRim(colorId) {
    return PYRAMID_RIMS[colorId] ?? null;
}

export function pyramidSrc(colorId) {
    return pyramids[`piramid_${colorId}`];
}
