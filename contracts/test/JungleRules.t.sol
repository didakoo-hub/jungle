// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {JungleRules} from "../src/JungleRules.sol";

contract JungleRulesTest is Test {
    function test_le_mosse_sono_quelle_del_motore() public view {
        string memory json = vm.readFile("test/fixture/rules.json");

        uint256[] memory boards = vm.parseJsonUintArray(json, ".boards");
        uint256[] memory reps = vm.parseJsonUintArray(json, ".reps");
        uint256[] memory sides = vm.parseJsonUintArray(json, ".sides");
        uint256[] memory counts = vm.parseJsonUintArray(json, ".counts");
        uint256[] memory attese = vm.parseJsonUintArray(json, ".moves");
        uint8 limite = uint8(vm.parseJsonUint(json, ".limit"));

        uint256 letta = 0;
        for (uint256 p = 0; p < boards.length; p++) {
            uint16[] memory mie = JungleRules.mosse(
                JungleRules.apri(boards[p]), uint32(reps[p]), uint8(sides[p]), limite
            );
            ordina(mie);

            assertEq(mie.length, counts[p], concat("quante mosse, posizione ", p));
            for (uint256 k = 0; k < counts[p]; k++) {
                assertEq(uint256(mie[k]), attese[letta + k], concat("quali mosse, posizione ", p));
            }
            letta += counts[p];
        }

        assertEq(letta, attese.length, "tutte le mosse lette");
        assertGt(boards.length, 100, "il corpus non si e svuotato");
    }

    function test_il_corpus_porta_le_tre_sorgenti() public view {
        string memory json = vm.readFile("test/fixture/rules.json");
        uint256[] memory counts = vm.parseJsonUintArray(json, ".counts");

        uint256 conMosse = 0;
        uint256 senza = 0;
        for (uint256 i = 0; i < counts.length; i++) {
            if (counts[i] == 0) senza++;
            else conMosse++;
        }
        assertGt(conMosse, 100, "posizioni con mosse");
        assertGt(senza, 0, "e almeno una senza: il colore che salta il giro");
    }

    function ordina(uint16[] memory v) internal pure {
        for (uint256 i = 1; i < v.length; i++) {
            uint16 x = v[i];
            uint256 j = i;
            while (j > 0 && v[j - 1] > x) {
                v[j] = v[j - 1];
                j--;
            }
            v[j] = x;
        }
    }

    function concat(string memory testo, uint256 n) internal pure returns (string memory) {
        return string.concat(testo, vm.toString(n));
    }
}
