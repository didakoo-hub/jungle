// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {JungleRulesTables as T} from "./JungleRulesTables.sol";

library JungleRules {
    uint8 internal constant VUOTA = 0;
    uint8 internal constant NESSUNO = 8;

    struct Pezzo {
        uint8 colore;
        uint8 quale;
        uint8 senzaForza;
        uint8 debole;
    }

    uint8 internal constant TERRA = 0;
    uint8 internal constant ACQUA = 1;
    uint8 internal constant TRAPPOLA = 2;
    uint8 internal constant TANA = 3;

    function apri(uint256 board) internal pure returns (uint8[63] memory cella) {
        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 c = (board >> (slot * 7)) & 0x7f;
            if (c & 64 == 0) continue;
            cella[c & 63] = uint8(slot + 1);
        }
    }

    function chiudi(uint8[63] memory cella) internal pure returns (uint256 board) {
        for (uint256 i = 0; i < 63; i++) {
            if (cella[i] == VUOTA) continue;
            board |= uint256(64 + i) << ((uint256(cella[i]) - 1) * 7);
        }
    }

    function applica(uint8[63] memory cella, uint8 da, uint8 a) internal pure {
        cella[a] = cella[da];
        cella[da] = VUOTA;
    }

    function lato(uint8[63] memory cella, uint8 i) internal pure returns (uint8) {
        return (cella[i] - 1) / 8;
    }

    function animale(uint8[63] memory cella, uint8 i) internal pure returns (uint8) {
        return (cella[i] - 1) % 8;
    }

    function contatore(uint32 ripetizioni, uint8 colore) internal pure returns (uint8, uint8) {
        uint8 shift = colore * 8;
        return (uint8((ripetizioni >> shift) & 15), uint8((ripetizioni >> (shift + 4)) & 15));
    }

    function bloccato(uint32 ripetizioni, uint8 colore, uint8 limite) internal pure returns (uint8) {
        (uint8 ultimo, uint8 conteggio) = contatore(ripetizioni, colore);
        return ultimo != 0 && conteggio >= limite ? ultimo - 1 : NESSUNO;
    }

    function segna(uint32 ripetizioni, uint8 colore, uint8 quale, uint8 limite)
        internal
        pure
        returns (uint32)
    {
        uint8 shift = colore * 8;
        (uint8 ultimo, uint8 conteggio) = contatore(ripetizioni, colore);
        conteggio = ultimo == quale + 1 ? (conteggio + 1 > limite ? limite : conteggio + 1) : 1;
        return (ripetizioni & ~(uint32(0xff) << shift))
            | (uint32(quale + 1) << shift) | (uint32(conteggio) << (shift + 4));
    }

    function azzera(uint32 ripetizioni, uint8 colore) internal pure returns (uint32) {
        return ripetizioni & ~(uint32(0xff) << (colore * 8));
    }

    function tipo(uint8 i) internal pure returns (uint8) {
        return uint8((T.SQUARE_TYPE >> (uint256(i) * 2)) & 3);
    }

    function proprietario(uint8 i) internal pure returns (uint8) {
        return uint8((T.SQUARE_SIDE >> (uint256(i) * 2)) & 3);
    }

    function legale(
        uint8[63] memory cella,
        uint32 ripetizioni,
        uint8 colore,
        uint8 limite,
        uint8 da,
        uint8 a
    ) internal pure returns (bool) {
        if (da > 62 || a > 62 || da == a) return false;
        if (cella[da] == VUOTA || lato(cella, da) != colore) return false;

        uint8 quale = animale(cella, da);
        if (quale == bloccato(ripetizioni, colore, limite)) return false;

        uint16[] memory uscite = new uint16[](4);
        uint256 n = daQui(cella, chiMuove(cella, ripetizioni, colore, limite, da), da, uscite, 0);
        for (uint256 k = 0; k < n; k++) {
            if (uint8(uscite[k] & 63) == a) return true;
        }
        return false;
    }

    function mosse(uint8[63] memory cella, uint32 ripetizioni, uint8 colore, uint8 limite)
        internal
        pure
        returns (uint16[] memory)
    {
        uint16[] memory tutte = new uint16[](63 * 4);
        uint256 n = 0;
        uint8 fermo = bloccato(ripetizioni, colore, limite);

        for (uint8 i = 0; i < 63; i++) {
            if (cella[i] == VUOTA || lato(cella, i) != colore) continue;
            if (animale(cella, i) == fermo) continue;
            n = daQui(cella, chiMuove(cella, ripetizioni, colore, limite, i), i, tutte, n);
        }

        uint16[] memory out = new uint16[](n);
        for (uint256 k = 0; k < n; k++) out[k] = tutte[k];
        return out;
    }

    function daQui(
        uint8[63] memory cella,
        Pezzo memory p,
        uint8 da,
        uint16[] memory out,
        uint256 n
    ) private pure returns (uint256) {
        for (uint8 k = 0; k < 4; k++) {
            (bool c, uint8 li) = vicino(da, k);
            if (!c) continue;
            if (cella[li] != VUOTA && lato(cella, li) == p.colore) continue;

            uint8 t = tipo(li);
            if (t == ACQUA) {
                if (nuota(p.quale)) {
                    out[n++] = uint16(da) * 64 + li;
                } else {
                    (bool ok, uint8 arrivo) = salto(cella, p, da, li);
                    if (ok) out[n++] = uint16(da) * 64 + arrivo;
                }
            } else if (t == TANA) {
                if (proprietario(li) != p.colore) out[n++] = uint16(da) * 64 + li;
            } else if (
                (t == TRAPPOLA && proprietario(li) == p.colore)
                    || cella[li] == VUOTA
                    || batte(cella, li, p)
            ) {
                out[n++] = uint16(da) * 64 + li;
            }
        }
        return n;
    }

    function chiMuove(
        uint8[63] memory cella,
        uint32 ripetizioni,
        uint8 colore,
        uint8 limite,
        uint8 da
    ) private pure returns (Pezzo memory) {
        return Pezzo({
            colore: colore,
            quale: animale(cella, da),
            senzaForza: tipo(da) == TRAPPOLA && proprietario(da) != colore ? 1 : 0,
            debole: bloccato(ripetizioni, colore == 0 ? 1 : 0, limite)
        });
    }

    function salto(uint8[63] memory cella, Pezzo memory p, uint8 da, uint8 li)
        private
        pure
        returns (bool, uint8)
    {
        bool verticale = da % 7 == li % 7;
        if (!(verticale ? salta(p.quale, T.JUMPS_V) : salta(p.quale, T.JUMPS_H))) return (false, 0);
        if (fiumeBloccato(cella, li % 7 > 3)) return (false, 0);

        int16 riga = int16(uint16(li / 7));
        int16 colonna = int16(uint16(li % 7));
        if (verticale) riga += li > da ? int16(3) : int16(-3);
        else colonna += li > da ? int16(2) : int16(-2);
        if (riga < 0 || riga > 8 || colonna < 0 || colonna > 6) return (false, 0);

        uint8 arrivo = uint8(uint16(riga * 7 + colonna));
        if (cella[arrivo] != VUOTA && lato(cella, arrivo) == p.colore) return (false, 0);
        return (cella[arrivo] == VUOTA || batte(cella, arrivo, p), arrivo);
    }

    function batte(uint8[63] memory cella, uint8 preda, Pezzo memory p) private pure returns (bool) {
        uint8 chi = animale(cella, preda);
        if (chi == p.debole) return true;
        return (T.BEATS >> ((uint256(p.quale) * 8 + chi) * 2 + p.senzaForza)) & 1 == 1;
    }

    function fiumeBloccato(uint8[63] memory cella, bool destra) private pure returns (bool) {
        uint256 lati = destra ? T.RIVER_RIGHT : T.RIVER_LEFT;
        for (uint8 i = 0; i < 63; i++) {
            if ((lati >> i) & 1 == 0) continue;
            if (cella[i] != VUOTA && animale(cella, i) == T.MOUSE) return true;
        }
        return false;
    }

    function nuota(uint8 quale) private pure returns (bool) {
        return (T.SWIMS >> quale) & 1 == 1;
    }

    function salta(uint8 quale, uint8 tabella) private pure returns (bool) {
        return (tabella >> quale) & 1 == 1;
    }

    function vicino(uint8 i, uint8 k) private pure returns (bool, uint8) {
        uint8 riga = i / 7;
        uint8 colonna = i % 7;
        if (k == 0) return colonna < 6 ? (true, i + 1) : (false, 0);
        if (k == 1) return colonna > 0 ? (true, i - 1) : (false, 0);
        if (k == 2) return riga > 0 ? (true, i - 7) : (false, 0);
        return riga < 8 ? (true, i + 7) : (false, 0);
    }
}
