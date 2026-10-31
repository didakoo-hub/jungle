<template>
    <div style="width: 100%">
        <div
            class="turn-status"
            style="font-size:12px; margin-bottom:15px; --heartbeat: 0.3s;"
            :class="{ 'turn-status-hidden': !statusVisible }"
        >
            <span v-if="waiting" :class="{ 'turn-status-hidden': !waitingText }">
                <template v-if="waitingSpinner">{{ withoutDots(waitingText) }} <Dots /></template>
                <template v-else>{{ waitingText }}</template>
            </span>
            <span v-else-if="botThinking">
                Bot is thinking <Dots />
            </span>
            <span v-else-if="syncing">
                Syncing <Dots />
            </span>
            <span v-else-if="confirming">
                Confirming <Dots />
            </span>
            <span v-else-if="moveInFlight">
                Sending <Dots />
            </span>
            <span v-else-if="locked">
                Wrong account
            </span>
            <span v-else-if="fundsFinished && turn === myColor">
                Match out of gas
            </span>
            <span v-else-if="(waitingDeadline && (!chain || turn === myColor)) || held">
                Turn expired, waiting <Dots />
            </span>
            <span v-else-if="waitingOpponent">
                Opponent's move · {{ secondsLeft }}s
            </span>
            <span v-else>
                Your move · {{ secondsLeft }}s
            </span>
            <span v-if="!waiting && error" class="error-line">{{ error }}</span>
            <span
                v-if="!waiting && messageBlocked"
                :style="{ color: colorBlocked, marginLeft: '1em' }"
            >{{ messageBlocked }}</span>
        </div>
        <svg
            :style="{ backgroundColor: playColors.light }"
            ref="svg"
            :viewBox="`0 0 ${viewBox.x} ${viewBox.y}`"
        >
            <g>
                <rect
                    :x="boardSettings.padding + boardSettings.square.width"
                    :y="boardSettings.square.height * 3"
                    :width="boardSettings.square.width * 2"
                    :height="boardSettings.square.height * 3"
                    fill="#07569c"
                />
                <River
                    :x="boardSettings.padding + boardSettings.square.width"
                    :y="boardSettings.square.height * 3"
                    :width="boardSettings.square.width * 2"
                    :height="boardSettings.square.height * 3"
                />
            </g>
            <g>
                <rect
                    :x="boardSettings.padding + boardSettings.square.width * 4"
                    :y="boardSettings.square.height * 3"
                    :width="boardSettings.square.width * 2"
                    :height="boardSettings.square.height * 3"
                    fill="#07569c"
                />
                <River
                    :x="boardSettings.padding + boardSettings.square.width * 4"
                    :y="boardSettings.square.height * 3"
                    :width="boardSettings.square.width * 2"
                    :height="boardSettings.square.height * 3"
                />
            </g>
            <g class="squares">
                <g
                    v-for="(squareRow, squareRowIndex) in squares"
                    :key="squareRowIndex"
                    class="square-row"
                >
                    <g
                        v-for="(square, squareColIndex) in squareRow"
                        :key="square.code"
                        :ref="square.code"
                        :class="{
                            square: true,
                            [`square-${square.code}`]: true,
                        }"
                        @click="squareClick(squareRowIndex, squareColIndex)"
                    >
                        <rect
                            :x="square.x"
                            :y="square.y"
                            :width="square.width"
                            :height="square.height"
                            :fill="
                                square.isPossibleMove
                                    ? possibleMoveColor(square.code)
                                    : playColors[square.color]
                            "
                        ></rect>
                        <rect
                            v-show="square.isPossibleMove"
                            :x="square.x + square.width / 2 - 5"
                            :y="square.y + square.height / 2 - 5"
                            width="10"
                            height="10"
                            rx="50"
                            fill="#ffffff"
                        />
                    </g>
                </g>
            </g>
            <g @click="squareClick(0, 3)" :class="{ 'placeholder-in-flight': inFlightOn(0, 3) }">
                <Pyramid1
                    v-if="!waiting && winner !== 'white'"
                    :x="boardSettings.padding + boardSettings.square.width * 3"
                    :y="flipped ? boardSettings.square.height * 8 : 0"
                    :width="boardSettings.square.width"
                    :height="boardSettings.square.height"
                    :color="boardColors?.black"
                    :target="nearestFoe.black"
                />
            </g>
            <g @click="squareClick(8, 3)" :class="{ 'placeholder-in-flight': inFlightOn(8, 3) }">
                <Pyramid2
                    v-if="winner !== 'black'"
                    :x="boardSettings.padding + boardSettings.square.width * 3"
                    :y="flipped ? 0 : boardSettings.square.height * 8"
                    :width="boardSettings.square.width"
                    :height="boardSettings.square.height"
                    :color="boardColors?.white"
                    :target="nearestFoe.white"
                />
            </g>
            <g class="squares">
                <g
                    v-for="(squareRow, squareRowIndex) in squares"
                    :key="squareRowIndex"
                    class="square-row"
                >
                    <g
                        v-for="(square, squareColIndex) in squareRow"
                        :key="square.code"
                        :ref="square.code"
                        :class="{
                            square: true,
                            [`square-${square.code}`]: true,
                        }"
                        @click="squareClick(squareRowIndex, squareColIndex)"
                    >
                        <g
                            v-if="square.content.piece"
                            :class="{ 'placeholder-in-flight': inFlightOn(square.row, square.col) }"
                        >
                            <Piece
                                :avatar-color="
                                    boardColors[square.content.color]
                                "
                                :key="square.code"
                                :name="square.content.piece"
                                :x="square.content.x"
                                :y="square.content.y"
                                :transformX="gamePieceMoveCoords.toX"
                                :transformY="gamePieceMoveCoords.toY"
                                :isMoves="
                                    square.content.piece ===
                                        gamePieceMoveCoords.piece &&
                                    square.content.color ===
                                        gamePieceMoveCoords.color
                                "
                                :width="square.content.width"
                                :height="square.content.height"
                                :color="square.content.color"
                                :water="mouseWater[square.content.color] === true"
                                @settled="syncMouseWater"
                            />
                        </g>
                    </g>
                </g>
            </g>
            <g
                v-for="trap in trapPositions"
                :key="trap.code"
                :class="{ 'placeholder-in-flight': inFlightOn(trap.row, trap.col) && !placeholderInFlight.content.piece }"
                @click="squareClick(trap.row, trap.col)"
            >
                <Trap
                    :x="trap.x"
                    :y="trap.y"
                    :width="boardSettings.square.width"
                    :height="boardSettings.square.height"
                />
            </g>
            <g v-if="pointInFlight" style="pointer-events: none">
                <circle
                    class="placeholder-in-flight"
                    :cx="placeholderInFlight.x + placeholderInFlight.width / 2"
                    :cy="placeholderInFlight.y + placeholderInFlight.height / 2"
                    r="6"
                    :fill="tintInFlight"
                />
            </g>
            <g v-if="cursorSquare" style="pointer-events: none">
                <rect
                    :x="cursorSquare.x + 3"
                    :y="cursorSquare.y + 3"
                    :width="cursorSquare.width - 6"
                    :height="cursorSquare.height - 6"
                    rx="6"
                    fill="none"
                    :stroke="colorCursor"
                    :stroke-width="moveFromKeyboard ? 4 : 3"
                    :stroke-dasharray="moveFromKeyboard ? 'none' : '7 5'"
                />
            </g>
        </svg>
    </div>
</template>

<script>
import { ref } from "vue";
import store from "../../store/index.js";
import helper from "./GameHelper.js";
import * as engine from "../../engine/minimax.js";
import BotWorker from "../../engine/bot.worker.js?worker&inline";
import Piece from "./Elements/Piece.vue";
import River from "./Elements/River.vue";
import Pyramid1 from "./Elements/Pyramid1.vue";
import Pyramid2 from "./Elements/Pyramid2.vue";
import Trap from "./Elements/Trap.vue";
import Dots from "../includes/Dots.vue";
import { trapCodes, houseCodes } from "./constants.js";
import { colorName, tintColor, TINT_MOUSE_WATER } from "../../game/colors.js";
import { patchGame } from "../../game/snapshot.js";
import { addWin } from "../../game/wins.js";
import * as timer from "../../game/timer.js";
import { depthOf, botRoll, levelFromSeed, levelOfDepth, BOT_FALLBACK_DEPTH } from "../../game/botEngine.js";
import { MATCH_TARGETS } from "../includes/bar.js";
import { onMouseMove } from "../includes/mouse.js";
const waterCodes = helper.getWaterCodes();
const backgroundColors = helper.getBoardColors();
const WIN_REVEAL_MS = 1000;

const BLOCKED_COLOR = "#ffffff";
const COLOR_CURSOR = "#ffffff";
const ARROWS = {
    ArrowUp: { dr: -1, dc: 0 },
    ArrowLeft: { dr: 0, dc: -1 },
    ArrowDown: { dr: 1, dc: 0 },
    ArrowRight: { dr: 0, dc: 1 },
};
const SIDE_WEIGHT = 2;
const KEYSTROKES_SELECTION = ["Enter", " ", "Spacebar"];
const TAG_INTERACTIVE = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"];
const BOT_FLOOR_MS = 500;
const BOT_ANIMATION_DELAY_MS = 500;
const BOT_WARMUP_DEPTH = 5;
const SLICE_SCALE = [
    [8, 4],
    [6, 3],
    [4, 2],
    [2, 1],
];
const SLICE_GAIN = [1, 1, 1.44, 1.98, 2.39];
const RELATIVE_COST = { 1: 0.003, 2: 0.01, 3: 0.1, 4: 0.3, 5: 1, 6: 3.3, 7: 17 };
const MIDGAME_FACTOR = 3;
const BOT_ACCEPTABLE_WAIT_MS = 1500;
function slicesNeeded(ms, depth, cap) {
    if (cap <= 1) return cap;
    if (!Number.isFinite(ms) || ms <= 0) return cap;
    const estimate = ms * (RELATIVE_COST[depth] ?? 1) * MIDGAME_FACTOR;
    for (let n = 1; n < cap; n++) {
        if (estimate / SLICE_GAIN[n] <= BOT_ACCEPTABLE_WAIT_MS) return n;
    }
    return cap;
}
function slicesPerCore(core) {
    for (const [minimum, slices] of SLICE_SCALE) {
        if (core >= minimum) return slices;
    }
    return 0;
}
function workerCount() {
    const core = navigator.hardwareConcurrency;
    if (!Number.isInteger(core) || core < 2) return 0;
    const requested = slicesPerCore(core);
    return Math.max(0, Math.min(requested, core - 1));
}
const BOT_WATCHDOG_MS = 30000;
const BOT_WATCHDOG_LIMIT = 2;
const BOT_PROBE_DEPTH = 1;
const BOT_PROBE_MS = 4500;
const PROBE_BOARD = Array.from({ length: 9 }, () =>
    Array.from({ length: 7 }, () => ({ content: {} }))
);
const NO_MOVE = Symbol("no legal move");
export default {
    name: "Game",
    components: {
        Piece,
        River,
        Pyramid1,
        Pyramid2,
        Trap,
        Dots,
    },
    emits: ["gameover", "fallback"],
    props: {
        boardSettings: {
            required: false,
            type: Object,
            default: () => ({
                padding: 0,
                square: {
                    width: 80,
                    height: 80,
                },
            }),
        },
        game: Object,
        waitingSpinner: {
            type: Boolean,
            default: true,
        },
        waitingText: {
            type: String,
            default: "Waiting for player",
        },
        syncing: {
            type: Boolean,
            default: false,
        },
        error: {
            type: String,
            default: "",
        },
        fundsFinished: {
            type: Boolean,
            default: false,
        },
        locked: {
            type: Boolean,
            default: false,
        },
        held: {
            type: Boolean,
            default: false,
        },
        menuOpen: {
            type: Boolean,
            default: false,
        },
        color: {
            type: Object,
            default: () => ({
                dark: "#55555500",
                possibleMoveWater: "#00e4ffa3",
            }),
        },
        waiting: {
            type: Boolean,
            default: false,
        },
        myColor: {
            type: String,
            default: "white",
        },
        chain: {
            type: Boolean,
            default: false,
        },
        online: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            possibleMove: "",
            colorBlocked: BLOCKED_COLOR,
            viewBox: { x: 560, y: 720 },
            boardColors: {
                black: 1,
                white: 2,
                board: 1,
            },
            playColors: {
                light: "#feb442",
                dark: this.color.dark,
            },
            squares: ref([]),
            possibleMoves: ref([]),
            gamePieceMoveCoords: {
                piece: null,
                toX: 0,
                toY: 0,
                color: "",
            },
            state: null,
            mouseWater: { white: false, black: false },
            isHoldingChessPiece: ref(false),
            holding: ref({ row: null, col: null }),
            winner: null,
            cursor: null,
            moveFromKeyboard: false,
            cursorBar: "",
            barComeback: null,
            colorCursor: COLOR_CURSOR,
            repetitions: engine.initialRepetitions(),
            seed: "",
            moves: 0,
            turnDeadline: 0,
            idleDeadline: 0,
            penalized: false,
            secondsLeft: 0,
            waitingDeadline: false,
            moveInFlight: false,
            confirming: false,
            metaInFlight: null,
            pieceInFlight: null,
            deadlineVerified: false,
            extendedMs: 0,
            turnTimer: null,
            botHandle: null,
            bots: [],
            botPending: null,
            botRequestId: 0,
            botWatchdog: null,
            botDelay: null,
            slices: null,
            calibration: null,
            probing: null,
            probeHandle: null,
            fallback: false,
            watchdogs: 0,
        };
    },
    async mounted() {
        this.winner = null;
        this.fallback = this.game?.fallback === true;
        this.createWorker(this.fallback ? 0 : Math.min(1, workerCount()));
        this.probing = this.online || !this.bots.length ? null : this.probeWorkers(this.bots);
        this.turnTimer = timer.createTurnTimer({
            onTick: () => {
                this.secondsLeft = timer.secondsLeft(
                    timer.shownDeadline(this.turnDeadline, { grace: this.waitingOpponent })
                );
            },
            onTurnExpired: this.expireTurn,
            onIdleExpired: this.abandon,
        });
        this.setInitialConfig();
        this.startBot();
        window.addEventListener("keydown", this.keyboard);
        window.addEventListener("click", this.resetKeyboard);
        this.switchOffOnMouse = onMouseMove(this.resetKeyboard);
    },
    beforeDestroy() {
        clearTimeout(this.winReveal);
        clearTimeout(this.probeHandle);
        this.turnTimer?.stop();
        this.cancelBot();
        this.bots.forEach((w) => w.terminate());
        window.removeEventListener("keydown", this.keyboard);
        window.removeEventListener("click", this.resetKeyboard);
        this.switchOffOnMouse?.();
    },
    computed: {
        turn: {
            get: function () {
                return store.state.turn;
            },
            set: function (val) {
                return store.commit("CHANGE_TURN", val);
            },
        },
        showTimer() {
            return !this.winner && this.turnDeadline > 0;
        },
        botThinking() {
            return !this.online && !this.winner && this.turn === this.itsColor;
        },
        itsColor() {
            return engine.getOpponentColor(this.myColor);
        },
        flipped() {
            return this.myColor === "black";
        },
        waitingOpponent() {
            return this.online && !this.winner && this.turn === this.itsColor;
        },
        myTurn() {
            return this.turn === this.myColor && !this.waitingDeadline && !this.syncing && !this.moveInFlight && !this.locked && !this.held;
        },
        placeholderInFlight() {
            if (!this.moveInFlight || !this.metaInFlight) return null;
            return this.squares[this.metaInFlight.row][this.metaInFlight.col];
        },
        pointInFlight() {
            const s = this.placeholderInFlight;
            if (!s || s.content.piece) return null;
            if (trapCodes.all.includes(s.code) || houseCodes.all.includes(s.code)) return null;
            return s;
        },
        tintInFlight() {
            const id = this.boardColors?.[this.myColor];
            if (
                id === 3 &&
                this.pieceInFlight === "mouse" &&
                waterCodes.includes(this.placeholderInFlight?.code)
            ) return TINT_MOUSE_WATER;
            return tintColor(id) ?? "#ffffff";
        },
        statusVisible() {
            return this.waiting || !!this.error || this.botThinking || this.showTimer || this.confirming;
        },
        trapPositions() {
            return trapCodes.all.map((code) => {
                const { rowIndex, colIndex } = helper.getIndexesByCode(code);
                return {
                    code,
                    row: rowIndex,
                    col: colIndex,
                    ...this.viewPosition(rowIndex, colIndex),
                };
            });
        },
        nearestFoe() {
            const dens = { black: { row: 0, col: 3 }, white: { row: 8, col: 3 } };
            const target = {};
            for (const [color, den] of Object.entries(dens)) {
                let best = null;
                for (const line of this.squares) {
                    for (const cell of line) {
                        if (!cell.content.piece || cell.content.color === color) continue;
                        const distance = Math.hypot(cell.row - den.row, cell.col - den.col);
                        if (!best || distance < best.distance) best = { distance, cell };
                    }
                }
                target[color] = best && {
                    x: best.cell.x + best.cell.width / 2,
                    y: best.cell.y + best.cell.height / 2,
                };
            }
            return target;
        },
        humanBlockedAnimal() {
            if (this.winner) return null;
            return engine.animalBlocked(this.repetitions, this.myColor);
        },
        cursorSquare() {
            if (!this.cursor) return null;
            return this.squares[this.cursor.row]?.[this.cursor.col] ?? null;
        },
        level() {
            return levelFromSeed(this.seed);
        },
        depth() {
            return depthOf(this.level);
        },
        blockedAnimals() {
            if (this.winner) return [];
            return ["white", "black"]
                .map((side) => ({ side, animal: engine.animalBlocked(this.repetitions, side) }))
                .filter(({ animal }) => animal);
        },
        messageBlocked() {
            const lines = this.blockedAnimals.map(({ side, animal }) => {
                const color = colorName(this.boardColors?.[side]);
                return `${color} ${animal} exhausted`.toUpperCase();
            });
            return lines.length ? lines.join(", ") : null;
        },
    },
    watch: {
        cursorBar(where) {
            this.$emit("bar", where);
        },
        menuOpen(opened) {
            if (opened) this.resetKeyboard();
        },
        locked(on) {
            if (on) this.deselectPiece();
        },
        held(on) {
            if (on) this.deselectPiece();
        },
    },
    methods: {
        withoutDots(text) {
            return text.replace(/\s*\.\.\.$/, "");
        },
        setInitialConfig() {
            if (this.game) {
                this.fillState(this.game.state);
                this.fillColors(this.game);
                this.turn = this.game.turn ?? "white";
                this.penalized = this.online
                    ? { white: false, black: false, ...(typeof this.game.penalized === "object" ? this.game.penalized : null) }
                    : this.game.penalized === true;
                this.repetitions =
                    this.game.repetitions ?? engine.initialRepetitions();
                this.seed = this.game.seed ?? "";
                this.moves = this.game.moves ?? 0;
            }
            this.idleDeadline = this.game?.idleDeadline ?? timer.openIdle();
            this.initSquares();
            if (!this.waiting) this.resumeTimer();
        },
        endGame() {
            this.turnTimer?.stop();
            this.cancelBot();
            this.deselectPiece();
            this.turnDeadline = 0;
            this.emitTurnState();
        },
        reopenTurn() {
            if (this.winner) return;
            this.changeTurn(this.turn);
        },
        resumeTimer() {
            const decision = timer.restore(this.game, Date.now());
            if (decision.action === "abandon") {
                this.abandon();
                return;
            }
            if (!this.online && this.turn === this.itsColor) {
                this.changeTurn(this.itsColor);
                this.scheduleBot();
                return;
            }
            if (decision.action === "resume") {
                this.turnDeadline = this.game.turnDeadline;
                this.armTimer();
                return;
            }
            if (decision.action === "expired") {
                this.expireTurn();
                return;
            }
            this.changeTurn(this.turn);
        },
        changeTurn(color) {
            if (color !== this.turn) this.moves += 1;
            this.turn = color;
            this.waitingDeadline = false;
            this.moveInFlight = false;
            this.deadlineVerified = false;
            this.extendedMs = 0;
            this.turnDeadline = (
                this.online && color === this.itsColor
                    ? timer.openTurnOpponent(color, this.penalized)
                    : timer.openTurn(color, this.penalized, Date.now(), { symmetric: this.online })
            ).turnDeadline;
            this.armTimer();
            this.saveState();
        },
        suspendTime() {
            this.turnTimer?.stop();
        },
        realignDeadline(deadline) {
            if (this.winner || !this.turnDeadline || this.syncing || this.waitingDeadline) return;
            const grace = this.turn === this.itsColor && !this.chain ? timer.GRACE_SECONDS * 1000 : 0;
            this.turnDeadline = Math.min(this.turnDeadline, deadline + grace);
            this.armTimer();
        },
        resumeAfterSync(reopens = false) {
            if (this.winner) return;
            if (reopens) return this.changeTurn(this.turn);
            if (this.turnDeadline && Date.now() >= this.turnDeadline) return this.expireTurn();
            this.armTimer();
        },
        extendItsTurn(ms) {
            if (!this.online || this.winner || this.turn !== this.itsColor || this.waitingDeadline || !(ms > 0)) return false;
            const cap = (timer.TURN_SECONDS + timer.GRACE_SECONDS) * 1000;
            const granted = Math.min(ms, cap - this.extendedMs);
            if (granted <= 0) return false;
            this.extendedMs += granted;
            this.turnDeadline = Math.max(this.turnDeadline, Date.now() + granted);
            this.deadlineVerified = false;
            this.armTimer();
            return true;
        },
        armTimer({ idleOnly = false } = {}) {
            this.turnTimer.start({
                turnDeadline: idleOnly ? 0 : this.turnDeadline,
                idleDeadline: this.idleDeadline,
            });
            this.emitTurnState();
        },
        emitTurnState() {
            this.$emit("turnstate", {
                turn: this.turn,
                turnDeadline: timer.shownDeadline(this.turnDeadline, { grace: this.waitingOpponent }),
            });
        },
        expireTurn() {
            if (this.winner) return;
            if (this.online && this.waitingDeadline) return;
            if (this.moveInFlight) { this.secondsLeft = 0; return; }
            if (this.online && this.turn === this.itsColor) {
                if (this.syncing) return;
                if (!this.deadlineVerified) {
                    this.deadlineVerified = true;
                    this.$emit("verifydeadline");
                    return;
                }
                this.$emit("expired", this.itsColor);
                if (this.chain) {
                    this.secondsLeft = 0;
                    this.waitingDeadline = true;
                    return;
                }
                this.applyDeadline(this.itsColor);
                return;
            }
            if (this.turn !== this.myColor) return;
            this.deselectPiece();
            if (!this.online) this.repetitions = engine.resetRepetitions(this.repetitions, this.myColor);
            this.penalized = timer.withPenalty(this.penalized, this.myColor, true);
            if (!this.syncing) this.$emit("expired", this.myColor);
            if (this.online) {
                this.secondsLeft = 0;
                this.waitingDeadline = true;
                this.armTimer({ idleOnly: true });
                return;
            }
            this.changeTurn(this.itsColor);
            this.scheduleBot();
        },
        applyDeadline(color) {
            if (this.winner) return;
            this.deselectPiece();
            this.repetitions = engine.resetRepetitions(this.repetitions, color);
            this.penalized = timer.withPenalty(this.penalized, color, true);
            this.changeTurn(engine.getOpponentColor(color));
        },
        blackCedes() {
            this.repetitions = engine.resetRepetitions(this.repetitions, this.itsColor);
            this.changeTurn(this.myColor);
        },
        abandon() {
            if (this.winner) return;
            this.winner = this.itsColor;
            this.alertWin(this.itsColor, "inactivity");
        },
        createWorker(howMany = this.slices ?? workerCount()) {
            this.bots = [];
            if (!this.openWorker(howMany).length && howMany > 0) return;
        },
        openWorker(howMany) {
            const newOnes = [];
            try {
                for (let k = 0; k < howMany; k++) {
                    const w = new BotWorker();
                    w.onmessage = ({ data }) => this.settleBot(data.id, data.outcome);
                    w.onerror = this.disableBot;
                    newOnes.push(w);
                }
            } catch {
                newOnes.forEach((w) => w.terminate());
                return [];
            }
            this.bots.push(...newOnes);
            return newOnes;
        },
        cancelBot() {
            clearTimeout(this.botHandle);
            this.botHandle = null;
            clearTimeout(this.botWatchdog);
            this.botWatchdog = null;
            if (this.botDelay) {
                const { handle, resolve } = this.botDelay;
                this.botDelay = null;
                clearTimeout(handle);
                resolve(false);
            }
            if (this.botPending) {
                const { resolve } = this.botPending;
                this.botPending = null;
                resolve(null);
            }
        },
        settleBot(id, outcome) {
            if (this.calibration?.ids.has(id)) {
                this.calibration.ids.delete(id);
                if (this.calibration.ids.size) return;
                const { resolve } = this.calibration;
                this.calibration = null;
                resolve();
                return;
            }
            if (this.botPending?.id !== id) return;
            this.botPending.outcomes.push(outcome);
            if (this.botPending.outcomes.length < this.botPending.awaitedAll) return;
            const { resolve, outcomes, ply } = this.botPending;
            this.botPending = null;
            clearTimeout(this.botWatchdog);
            this.botWatchdog = null;
            resolve(
                engine.mergeSlices(outcomes, botRoll(this.seed, ply)) ??
                    NO_MOVE
            );
        },
        probeWorkers(list) {
            return new Promise((resolve) => {
                const ids = new Set();
                for (const w of list) {
                    const id = ++this.botRequestId;
                    ids.add(id);
                    w.postMessage({
                        id,
                        board: PROBE_BOARD,
                        color: this.myColor,
                        depth: BOT_PROBE_DEPTH,
                        slice: { k: 0, n: 1 },
                    });
                }
                this.probeHandle = setTimeout(() => {
                    this.probeHandle = null;
                    if (this.calibration?.ids !== ids) return;
                    this.calibration = null;
                    resolve(false);
                }, BOT_PROBE_MS);
                this.calibration = {
                    ids,
                    resolve: () => {
                        clearTimeout(this.probeHandle);
                        this.probeHandle = null;
                        resolve(true);
                    },
                };
            });
        },
        warmWorkers(list, color = this.itsColor) {
            if (!list.length) return Promise.resolve();
            return new Promise((resolve) => {
                const ids = new Set();
                for (const w of list) {
                    const id = ++this.botRequestId;
                    ids.add(id);
                    w.postMessage({
                        id,
                        board: this.squares,
                        color,
                        depth: BOT_WARMUP_DEPTH,
                        slice: { k: 0, n: 1 },
                    });
                }
                this.calibration = { ids, resolve };
            });
        },
        async startBot() {
            try {
                await this.prepareBot();
            } finally {
                this.$emit("ready");
            }
        },
        async prepareBot() {
            if (this.online || !this.bots.length) return;
            if (this.probing && !(await this.probing)) {
                this.giveUpWorkers();
                return;
            }
            if (!this.bots.length) return;
            const warmable = !this.winner && this.turn === this.myColor;
            if (this.slices === null && warmable) {
                const ply = this.moves;
                await this.warmWorkers(this.bots, this.myColor);
                if (!this.bots.length) return;
                const t0 = performance.now();
                await this.warmWorkers(this.bots, this.itsColor);
                if (!this.bots.length) return;
                this.slices = slicesNeeded(
                    performance.now() - t0,
                    this.depth,
                    workerCount()
                );
                const newOnes = this.openWorker(this.slices - this.bots.length);
                if (this.winner || this.turn !== this.myColor || this.moves !== ply) return;
                await this.warmWorkers(newOnes);
                return;
            }
            this.openWorker((this.slices ?? workerCount()) - this.bots.length);
            if (warmable) await this.warmWorkers(this.bots);
        },
        askBot(board, color, depth) {
            if (!this.probing) return this.askWorkers(board, color, depth);
            return this.probing.then(() => this.askWorkers(board, color, depth));
        },
        askWorkers(board, color, depth) {
            const n = this.bots.length;
            if (!n) {
                return Promise.resolve(
                    this.fallbackMove(board, color, this.repetitions, this.moves)
                );
            }
            return new Promise((resolve) => {
                const id = ++this.botRequestId;
                const repetitions = this.repetitions;
                const ply = this.moves;
                this.botPending = {
                    id,
                    resolve,
                    board,
                    color,
                    repetitions,
                    ply,
                    awaitedAll: n,
                    outcomes: [],
                };
                this.bots.forEach((w, k) => {
                    w.postMessage({
                        id,
                        board,
                        color,
                        depth,
                        slice: { k, n },
                        repetitions,
                    });
                });
                this.botWatchdog = setTimeout(this.botMute, BOT_WATCHDOG_MS);
            });
        },
        fallbackMove(board, color, repetitions, ply) {
            const move = engine.calculateBestMove(
                board,
                color,
                BOT_FALLBACK_DEPTH,
                -Infinity,
                Infinity,
                { repetitions, rnd: botRoll(this.seed, ply) }
            );
            return move?.fromRow === undefined ? NO_MOVE : move;
        },
        satisfiesWithFallback() {
            if (!this.botPending) return;
            const { id, board, color, repetitions, ply } = this.botPending;
            this.botPending.awaitedAll = 1;
            this.botPending.outcomes = [];
            const move = this.fallbackMove(board, color, repetitions, ply);
            this.settleBot(
                id,
                move === NO_MOVE ? null : { score: 0, moves: [move] }
            );
        },
        botMute() {
            this.botWatchdog = null;
            if (!this.botPending) return;
            this.bots.forEach((w) => w.terminate());
            this.watchdogs += 1;
            if (this.watchdogs >= BOT_WATCHDOG_LIMIT) {
                this.giveUpWorkers();
                return;
            }
            this.satisfiesWithFallback();
            this.createWorker();
        },
        disableBot() {
            if (this.calibration) {
                const { resolve } = this.calibration;
                this.calibration = null;
                resolve();
            }
            this.giveUpWorkers();
        },
        giveUpWorkers() {
            this.bots.forEach((w) => w.terminate());
            this.bots = [];
            if (!this.fallback) {
                this.fallback = true;
                if (!this.online) patchGame({ fallback: true });
                this.$emit("fallback", levelOfDepth(BOT_FALLBACK_DEPTH));
            }
            this.satisfiesWithFallback();
        },
        awaitForAnimation() {
            return new Promise((resolve) => {
                const handle = setTimeout(() => {
                    this.botDelay = null;
                    resolve(true);
                }, BOT_ANIMATION_DELAY_MS);
                this.botDelay = { handle, resolve };
            });
        },
        async scheduleBot({ afterAnimation = false } = {}) {
            this.cancelBot();
            if (this.winner) return;
            const color = this.turn;
            if (this.online || color !== this.itsColor) return;
            const started = performance.now();
            if (afterAnimation) {
                if (!(await this.awaitForAnimation())) return;
                if (this.winner || this.turn !== color) return;
            }
            const move = await this.askBot(this.squares, color, this.depth);
            if (!move || this.winner || this.turn !== color) return;
            if (move === NO_MOVE) {
                this.blackCedes();
                return;
            }
            const left = BOT_FLOOR_MS - (performance.now() - started);
            this.botHandle = setTimeout(() => {
                if (this.winner || this.turn !== color) return;
                this.playComputer(move);
            }, Math.max(0, left));
        },
        inFlightOn(row, col) {
            const s = this.placeholderInFlight;
            return !!s && s.row === row && s.col === col;
        },
        possibleMoveColor(code) {
            return waterCodes.includes(code)
                ? this.color.possibleMoveWater
                : this.possibleMove;
        },
        getSquareContent() {
            return this.state ?? helper.getInitialState();
        },
        fillState(data) {
            if (!data) {
                this.state = helper.getInitialState();
            } else {
                this.state = data;
            }
        },
        fillColors(data) {
            if (data?.colors) {
                this.boardColors = data.colors;
                if (data.colors.board === 2) {
                    this.possibleMove = "#9be8b4";
                } else {
                    this.possibleMove = "#FFE194";
                }
                this.playColors.light =
                    backgroundColors[this.boardColors.board];
            }
        },
        initSquares() {
            this.squares = [];
            let squareContent = this.getSquareContent();
            for (let i = 0; i < 9; i++) {
                this.squares.push([]);
                for (let j = 0; j < 7; j++) {
                    let squarePosition = this.viewPosition(i, j);
                    let code = helper.getSquareCode(i, j);
                    let content = squareContent[code] || {};
                    let pieceSize = {
                        width: this.boardSettings.square.width,
                        height: this.boardSettings.square.height,
                    };
                    this.squares[i].push({
                        isPossibleMove: false,
                        code,
                        i,
                        j,
                        row: i,
                        col: j,
                        areaColor: i < 3 ? "black" : i > 5 ? "white" : null,
                        color: helper.getSquareColor(i, j),
                        content: {
                            color: content.color,
                            piece: content.piece,
                            ...squarePosition,
                            ...pieceSize,
                        },
                        ...squarePosition,
                        ...this.boardSettings.square,
                    });
                }
            }
            this.syncMouseWater();
        },
        settle() {
            this.gamePieceMoveCoords = { piece: null, toX: 0, toY: 0, color: "" };
            this.syncMouseWater();
        },
        syncMouseWater() {
            const water = { white: false, black: false };
            for (const line of this.squares) {
                for (const cell of line) {
                    if (
                        cell.content.piece === "mouse" &&
                        waterCodes.includes(cell.code)
                    ) {
                        water[cell.content.color] = true;
                    }
                }
            }
            this.mouseWater = water;
        },
        viewPosition(row, col) {
            return helper.getSquarePosition(
                this.flipped ? 8 - row : row,
                this.flipped ? 6 - col : col,
                this.boardSettings,
            );
        },

        squareClick(rowIndex, colIndex, fromKeyboard = false) {
            if (this.waiting) return;
            if (!fromKeyboard) this.resetKeyboard();
            let square = this.squares[rowIndex][colIndex];
            if (!this.releasePiece(square)) {
                if (
                    square.content.piece &&
                    square.content.color === this.myColor &&
                    this.myTurn &&
                    square.content.piece !== this.humanBlockedAnimal
                ) {
                    this.showPossibleMoves(rowIndex, colIndex);
                    this.holding.row = rowIndex;
                    this.holding.col = colIndex;
                    this.holdPiece(square);
                }
            }
        },
        keyboard(event) {
            if (this.winner || this.menuOpen) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target;
            if (
                target &&
                (TAG_INTERACTIVE.includes(target.tagName) ||
                    target.isContentEditable)
            )
                return;

            if (this.cursorBar) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.resetKeyboard();
                    return;
                }
                if (KEYSTROKES_SELECTION.includes(event.key)) {
                    event.preventDefault();
                    this.$emit("menu");
                    return;
                }
                const fromThe = ARROWS[event.key];
                if (!fromThe) return;
                event.preventDefault();
                if (fromThe.dr > 0) {
                    this.leaveLaBar();
                    return;
                }
                if (fromThe.dc) {
                    const i = MATCH_TARGETS.indexOf(this.cursorBar) + fromThe.dc;
                    if (MATCH_TARGETS[i]) this.cursorBar = MATCH_TARGETS[i];
                }
                return;
            }
            if (this.waiting || !this.myTurn) {
                const towards = ARROWS[event.key];
                if (!towards || towards.dr >= 0) return;
                event.preventDefault();
                this.goToBar();
                return;
            }

            if (event.key === "Escape") {
                if (!this.cursor) return;
                event.preventDefault();
                this.deselectPiece();
                return;
            }
            if (KEYSTROKES_SELECTION.includes(event.key)) {
                event.preventDefault();
                if (!this.cursorSquare) {
                    this.startCursor();
                    return;
                }
                this.moveFromKeyboard = !this.moveFromKeyboard;
                return;
            }
            const arrowScreen = ARROWS[event.key];
            if (!arrowScreen) return;
            const arrow = this.flipped
                ? { dr: -arrowScreen.dr, dc: -arrowScreen.dc }
                : arrowScreen;
            event.preventDefault();
            if (this.moveFromKeyboard && this.cursorSquare) {
                this.doMoveInDirection(arrow);
            } else if (this.cursorSquare) {
                if (!this.scrollTowards(arrow) && arrowScreen.dr < 0) {
                    this.goToBar();
                }
            } else {
                this.startCursor();
            }
        },
        animalsScrollable() {
            const blocked = this.humanBlockedAnimal;
            const list = [];
            for (const line of this.squares) {
                for (const sq of line) {
                    if (
                        sq.content.piece &&
                        sq.content.color === this.myColor &&
                        sq.content.piece !== blocked
                    ) {
                        list.push({ row: sq.row, col: sq.col });
                    }
                }
            }
            return list;
        },
        placeCursor(row, col) {
            this.deselectPiece();
            this.cursor = { row, col };
            this.moveFromKeyboard = false;
            this.squareClick(row, col, true);
        },
        startCursor() {
            const list = this.animalsScrollable();
            if (!list.length) return;
            const { rowIndex, colIndex } = helper.getIndexesByCode(
                houseCodes[this.myColor]
            );
            let best = null;
            let cost = Infinity;
            for (const p of list) {
                const d =
                    (p.row - rowIndex) * (p.row - rowIndex) +
                    (p.col - colIndex) * (p.col - colIndex);
                if (d < cost) {
                    cost = d;
                    best = p;
                }
            }
            this.placeCursor(best.row, best.col);
        },
        scrollTowards({ dr, dc }) {
            const { row, col } = this.cursor;
            let best = null;
            let cost = Infinity;
            for (const p of this.animalsScrollable()) {
                const forward = dr ? (p.row - row) * dr : (p.col - col) * dc;
                if (forward <= 0) continue;
                const side = dr ? p.col - col : p.row - row;
                const d = forward * forward + SIDE_WEIGHT * side * side;
                if (d < cost) {
                    cost = d;
                    best = p;
                }
            }
            if (!best) return false;
            this.placeCursor(best.row, best.col);
            return true;
        },
        goToBar() {
            const from = this.cursor;
            this.deselectPiece();
            this.barComeback = from;
            this.cursorBar = MATCH_TARGETS[0];
        },
        leaveLaBar() {
            this.cursorBar = "";
            if (this.waiting || !this.myTurn) return;
            if (this.barComeback) {
                this.placeCursor(this.barComeback.row, this.barComeback.col);
                return;
            }
            this.startCursor();
        },
        doMoveInDirection({ dr, dc }) {
            const { row, col } = this.cursor;
            const arrival = this.possibleMoves.find(
                (sq) =>
                    Math.sign(sq.row - row) === dr &&
                    Math.sign(sq.col - col) === dc
            );
            if (!arrival) return;
            this.squareClick(arrival.row, arrival.col, true);
        },
        resetKeyboard() {
            this.cursor = null;
            this.moveFromKeyboard = false;
            this.cursorBar = "";
            this.barComeback = null;
        },
        makeMove(fromSquare, toSquare) {
            this.repetitions = engine.advanceRepetitions(
                this.repetitions,
                fromSquare.content.color,
                fromSquare.content.piece
            );
            this.syncMouseWater();
            this.gamePieceMoveCoords = {
                piece: fromSquare.content?.piece,
                toX: toSquare.x - fromSquare.x,
                toY: toSquare.y - fromSquare.y,
                color: this.turn,
            };
            this.updateState({
                fromCode: fromSquare.code,
                toCode: toSquare.code,
                piece: fromSquare.content.piece,
                color: fromSquare.content.color,
            });
            toSquare.content.piece = fromSquare.content?.piece;
            toSquare.content.color = fromSquare.content?.color;
            fromSquare.content.piece = null;
            fromSquare.content.color = null;
        },
        updateState(data) {
            const { fromCode, toCode, piece, color } = data;
            this.state[toCode] = {
                color,
                piece,
            };
            if (this.state[fromCode]) {
                delete this.state[fromCode];
            }
        },
        saveState() {
            if (this.online) return;
            patchGame({
                state: this.state,
                turn: this.turn,
                colors: this.boardColors,
                repetitions: this.repetitions,
                moves: this.moves,
                turnDeadline: this.turnDeadline,
                penalized: this.penalized,
                idleDeadline: this.idleDeadline,
            });
        },
        alertWin(winner, reason = "den") {
            this.confirming = false;
            this.endGame();
            if (this.online && winner === this.myColor) addWin();
            this.$emit("gameover", winner, reason);
            this.playAgain();
        },
        recordOutcome(winner) {
            this.saveState();
            patchGame({ finished: { winner, t: Date.now() } });
            if (winner === this.myColor) addWin();
        },
        concludeMove({ scheduleBot }) {
            const checkmate = engine.isCheckmate(this.squares);
            if (checkmate) {
                this.winner = checkmate;
                const reason = engine.isWin(this.squares, checkmate) ? "den" : "wipeout";
                const confirm = this.online && !this.chain && this.turn === this.myColor && checkmate === this.myColor;
                this.$emit("checkmate", checkmate, reason);
                this.endGame();
                if (!this.online) this.recordOutcome(checkmate);
                clearTimeout(this.winReveal);
                this.winReveal = setTimeout(() => {
                    this.winReveal = null;
                    if (!confirm) return this.alertWin(checkmate, reason);
                    this.confirming = true;
                    this.$emit("confirmwin", checkmate, reason);
                }, WIN_REVEAL_MS);
                return;
            }
            this.changeTurn(engine.getOpponentColor(this.turn));
            if (scheduleBot) this.scheduleBot({ afterAnimation: true });
        },
        releasePiece(toSquare) {
            if (!this.isHoldingChessPiece) return false;
            if (this.winner || !this.myTurn) {
                this.deselectPiece();
                return false;
            }
            let fromSquare = this.squares[this.holding.row][this.holding.col];
            if (!toSquare.isPossibleMove) {
                this.isHoldingChessPiece = null;
                this.clearPossibleMoves();
                return false;
            }
            this.$emit("move", {
                fromRow: this.holding.row,
                fromCol: this.holding.col,
                toRow: toSquare.row,
                toCol: toSquare.col,
            });
            if (this.chain) {
                this.moveInFlight = true;
                this.metaInFlight = { row: toSquare.row, col: toSquare.col };
                this.pieceInFlight = fromSquare.content.piece;
                this.isHoldingChessPiece = false;
                this.clearPossibleMoves();
                this.deselectPiece();
                this.emitTurnState();
                return true;
            }
            this.makeMove(fromSquare, toSquare);
            this.isHoldingChessPiece = false;

            this.penalized = timer.withPenalty(this.penalized, this.myColor, false);
            this.idleDeadline = timer.openIdle();

            this.clearPossibleMoves();
            this.resetKeyboard();
            this.concludeMove({ scheduleBot: true });
            return true;
        },

        playAgain() {
            this.initSquares();
            this.turn = "white";
            this.turnDeadline = 0;
            this.waitingDeadline = false;
            this.penalized = this.online ? { white: false, black: false } : false;
            this.repetitions = engine.initialRepetitions();
        },
        restart(state) {
            clearTimeout(this.winReveal);
            this.winReveal = null;
            this.winner = null;
            this.confirming = false;
            this.deselectPiece();
            this.clearPossibleMoves();
            this.isHoldingChessPiece = false;
            this.fillState(state);
            this.moves = 0;
            this.moveInFlight = false;
            this.deadlineVerified = false;
            this.playAgain();
        },

        deselectPiece() {
            this.isHoldingChessPiece = null;
            this.clearPossibleMoves();
            this.resetKeyboard();
        },
        clearPossibleMoves() {
            for (let i = 0; i < this.possibleMoves.length; i++) {
                this.possibleMoves[i].isPossibleMove = false;
            }
            this.possibleMoves = ref([]);
        },
        holdPiece(square) {
            if (
                !square.content.piece ||
                square.content.color !== this.turn ||
                this.possibleMoves.length === 0
            )
                return;
            this.isHoldingChessPiece = square;
        },
        getPossibleMoves(squareRowIndex, squareColIndex, board = this.squares) {
            return engine.getPossibleMoves(
                board,
                squareRowIndex,
                squareColIndex,
                this.repetitions
            );
        },
        showPossibleMoves(squareRowIndex, squareColIndex) {
            let moves = this.getPossibleMoves(squareRowIndex, squareColIndex);
            moves.forEach((move) => {
                let square = this.squares[move.toRow][move.toCol];
                square.isPossibleMove = true;
                this.possibleMoves.push(square);
            });
        },
        playComputer(move) {
            const { fromRow, fromCol, toRow, toCol } = move;
            const fromSquare = this.squares[fromRow][fromCol];
            const toSquare = this.squares[toRow][toCol];
            const who = fromSquare.content?.color ?? this.itsColor;
            this.makeMove(fromSquare, toSquare);
            this.penalized = timer.withPenalty(this.penalized, who, false);
            if (who === this.myColor) {
                this.idleDeadline = timer.openIdle();
                this.moveInFlight = false;
            }
            this.concludeMove({ scheduleBot: false });
        },
        lostMove() {
            this.moveInFlight = false;
            if (this.turnDeadline && Date.now() >= this.turnDeadline) return this.expireTurn();
            this.emitTurnState();
        },
    },
};
</script>
<style lang="scss">
.turn-status {
    display: block;
    text-align: center;
    height: 1.25em;
    line-height: 1.25em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: monospace;
    font-size: 16px;
    color: white;
    margin-bottom: 6px;
}
.turn-status-hidden {
    visibility: hidden;
}
.placeholder-in-flight {
    animation: placeholder-blink 0.5s steps(1) infinite;
}
@keyframes placeholder-blink {
    50% {
        opacity: 0;
    }
}
.turn-status .icon {
    margin-right: 0.4em;
    opacity: 0.8;
}
.turn-status .error-line {
    color: #ed3634;
    margin-left: 1em;
}
</style>
