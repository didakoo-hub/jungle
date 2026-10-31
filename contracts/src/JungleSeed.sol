// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

library JungleSeed {
    struct Rnd {
        uint32 a;
        uint32 b;
        uint32 c;
        uint32 d;
    }

    function stream(bytes32 seed, string memory domain) internal pure returns (Rnd memory r) {
        uint32[4] memory w = [uint32(0x9e3779b9), 0x243f6a88, 0xb7e15162, 0x85ebca6b];
        bytes memory input = abi.encodePacked(seed, bytes1(0), domain);
        unchecked {
            for (uint256 i = 0; i < input.length; i++) {
                w[i & 3] = (w[i & 3] ^ uint32(uint8(input[i]))) * 0x01000193;
            }
        }
        r = Rnd(w[0], w[1], w[2], w[3]);
        for (uint256 i = 0; i < 12; i++) {
            draw(r);
        }
    }

    function draw(Rnd memory r) internal pure returns (uint32 t) {
        unchecked {
            (uint32 a, uint32 b, uint32 c, uint32 d) = (r.a, r.b, r.c, r.d);
            t = a + b;
            a = b ^ (b >> 9);
            b = c + (c << 3);
            c = (c << 21) | (c >> 11);
            d = d + 1;
            t = t + d;
            c = c + t;
            (r.a, r.b, r.c, r.d) = (a, b, c, d);
        }
    }

    function below(Rnd memory r, uint256 n) internal pure returns (uint256) {
        return (uint256(draw(r)) * n) >> 32;
    }

    function _whiteSquares() private pure returns (uint8[8] memory) {
        return [56, 62, 50, 54, 42, 44, 46, 48];
    }

    function _blackSquares() private pure returns (uint8[8] memory) {
        return [0, 6, 8, 12, 14, 16, 18, 20];
    }

    function _shuffle(Rnd memory r) private pure returns (uint8[8] memory out) {
        for (uint8 i = 0; i < 8; i++) {
            out[i] = i;
        }
        for (uint256 i = 7; i > 0; i--) {
            uint256 j = below(r, i + 1);
            (out[i], out[j]) = (out[j], out[i]);
        }
    }

    function _animalSlot(uint8 k) private pure returns (uint256) {
        uint8[8] memory slots = [5, 6, 1, 2, 7, 3, 4, 0];
        return slots[k];
    }

    function initialBoard(bytes32 seed) internal pure returns (uint256 board) {
        Rnd memory r = stream(seed, "animals");
        uint8[8] memory whites = _shuffle(r);
        uint8[8] memory blacks = _shuffle(r);
        uint8[8] memory ws = _whiteSquares();
        uint8[8] memory bs = _blackSquares();
        for (uint256 i = 0; i < 8; i++) {
            board |= uint256(64 + bs[i]) << (_animalSlot(blacks[i]) * 7);
            board |= uint256(64 + ws[i]) << ((8 + _animalSlot(whites[i])) * 7);
        }
    }

    function _rand(Rnd memory r, uint256 min, uint256 max) private pure returns (uint8) {
        return uint8(below(r, max - min + 1) + min);
    }

    function colors(bytes32 seed) internal pure returns (uint8) {
        Rnd memory r = stream(seed, "colors");
        uint8 blackA;
        uint8 whiteA;
        do {
            blackA = _rand(r, 5, 6);
            whiteA = _rand(r, 5, 6);
        } while (blackA == whiteA);

        uint8 blackB;
        uint8 whiteB;
        do {
            blackB = _rand(r, 1, 4);
            whiteB = _rand(r, 1, 4);
        } while (blackB == whiteB || (whiteB == 4 && blackB == 2) || (blackB == 4 && whiteB == 2));

        return _rand(r, 0, 1) == 1 ? (whiteA << 3) | blackA : (1 << 6) | (whiteB << 3) | blackB;
    }

    function whiteFirst(bytes32 seed) internal pure returns (bool) {
        Rnd memory r = stream(seed, "sides");
        return draw(r) < 2 ** 31;
    }
}
