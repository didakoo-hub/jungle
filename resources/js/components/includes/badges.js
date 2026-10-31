import { animals } from "../Game/constants.js";
import { ART_SIDE, badgeFrame, fittedFrame } from "../Game/Elements/pieceFrame.js";

const SOURCE_SIDE = 2363;

const URLS = import.meta.glob("../../../images/board/animals/*_1.svg", {
    eager: true,
    import: "default",
});

const PER_NAME = Object.fromEntries(
    Object.entries(URLS).map(([p, url]) =>
        [p.slice(p.lastIndexOf("/") + 1, -"_1.svg".length), url]));

export function icon(src) {
    return `url("${src}")`;
}

export function badgesOf(names, { fitted = false } = {}) {
    return (names ?? [])
        .filter((name) => animals[name] && PER_NAME[name])
        .sort((a, b) => animals[a].power - animals[b].power)
        .map((name) => {
            const { x, y, size, width, height } = (fitted ? fittedFrame : badgeFrame)(name);
            const view = [x, y, size, size].map((v) => ((v * SOURCE_SIDE) / ART_SIDE).toFixed(2)).join(",");
            return {
                name,
                src: `${PER_NAME[name]}#svgView(viewBox(${view}))`,
                ratio: width / height,
                scale: size / height,
            };
        });
}
