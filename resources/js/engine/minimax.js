import helper from "../components/Game/GameHelper.js";
import {
    animals,
    waterCodes,
    trapCodes,
    houseCodes,
    protectHouseCodes,
    trapGuards,
} from "../components/Game/constants.js";

const trapGuardCodes = {
    white: [...new Set(["C1", "D2", "E1"].flatMap((c) => trapGuards[c]))],
    black: [...new Set(["C9", "D8", "E9"].flatMap((c) => trapGuards[c]))],
};

const GEO_NOTHING = 0;
const GEO_TRAP_BLACK = 1;
const GEO_TRAP_WHITE = 2;
const GEO_DEN_BLACK = 3;
const GEO_DEN_WHITE = 4;
const GEO_GUARD_BLACK = 5;
const GEO_GUARD_WHITE = 6;

const GEOMETRY = new Int8Array(63);
(() => {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
            const code = helper.getSquareCode(row, col);
            let type = GEO_NOTHING;
            if (trapCodes.black.includes(code)) type = GEO_TRAP_BLACK;
            else if (trapCodes.white.includes(code)) type = GEO_TRAP_WHITE;
            else if (houseCodes.black === code) type = GEO_DEN_BLACK;
            else if (houseCodes.white === code) type = GEO_DEN_WHITE;
            else if (trapGuardCodes.black.includes(code)) type = GEO_GUARD_BLACK;
            else if (trapGuardCodes.white.includes(code)) type = GEO_GUARD_WHITE;
            GEOMETRY[row * 7 + col] = type;
        }
    }
})();

const piecePowers = {
    mouse: 8,
    cat: 5,
    dog: 6,
    monkey: 7,
    leopard: 10,
    tiger: 15,
    lion: 25,
    elephant: 20,
};

const OPPOSITE_COLOR = { black: "white", white: "black" };

export function getOpponentColor(color) {
    return OPPOSITE_COLOR[color];
}

export function outOfBoard(x, y) {
    return y < 0 || x < 0 || y > 8 || x > 6;
}

export function squareTypeInfo(code) {
    if (!code) return null;
    if (waterCodes.includes(code)) {
        return {
            type: "water",
            position: waterCodes.indexOf(code) < 6 ? "left" : "right",
        };
    }
    if (trapCodes.all.includes(code)) {
        return {
            type: "trap",
            position: trapCodes.all.indexOf(code) < 3 ? "black" : "white",
        };
    }
    if (houseCodes.all.includes(code)) {
        return {
            type: "dom",
            position: code === "D9" ? "black" : "white",
        };
    }
    return { type: "land" };
}

const squareTypes = (() => {
    const map = {};
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
            const code = helper.getSquareCode(row, col);
            map[code] = squareTypeInfo(code);
        }
    }
    return map;
})();

function riverBlocked(piece, bank) {
    const side = bank === "left" ? RIVER_LEFT : RIVER_RIGHT;
    for (let k = 0; k < 6; k++) {
        if (piece[side[k]] === INDEX_MOUSE) return true;
    }
    return false;
}

function beats(targetPiece, targetColor, attackerPiece, attackerColor, attackerPower) {
    if (attackerColor === targetColor) return false;
    const target = animals[targetPiece];
    const attacker = animals[attackerPiece];
    return (
        (attackerPower >= target.power &&
            !attacker.vulnerability?.includes(target.name)) ||
        !!attacker.specialPower?.canBeat?.includes(target.name)
    );
}

export function canJump(animal, direction) {
    return (
        animal.specialPower?.canJumpOverTheRiver &&
        animal.specialPower?.jumpDirections?.includes(direction)
    );
}

const INDEX_ANIMAL = Object.create(null);
Object.keys(piecePowers).forEach((name, i) => {
    INDEX_ANIMAL[name] = i;
});

const BEATS_TABLE = new Uint8Array(8 * 8 * 2);
(() => {
    const names = Object.keys(piecePowers);
    for (const attacker of names) {
        for (const prey of names) {
            const i = (INDEX_ANIMAL[attacker] * 8 + INDEX_ANIMAL[prey]) * 2;
            BEATS_TABLE[i] = beats(prey, "black", attacker, "white", animals[attacker].power)
                ? 1
                : 0;
            BEATS_TABLE[i + 1] = beats(prey, "black", attacker, "white", 0) ? 1 : 0;
        }
    }
})();

function defeatsIndices(prey, colorPrey, indexAttacker, colorAttacker, withoutForce, weak) {
    if (colorAttacker === colorPrey) return false;
    if (prey === weak) return true;
    return BEATS_TABLE[(indexAttacker * 8 + prey) * 2 + withoutForce] === 1;
}

const EMPTY = -1;
const BLACK = 0;
const WHITE = 1;

const DEN_BLACK_I = 3;
const DEN_WHITE_I = 8 * 7 + 3;

const LINE = new Int8Array(63);
const COLUMN = new Int8Array(63);

const AREA = new Int8Array(63);

const POWER = new Int8Array(8);

const TRAP_COLOR = new Int8Array(63);
const DEN_COLOR = new Int8Array(63);

const GUARDS = new Array(63).fill(null);

const RIVER_LEFT = new Int8Array(6);
const RIVER_RIGHT = new Int8Array(6);

const SWIMS = new Uint8Array(8);
const SKIP_HORIZONTAL = new Uint8Array(8);
const SKIP_VERTICAL = new Uint8Array(8);

const INDEX_MOUSE = INDEX_ANIMAL.mouse;

export const NAME_ANIMAL = Object.keys(piecePowers);

(() => {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
            const i = row * 7 + col;
            const code = helper.getSquareCode(row, col);
            LINE[i] = row;
            COLUMN[i] = col;
            AREA[i] = row < 3 ? BLACK : row > 5 ? WHITE : -1;
            TRAP_COLOR[i] = trapCodes.black.includes(code)
                ? BLACK
                : trapCodes.white.includes(code)
                  ? WHITE
                  : -1;
            DEN_COLOR[i] =
                houseCodes.black === code ? BLACK : houseCodes.white === code ? WHITE : -1;
            if (trapGuards[code]) {
                GUARDS[i] = Int8Array.from(trapGuards[code], (guard) => {
                    const coord = helper.getIndexesByCode(guard);
                    return coord.rowIndex * 7 + coord.colIndex;
                });
            }
        }
    }

    let left = 0;
    let right = 0;
    for (let row = 3; row < 6; row++) {
        for (let col = 1; col < 3; col++) RIVER_LEFT[left++] = row * 7 + col;
        for (let col = 4; col < 6; col++) RIVER_RIGHT[right++] = row * 7 + col;
    }

    for (const name of Object.keys(piecePowers)) {
        const i = INDEX_ANIMAL[name];
        const a = animals[name];
        POWER[i] = piecePowers[name];
        SWIMS[i] = a.specialPower?.canSwim ? 1 : 0;
        SKIP_HORIZONTAL[i] = canJump(a, "horizontal") ? 1 : 0;
        SKIP_VERTICAL[i] = canJump(a, "vertical") ? 1 : 0;
    }
})();

export const REPETITION_LIMIT = 6;

export function initialRepetitions() {
    return { last: [EMPTY, EMPTY], count: [0, 0] };
}

function stateRepetitions(repetitions) {
    const last = new Int8Array(2).fill(EMPTY);
    const count = new Int8Array(2);
    if (repetitions) {
        for (let c = BLACK; c <= WHITE; c++) {
            const u = repetitions.last?.[c];
            const n = repetitions.count?.[c];
            if (
                Number.isInteger(u) &&
                u >= 0 &&
                u < 8 &&
                Number.isInteger(n) &&
                n > 0
            ) {
                last[c] = u;
                count[c] = Math.min(n, REPETITION_LIMIT);
            }
        }
    }
    return { last, count };
}

export function resetRepetitions(repetitions, color) {
    const c = color === "black" ? BLACK : WHITE;
    const state = stateRepetitions(repetitions);
    const last = [state.last[BLACK], state.last[WHITE]];
    const count = [state.count[BLACK], state.count[WHITE]];
    last[c] = EMPTY;
    count[c] = 0;
    return { last, count };
}

export function animalBlocked(repetitions, color) {
    const c = color === "black" ? BLACK : WHITE;
    const state = stateRepetitions(repetitions);
    return state.count[c] >= REPETITION_LIMIT
        ? NAME_ANIMAL[state.last[c]]
        : null;
}

export function advanceRepetitions(repetitions, color, piece) {
    const c = color === "black" ? BLACK : WHITE;
    const state = stateRepetitions(repetitions);
    const animal = INDEX_ANIMAL[piece];
    const last = [state.last[BLACK], state.last[WHITE]];
    const count = [state.count[BLACK], state.count[WHITE]];
    if (animal === undefined) return { last, count };
    count[c] =
        last[c] === animal
            ? Math.min(count[c] + 1, REPETITION_LIMIT)
            : 1;
    last[c] = animal;
    return { last, count };
}

function aObjects(board) {
    return Array.isArray(board);
}

export function boardFlat(board, repetitions = null) {
    const piece = new Int8Array(63).fill(EMPTY);
    const color = new Int8Array(63).fill(EMPTY);
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
            const content = board[row][col].content;
            if (!content || !content.piece) continue;
            const i = row * 7 + col;
            piece[i] = INDEX_ANIMAL[content.piece];
            color[i] = content.color === "black" ? BLACK : WHITE;
        }
    }
    const rip = stateRepetitions(repetitions);
    return { piece, color, last: rip.last, count: rip.count };
}

export function cloneFlat(flat) {
    return {
        piece: flat.piece.slice(),
        color: flat.color.slice(),
        last: flat.last.slice(),
        count: flat.count.slice(),
    };
}

export function boardObjects(flat) {
    const board = [];
    for (let row = 0; row < 9; row++) {
        const line = [];
        for (let col = 0; col < 7; col++) {
            const i = row * 7 + col;
            const p = flat.piece[i];
            line.push({
                code: helper.getSquareCode(row, col),
                i: row,
                j: col,
                row,
                col,
                areaColor: AREA[i] < 0 ? null : AREA[i] === BLACK ? "black" : "white",
                content:
                    p < 0
                        ? { piece: null, color: null }
                        : {
                              piece: NAME_ANIMAL[p],
                              color: flat.color[i] === BLACK ? "black" : "white",
                          },
            });
        }
        board.push(line);
    }
    return board;
}

export function cloneBoard(board) {
    const clonedBoard = [];
    for (let row = 0; row < 9; row++) {
        const newRow = [];
        for (let col = 0; col < 7; col++) {
            newRow.push({ ...board[row][col] });
        }
        clonedBoard.push(newRow);
    }
    return clonedBoard;
}

export function makeVirtualMove(board, move) {
    if (!aObjects(board)) {
        const copy = cloneFlat(board);
        applyFlat(copy, move);
        return copy;
    }
    const boardClone = cloneBoard(board);
    const { fromRow, fromCol, toRow, toCol } = move;
    const fromSquare = boardClone[fromRow][fromCol];
    const toSquare = boardClone[toRow][toCol];
    toSquare.content = fromSquare.content;
    fromSquare.content = { piece: null, color: null };
    return boardClone;
}

function applyFlat(b, move) {
    const piece = b.piece;
    const color = b.color;
    const from = move.fromRow * 7 + move.fromCol;
    const a = move.toRow * 7 + move.toCol;
    const preyPiece = piece[a];
    const prey = preyPiece < 0 ? EMPTY : preyPiece * 2 + color[a];
    const moved = piece[from];
    const colorMoved = color[from];
    piece[a] = piece[from];
    color[a] = color[from];
    piece[from] = EMPTY;
    color[from] = EMPTY;
    b.count[colorMoved] =
        b.last[colorMoved] === moved
            ? Math.min(b.count[colorMoved] + 1, REPETITION_LIMIT)
            : 1;
    b.last[colorMoved] = moved;
    return prey;
}

function undoFlat(b, move, prey, lastBefore, countBefore) {
    const piece = b.piece;
    const color = b.color;
    const from = move.fromRow * 7 + move.fromCol;
    const a = move.toRow * 7 + move.toCol;
    piece[from] = piece[a];
    color[from] = color[a];
    if (prey < 0) {
        piece[a] = EMPTY;
        color[a] = EMPTY;
    } else {
        piece[a] = prey >> 1;
        color[a] = prey & 1;
    }
    if (lastBefore !== undefined) {
        const colorMoved = color[from];
        b.last[colorMoved] = lastBefore;
        b.count[colorMoved] = countBefore;
    }
}

export function applyMove(board, move) {
    if (!aObjects(board)) return applyFlat(board, move);
    const fromSquare = board[move.fromRow][move.fromCol];
    const toSquare = board[move.toRow][move.toCol];
    const captured = toSquare.content;
    toSquare.content = fromSquare.content;
    fromSquare.content = { piece: null, color: null };
    return captured;
}

export function undoMove(board, move, captured, lastBefore, countBefore) {
    if (!aObjects(board)) {
        undoFlat(board, move, captured, lastBefore, countBefore);
        return;
    }
    const fromSquare = board[move.fromRow][move.fromCol];
    const toSquare = board[move.toRow][move.toCol];
    fromSquare.content = toSquare.content;
    toSquare.content = captured;
}

const NEIGHBORS_ROW = [0, 0, -1, 1];
const NEIGHBORS_COL = [1, -1, 0, 0];

const TYPE_GROUND = 0;
const TYPE_WATER = 1;
const TYPE_TRAP = 2;
const TYPE_DEN = 3;

const CELL_TYPE = new Int8Array(63);
const CELL_BLACK = new Int8Array(63);

const NEIGHBORS = new Int8Array(63 * 4);

(() => {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
            const i = row * 7 + col;
            const info = squareTypes[helper.getSquareCode(row, col)];
            CELL_TYPE[i] =
                info.type === "water"
                    ? TYPE_WATER
                    : info.type === "trap"
                      ? TYPE_TRAP
                      : info.type === "dom"
                        ? TYPE_DEN
                        : TYPE_GROUND;
            CELL_BLACK[i] =
                info.type === "trap" || info.type === "dom"
                    ? info.position === "black"
                        ? 0
                        : 1
                    : -1;

            for (let k = 0; k < 4; k++) {
                const r = row + NEIGHBORS_ROW[k];
                const c = col + NEIGHBORS_COL[k];
                NEIGHBORS[i * 4 + k] = outOfBoard(c, r) ? -1 : r * 7 + c;
            }
        }
    }
})();

function accumulate(out, fromRow, fromCol, toRow, toCol) {
    if (out) out.push({ fromRow, fromCol, toRow, toCol });
}

function walkMoves(board, squareRowIndex, squareColIndex, out) {
    const pieces = board.piece;
    const colors = board.color;
    const here = squareRowIndex * 7 + squareColIndex;
    const indexAttacker = pieces[here];
    if (indexAttacker < 0) return 0;

    const myColor = colors[here];

    const withoutForce =
        CELL_TYPE[here] === TYPE_TRAP && CELL_BLACK[here] !== myColor ? 1 : 0;

    const itsColor = myColor === BLACK ? WHITE : BLACK;
    const weak =
        board.count[itsColor] >= REPETITION_LIMIT ? board.last[itsColor] : EMPTY;

    let count = 0;

    for (let k = 0; k < 4; k++) {
        const li = NEIGHBORS[here * 4 + k];
        if (li < 0) continue;
        const rowIndex = squareRowIndex + NEIGHBORS_ROW[k];
        const colIndex = squareColIndex + NEIGHBORS_COL[k];

        const targetPiece = pieces[li];
        const targetColor = colors[li];
        if (targetPiece >= 0 && targetColor === myColor) continue;

        switch (CELL_TYPE[li]) {
            case TYPE_WATER:
                if (SWIMS[indexAttacker]) {
                    count++;
                    accumulate(out, squareRowIndex, squareColIndex, rowIndex, colIndex);
                } else if (
                    (squareRowIndex === rowIndex
                        ? SKIP_HORIZONTAL[indexAttacker]
                        : SKIP_VERTICAL[indexAttacker]) &&
                    !riverBlocked(pieces, colIndex > 3 ? "right" : "left")
                ) {
                    let landCol;
                    let landRow;
                    if (squareColIndex === colIndex) {
                        landCol = colIndex;
                        landRow = rowIndex > squareRowIndex ? rowIndex + 3 : rowIndex - 3;
                    } else {
                        landCol = colIndex > squareColIndex ? colIndex + 2 : colIndex - 2;
                        landRow = rowIndex;
                    }
                    const outside = outOfBoard(landCol, landRow);
                    const arrival = outside ? -1 : landRow * 7 + landCol;
                    const landingPiece = outside ? EMPTY : pieces[arrival];
                    if (
                        landingPiece < 0 ||
                        defeatsIndices(
                            landingPiece,
                            colors[arrival],
                            indexAttacker,
                            myColor,
                            withoutForce,
                            weak
                        )
                    ) {
                        count++;
                        accumulate(out, squareRowIndex, squareColIndex, landRow, landCol);
                    }
                }
                break;
            case TYPE_TRAP:
                if (
                    CELL_BLACK[li] === myColor ||
                    targetPiece < 0 ||
                    defeatsIndices(
                        targetPiece,
                        targetColor,
                        indexAttacker,
                        myColor,
                        withoutForce,
                        weak
                    )
                ) {
                    count++;
                    accumulate(out, squareRowIndex, squareColIndex, rowIndex, colIndex);
                }
                break;
            case TYPE_DEN:
                if (CELL_BLACK[li] !== myColor) {
                    count++;
                    accumulate(out, squareRowIndex, squareColIndex, rowIndex, colIndex);
                }
                break;
            case TYPE_GROUND:
                if (
                    targetPiece < 0 ||
                    defeatsIndices(
                        targetPiece,
                        targetColor,
                        indexAttacker,
                        myColor,
                        withoutForce,
                        weak
                    )
                ) {
                    count++;
                    accumulate(out, squareRowIndex, squareColIndex, rowIndex, colIndex);
                }
        }
    }
    return count;
}

export function getPossibleMoves(board, squareRowIndex, squareColIndex, repetitions = null) {
    const moves = [];
    walkMoves(
        aObjects(board) ? boardFlat(board, repetitions) : board,
        squareRowIndex,
        squareColIndex,
        moves
    );
    return moves;
}

export function getBoardPossibleMoves(board, color, repetitions = null) {
    const flat = aObjects(board) ? boardFlat(board, repetitions) : board;
    const myColor = color === "black" ? BLACK : WHITE;
    const pieces = flat.piece;
    const colors = flat.color;
    const blocked =
        flat.count[myColor] >= REPETITION_LIMIT
            ? flat.last[myColor]
            : EMPTY;
    const moves = [];
    for (let i = 0; i < 63; i++) {
        if (pieces[i] < 0 || colors[i] !== myColor || pieces[i] === blocked)
            continue;
        const possibleMoves = getPossibleMoves(flat, LINE[i], COLUMN[i]);
        for (let k = 0; k < possibleMoves.length; k++) {
            moves.push(possibleMoves[k]);
        }
    }
    return moves;
}

const PRIORITY_TT = 2e9;
const PRIORITY_DEN = 1e9;
const PRIORITY_CAPTURE = 1e6;

const CAP_HISTORY = 60000;

const history = new Int32Array(63 * 63);

function indexHistory(move) {
    return (move.fromRow * 7 + move.fromCol) * 63 + (move.toRow * 7 + move.toCol);
}

function orderingScore(board, move, black) {
    const to = move.toRow * 7 + move.toCol;
    if (CELL_TYPE[to] === TYPE_DEN) return PRIORITY_DEN;

    const prey = board.piece[to];
    if (prey >= 0) return PRIORITY_CAPTURE + POWER[prey];

    const advancement = black ? move.fromRow : 8 - move.fromRow;
    const points = history[indexHistory(move)];
    return (points > CAP_HISTORY ? CAP_HISTORY : points) * 16 + advancement;
}

const SCORES_SCRATCH = new Float64Array(64);

function sortMoves(board, moves, myColor, moveTT = -1) {
    const n = moves.length;
    const black = myColor === BLACK;
    const scores = n <= SCORES_SCRATCH.length ? SCORES_SCRATCH : new Float64Array(n);
    for (let i = 0; i < n; i++) {
        scores[i] =
            moveTT >= 0 && indexHistory(moves[i]) === moveTT
                ? PRIORITY_TT
                : orderingScore(board, moves[i], black);
    }

    for (let i = 1; i < moves.length; i++) {
        const score = scores[i];
        const move = moves[i];
        let j = i - 1;
        while (j >= 0 && scores[j] < score) {
            scores[j + 1] = scores[j];
            moves[j + 1] = moves[j];
            j--;
        }
        scores[j + 1] = score;
        moves[j + 1] = move;
    }
    return moves;
}

export function isCheckmate(board) {
    const flat = aObjects(board) ? boardFlat(board) : board;
    const pieces = flat.piece;
    const colors = flat.color;
    if (pieces[DEN_BLACK_I] >= 0 || pieces[DEN_WHITE_I] >= 0) {
        return pieces[DEN_BLACK_I] >= 0 ? "white" : "black";
    }
    let whites = false;
    let blacks = false;
    for (let i = 0; i < 63; i++) {
        if (pieces[i] < 0) continue;
        if (colors[i] === BLACK) blacks = true;
        else whites = true;
    }
    if (!whites || !blacks) {
        return !blacks ? "white" : "black";
    }
    return false;
}

export function isWin(board, color) {
    const flat = aObjects(board) ? boardFlat(board) : board;
    const i = color === "white" ? DEN_BLACK_I : DEN_WHITE_I;
    return flat.piece[i] >= 0 ? NAME_ANIMAL[flat.piece[i]] : undefined;
}

function guardedTrap(flat, index) {
    const guards = GUARDS[index];
    if (!guards) return false;
    const color = TRAP_COLOR[index];
    for (let k = 0; k < guards.length; k++) {
        const g = guards[k];
        if (flat.piece[g] >= 0 && flat.color[g] === color) return true;
    }
    return false;
}

export function checkPossibleWin(board, moves, color) {
    const flat = aObjects(board) ? boardFlat(board) : board;
    const opponent = color === "black" ? WHITE : BLACK;
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        if (DEN_COLOR[move.toRow * 7 + move.toCol] === opponent) return move;
    }
    return null;
}

export function getDistanceFromHouse(square, color) {
    const row = color === "black" ? 0 : 8;
    const col = 3;
    return Math.abs(row - square.row) + Math.abs(col - square.col);
}

export function getBattleStrategy(board, color) {
    if (!aObjects(board)) board = boardObjects(board);

    let defence = false;
    let attack = false;
    let defenceDistance = 20;
    let attackDistance = 20;
    let urgency = false;

    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 7; j++) {
            const square = board[i][j];
            if (
                square.areaColor &&
                square.content.piece &&
                square.content.color !== square.areaColor
            ) {
                if (square.areaColor === color) {
                    if (protectHouseCodes[square.areaColor].includes(square.code)) {
                        urgency = true;
                        defenceDistance = Math.min(
                            defenceDistance,
                            getDistanceFromHouse(square, square.areaColor)
                        );
                    }
                    defence = true;
                } else {
                    if (protectHouseCodes[square.areaColor].includes(square.code)) {
                        urgency = true;
                        attackDistance = Math.min(
                            attackDistance,
                            getDistanceFromHouse(square, square.areaColor)
                        );
                    }
                    attack = true;
                }
            }
        }
    }

    if (defenceDistance !== attackDistance) {
        if (defenceDistance < attackDistance) {
            attack = false;
        } else {
            defence = false;
        }
    }

    const scenario =
        attack && defence
            ? "normal"
            : attack || defence
            ? attack
                ? "attack"
                : "defence"
            : "attack";

    return { scenario, urgency };
}

const BASE_FACTORS = Object.freeze({
    controlOfSquare: 20,
    controlOfOwnTrap: 2,
    guardOwnTrap: 5,
    controlOfOpponentsSquare: 5,
    controlOfOpponentsTrap: 5,
    guardOpponentsTrap: 0,
    winFactor: 1000000,
    attack: 5,
    mobility: 1,
});

function factorsFromStrategy(scenario, urgency, overrides) {

    if (!overrides && scenario !== "attack" && scenario !== "defence") {
        return BASE_FACTORS;
    }

    const factors = { ...BASE_FACTORS };
    if (scenario === "attack") {
        factors.guardOpponentsTrap = 10;
        factors.controlOfOpponentsTrap = 20;
        if (urgency) {
            factors.guardOpponentsTrap = 100;
            factors.controlOfOpponentsTrap = 200;
        }
    } else if (scenario === "defence") {
        factors.guardOwnTrap = 20;
        factors.controlOfOwnTrap = 10;
        if (urgency) {
            factors.guardOwnTrap = 200;
            factors.controlOfOpponentsTrap = 300;
        }
    }
    if (overrides) Object.assign(factors, overrides);
    return factors;
}

export function getBoardFactors(board, color, overrides) {
    const strategy = getBattleStrategy(board, color);
    return factorsFromStrategy(strategy.scenario, strategy.urgency, overrides);
}

const PROTECTS = new Int8Array(63 * 2);
const DIST_DEN = new Int8Array(63 * 2);
(() => {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
            const i = (row * 7 + col) * 2;
            const code = helper.getSquareCode(row, col);
            PROTECTS[i] = protectHouseCodes.black.includes(code) ? 1 : 0;
            PROTECTS[i + 1] = protectHouseCodes.white.includes(code) ? 1 : 0;
            DIST_DEN[i] = Math.abs(0 - row) + Math.abs(3 - col);
            DIST_DEN[i + 1] = Math.abs(8 - row) + Math.abs(3 - col);
        }
    }
})();

const ASSESS_SCRATCH = new Int8Array(64);

function assess(squares, color, overrides) {
    const assessingBlack = color === "black";
    const assessing = assessingBlack ? BLACK : WHITE;

    let nPieceValue = 0, nMobility = 0, nControlled = 0, nOppControlled = 0;
    let nOwnTraps = 0, nOppTraps = 0, nWin = 0, nHighest = 0;
    let bPieceValue = 0, bMobility = 0, bControlled = 0, bOppControlled = 0;
    let bOwnTraps = 0, bOppTraps = 0, bWin = 0, bHighest = 0;

    let defence = false, attack = false, urgency = false;
    let defenceDistance = 20, attackDistance = 20;
    let pieces = 0;

    const piecesBoard = squares.piece;
    const colorsBoard = squares.color;
    for (let i = 0; i < 63; i++) {
        const piece = piecesBoard[i];
        if (piece < 0) continue;

        const squareColor = colorsBoard[i];
        const black = squareColor === BLACK;

        const row = LINE[i];
        const col = COLUMN[i];

        const exhausted =
            squares.count[squareColor] >= REPETITION_LIMIT &&
            squares.last[squareColor] === piece;
        const mobility = exhausted ? 0 : walkMoves(squares, row, col, null);

        const advancement = black ? row : 8 - row;

        const areaColor = AREA[i];
        const inAreaOpponent = areaColor >= 0 && squareColor !== areaColor;

        if (inAreaOpponent) {
            const iArea = i * 2 + areaColor;
            if (areaColor === assessing) {
                if (PROTECTS[iArea]) {
                    urgency = true;
                    const d = DIST_DEN[iArea];
                    if (d < defenceDistance) defenceDistance = d;
                }
                defence = true;
            } else {
                if (PROTECTS[iArea]) {
                    urgency = true;
                    const d = DIST_DEN[iArea];
                    if (d < attackDistance) attackDistance = d;
                }
                attack = true;
            }
        }

        let outcome = 0;
        const geo = GEOMETRY[i];
        if (geo !== GEO_NOTHING) {
            const trapOwn = black ? GEO_TRAP_BLACK : GEO_TRAP_WHITE;
            const trapOpponent = black ? GEO_TRAP_WHITE : GEO_TRAP_BLACK;
            const denOpponent = black ? GEO_DEN_WHITE : GEO_DEN_BLACK;
            const guardAssessing = black
                ? GEO_GUARD_BLACK
                : GEO_GUARD_WHITE;
            const guardOpponent = black ? GEO_GUARD_WHITE : GEO_GUARD_BLACK;

            if (geo === trapOwn) {
                outcome = 1;
            } else if (
                geo === trapOpponent &&
                !guardedTrap(squares, i)
            ) {
                outcome = 2;
            } else if (geo === denOpponent) {
                outcome = 3;
            } else if (geo === guardAssessing) {
                outcome = 4;
            } else if (geo === guardOpponent) {
                outcome = 5;
            }
        }

        ASSESS_SCRATCH[pieces++] =
            (black ? 32 : 0) | (inAreaOpponent ? 16 : 0) | outcome;

        if (black) {
            nPieceValue += POWER[piece];
            nMobility += mobility;
            if (advancement > nHighest) nHighest = advancement;
        } else {
            bPieceValue += POWER[piece];
            bMobility += mobility;
            if (advancement > bHighest) bHighest = advancement;
        }
    }

    if (defenceDistance !== attackDistance) {
        if (defenceDistance < attackDistance) attack = false;
        else defence = false;
    }
    const scenario =
        attack && defence ? "normal" : attack || defence ? (attack ? "attack" : "defence") : "attack";

    const factors = factorsFromStrategy(scenario, urgency, overrides);

    for (let k = 0; k < pieces; k++) {
        const rec = ASSESS_SCRATCH[k];
        const outcome = rec & 7;
        const oppControlled = rec & 16 ? factors.controlOfOpponentsSquare : 0;
        const ownTraps = outcome === 1 ? factors.controlOfOwnTrap : 0;
        const oppTraps =
            outcome === 2
                ? factors.controlOfOpponentsTrap
                : outcome === 4
                  ? factors.guardOwnTrap
                  : outcome === 5
                    ? factors.guardOpponentsTrap
                    : 0;
        const win = outcome === 3 ? factors.winFactor : 0;
        if (rec & 32) {
            nControlled += factors.controlOfSquare;
            nOppControlled += oppControlled;
            nOwnTraps += ownTraps;
            nOppTraps += oppTraps;
            nWin += win;
        } else {
            bControlled += factors.controlOfSquare;
            bOppControlled += oppControlled;
            bOwnTraps += ownTraps;
            bOppTraps += oppTraps;
            bWin += win;
        }
    }

    const totalBlack =
        nPieceValue +
        nMobility * factors.mobility +
        nControlled +
        nOppControlled +
        nOwnTraps +
        nOppTraps +
        nWin +
        nHighest * factors.attack;
    const totalWhite =
        bPieceValue +
        bMobility * factors.mobility +
        bControlled +
        bOppControlled +
        bOwnTraps +
        bOppTraps +
        bWin +
        bHighest * factors.attack;

    return assessingBlack ? totalBlack - totalWhite : totalWhite - totalBlack;
}

export function evaluateBoard(squares, color) {
    return assess(aObjects(squares) ? boardFlat(squares) : squares, color, undefined);
}

export function makeEvaluate(overrides) {
    return (squares, color) =>
        assess(aObjects(squares) ? boardFlat(squares) : squares, color, overrides);
}

const SCORE_TERMINAL = 1e9;

const TT_BIT = 18;
const TT_CUT = 1 << TT_BIT;
const TT_MASK = TT_CUT - 1;

const TT_SEARCH_THRESHOLD = 4;
const TT_NODE_THRESHOLD = 0;

const R_NULL = 2;

const TT_EXACT = 0;
const TT_LIMIT_INF = 1;
const TT_LIMIT_SUP = 2;

let ttKeyHi = null;
let ttKeyLo = null;
let ttScore = null;
let ttDepth = null;
let ttType = null;
let ttGeneration = null;
let ttMove = null;

let generation = 0;

function ensureTable() {
    if (ttKeyHi) return;
    ttKeyHi = new Int32Array(TT_CUT);
    ttKeyLo = new Int32Array(TT_CUT);
    ttScore = new Float64Array(TT_CUT);
    ttDepth = new Int8Array(TT_CUT);
    ttType = new Int8Array(TT_CUT);
    ttGeneration = new Int32Array(TT_CUT);
    ttMove = new Int16Array(TT_CUT);
}

function createPrng(seed) {
    let s = seed | 0;
    return () => {
        s ^= s << 13;
        s |= 0;
        s ^= s >>> 17;
        s ^= s << 5;
        s |= 0;
        return s;
    };
}


const ZOB_HI = new Int32Array(63 * 16);
const ZOB_LO = new Int32Array(63 * 16);
let ZOB_MOVER_HI = 0;
let ZOB_MOVER_LO = 0;
let ZOB_COLOR_HI = 0;
let ZOB_COLOR_LO = 0;

const RIP_STATES = 9 * (REPETITION_LIMIT + 1);
const ZOB_RIP_HI = new Int32Array(2 * RIP_STATES);
const ZOB_RIP_LO = new Int32Array(2 * RIP_STATES);
(() => {
    const rnd = createPrng(0x1a2b3c4d);
    for (let i = 0; i < ZOB_HI.length; i++) {
        ZOB_HI[i] = rnd();
        ZOB_LO[i] = rnd();
    }
    ZOB_MOVER_HI = rnd();
    ZOB_MOVER_LO = rnd();
    ZOB_COLOR_HI = rnd();
    ZOB_COLOR_LO = rnd();
    for (let i = 0; i < ZOB_RIP_HI.length; i++) {
        ZOB_RIP_HI[i] = rnd();
        ZOB_RIP_LO[i] = rnd();
    }
})();

export function repetitionThreshold(count, hasTheMover) {
    return 2 * (REPETITION_LIMIT - count) - (hasTheMover ? 1 : 0);
}

function indexRip(color, last, count) {
    return color * RIP_STATES + (last + 1) * (REPETITION_LIMIT + 1) + count;
}

function indexZobrist(i, piece, color) {
    return i * 16 + piece * 2 + (color === BLACK ? 1 : 0);
}

function computeHash(board, playerColor) {
    const flat = aObjects(board) ? boardFlat(board) : board;
    const pieces = flat.piece;
    const colors = flat.color;
    let hi = playerColor === "black" ? ZOB_COLOR_HI : 0;
    let lo = playerColor === "black" ? ZOB_COLOR_LO : 0;
    for (let k = 0; k < 63; k++) {
        if (pieces[k] < 0) continue;
        const i = indexZobrist(k, pieces[k], colors[k]);
        hi ^= ZOB_HI[i];
        lo ^= ZOB_LO[i];
    }
    for (let c = BLACK; c <= WHITE; c++) {
        const i = indexRip(c, flat.last[c], flat.count[c]);
        hi ^= ZOB_RIP_HI[i];
        lo ^= ZOB_RIP_LO[i];
    }
    return { hi, lo };
}

export { computeHash };

function remember(
    index,
    hi,
    lo,
    depth,
    value,
    alphaInitial,
    betaInitial,
    move
) {
    ttKeyHi[index] = hi;
    ttKeyLo[index] = lo;
    ttScore[index] = value;
    ttDepth[index] = depth;
    ttType[index] =
        value <= alphaInitial
            ? TT_LIMIT_SUP
            : value >= betaInitial
              ? TT_LIMIT_INF
              : TT_EXACT;
    ttGeneration[index] = generation;
    ttMove[index] = move;
}

function searchNode(
    board,
    depth,
    alpha,
    beta,
    isMaximizingPlayer,
    playerColor,
    evaluate = evaluateBoard,
    hashHi = null,
    hashLo = null,
    useTT = true,
    useNM = true,
    canNull = true
) {
    if (board.piece[DEN_BLACK_I] >= 0) {
        return playerColor === "white" ? SCORE_TERMINAL : -SCORE_TERMINAL;
    }
    if (board.piece[DEN_WHITE_I] >= 0) {
        return playerColor === "black" ? SCORE_TERMINAL : -SCORE_TERMINAL;
    }

    if (hashHi === null) {
        const key = computeHash(board, playerColor);
        hashHi = key.hi;
        hashLo = key.lo;
        generation = (generation + 1) | 0;
    }

    const colorCurrent =
        (playerColor === "black" ? BLACK : WHITE) ^ (isMaximizingPlayer ? 0 : 1);

    let keyHi = hashHi;
    let keyLo = hashLo;
    for (let c = BLACK; c <= WHITE; c++) {
        if (depth < repetitionThreshold(board.count[c], c === colorCurrent)) {
            const i = indexRip(c, board.last[c], board.count[c]);
            keyHi ^= ZOB_RIP_HI[i];
            keyLo ^= ZOB_RIP_LO[i];
        }
    }

    const withTT = useTT && depth >= TT_NODE_THRESHOLD;
    const index = withTT ? keyLo & TT_MASK : -1;
    let moveTT = -1;

    if (withTT) {
        ensureTable();
        if (
            ttGeneration[index] === generation &&
            ttKeyHi[index] === keyHi &&
            ttKeyLo[index] === keyLo
        ) {
            moveTT = ttMove[index];

            if (ttDepth[index] === depth) {
                const value = ttScore[index];
                const type = ttType[index];
                if (type === TT_EXACT) return value;
                if (type === TT_LIMIT_INF && value >= beta) return value;
                if (type === TT_LIMIT_SUP && value <= alpha) return value;
            }
        }
    }

    if (!(depth > 0)) {
        const leaf = evaluate(board, playerColor);
        if (withTT) {
            remember(index, keyHi, keyLo, 0, leaf, -Infinity, Infinity, -1);
        }
        return leaf;
    }

    const currentPlayerColor = isMaximizingPlayer
        ? playerColor
        : getOpponentColor(playerColor);

    if (
        useNM &&
        canNull &&
        depth - 1 - R_NULL >= 1 &&
        board.count[colorCurrent] < REPETITION_LIMIT
    ) {
        if (isMaximizingPlayer ? beta !== Infinity : alpha !== -Infinity) {
            const nullLow = alpha;
            const nullHigh = beta;
            const reduced = searchNode(
                board,
                depth - 1 - R_NULL,
                nullLow,
                nullHigh,
                !isMaximizingPlayer,
                playerColor,
                evaluate,
                hashHi ^ ZOB_MOVER_HI,
                hashLo ^ ZOB_MOVER_LO,
                useTT,
                useNM,
                false
            );
            if (isMaximizingPlayer) {
                if (reduced >= beta && reduced < SCORE_TERMINAL) {
                    return reduced;
                }
            } else if (reduced <= alpha && reduced > -SCORE_TERMINAL) {
                return reduced;
            }
        }
    }

    const alphaInitial = alpha;
    const betaInitial = beta;

    const updateHash = useTT && depth - 1 >= TT_NODE_THRESHOLD;
    let bestIndex = -1;

    const moves = sortMoves(
        board,
        getBoardPossibleMoves(board, currentPlayerColor),
        colorCurrent,
        moveTT
    );

    if (moves.length === 0) {
        const ripLast = board.last[colorCurrent];
        const ripCount = board.count[colorCurrent];
        const iRipBefore = indexRip(colorCurrent, ripLast, ripCount);
        const iRipAfter = indexRip(colorCurrent, EMPTY, 0);
        const childHi =
            hashHi ^ ZOB_MOVER_HI ^ ZOB_RIP_HI[iRipBefore] ^ ZOB_RIP_HI[iRipAfter];
        const childLo =
            hashLo ^ ZOB_MOVER_LO ^ ZOB_RIP_LO[iRipBefore] ^ ZOB_RIP_LO[iRipAfter];
        board.last[colorCurrent] = EMPTY;
        board.count[colorCurrent] = 0;
        const ceded = searchNode(
            board,
            depth - 1,
            alpha,
            beta,
            !isMaximizingPlayer,
            playerColor,
            evaluate,
            childHi,
            childLo,
            useTT,
            useNM
        );
        board.last[colorCurrent] = ripLast;
        board.count[colorCurrent] = ripCount;
        if (withTT) {
            remember(
                index,
                keyHi,
                keyLo,
                depth,
                ceded,
                alphaInitial,
                betaInitial,
                -1
            );
        }
        return ceded;
    }

    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (const move of moves) {
            let childHi = hashHi;
            let childLo = hashLo;
            const from = move.fromRow * 7 + move.fromCol;
            const a = move.toRow * 7 + move.toCol;
            const pieceMoved = board.piece[from];
            const colorMoved = board.color[from];
            const ripLast = board.last[colorMoved];
            const ripCount = board.count[colorMoved];
            if (updateHash) {
                const iFrom = indexZobrist(from, pieceMoved, colorMoved);
                const iA = indexZobrist(a, pieceMoved, colorMoved);
                childHi ^= ZOB_HI[iFrom] ^ ZOB_HI[iA] ^ ZOB_MOVER_HI;
                childLo ^= ZOB_LO[iFrom] ^ ZOB_LO[iA] ^ ZOB_MOVER_LO;
                const iRipBefore = indexRip(colorMoved, ripLast, ripCount);
                const iRipAfter = indexRip(
                    colorMoved,
                    pieceMoved,
                    ripLast === pieceMoved
                        ? Math.min(ripCount + 1, REPETITION_LIMIT)
                        : 1
                );
                childHi ^= ZOB_RIP_HI[iRipBefore] ^ ZOB_RIP_HI[iRipAfter];
                childLo ^= ZOB_RIP_LO[iRipBefore] ^ ZOB_RIP_LO[iRipAfter];
            }
            const captured = applyFlat(board, move);
            if (updateHash && captured >= 0) {
                const iPrey = indexZobrist(a, captured >> 1, captured & 1);
                childHi ^= ZOB_HI[iPrey];
                childLo ^= ZOB_LO[iPrey];
            }
            const score = searchNode(
                board,
                depth - 1,
                alpha,
                beta,
                false,
                playerColor,
                evaluate,
                childHi,
                childLo,
                useTT,
                useNM
            );
            undoFlat(board, move, captured, ripLast, ripCount);
            if (score > maxEval) {
                maxEval = score;
                bestIndex = indexHistory(move);
            }
            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                history[indexHistory(move)] += depth * depth;
                break;
            }
        }
        if (withTT) {
            remember(
                index,
                keyHi,
                keyLo,
                depth,
                maxEval,
                alphaInitial,
                betaInitial,
                bestIndex
            );
        }
        return maxEval;
    }

    let minEval = Infinity;
    for (const move of moves) {
        let childHi = hashHi;
        let childLo = hashLo;
        const from = move.fromRow * 7 + move.fromCol;
        const a = move.toRow * 7 + move.toCol;
        const pieceMoved = board.piece[from];
        const colorMoved = board.color[from];
        const ripLast = board.last[colorMoved];
        const ripCount = board.count[colorMoved];
        if (updateHash) {
            const iFrom = indexZobrist(from, pieceMoved, colorMoved);
            const iA = indexZobrist(a, pieceMoved, colorMoved);
            childHi ^= ZOB_HI[iFrom] ^ ZOB_HI[iA] ^ ZOB_MOVER_HI;
            childLo ^= ZOB_LO[iFrom] ^ ZOB_LO[iA] ^ ZOB_MOVER_LO;
            const iRipBefore = indexRip(colorMoved, ripLast, ripCount);
            const iRipAfter = indexRip(
                colorMoved,
                pieceMoved,
                ripLast === pieceMoved
                    ? Math.min(ripCount + 1, REPETITION_LIMIT)
                    : 1
            );
            childHi ^= ZOB_RIP_HI[iRipBefore] ^ ZOB_RIP_HI[iRipAfter];
            childLo ^= ZOB_RIP_LO[iRipBefore] ^ ZOB_RIP_LO[iRipAfter];
        }
        const captured = applyFlat(board, move);
        if (updateHash && captured >= 0) {
            const iPrey = indexZobrist(a, captured >> 1, captured & 1);
            childHi ^= ZOB_HI[iPrey];
            childLo ^= ZOB_LO[iPrey];
        }
        const score = searchNode(
            board,
            depth - 1,
            alpha,
            beta,
            true,
            playerColor,
            evaluate,
            childHi,
            childLo,
            useTT,
            useNM
        );
        undoFlat(board, move, captured, ripLast, ripCount);
        if (score < minEval) {
            minEval = score;
            bestIndex = indexHistory(move);
        }
        beta = Math.min(beta, score);
        if (alpha >= beta) {
            history[indexHistory(move)] += depth * depth;
            break;
        }
    }
    if (withTT) {
        remember(
            index,
            keyHi,
            keyLo,
            depth,
            minEval,
            alphaInitial,
            betaInitial,
            bestIndex
        );
    }
    return minEval;
}

function recursiveMove(
    board,
    depth,
    alpha,
    beta,
    isMaximizingPlayer,
    playerColor,
    evaluate = evaluateBoard,
    hashHi = null,
    hashLo = null,
    useTT = true,
    useNM = true,
    canNull = true
) {
    return searchNode(
        aObjects(board) ? boardFlat(board) : board,
        depth,
        alpha,
        beta,
        isMaximizingPlayer,
        playerColor,
        evaluate,
        hashHi,
        hashLo,
        useTT,
        useNM,
        canNull
    );
}

export { recursiveMove };

export function calculateBestMove(
    board,
    color,
    depth = 3,
    alpha = -Infinity,
    beta = Infinity,
    opts = {}
) {
    const evaluate = opts.evaluate ?? evaluateBoard;
    const slice = opts.slice ?? null;
    const raw = opts.raw === true;
    const repetitions = opts.repetitions ?? null;
    const rnd = opts.rnd ?? Math.random;

    history.fill(0);

    generation = (generation + 1) | 0;

    const work = aObjects(board) ? boardFlat(board, repetitions) : cloneFlat(board);
    if (repetitions && !aObjects(board)) {
        const state = stateRepetitions(repetitions);
        work.last = state.last;
        work.count = state.count;
    }

    let validMoves = getBoardPossibleMoves(work, color);
    if (color === "black") {
        validMoves = validMoves.sort((a, b) => b.fromRow - a.fromRow);
    }

    const winMove = checkPossibleWin(work, validMoves, color);
    if (winMove) return raw ? { score: SCORE_TERMINAL, moves: [winMove] } : winMove;

    if (slice) {
        validMoves = validMoves.filter((_, i) => i % slice.n === slice.k);
    }

    let bestScore = -Infinity;
    let bestMoves = [];

    const useTT = depth >= TT_SEARCH_THRESHOLD;
    const root = useTT ? computeHash(work, color) : { hi: 0, lo: 0 };
    const updateHash = useTT && depth - 1 >= TT_NODE_THRESHOLD;

    for (let i = 0; i < validMoves.length; i++) {
        const move = validMoves[i];
        let childHi = root.hi;
        let childLo = root.lo;
        const from = move.fromRow * 7 + move.fromCol;
        const a = move.toRow * 7 + move.toCol;
        const pieceMoved = work.piece[from];
        const colorMoved = work.color[from];
        const ripLast = work.last[colorMoved];
        const ripCount = work.count[colorMoved];
        if (updateHash) {
            const iFrom = indexZobrist(from, pieceMoved, colorMoved);
            const iA = indexZobrist(a, pieceMoved, colorMoved);
            childHi ^= ZOB_HI[iFrom] ^ ZOB_HI[iA] ^ ZOB_MOVER_HI;
            childLo ^= ZOB_LO[iFrom] ^ ZOB_LO[iA] ^ ZOB_MOVER_LO;
            const iRipBefore = indexRip(colorMoved, ripLast, ripCount);
            const iRipAfter = indexRip(
                colorMoved,
                pieceMoved,
                ripLast === pieceMoved
                    ? Math.min(ripCount + 1, REPETITION_LIMIT)
                    : 1
            );
            childHi ^= ZOB_RIP_HI[iRipBefore] ^ ZOB_RIP_HI[iRipAfter];
            childLo ^= ZOB_RIP_LO[iRipBefore] ^ ZOB_RIP_LO[iRipAfter];
        }
        const captured = applyFlat(work, move);
        if (updateHash && captured >= 0) {
            const iPrey = indexZobrist(a, captured >> 1, captured & 1);
            childHi ^= ZOB_HI[iPrey];
            childLo ^= ZOB_LO[iPrey];
        }
        const score = searchNode(
            work,
            depth - 1,
            alpha,
            beta,
            false,
            color,
            evaluate,
            childHi,
            childLo,
            useTT
        );
        undoFlat(work, move, captured, ripLast, ripCount);
        if (score >= bestScore) {
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else {
                bestMoves.push(move);
            }
        }
    }

    if (raw) return { score: bestScore, moves: bestMoves };

    if (bestMoves.length) return drawOne(bestMoves, rnd);
    return validMoves.length ? validMoves[0] : {};
}

function drawOne(moves, rnd) {
    const n = moves.length;
    let i = Math.floor(rnd() * n);
    if (!(i >= 0)) i = 0;
    else if (i >= n) i = n - 1;
    return moves[i];
}

export function mergeSlices(outcomes, rnd = Math.random) {
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const outcome of outcomes) {
        if (!outcome || !outcome.moves?.length) continue;
        if (outcome.score > bestScore) {
            bestScore = outcome.score;
            bestMoves = outcome.moves.slice();
        } else if (outcome.score === bestScore) {
            bestMoves.push(...outcome.moves);
        }
    }
    if (!bestMoves.length) return null;
    return drawOne(bestMoves, rnd);
}
