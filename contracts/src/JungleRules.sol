// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {JungleRulesTables as T} from "./JungleRulesTables.sol";

library JungleRules {
    uint8 internal constant EMPTY = 0;
    uint8 internal constant NONE = 8;

    struct Piece {
        uint8 side;
        uint8 animal;
        uint8 disarmed;
        uint8 weak;
    }

    uint8 internal constant WATER = 1;
    uint8 internal constant TRAP = 2;
    uint8 internal constant DEN = 3;

    function unpack(uint256 board) internal pure returns (uint8[63] memory cells) {
        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 c = (board >> (slot * 7)) & 0x7f;
            if (c & 64 == 0) continue;
            cells[c & 63] = uint8(slot + 1);
        }
    }

    function pack(uint8[63] memory cells) internal pure returns (uint256 board) {
        for (uint256 i = 0; i < 63; i++) {
            if (cells[i] == EMPTY) continue;
            board |= uint256(64 + i) << ((uint256(cells[i]) - 1) * 7);
        }
    }

    function play(uint8[63] memory cells, uint8 from, uint8 to) internal pure {
        cells[to] = cells[from];
        cells[from] = EMPTY;
    }

    function sideAt(uint8[63] memory cells, uint8 i) internal pure returns (uint8) {
        return (cells[i] - 1) / 8;
    }

    function animalAt(uint8[63] memory cells, uint8 i) internal pure returns (uint8) {
        return (cells[i] - 1) % 8;
    }

    function counter(uint32 repetitions, uint8 side) internal pure returns (uint8, uint8) {
        uint8 shift = side * 8;
        return (uint8((repetitions >> shift) & 15), uint8((repetitions >> (shift + 4)) & 15));
    }

    function blocked(uint32 repetitions, uint8 side, uint8 limit) internal pure returns (uint8) {
        (uint8 last, uint8 count) = counter(repetitions, side);
        return last != 0 && count >= limit ? last - 1 : NONE;
    }

    function mark(uint32 repetitions, uint8 side, uint8 animal, uint8 limit)
        internal
        pure
        returns (uint32)
    {
        uint8 shift = side * 8;
        (uint8 last, uint8 count) = counter(repetitions, side);
        count = last == animal + 1 ? (count + 1 > limit ? limit : count + 1) : 1;
        return (repetitions & ~(uint32(0xff) << shift))
            | (uint32(animal + 1) << shift) | (uint32(count) << (shift + 4));
    }

    function clear(uint32 repetitions, uint8 side) internal pure returns (uint32) {
        return repetitions & ~(uint32(0xff) << (side * 8));
    }

    function squareType(uint8 i) internal pure returns (uint8) {
        return uint8((T.SQUARE_TYPE >> (uint256(i) * 2)) & 3);
    }

    function squareSide(uint8 i) internal pure returns (uint8) {
        return uint8((T.SQUARE_SIDE >> (uint256(i) * 2)) & 3);
    }

    function legal(
        uint8[63] memory cells,
        uint32 repetitions,
        uint8 side,
        uint8 limit,
        uint8 from,
        uint8 to
    ) internal pure returns (bool) {
        if (from > 62 || to > 62 || from == to) return false;
        if (cells[from] == EMPTY || sideAt(cells, from) != side) return false;

        uint8 animal = animalAt(cells, from);
        if (animal == blocked(repetitions, side, limit)) return false;

        uint16[] memory exits = new uint16[](4);
        uint256 n = movesFrom(cells, mover(cells, repetitions, side, limit, from), from, exits, 0);
        for (uint256 k = 0; k < n; k++) {
            if (uint8(exits[k] & 63) == to) return true;
        }
        return false;
    }

    function moves(uint8[63] memory cells, uint32 repetitions, uint8 side, uint8 limit)
        internal
        pure
        returns (uint16[] memory)
    {
        uint16[] memory found = new uint16[](63 * 4);
        uint256 n = 0;
        uint8 stopped = blocked(repetitions, side, limit);

        for (uint8 i = 0; i < 63; i++) {
            if (cells[i] == EMPTY || sideAt(cells, i) != side) continue;
            if (animalAt(cells, i) == stopped) continue;
            n = movesFrom(cells, mover(cells, repetitions, side, limit, i), i, found, n);
        }

        uint16[] memory out = new uint16[](n);
        for (uint256 k = 0; k < n; k++) out[k] = found[k];
        return out;
    }

    function movesFrom(
        uint8[63] memory cells,
        Piece memory p,
        uint8 from,
        uint16[] memory out,
        uint256 n
    ) private pure returns (uint256) {
        for (uint8 k = 0; k < 4; k++) {
            (bool c, uint8 near) = neighbour(from, k);
            if (!c) continue;
            if (cells[near] != EMPTY && sideAt(cells, near) == p.side) continue;

            uint8 t = squareType(near);
            if (t == WATER) {
                if (swims(p.animal)) {
                    out[n++] = uint16(from) * 64 + near;
                } else {
                    (bool ok, uint8 landing) = jump(cells, p, from, near);
                    if (ok) out[n++] = uint16(from) * 64 + landing;
                }
            } else if (t == DEN) {
                if (squareSide(near) != p.side) out[n++] = uint16(from) * 64 + near;
            } else if (
                (t == TRAP && squareSide(near) == p.side)
                    || cells[near] == EMPTY
                    || beats(cells, near, p)
            ) {
                out[n++] = uint16(from) * 64 + near;
            }
        }
        return n;
    }

    function mover(
        uint8[63] memory cells,
        uint32 repetitions,
        uint8 side,
        uint8 limit,
        uint8 from
    ) private pure returns (Piece memory) {
        return Piece({
            side: side,
            animal: animalAt(cells, from),
            disarmed: squareType(from) == TRAP && squareSide(from) != side ? 1 : 0,
            weak: blocked(repetitions, side == 0 ? 1 : 0, limit)
        });
    }

    function jump(uint8[63] memory cells, Piece memory p, uint8 from, uint8 near)
        private
        pure
        returns (bool, uint8)
    {
        bool vertical = from % 7 == near % 7;
        if (!(vertical ? jumps(p.animal, T.JUMPS_V) : jumps(p.animal, T.JUMPS_H))) return (false, 0);
        if (riverBlocked(cells, near % 7 > 3)) return (false, 0);

        int16 row = int16(uint16(near / 7));
        int16 col = int16(uint16(near % 7));
        if (vertical) row += near > from ? int16(3) : int16(-3);
        else col += near > from ? int16(2) : int16(-2);
        if (row < 0 || row > 8 || col < 0 || col > 6) return (false, 0);

        uint8 landing = uint8(uint16(row * 7 + col));
        if (cells[landing] != EMPTY && sideAt(cells, landing) == p.side) return (false, 0);
        return (cells[landing] == EMPTY || beats(cells, landing, p), landing);
    }

    function beats(uint8[63] memory cells, uint8 prey, Piece memory p) private pure returns (bool) {
        uint8 victim = animalAt(cells, prey);
        if (victim == p.weak) return true;
        return (T.BEATS >> ((uint256(p.animal) * 8 + victim) * 2 + p.disarmed)) & 1 == 1;
    }

    function riverBlocked(uint8[63] memory cells, bool right) private pure returns (bool) {
        uint256 river = right ? T.RIVER_RIGHT : T.RIVER_LEFT;
        for (uint8 i = 0; i < 63; i++) {
            if ((river >> i) & 1 == 0) continue;
            if (cells[i] != EMPTY && animalAt(cells, i) == T.MOUSE) return true;
        }
        return false;
    }

    function swims(uint8 animal) private pure returns (bool) {
        return (T.SWIMS >> animal) & 1 == 1;
    }

    function jumps(uint8 animal, uint8 table) private pure returns (bool) {
        return (table >> animal) & 1 == 1;
    }

    function neighbour(uint8 i, uint8 k) private pure returns (bool, uint8) {
        uint8 row = i / 7;
        uint8 col = i % 7;
        if (k == 0) return col < 6 ? (true, i + 1) : (false, 0);
        if (k == 1) return col > 0 ? (true, i - 1) : (false, 0);
        if (k == 2) return row > 0 ? (true, i - 7) : (false, 0);
        return row < 8 ? (true, i + 7) : (false, 0);
    }
}
