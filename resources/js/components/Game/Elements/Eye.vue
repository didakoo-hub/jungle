<template>
    <g :transform="`scale(${400 / ART_SIZE})`">
        <path :fill="rim.fill" :stroke="rim.fill" stroke-width="30" :d="OUTLINE" />
        <path v-if="rim.line" :transform="lids" :fill="rim.line" :d="OUTLINE" />
        <clipPath :id="clipId">
            <path :transform="lids" :d="white" />
        </clipPath>
        <g :clip-path="`url(#${clipId})`">
            <path fill="#fefefe" :d="white" />
            <g :transform="`translate(${offset.x} ${offset.y})`">
                <path fill="#010101" :d="RING" />
                <path fill="#fdfdfd" :d="RING_INNER" />
                <circle fill="#010101" :cx="PUPIL.x" :cy="PUPIL.y" :r="PUPIL.r" />
                <circle fill="#fdfdfd" :cx="glint.x" :cy="glint.y" :r="glint.r" />
            </g>
        </g>
    </g>
</template>
<script>
import { PUPIL, glintOf } from "./eye.js";

const ART_SIZE = 2363;
const OUTLINE = "M 1145.5,1148.5 C 1260.61,1143.15 1366.94,1170.99 1464.5,1232C 1526.4,1270.01 1580.4,1317.34 1626.5,1374C 1552.85,1463.84 1461.52,1529.18 1352.5,1570C 1219.97,1615.16 1089.97,1608.83 962.5,1551C 873.587,1509.04 797.92,1450.04 735.5,1374C 814.68,1277.54 913.68,1209.54 1032.5,1170C 1069.56,1159.15 1107.22,1151.98 1145.5,1148.5 Z";
const WHITE = "M 1155.5,1164.5 C 1263.72,1161.72 1363.72,1188.89 1455.5,1246C 1511.33,1280.97 1560.99,1323.47 1604.5,1373.5C 1537.18,1452.64 1455.18,1511.47 1358.5,1550C 1225.28,1599.44 1094.28,1594.1 965.5,1534C 885.711,1495.23 816.545,1442.4 758,1375.5C 757.333,1374.5 757.333,1373.5 758,1372.5C 834.088,1285.02 927.254,1222.85 1037.5,1186C 1076.16,1174.41 1115.49,1167.24 1155.5,1164.5 Z";
const RING = "M 1169.5,1193.5 C 1242.37,1192.51 1298.2,1222.51 1337,1283.5C 1360.6,1325.68 1366.93,1370.35 1356,1417.5C 1332.97,1494.53 1281.8,1539.7 1202.5,1553C 1136.14,1558.78 1081.64,1536.28 1039,1485.5C 994.702,1424.1 988.702,1359.1 1021,1290.5C 1053.81,1232.68 1103.31,1200.34 1169.5,1193.5 Z";
const RING_INNER = "M 1165.5,1237.5 C 1224.93,1233.79 1270.09,1257.13 1301,1307.5C 1318.03,1339.15 1322.36,1372.48 1314,1407.5C 1296.23,1466.27 1257.07,1500.44 1196.5,1510C 1138.05,1514.19 1093.22,1491.69 1062,1442.5C 1044.31,1409.97 1039.64,1375.64 1048,1339.5C 1066.37,1281.28 1105.54,1247.28 1165.5,1237.5 Z";
const CENTER_Y = 1373;
const BLINK_MS = 500;
const BLINK_WAIT_MS = { min: 1000, max: 90000 };
const REACH = { x: 220, y: 90 };
const LOOK_MS = 500;
const GLANCE_MS = 5000;
const GLANCE_WAIT_MS = { min: 35000, max: 190000 };

export default {
    props: {
        center: { type: Object, required: true },
        target: { type: Object, default: null },
        rim: { type: Object, required: true },
    },
    data() {
        return {
            ART_SIZE, OUTLINE, RING, RING_INNER, PUPIL,
            clipId: `eye-${this._uid}`,
            open: 1,
            offset: { x: 0, y: 0 },
            lookFrame: null,
            glancing: false,
            glanceTimer: null,
            blinkFrame: null,
            blinkTimer: null,
        };
    },
    computed: {
        lids() {
            return `translate(0 ${CENTER_Y}) scale(1 ${this.open}) translate(0 ${-CENTER_Y})`;
        },
        glint() {
            return glintOf(Math.min(1, Math.hypot(this.offset.x / REACH.x, this.offset.y / REACH.y)));
        },
        white() {
            return this.rim.wide ? OUTLINE : WHITE;
        },
    },
    watch: {
        target() {
            if (this.glancing) this.look(this.target);
        },
    },
    mounted() {
        this.scheduleBlink();
        this.scheduleGlance();
    },
    beforeDestroy() {
        cancelAnimationFrame(this.lookFrame);
        clearTimeout(this.glanceTimer);
        cancelAnimationFrame(this.blinkFrame);
        clearTimeout(this.blinkTimer);
    },
    methods: {
        lookAt(target) {
            if (!target) return { x: 0, y: 0 };
            const dx = target.x - this.center.x, dy = target.y - this.center.y;
            const length = Math.hypot(dx, dy);
            if (length < 1) return { x: 0, y: 0 };
            return { x: (dx / length) * REACH.x, y: (dy / length) * REACH.y };
        },
        scheduleGlance() {
            const { min, max } = GLANCE_WAIT_MS;
            this.glanceTimer = setTimeout(() => {
                this.glancing = true;
                this.look(this.target);
                this.glanceTimer = setTimeout(() => {
                    this.glancing = false;
                    this.look(null);
                    this.scheduleGlance();
                }, GLANCE_MS);
            }, min + Math.random() * (max - min));
        },
        look(target) {
            cancelAnimationFrame(this.lookFrame);
            const from = { ...this.offset };
            const to = this.lookAt(target);
            const start = performance.now();
            const step = (now) => {
                const t = Math.min(1, (now - start) / LOOK_MS);
                const p = t * t * (3 - 2 * t);
                this.offset = { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
                if (t < 1) this.lookFrame = requestAnimationFrame(step);
            };
            this.lookFrame = requestAnimationFrame(step);
        },
        scheduleBlink() {
            const { min, max } = BLINK_WAIT_MS;
            this.blinkTimer = setTimeout(() => this.blink(), min + Math.random() * (max - min));
        },
        blink() {
            const start = performance.now();
            const step = (now) => {
                const t = Math.min(1, (now - start) / BLINK_MS);
                this.open = Math.abs(1 - 2 * t);
                if (t < 1) this.blinkFrame = requestAnimationFrame(step);
                else this.scheduleBlink();
            };
            this.blinkFrame = requestAnimationFrame(step);
        },
    },
};
</script>
