// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Table} from "./Table.sol";
import {JungleGame} from "../src/JungleGame.sol";
import {JungleMemento} from "../src/JungleMemento.sol";

contract Sede {
    function apri(JungleGame game, address session, uint16 v) external payable {
        game.jungledidakooOpen{value: msg.value}(session, 2, address(0), v);
    }
}

contract JungleRankingTest is Table {

    function sessioneDi(address wallet) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("sessione", wallet)))));
    }

    function giocatore(uint256 i) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("giocatore", i)))));
    }

    function tienePass(address chi, bool si) internal {
        collezione.dai(chi, 1, si ? 1 : 0);
    }

    function siediAi(address chi, bool conPass) internal {
        tienePass(chi, conPass);
        siedi(chi, sessioneDi(chi), ARENA, address(0));
    }

    function semeDi(uint256 id) internal {
        JungleGame.Game memory g = game.gameOf(id);
        vm.roll(g.seedBlock + 1);
        vm.setBlockhash(g.seedBlock, keccak256(abi.encode(id)));
    }

    function accoppiaCon(address vince, address perde, bool passVince, bool passPerde)
        internal
        returns (uint256 id)
    {
        siediAi(perde, passPerde);
        siediAi(vince, passVince);
        (,, id,,,) = game.seats(vince);
        semeDi(id);
    }

    function lampo(address vince, address perde, bool passVince, bool passPerde)
        internal
        returns (uint256 id)
    {
        id = accoppiaCon(vince, perde, passVince, passPerde);
        vm.prank(sessioneDi(perde));
        game.jungledidakooResign(id);
    }

    function privata(address vince, address perde, bool passVince, bool passPerde)
        internal
        returns (uint256 id)
    {
        tienePass(perde, passPerde);
        siedi(perde, sessioneDi(perde), PRIVATA, invito());
        tienePass(vince, passVince);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x1a7e, game.inviteHash(perde, vince));
        vm.deal(vince, vince.balance + POSTA);
        vm.prank(vince, vince);
        game.jungledidakooJoin{value: POSTA}(perde, sessioneDi(vince), abi.encodePacked(r, s, v), V);
        (,, id,,,) = game.seats(vince);
        semeDi(id);
        vm.prank(sessioneDi(perde));
        game.jungledidakooResign(id);
    }

    function categoriaDi(uint256 id) internal view returns (uint8 categoria) {
        (,, categoria,,,,,,,) = memento.drawing(id);
    }

    function cedi(address chi, address verso, uint256 id) internal {
        vm.prank(chi);
        memento.transferFrom(chi, verso, id);
    }

    function senzaCommemorativo(uint256 id) internal {
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.ownerOf(id);
    }

    function test_senza_pass_si_gioca_ma_non_si_conia() public {
        uint256 id = lampo(a, b, false, false);
        JungleGame.Game memory g = game.gameOf(id);
        assertEq(g.status, 2, "finita");
        assertEq(g.winner, a);
        assertGt(uint256(g.escrowWhite) + g.escrowBlack, 0, "i resti restituiti");
        senzaCommemorativo(id);
        assertEq(memento.balanceOf(a), 0, "nessun commemorativo");
    }

    function test_il_commemorativo_solo_al_vincitore_col_pass() public {
        uint256 id = lampo(a, b, true, false);
        assertEq(memento.ownerOf(id), a, "col pass si conia");
        assertEq(arenaDi(a), 1, "di Arena");

        id = lampo(b, a, false, true);
        senzaCommemorativo(id);
        assertEq(arenaDi(a), 1, "perdere non toglie niente");
        assertEq(arenaDi(b), 0);
    }

    function test_si_conia_anche_in_privata_ma_non_conta() public {
        uint256 id = privata(a, b, true, true);
        assertEq(memento.ownerOf(id), a, "il commemorativo si conia");
        assertEq(categoriaDi(id), PRIVATA);
        assertEq(arenaDi(a), 0, "e non e' di Arena");
        senzaCommemorativo(privata(b, a, false, true));
    }

    function numero(uint256 n) internal view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(game), n)));
    }

    function test_il_gameId_viene_dal_numero_della_partita() public {
        assertEq(lampo(a, b, true, false), numero(1), "la prima");
        assertEq(privata(b, a, true, true), numero(2), "la privata conta come le altre");
        assertEq(lampo(a, b, false, false), numero(3), "anche senza commemorativo");
        assertEq(game.gameOf(numero(1)).status, 2, "la partita finita resta");
        assertEq(game.gameOf(numero(4)).status, 0, "oltre l'ultima niente");
    }

    function test_il_pass_e_quello_della_fine() public {
        uint256 id = accoppiaCon(a, b, true, true);
        vendi(a);
        vm.prank(sessioneDi(b));
        game.jungledidakooResign(id);
        senzaCommemorativo(id);

        id = accoppiaCon(c(), d(), false, false);
        compra(c());
        vm.prank(sessioneDi(d()));
        game.jungledidakooResign(id);
        assertEq(memento.ownerOf(id), c(), "il pass preso in partita conia");
        assertEq(arenaDi(c()), 1);
    }

    function test_il_posto_lo_apre_chi_firma_la_transazione() public {
        vm.deal(a, 2 * POSTA);
        vm.prank(a);
        vm.expectRevert(JungleGame.NotOrigin.selector);
        game.jungledidakooOpen{value: POSTA}(sessioneDi(a), ARENA, address(0), V);

        Sede sede = new Sede();
        vm.prank(a, a);
        vm.expectRevert(JungleGame.NotOrigin.selector);
        sede.apri{value: POSTA}(game, sessioneDi(address(sede)), V);

        siedi(a, sessioneDi(a), PRIVATA, invito());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x1a7e, game.inviteHash(a, b));
        vm.deal(b, POSTA);
        vm.prank(b);
        vm.expectRevert(JungleGame.NotOrigin.selector);
        game.jungledidakooJoin{value: POSTA}(a, sessioneDi(b), abi.encodePacked(r, s, v), V);
        vm.prank(b, b);
        game.jungledidakooJoin{value: POSTA}(a, sessioneDi(b), abi.encodePacked(r, s, v), V);
        (,, uint256 id,,,) = game.seats(b);
        assertGt(id, 0, "dal suo wallet si entra");
    }

    function test_i_commemorativi_seguono_i_trasferimenti() public {
        uint256 primo = lampo(a, b, true, false);
        uint256 secondo = lampo(a, b, true, false);
        uint256 amico = privata(b, a, true, false);
        assertEq(arenaDi(a), 2);
        assertEq(arenaDi(b), 0, "la privata no");
        assertEq(memento.balanceOf(b), 1);

        cedi(a, c(), primo);
        assertEq(arenaDi(a), 1, "il commemorativo cambia mano");
        assertEq(arenaDi(c()), 1);

        cedi(b, c(), amico);
        assertEq(arenaDi(c()), 1, "quello di privata resta di privata");
        assertEq(memento.balanceOf(c()), 2);

        cedi(a, c(), secondo);
        assertEq(memento.tokensOf(a).length, 0, "chi cede tutto non ne ha");
        assertEq(arenaDi(c()), 2);

        cedi(c(), c(), primo);
        assertEq(memento.tokensOf(c()).length, 3, "a se stesso non cambia il conto");
    }

    function arenaDi(address chi) internal view returns (uint256 n) {
        uint256[] memory suoi = memento.tokensOf(chi);
        for (uint256 k = 0; k < suoi.length; k++) {
            if (categoriaDi(suoi[k]) == ARENA) n++;
        }
    }

    function test_i_commemorativi_tenuti_tornano_partita_dopo_partita() public {
        uint256 partite = 300;
        vm.pauseGasMetering();
        for (uint256 i = 0; i < partite; i++) {
            uint256 h = uint256(keccak256(abi.encode("pagine", i)));
            address vince = giocatore(h % 60);
            lampo(vince, giocatore(1000 + i), true, h % 3 == 0);
            if (h % 7 == 0) privata(vince, giocatore(2000 + i), true, false);
            if (h % 5 == 0) vm.warp(block.timestamp + 1 + h % 50);
            uint256 arena = 0;
            uint256[] memory suoi = memento.tokensOf(vince);
            for (uint256 k = suoi.length; k > 0; k--) {
                if (categoriaDi(suoi[k - 1]) == ARENA) {
                    arena = suoi[k - 1];
                    break;
                }
            }
            if (h % 4 == 0) cedi(vince, giocatore((h >> 8) % 60), arena);
            else if (h % 9 == 0) cedi(vince, giocatore(3000 + i), arena);
            else if (h % 13 == 0) cedi(vince, vince, arena);
        }

        uint256 somma = 0;
        for (uint256 i = 0; i < 60 + partite; i++) {
            address chi = i < 60 ? giocatore(i) : giocatore(3000 + i - 60);
            assertEq(memento.balanceOf(chi), memento.tokensOf(chi).length, "la lista e' il saldo");
            somma += arenaDi(chi);
        }
        vm.resumeGasMetering();
        assertEq(somma, partite, "un commemorativo di Arena per partita di Arena");
    }

    function test_la_resa_con_poco_gas_non_salta_il_pass() public {
        uint256 id = accoppiaCon(a, b, true, true);
        uint256 riuscite = 0;
        for (uint256 tetto = 150_000; tetto <= 900_000; tetto += 5_000) {
            uint256 stato = vm.snapshotState();
            vm.prank(sessioneDi(b));
            try game.jungledidakooResign{gas: tetto}(id) {
                riuscite++;
                assertEq(memento.ownerOf(id), a, "se passa, il commemorativo c'e'");
                assertEq(arenaDi(a), 1, "di Arena");
            } catch {}
            vm.revertToState(stato);
        }
        assertGt(riuscite, 0, "con abbastanza gas passa");
    }

    function test_il_gas_del_trasferimento() public {
        uint256 primo = lampo(a, b, true, false);
        uint256 secondo = lampo(a, b, true, false);
        lampo(c(), b, true, false);
        uint256 amico = privata(a, b, true, false);

        vm.prank(a);
        uint256 prima = gasleft();
        memento.transferFrom(a, d(), primo);
        uint256 entra = prima - gasleft();
        emit log_named_uint("trasferimento di Arena, al primo commemorativo", entra);

        vm.prank(a);
        prima = gasleft();
        memento.transferFrom(a, c(), secondo);
        uint256 esce = prima - gasleft();
        emit log_named_uint("trasferimento di Arena, a chi ne ha gia'", esce);

        vm.prank(a);
        prima = gasleft();
        memento.transferFrom(a, c(), amico);
        emit log_named_uint("trasferimento di privata", prima - gasleft());
        assertLt(entra, 300_000);
        assertLt(esce, 300_000);
    }

    function test_il_gas_della_mossa_finale() public {
        avvia();
        gioca(quantiPly - 1);
        uint256 prima = ultimaMossa();
        emit log_named_uint("mossa finale, primo commemorativo", prima);

        apri(a, sessionA);
        apri(b, sessionB);
        (,, gameId,,,) = game.seats(a);
        semina();
        gioca(quantiPly - 1);
        uint256 dopo = ultimaMossa();
        emit log_named_uint("mossa finale, gia' con commemorativi", dopo);
        assertLt(prima, 760_000, "col registro vero resta sotto il ripiego del client");
    }

    function ultimaMossa() internal returns (uint256 speso) {
        (uint8 colore, bool saltato, uint8 da, uint8 dove) = ply(quantiPly - 1);
        assertFalse(saltato);
        vm.warp(block.timestamp + 2);
        seqAtteso = atteso();
        vm.prank(colore == 1 ? sessioneBianca : sessioneNera);
        uint256 prima = gasleft();
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        speso = prima - gasleft();
        assertEq(game.gameOf(gameId).status, 2, "e' la mossa che chiude");
    }

    function c() internal pure returns (address) {
        return address(0xc0c0);
    }

    function d() internal pure returns (address) {
        return address(0xd0d0);
    }
}
