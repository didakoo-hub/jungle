// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library JungleSeed {
    struct Rnd {
        uint32 a;
        uint32 b;
        uint32 c;
        uint32 d;
    }

    function apri(bytes32 seed, string memory dominio) internal pure returns (Rnd memory r) {
        uint32[4] memory w = [uint32(0x9e3779b9), 0x243f6a88, 0xb7e15162, 0x85ebca6b];
        bytes memory input = abi.encodePacked(seed, bytes1(0), dominio);
        unchecked {
            for (uint256 i = 0; i < input.length; i++) {
                w[i & 3] = (w[i & 3] ^ uint32(uint8(input[i]))) * 0x01000193;
            }
        }
        r = Rnd(w[0], w[1], w[2], w[3]);
        for (uint256 i = 0; i < 12; i++) {
            estrai(r);
        }
    }

    function estrai(Rnd memory r) internal pure returns (uint32 t) {
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

    function sotto(Rnd memory r, uint256 n) internal pure returns (uint256) {
        return (uint256(estrai(r)) * n) >> 32;
    }

    function _caselleBianche() private pure returns (uint8[8] memory) {
        return [56, 62, 50, 54, 42, 44, 46, 48];
    }

    function _caselleNere() private pure returns (uint8[8] memory) {
        return [0, 6, 8, 12, 14, 16, 18, 20];
    }

    function _mescola(Rnd memory r) private pure returns (uint8[8] memory out) {
        for (uint8 i = 0; i < 8; i++) {
            out[i] = i;
        }
        for (uint256 i = 7; i > 0; i--) {
            uint256 j = sotto(r, i + 1);
            (out[i], out[j]) = (out[j], out[i]);
        }
    }

    function _animale(uint8 k) private pure returns (uint256) {
        uint8[8] memory indice = [5, 6, 1, 2, 7, 3, 4, 0];
        return indice[k];
    }

    function scacchieraIniziale(bytes32 seed) internal pure returns (uint256 board) {
        Rnd memory r = apri(seed, "animals");
        uint8[8] memory bianchi = _mescola(r);
        uint8[8] memory neri = _mescola(r);
        uint8[8] memory cb = _caselleBianche();
        uint8[8] memory cn = _caselleNere();
        for (uint256 i = 0; i < 8; i++) {
            board |= uint256(64 + cn[i]) << (_animale(neri[i]) * 7);
            board |= uint256(64 + cb[i]) << ((8 + _animale(bianchi[i])) * 7);
        }
    }

    function _rand(Rnd memory r, uint256 min, uint256 max) private pure returns (uint8) {
        return uint8(sotto(r, max - min + 1) + min);
    }

    function colori(bytes32 seed) internal pure returns (uint8) {
        Rnd memory r = apri(seed, "colors");
        uint8 neroA;
        uint8 biancoA;
        do {
            neroA = _rand(r, 5, 6);
            biancoA = _rand(r, 5, 6);
        } while (neroA == biancoA);

        uint8 neroB;
        uint8 biancoB;
        do {
            neroB = _rand(r, 1, 4);
            biancoB = _rand(r, 1, 4);
        } while (neroB == biancoB || (biancoB == 4 && neroB == 2) || (neroB == 4 && biancoB == 2));

        return _rand(r, 0, 1) == 1 ? (biancoA << 3) | neroA : (1 << 6) | (biancoB << 3) | neroB;
    }

    function primoBianco(bytes32 seed) internal pure returns (bool) {
        Rnd memory r = apri(seed, "sides");
        return estrai(r) < 2 ** 31;
    }
}
