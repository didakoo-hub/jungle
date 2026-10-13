// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {JungleSeed} from "../src/JungleSeed.sol";

contract JungleSeedTest is Test {
    string json;
    uint256 quanti;

    function setUp() public {
        json = vm.readFile("test/fixture/game.json");
        quanti = vm.parseJsonBytes32Array(json, ".seeds").length;
    }

    function test_la_scacchiera_iniziale_e_quella_del_bundle() public view {
        for (uint256 i = 0; i < quanti; i++) {
            bytes32 seed = vm.parseJsonBytes32(json, string.concat(".seeds[", vm.toString(i), "]"));
            assertEq(
                JungleSeed.scacchieraIniziale(seed),
                vm.parseJsonUint(json, string.concat(".boards[", vm.toString(i), "]")),
                string.concat("seme ", vm.toString(i))
            );
        }
    }

    function test_i_colori_sono_quelli_del_bundle() public view {
        for (uint256 i = 0; i < quanti; i++) {
            bytes32 seed = vm.parseJsonBytes32(json, string.concat(".seeds[", vm.toString(i), "]"));
            assertEq(
                JungleSeed.colori(seed),
                uint8(vm.parseJsonUint(json, string.concat(".colorsOf[", vm.toString(i), "]"))),
                string.concat("seme ", vm.toString(i))
            );
        }
    }

    function test_il_bianco_e_quello_del_bundle() public view {
        for (uint256 i = 0; i < quanti; i++) {
            bytes32 seed = vm.parseJsonBytes32(json, string.concat(".seeds[", vm.toString(i), "]"));
            assertEq(
                JungleSeed.primoBianco(seed),
                vm.parseJsonBool(json, string.concat(".firstIsWhite[", vm.toString(i), "]")),
                string.concat("seme ", vm.toString(i))
            );
        }
    }

    function testFuzz_sedici_animali_vivi(bytes32 seed) public pure {
        uint256 board = JungleSeed.scacchieraIniziale(seed);
        uint256 occupate;
        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 c = (board >> (slot * 7)) & 0x7f;
            assertTrue(c & 64 != 0, "ogni animale e' vivo");
            uint256 casella = c & 63;
            assertTrue(casella < 63);
            assertTrue(occupate & (1 << casella) == 0, "una casella per animale");
            occupate |= 1 << casella;
            assertTrue(slot < 8 ? casella / 7 <= 2 : casella / 7 >= 6, "ognuno dal suo lato");
        }
    }

    function testFuzz_i_colori_sono_una_combinazione_lecita(bytes32 seed) public pure {
        uint8 c = JungleSeed.colori(seed);
        uint8 board = (c >> 6) & 1;
        uint8 white = (c >> 3) & 7;
        uint8 black = c & 7;
        assertTrue(white != black);
        if (board == 0) {
            assertTrue(white >= 5 && white <= 6 && black >= 5 && black <= 6, "board 1: black and white pieces");
        } else {
            assertTrue(white >= 1 && white <= 4 && black >= 1 && black <= 4, "board 2: the four colours");
            assertFalse((white == 4 && black == 2) || (white == 2 && black == 4), "not red against pink");
        }
    }
}
