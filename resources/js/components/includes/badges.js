const URLS = import.meta.glob("../../../images/board/animals/*_1.svg", {
    eager: true,
    import: "default",
});

const VIEWS = {
    cat: "416.47,417.06,1527.92,1527.92",
    elephant: "536.50,534.97,1323.05,1323.05",
    leopard: "309.95,405.44,1576.12,1576.12",
    lion: "426.56,412.05,1532.95,1532.95",
    monkey: "480.17,363.20,1482.31,1482.31",
    tiger: "309.94,404.44,1576.12,1576.12",
};

const PER_NAME = Object.fromEntries(
    Object.entries(URLS).map(([p, url]) =>
        [p.slice(p.lastIndexOf("/") + 1, -"_1.svg".length), url]));

export function icon(src) {
    return `url("${src}")`;
}

export function badgesOf(names) {
    return (names ?? [])
        .filter((name) => VIEWS[name] && PER_NAME[name])
        .map((name) => ({ name, src: `${PER_NAME[name]}#svgView(viewBox(${VIEWS[name]}))` }));
}
