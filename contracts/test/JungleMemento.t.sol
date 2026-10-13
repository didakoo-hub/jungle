// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Table} from "./Table.sol";
import {JungleArt} from "../src/JungleArt.sol";
import {JungleGame} from "../src/JungleGame.sol";
import {JungleMemento} from "../src/JungleMemento.sol";
import {JungleReplay} from "../src/JungleReplay.sol";

contract Encoder is JungleMemento {
    constructor() JungleMemento(JungleGame(address(0)), JungleArt(address(0)), JungleReplay(address(0)), address(1)) {}

    function base64(bytes memory data) external pure returns (string memory) {
        return _base64(data);
    }
}

contract JungleMementoTest is Table {
    function conia() internal {
        avvia();
        gioca();
    }

    function conPly(uint256 n) internal {
        JungleGame.Game memory g = game.gameOf(gameId);
        bytes memory moves = new bytes(n * 2);
        for (uint256 i = 0; i < n; i++) {
            uint16 v = uint16(((i * 7) % 63) << 6) | uint16((i * 11) % 63) | (i % 2 == 0 ? 0x8000 : 0);
            moves[2 * i] = bytes1(uint8(v >> 8));
            moves[2 * i + 1] = bytes1(uint8(v));
        }
        g.moves = moves;
        vm.mockCall(address(game), abi.encodeWithSelector(game.gameOf.selector, gameId), abi.encode(g));
    }

    function test_lo_conia_il_contratto_di_partita_al_vincitore() public {
        conia();
        assertEq(memento.ownerOf(gameId), bianco);
        assertEq(memento.winnerOf(gameId), bianco);
        assertEq(memento.opponentOf(gameId), nero);
        assertEq(memento.mintedAt(gameId), uint64(block.timestamp));
    }

    function test_nessun_altro_conia() public {
        conia();
        vm.expectRevert(JungleMemento.NotTheGame.selector);
        memento.mint(gameId);
        vm.prank(bianco);
        vm.expectRevert(JungleMemento.NotTheGame.selector);
        memento.mint(gameId);
    }

    function test_niente_token_niente_letture() public {
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.winnerOf(gameId);
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.tokenURI(gameId);
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.image(gameId);
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.animation(gameId);
    }

    function test_il_disegno_ha_i_pezzi_della_posizione_finale() public {
        conia();
        string memory svg = memento.image(gameId);
        uint256[] memory slots = vm.parseJsonUintArray(json, ".game.finalSlots");
        uint256[] memory caselle = vm.parseJsonUintArray(json, ".game.finalSquares");
        assertGt(slots.length, 0);
        assertEq(quante(svg, "<use xlink:href=\"#a"), slots.length, "un <use> per pezzo vivo");
        for (uint256 i = 0; i < slots.length; i++) {
            bool topo = slots[i] % 8 == 0;
            string memory atteso = string.concat(
                "transform=\"translate(",
                vm.toString((caselle[i] % 7) * 80 + (topo ? 10 : 0)),
                " ",
                vm.toString((caselle[i] / 7) * 80),
                topo ? ") scale(.06)\"/>" : ") scale(.08)\"/>"
            );
            assertTrue(contiene(svg, atteso), string.concat("slot ", vm.toString(slots[i]), " sulla sua casella"));
        }
    }

    function test_la_tana_presa_non_si_disegna() public {
        conia();
        string memory svg = memento.image(gameId);
        assertFalse(contiene(svg, "href=\"#d0\""), "la tana nera e' presa");
        assertTrue(contiene(svg, "href=\"#d1\""), "quella bianca e' libera");
    }

    function test_i_tratti_sono_un_json() public {
        conia();
        string memory lista = string.concat("[", memento.attributes(gameId), "]");
        vm.parseJson(lista);
        assertEq(quante(lista, "\"trait_type\""), 6, "sei tratti");
        assertEq(vm.parseJsonString(lista, "[0].trait_type"), "Winner");
        assertEq(vm.parseJsonString(lista, "[1].trait_type"), "Opponent");
        assertEq(vm.parseJsonString(lista, "[2].trait_type"), "Category");
        assertEq(vm.parseJsonString(lista, "[3].trait_type"), "Minted");
        assertEq(vm.parseJsonString(lista, "[4].trait_type"), "Ending");
        assertEq(vm.parseJsonString(lista, "[5].trait_type"), "Moves");
        assertEq(vm.parseJsonString(lista, "[2].value"), "Arena");
        assertEq(vm.parseJsonString(lista, "[4].value"), "Pyramid");
        assertEq(vm.parseJsonUint(lista, "[5].value"), quantiPly);
    }

    function test_il_rigioco_non_lampeggia() public {
        conia();
        string memory pagina = memento.animation(gameId);
        assertFalse(contiene(pagina, "@keyframes"), "nessuna animazione CSS");
        assertFalse(contiene(pagina, "animation"), "nessuna animazione CSS");
        assertFalse(contiene(pagina, "opacity"), "niente che lampeggia");
        assertFalse(contiene(pagina, "segnaposto"), "niente segnaposto");
    }

    function test_il_rigioco_parte_dalla_posizione_iniziale_e_porta_i_ply() public {
        conia();
        string memory pagina = memento.animation(gameId);
        assertTrue(contiene(pagina, "<!DOCTYPE html>"));
        assertTrue(contiene(pagina, "</html>"));
        assertTrue(contiene(pagina, "<script>"), "lo script del rigioco");

        uint256 iniziale = vm.parseJsonUint(json, ".game.initialBoard");
        string memory s = "var S=[";
        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 cell = (iniziale >> (slot * 7)) & 0x7f;
            s = string.concat(s, slot == 0 ? "" : ",", vm.toString(cell & 63));
        }
        assertTrue(contiene(pagina, string.concat(s, "]")), "S e' la posizione iniziale");

        (,, uint8 da, uint8 dove) = ply(0);
        assertTrue(
            contiene(pagina, string.concat(",M=[[", vm.toString(da), ",", vm.toString(dove), "]")),
            "M comincia dal primo ply"
        );
        assertEq(quante(pagina, "id=\"p"), 16, "sedici pezzi con un id: all'inizio sono tutti vivi");
        assertTrue(contiene(pagina, "id=\"d0\"") && contiene(pagina, "id=\"d1\""), "le due tane con un id");
    }

    function test_le_due_fasce_portano_i_due_lati_nel_loro_colore() public {
        conia();
        (, uint8 colors,,,,,,,,) = memento.drawing(gameId);
        string memory svg = memento.image(gameId);
        assertTrue(
            contiene(svg, string.concat(fascia("-14", tinta(colors & 7)), minuscolo(vm.toString(nero)))),
            "sopra il nero, nel colore delle sue pedine"
        );
        assertTrue(
            contiene(svg, string.concat(fascia("750", tinta((colors >> 3) & 7)), minuscolo(vm.toString(bianco)))),
            "sotto il bianco, nel colore delle sue"
        );
        assertEq(quante(svg, "fill=\"#111111\""), 2, "le due fasce nere");
    }

    function fascia(string memory y, string memory colore) internal pure returns (string memory) {
        return string.concat(
            '<text x="280" y="', y, '" fill="', colore, '" font-family="monospace" font-size="20" text-anchor="middle">'
        );
    }

    function tinta(uint8 id) internal pure returns (string memory) {
        if (id == 1) return "#e9e954";
        if (id == 2) return "#ed3634";
        if (id == 3) return "#3a60a3";
        if (id == 4) return "#ed5d80";
        if (id == 5) return "#8a1fcc";
        return "#fefffe";
    }

    function minuscolo(string memory testo) internal pure returns (string memory) {
        bytes memory b = bytes(testo);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5a) b[i] = bytes1(uint8(b[i]) + 32);
        }
        return string(b);
    }

    function test_il_token_uri_porta_immagine_e_animazione() public {
        conia();
        string memory json = string.concat(
            '{"name":"Jungle didakoo #',
            vm.toString(abi.encodePacked(bytes4(bytes32(gameId)))),
            '","image":"data:image/svg+xml;base64,',
            vm.toBase64(bytes(memento.image(gameId))),
            '","animation_url":"data:text/html;base64,',
            vm.toBase64(bytes(memento.animation(gameId))),
            '","attributes":[',
            memento.attributes(gameId),
            "]}"
        );
        assertEq(
            memento.tokenURI(gameId), string.concat("data:application/json;base64,", vm.toBase64(bytes(json)))
        );
    }

    function test_i_ply_del_rigioco_sono_tutti_e_nell_ordine() public {
        conia();
        string memory pagina = memento.animation(gameId);
        bytes memory moves = game.gameOf(gameId).moves;
        string memory m = ",M=[";
        for (uint256 i = 0; i + 1 < moves.length; i += 2) {
            uint16 v = (uint16(uint8(moves[i])) << 8) | uint8(moves[i + 1]);
            m = string.concat(m, i == 0 ? "[" : ",[", vm.toString((v >> 6) & 63), ",", vm.toString(v & 63), "]");
        }
        assertTrue(contiene(pagina, string.concat(m, "],B=")), "M porta ogni ply, due byte l'uno");
    }

    function test_senza_ply_il_rigioco_ha_la_lista_vuota() public {
        conia();
        conPly(0);
        assertTrue(contiene(memento.animation(gameId), ",M=[],B="));
    }

    function test_oltre_il_tetto_dei_ply_il_token_uri_omette_il_rigioco() public {
        conia();
        uint256 tetto = memento.REPLAY_PLY_CAP();
        conPly(tetto);
        string memory json = string.concat(
            '{"name":"Jungle didakoo #',
            vm.toString(abi.encodePacked(bytes4(bytes32(gameId)))),
            '","image":"data:image/svg+xml;base64,',
            vm.toBase64(bytes(memento.image(gameId))),
            '","animation_url":"data:text/html;base64,',
            vm.toBase64(bytes(memento.animation(gameId))),
            '","attributes":[',
            memento.attributes(gameId),
            "]}"
        );
        assertEq(
            memento.tokenURI(gameId),
            string.concat("data:application/json;base64,", vm.toBase64(bytes(json))),
            "al tetto il rigioco c'e'"
        );

        conPly(tetto + 1);
        json = string.concat(
            '{"name":"Jungle didakoo #',
            vm.toString(abi.encodePacked(bytes4(bytes32(gameId)))),
            '","image":"data:image/svg+xml;base64,',
            vm.toBase64(bytes(memento.image(gameId))),
            '","attributes":[',
            memento.attributes(gameId),
            "]}"
        );
        assertEq(
            memento.tokenURI(gameId),
            string.concat("data:application/json;base64,", vm.toBase64(bytes(json))),
            "oltre il tetto no"
        );
        assertTrue(contiene(memento.animation(gameId), ",M=[[0,0],"), "animation() lo da' comunque");
    }

    function test_il_base64_e_quello_standard(bytes memory data) public {
        Encoder e = new Encoder();
        assertEq(e.base64(data), vm.toBase64(data));
    }

    function test_il_base64_su_ogni_resto_e_ogni_taglio() public {
        Encoder e = new Encoder();
        for (uint256 n = 0; n < 130; n++) {
            bytes memory data = new bytes(n);
            for (uint256 i = 0; i < n; i++) {
                data[i] = bytes1(uint8(uint256(keccak256(abi.encode(n, i)))));
            }
            assertEq(e.base64(data), vm.toBase64(data));
        }
        bytes memory lunga = new bytes(100_003);
        for (uint256 i = 0; i < lunga.length; i += 97) {
            lunga[i] = bytes1(uint8(i));
        }
        assertEq(e.base64(lunga), vm.toBase64(lunga));
    }

    function test_la_collezione_ha_la_sua_immagine_e_un_proprietario() public view {
        assertTrue(contiene(memento.contractURI(), "data:application/json;base64,"));
        assertTrue(contiene(memento.emblem(), "<svg"));
        assertEq(memento.owner(), PROPRIETARIO);
    }

    function test_si_trasferisce_e_il_punto_segue() public {
        conia();
        vm.prank(bianco);
        memento.transferFrom(bianco, nero, gameId);
        assertEq(memento.ownerOf(gameId), nero);
        assertEq(memento.balanceOf(bianco), 0);
        assertEq(memento.balanceOf(nero), 1);
        assertEq(memento.winnerOf(gameId), bianco, "chi ha vinto non cambia");
    }

    function test_il_registro_dei_detentori_segue_i_token() public {
        assertEq(memento.holdersCount(), 0);
        assertEq(memento.totalMinted(), 0);
        conia();
        assertEq(memento.holdersCount(), 1);
        assertEq(memento.totalMinted(), 1);
        (address[] memory chi, uint256[] memory saldi, uint64[] memory da) = memento.holdersPage(0, 10);
        assertEq(chi.length, 1);
        assertEq(chi[0], bianco);
        assertEq(saldi[0], 1);
        assertEq(da[0], uint64(block.timestamp), "il conio dice da quando tiene il punteggio");
        uint256[] memory suoi = memento.tokensOf(bianco);
        assertEq(suoi.length, 1);
        assertEq(suoi[0], gameId);

        vm.warp(block.timestamp + 1000);
        vm.prank(bianco);
        memento.transferFrom(bianco, nero, gameId);
        assertEq(memento.holdersCount(), 1, "chi ha ceduto tutto esce");
        (chi, saldi, da) = memento.holdersPage(0, 10);
        assertEq(chi[0], nero);
        assertEq(saldi[0], 1);
        assertEq(da[0], uint64(block.timestamp), "chi riceve tiene il suo punteggio da adesso");
        assertEq(memento.heldSince(bianco), 0, "chi esce non tiene piu' niente");
        assertEq(memento.tokensOf(bianco).length, 0);
        assertEq(memento.tokensOf(nero)[0], gameId);
        assertEq(memento.totalMinted(), 1, "il conio non cambia");

        vm.prank(nero);
        memento.transferFrom(nero, bianco, gameId);
        vm.prank(bianco);
        memento.transferFrom(bianco, bianco, gameId);
        assertEq(memento.holdersCount(), 1);
        assertEq(memento.balanceOf(bianco), 1);
        assertEq(memento.tokensOf(bianco).length, 1);

        (chi,,) = memento.holdersPage(1, 10);
        assertEq(chi.length, 0);
        (chi,,) = memento.holdersPage(0, 0);
        assertEq(chi.length, 0);
    }

    function test_trasferisce_solo_chi_puo() public {
        conia();
        vm.prank(nero);
        vm.expectRevert(JungleMemento.NotAuthorized.selector);
        memento.transferFrom(bianco, nero, gameId);
    }

    function test_le_tre_interfacce() public view {
        assertTrue(memento.supportsInterface(0x01ffc9a7));
        assertTrue(memento.supportsInterface(0x80ac58cd));
        assertTrue(memento.supportsInterface(0x5b5e139f));
    }
}
