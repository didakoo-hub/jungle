// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Table, RegistroIngordo} from "./Table.sol";
import {JungleGame, IJunglePass, IStreamRegistry} from "../src/JungleGame.sol";
import {JungleRules} from "../src/JungleRules.sol";
import {JungleMemento} from "../src/JungleMemento.sol";

contract Rifiuta {
    receive() external payable {
        revert();
    }
}

contract JungleGameTest is Table {

    function test_il_resto_rifiutato_si_ritira_dopo() public {
        avvia();
        vm.etch(bianco, type(Rifiuta).runtimeCode);
        vm.prank(sessioneNera);
        game.jungledidakooResign(gameId);
        uint256 dovuto = game.owed(bianco);
        assertGt(dovuto, 0, "il resto che il wallet rifiuta resta nel contratto");

        vm.prank(bianco);
        vm.expectRevert(JungleGame.PayoutFailed.selector);
        game.jungledidakooWithdraw();
        assertEq(game.owed(bianco), dovuto, "il ritiro fallito non lo perde");

        vm.etch(bianco, "");
        uint256 prima = bianco.balance;
        vm.prank(bianco);
        game.jungledidakooWithdraw();
        assertEq(bianco.balance, prima + dovuto, "il ritiro lo restituisce");
        assertEq(game.owed(bianco), 0);
        assertEq(game.owed(nero), 0, "l'altro l'ha avuto subito");

        vm.prank(bianco);
        game.jungledidakooWithdraw();
        assertEq(bianco.balance, prima + dovuto, "una volta sola");
    }

    function test_la_partita_del_bundle_si_rigioca() public {
        avvia();
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 1);
        assertEq(g.white, bianco, "il bianco e' quello del seme");
        assertEq(g.black, nero);
        assertEq(g.board, vm.parseJsonUint(json, ".game.initialBoard"), "la scacchiera iniziale");
        assertEq(g.colors, uint8(vm.parseJsonUint(json, ".game.colors")), "i colori");
        assertEq(g.turn, 1, "muove il bianco");

        gioca();
        g = game.gameOf(gameId);
        assertEq(g.status, 2, "finita");
        assertEq(g.winner, bianco == vm.parseJsonAddress(json, ".game.white") ? bianco : nero);
        assertEq(g.endReason, uint8(vm.parseJsonUint(json, ".game.endReason")));
        assertEq(g.board, vm.parseJsonUint(json, ".game.finalBoard"), "la posizione finale");
        assertEq(g.seq, uint32(quantiPly));
        assertEq(g.moves, vm.parseJsonBytes(json, ".game.moves"), "i ply, due byte l'uno");
    }

    function test_il_posto_apre_i_due_canali_alla_sessione() public {
        assertFalse(registro.canPublish(CANALE_P, sessionA));
        apri(a, sessionA);
        assertTrue(registro.canPublish(CANALE_P, sessionA));
        assertFalse(registro.canPublish(CANALE_P, a), "il wallet no: a parlare e' la sessione");
    }

    function test_rendere_il_posto_chiude_i_canali() public {
        apri(a, sessionA);
        vm.prank(a);
        game.jungledidakooLeave();
        assertFalse(registro.canPublish(CANALE_P, sessionA));
    }

    function test_la_fine_della_partita_chiude_i_canali() public {
        avvia();
        assertTrue(registro.canPublish(CANALE_P, sessionA), "aperti durante la partita");
        assertTrue(registro.canPublish(CANALE_P, sessionB));
        gioca();
        assertFalse(registro.canPublish(CANALE_P, sessionA));
        assertFalse(registro.canPublish(CANALE_P, sessionB));
    }

    function test_una_sessione_e_di_un_wallet_solo() public {
        apri(a, sessionA);
        compra(b);
        vm.deal(b, b.balance + POSTA);
        vm.prank(b, b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA, ARENA, address(0), V);
        assertEq(game.sessionOf(sessionA), a, "la sessione e' di a");
        assertTrue(registro.canPublish(CANALE_P, sessionA), "e parla");

        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(game.sessionOf(sessionA), a, "resa la sessione resta di a");
        assertFalse(registro.canPublish(CANALE_P, sessionA), "ma tace");
        vm.prank(b, b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA, ARENA, address(0), V);
        apri(a, sessionA);
        assertEq(game.sessionOf(sessionA), a);
        assertTrue(registro.canPublish(CANALE_P, sessionA), "il posto nuovo le rida' la voce");
    }

    function test_la_sessione_resta_del_wallet_dopo_la_partita() public {
        avvia();
        gioca();
        assertEq(game.sessionOf(sessionA), a, "finita la partita la sessione e' ancora di a");
        assertEq(game.sessionOf(sessionB), b);
        assertFalse(registro.canPublish(CANALE_P, sessionA), "senza posto ne' partita tace");

        compra(b);
        vm.deal(b, b.balance + POSTA);
        vm.prank(b, b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA, ARENA, address(0), V);

        apri(a, sessionA);
        assertTrue(registro.canPublish(CANALE_P, sessionA), "a la riapre e torna a parlare");
    }

    function test_un_registro_che_brucia_il_gas_non_ferma_il_posto() public {
        JungleGame ingordo = new JungleGame(
            IJunglePass(address(pass)),
            1,
            IStreamRegistry(address(new RegistroIngordo())),
            CANALE_P,
            vm.addr(CHIAVE_D)
        );
        compra(a);
        vm.deal(a, a.balance + POSTA);
        vm.prank(a, a);
        uint256 prima = gasleft();
        ingordo.jungledidakooOpen{value: POSTA}(sessionA, ARENA, address(0), V);
        uint256 speso = prima - gasleft();
        (address sessione,,,,,) = ingordo.seats(a);
        assertEq(sessione, sessionA, "il posto si apre");
        assertLt(speso, 2 * ingordo.REGISTRY_GAS() + 300_000, "e il registro costa al piu' due tetti");
        vm.prank(a);
        ingordo.jungledidakooLeave();
        (sessione,,,,,) = ingordo.seats(a);
        assertEq(sessione, address(0), "e si rende");
    }

    function test_senza_registro_il_posto_si_apre_lo_stesso() public {
        JungleGame senza = new JungleGame(
            IJunglePass(address(pass)),
            1,
            IStreamRegistry(address(0xdead)),
            CANALE_P,
            vm.addr(CHIAVE_D)
        );
        compra(a);
        vm.deal(a, a.balance + POSTA);
        vm.prank(a, a);
        senza.jungledidakooOpen{value: POSTA}(sessionA, ARENA, address(0), V);
        (address sessione,,,,,) = senza.seats(a);
        assertEq(sessione, sessionA);

        JungleGame rifiutato = new JungleGame(
            IJunglePass(address(pass)),
            1,
            IStreamRegistry(address(registro)),
            CANALE_P,
            vm.addr(CHIAVE_D)
        );
        vm.deal(b, b.balance + POSTA);
        compra(b);
        vm.prank(b, b);
        rifiutato.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), V);
        (sessione,,,,,) = rifiutato.seats(b);
        assertEq(sessione, sessionB, "il registro rifiuta il grant, il posto si apre");
        assertFalse(registro.canPublish(CANALE_P, sessionB));
    }

    function test_a_fine_partita_ognuno_riprende_il_suo_resto_e_il_vincitore_il_commemorativo() public {
        avvia();
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(uint256(g.escrowWhite) + g.escrowBlack, 2 * (POSTA - game.FLOAT()), "due poste meno i due fondi");

        vm.txGasPrice(30 gwei);
        gioca(quantiPly - 1);
        g = game.gameOf(gameId);
        assertTrue(g.escrowWhite != g.escrowBlack, "due resti diversi");
        uint256 primaB = bianco.balance;
        uint256 primaN = nero.balance;
        (uint8 colore,, uint8 da, uint8 dove) = ply(quantiPly - 1);
        vm.warp(block.timestamp + 2);
        seqAtteso = atteso();
        vm.prank(colore == 1 ? sessioneBianca : sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);

        assertEq(game.gameOf(gameId).winner, bianco, "vince il bianco");
        assertEq(bianco.balance - primaB, g.escrowWhite, "al vincitore il suo resto");
        assertEq(nero.balance - primaN, g.escrowBlack, "al perdente il suo");
        JungleGame.Game memory ended = game.gameOf(gameId);
        assertEq(ended.escrowWhite, g.escrowWhite, "i due resti restano scritti");
        assertEq(ended.escrowBlack, g.escrowBlack);
        assertEq(address(game).balance, 0, "e il contratto e' vuoto");
        assertEq(memento.ownerOf(gameId), bianco, "il commemorativo al vincitore");
        assertEq(memento.balanceOf(bianco), 1);
        assertEq(memento.balanceOf(nero), 0);
    }

    function test_il_gas_torna_alla_sessione() public {
        avvia();
        vm.txGasPrice(30 gwei);
        uint256 restoPrima = game.gameOf(gameId).escrowWhite;
        uint256 sessionePrima = sessioneBianca.balance;

        (,, uint8 da, uint8 dove) = ply(0);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);

        uint256 rimborso = sessioneBianca.balance - sessionePrima;
        assertGt(rimborso, 0, "qualcosa e' tornato");
        assertEq(restoPrima - game.gameOf(gameId).escrowWhite, rimborso, "dal resto del suo lato");
        assertLt(rimborso, 0.02 ether, "e non piu' di una mossa");
    }

    function test_il_rimborso_ha_un_tetto_sopra_il_basefee() public {
        avvia();
        gioca(1);
        vm.fee(10 gwei);
        vm.txGasPrice(5000 gwei);
        uint256 restoPrima = game.gameOf(gameId).escrowBlack;
        uint256 sessionePrima = sessioneNera.balance;

        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);

        uint256 rimborso = sessioneNera.balance - sessionePrima;
        uint256 speso = restoPrima - game.gameOf(gameId).escrowBlack;
        assertEq(speso, rimborso, "dal resto del suo lato");
        assertLt(
            rimborso,
            200_000 * (10 gwei + game.REFUND_PRIORITY_CAP()),
            "al prezzo del tetto, non a quello dichiarato"
        );
    }

    function test_senza_pass_si_apre() public {
        siedi(a, sessionA, ARENA, address(0));
        (address sessione,,,,,) = game.seats(a);
        assertEq(sessione, sessionA, "il posto si apre");
    }

    function test_la_posta_e_esatta() public {
        compra(a);
        vm.deal(a, 2 * POSTA);
        vm.prank(a, a);
        vm.expectRevert(JungleGame.BadStake.selector);
        game.jungledidakooOpen{value: POSTA - 1}(sessionA, ARENA, address(0), V);
        vm.prank(a, a);
        vm.expectRevert(JungleGame.BadStake.selector);
        game.jungledidakooOpen{value: POSTA + 1}(sessionA, ARENA, address(0), V);
    }

    function test_l_apertura_anticipa_il_fondo_alla_sessione() public {
        uint256 prima = sessionA.balance;
        apri(a, sessionA);
        assertEq(sessionA.balance - prima, game.FLOAT(), "il fondo alla sessione");
        (address session, uint128 escrow,,,,) = game.seats(a);
        assertEq(session, sessionA);
        assertEq(escrow, POSTA - game.FLOAT());
    }

    function test_il_fondo_si_rabbocca_a_quel_che_manca() public {
        vm.deal(sessionA, 0.25 ether);
        apri(a, sessionA);
        assertEq(sessionA.balance, game.FLOAT(), "la sessione arriva al fondo");
        (, uint128 escrow,,,,) = game.seats(a);
        assertEq(escrow, POSTA - (game.FLOAT() - 0.25 ether), "il resto resta nel posto");
    }

    function test_la_sessione_gia_piena_non_riceve_niente() public {
        vm.deal(sessionA, 2 ether);
        apri(a, sessionA);
        assertEq(sessionA.balance, 2 ether, "niente alla sessione");
        (, uint128 escrow,,,,) = game.seats(a);
        assertEq(escrow, POSTA, "la posta intera nel posto");
        uint256 prima = a.balance;
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(a.balance - prima, POSTA, "e torna intera");
    }

    function test_un_posto_solo_per_wallet() public {
        apri(a, sessionA);
        vm.deal(a, POSTA);
        vm.prank(a, a);
        vm.expectRevert(JungleGame.SeatOpen.selector);
        game.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), V);
    }

    function test_il_posto_si_lascia_e_la_posta_torna() public {
        apri(a, sessionA);
        uint256 prima = a.balance;
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(a.balance - prima, POSTA - game.FLOAT(), "la posta meno il fondo gia' dato");
        (address session,,,,,) = game.seats(a);
        assertEq(session, address(0));
        vm.prank(a);
        vm.expectRevert(JungleGame.NoSeat.selector);
        game.jungledidakooLeave();
    }

    function tramonto(uint256 chiave, uint16 minVersione, uint64 notBefore)
        internal
        view
        returns (JungleGame.Deprecation memory d, bytes memory firma)
    {
        d = JungleGame.Deprecation(minVersione, notBefore);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(chiave, game.deprecationHash(d));
        firma = abi.encodePacked(r, s, v);
    }

    function spegni() internal {
        (JungleGame.Deprecation memory d, bytes memory firma) = tramonto(CHIAVE_D, 2, uint64(block.timestamp));
        vm.prank(address(0xbeef));
        game.jungledidakooSunset(d, firma);
        assertEq(game.minVersion(), 2, "la versione minima sale");
    }

    function test_il_tramonto_si_hasha_come_il_bundle() public {
        JungleGame.Deprecation memory d = JungleGame.Deprecation(
            uint16(vm.parseJsonUint(json, ".game.deprecation.minVersion")),
            uint64(vm.parseJsonUint(json, ".game.deprecation.notBefore"))
        );
        assertEq(game.deprecationHash(d), vm.parseJsonBytes32(json, ".game.deprecationHash"));
        game.jungledidakooSunset(d, vm.parseJsonBytes(json, ".game.deprecationSignature"));
        assertEq(game.minVersion(), d.minVersion);
    }

    function test_dopo_il_tramonto_i_posti_vecchi_tornano() public {
        apri(a, sessionA);
        spegni();

        uint256 prima = a.balance;
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(a.balance - prima, POSTA - game.FLOAT(), "il posto torna come sempre");
    }

    function test_dopo_il_tramonto_si_apre_solo_la_versione_nuova() public {
        apri(a, sessionA);
        spegni();
        compra(b);
        vm.deal(b, 2 * POSTA);
        vm.prank(b, b);
        vm.expectRevert(JungleGame.VersionTooOld.selector);
        game.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), V);
        vm.prank(b, b);
        game.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), 2);
        assertEq(game.waiting(2), b, "la v2 aspetta la sua");
        (,, uint256 partitaA,,,) = game.seats(a);
        assertEq(partitaA, 0, "e non pesca il posto vecchio");
    }

    function test_dopo_il_tramonto_l_invito_vecchio_non_entra() public {
        apri(a, sessionA, PRIVATA, invito());
        spegni();
        compra(b);
        vm.deal(b, POSTA);
        bytes memory firma = firmaInvito();
        vm.prank(b, b);
        vm.expectRevert(JungleGame.VersionTooOld.selector);
        game.jungledidakooJoin{value: POSTA}(a, sessionB, firma, V);
    }

    function test_la_partita_in_corso_si_gioca_e_paga_dopo_il_tramonto() public {
        avvia();
        spegni();
        uint256 prima = bianco.balance;
        gioca();
        assertEq(game.gameOf(gameId).status, 2, "finita");
        assertEq(bianco.balance - prima, POSTA - game.FLOAT(), "il suo resto al vincitore");
        assertEq(memento.ownerOf(gameId), bianco, "e il commemorativo");
    }

    function test_il_tramonto_vuole_la_firma_di_D_e_solo_sale() public {
        (JungleGame.Deprecation memory d, bytes memory firma) = tramonto(0xbad, 2, uint64(block.timestamp));
        vm.expectRevert(JungleGame.BadSignature.selector);
        game.jungledidakooSunset(d, firma);

        (d, firma) = tramonto(CHIAVE_D, 1, uint64(block.timestamp));
        vm.expectRevert(JungleGame.BadDeprecation.selector);
        game.jungledidakooSunset(d, firma);

        (d, firma) = tramonto(CHIAVE_D, 2, uint64(block.timestamp + 60));
        vm.expectRevert(JungleGame.NotYet.selector);
        game.jungledidakooSunset(d, firma);
        vm.warp(block.timestamp + 60);
        game.jungledidakooSunset(d, firma);
        assertEq(game.minVersion(), 2);

        vm.expectRevert(JungleGame.BadDeprecation.selector);
        game.jungledidakooSunset(d, firma);

        (d, firma) = tramonto(CHIAVE_D, 3, uint64(block.timestamp));
        game.jungledidakooSunset(d, firma);
        assertEq(game.minVersion(), 3, "e sale ancora");
    }

    function test_senza_D_nessun_tramonto() public {
        JungleGame senza = new JungleGame(
            IJunglePass(address(pass)), 1, IStreamRegistry(address(registro)), CANALE_P, address(0)
        );
        JungleGame.Deprecation memory d = JungleGame.Deprecation(2, uint64(block.timestamp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(CHIAVE_D, senza.deprecationHash(d));
        bytes memory firma = abi.encodePacked(r, s, v);
        vm.expectRevert(JungleGame.BadSignature.selector);
        senza.jungledidakooSunset(d, firma);
        bytes memory nulla = new bytes(65);
        vm.expectRevert(JungleGame.BadSignature.selector);
        senza.jungledidakooSunset(d, nulla);
    }

    function test_muove_solo_chi_tocca() public {
        avvia();
        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        vm.expectRevert(JungleGame.NotYourTurn.selector);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
    }

    function test_muovono_solo_le_due_sessioni() public {
        avvia();
        (,, uint8 da, uint8 dove) = ply(0);
        seqAtteso = atteso();
        vm.prank(a);
        vm.expectRevert(JungleGame.NotAPlayer.selector);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
    }

    function test_la_mossa_illegale_e_rifiutata() public {
        avvia();
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        vm.expectRevert(JungleGame.BadMove.selector);
        game.jungledidakooMove(gameId, seqAtteso, 56, 30);
    }

    function scadenza() internal view returns (uint64 fine) {
        (,,, fine,) = game.clockOf(gameId);
    }

    function test_la_mossa_in_ritardo_e_rifiutata() public {
        avvia();
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        (,, uint8 da, uint8 dove) = ply(0);
        (uint8 turno,,, uint64 fine,) = game.clockOf(gameId);
        assertEq(turno, 0, "il tratto e' del nero");
        assertEq(fine, uint64(block.timestamp) - 1 + game.TURN_SECONDS(), "dalla fine del turno saltato");
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        vm.expectRevert(JungleGame.NotYourTurn.selector);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
    }

    function test_l_orologio_corre_attraverso_i_salti() public {
        avvia();
        vm.warp(block.timestamp + 71);
        (uint8 turno,,, uint64 fine,) = game.clockOf(gameId);
        assertEq(turno, 0, "dopo cinque salti tocca al nero");
        assertEq(
            fine, uint64(block.timestamp) - 71 + 70 + game.PENALTY_SECONDS(), "col suo turno penalizzato"
        );
        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.seq, 6, "cinque salti e una mossa");
        assertEq(g.moves.length, 12);
        assertEq(uint8(g.moves[0]), 0xCF, "il primo salto e' del bianco");
        assertEq(uint8(g.moves[2]), 0x4F, "il secondo del nero");
        assertEq(uint8(g.moves[8]), 0xCF, "il quinto del bianco");
        assertEq(g.turn, 1, "e tocca al bianco");
        assertEq(g.penalized, 2, "il bianco porta la penalita, il nero l'ha tolta muovendo");
        assertEq(g.lastAt, uint64(block.timestamp), "il turno riparte dal blocco della mossa");
    }

    function test_l_orologio_letto_e_quello_che_la_mossa_scrive() public {
        avvia();
        uint64[7] memory silenzi = [uint64(0), 21, 3, 11, 71, 45, 9];
        uint256 saltiTotali = 0;
        for (uint256 i = 0; i < silenzi.length; i++) {
            vm.warp(block.timestamp + silenzi[i]);
            JungleGame.Game memory prima = game.gameOf(gameId);
            (uint8 turno, uint8 penalizzati, uint64 inizio, uint64 fine, uint8 salti) = game.clockOf(gameId);
            assertEq(
                fine - inizio,
                (penalizzati >> turno) & 1 == 1 ? game.PENALTY_SECONDS() : game.TURN_SECONDS(),
                "la durata e' del tratto"
            );
            assertTrue(fine >= uint64(block.timestamp), "il turno letto e' in corso");
            (uint8 da, uint8 dove) = mossaDi(turno);
            seqAtteso = atteso();
            vm.prank(turno == 1 ? sessioneBianca : sessioneNera);
            game.jungledidakooMove(gameId, seqAtteso, da, dove);
            JungleGame.Game memory dopo = game.gameOf(gameId);
            assertEq(dopo.seq, prima.seq + salti + 1, "i salti letti sono quelli scritti");
            assertEq(dopo.moves.length, prima.moves.length + 2 * (uint256(salti) + 1));
            assertEq(dopo.turn, 1 - turno, "il tratto letto e' quello che ha mosso");
            assertEq(
                dopo.penalized,
                penalizzati & ~uint8(1 << turno),
                "le penalita' lette, tolta quella di chi muove"
            );
            saltiTotali += salti;
        }
        assertGt(saltiTotali, 3, "la prova ha attraversato dei salti");
    }

    function test_l_orologio_di_una_partita_ferma_non_salta() public view {
        (uint8 turno,, uint64 inizio, uint64 fine, uint8 salti) = game.clockOf(gameId);
        assertEq(salti, 0);
        assertEq(turno, 0);
        assertEq(inizio, 0);
        assertEq(fine, game.TURN_SECONDS());
    }

    function test_oltre_l_inattivita_non_si_muove() public {
        avvia();
        vm.warp(block.timestamp + game.IDLE_SECONDS() + 1);
        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        vm.expectRevert(JungleGame.Idle.selector);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
    }

    function test_il_turno_saltato_lo_constata_la_mossa_dell_altro() public {
        avvia();
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);

        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.seq, 2, "il salto e' un ply");
        assertEq(g.turn, 1, "e tocca di nuovo al bianco");
        assertEq(g.moves.length, 4);
        assertEq(uint8(g.moves[0]), 0xCF, "il ply saltato: bianco, saltato, 63 e 63");
        assertEq(uint8(g.moves[1]), 0xFF);
        assertEq(g.lastAt, uint64(block.timestamp), "il turno del bianco riparte da adesso");
    }

    function test_la_mossa_scelta_per_un_altro_ply_cade() public {
        avvia();
        (,, uint8 da, uint8 dove) = ply(0);
        vm.prank(sessioneBianca);
        vm.expectRevert(JungleGame.StaleMove.selector);
        game.jungledidakooMove(gameId, 1, da, dove);

        vm.warp(block.timestamp + 2 * game.TURN_SECONDS() + 2);
        vm.prank(sessioneBianca);
        vm.expectRevert(JungleGame.StaleMove.selector);
        game.jungledidakooMove(gameId, 0, da, dove);
        assertEq(game.gameOf(gameId).seq, 0, "i salti non si scrivono con la mossa rifiutata");

        seqAtteso = atteso();
        assertEq(seqAtteso, 2, "col seq dei due salti");
        vm.prank(sessioneBianca);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        assertEq(game.gameOf(gameId).seq, 3, "passa");
    }

    function test_dopo_un_salto_il_turno_dura_la_penalita() public {
        avvia();
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        assertEq(game.gameOf(gameId).penalized, 2, "il bianco porta la penalita");
        assertEq(
            scadenza(), uint64(block.timestamp) + game.PENALTY_SECONDS(), "e ha dieci secondi"
        );

        vm.warp(block.timestamp + game.PENALTY_SECONDS() + 1);
        (,, uint8 bDa, uint8 bDove) = ply(0);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        vm.expectRevert(JungleGame.NotYourTurn.selector);
        game.jungledidakooMove(gameId, seqAtteso, bDa, bDove);

        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, dove, da);
        vm.warp(block.timestamp + 5);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        game.jungledidakooMove(gameId, seqAtteso, bDa, bDove);
        assertEq(game.gameOf(gameId).penalized, 0, "la mossa in tempo toglie la penalita");
        assertEq(
            scadenza(),
            uint64(block.timestamp) + game.TURN_SECONDS(),
            "e il nero ha il turno intero"
        );
    }

    function test_il_turno_saltato_azzera_il_contatore_di_chi_salta() public {
        avvia();
        (,, uint8 da, uint8 dove) = ply(0);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        (uint8 nDa, uint8 nDove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, nDa, nDove);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        game.jungledidakooMove(gameId, seqAtteso, dove, da);
        (, uint8 conteggio) = JungleRules.counter(game.gameOf(gameId).repetitions, 1);
        assertEq(conteggio, 2, "due mosse dello stesso animale");

        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, nDove, nDa);
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, nDa, nDove);
        (, conteggio) = JungleRules.counter(game.gameOf(gameId).repetitions, 1);
        assertEq(conteggio, 0, "azzerato dal salto");
    }

    function test_la_resa_da_la_partita_all_altro() public {
        avvia();
        vm.txGasPrice(30 gwei);
        gioca(4);
        JungleGame.Game memory g = game.gameOf(gameId);
        uint256 primaB = bianco.balance;
        uint256 primaN = nero.balance;
        vm.prank(sessioneNera);
        game.jungledidakooResign(gameId);

        assertEq(bianco.balance - primaB, g.escrowWhite, "al vincitore il suo resto");
        assertEq(nero.balance - primaN, g.escrowBlack, "a chi si arrende il suo");
        g = game.gameOf(gameId);
        assertEq(bianco.balance - primaB, g.escrowWhite, "i due resti restano scritti");
        assertEq(nero.balance - primaN, g.escrowBlack);
        assertEq(address(game).balance, 0, "la resa non si rimborsa da un resto gia' pagato");
        assertEq(g.status, 2);
        assertEq(g.winner, bianco);
        assertEq(g.endReason, game.RESIGNED());
        assertEq(memento.ownerOf(gameId), bianco);
    }

    function test_dopo_la_fine_non_si_muove() public {
        avvia();
        gioca();
        (,, uint8 da, uint8 dove) = ply(0);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        vm.expectRevert(JungleGame.NotRunning.selector);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        vm.prank(sessioneNera);
        vm.expectRevert(JungleGame.NotRunning.selector);
        game.jungledidakooResign(gameId);
    }

    function test_se_nessuno_muove_piu_ognuno_riprende_il_suo() public {
        avvia();
        gioca(3);
        JungleGame.Game memory g = game.gameOf(gameId);
        uint256 primaB = bianco.balance;
        uint256 primaN = nero.balance;

        vm.expectRevert(JungleGame.StillPlaying.selector);
        game.jungledidakooClose(gameId);

        vm.warp(block.timestamp + game.IDLE_SECONDS() + 1);
        game.jungledidakooClose(gameId);

        assertEq(bianco.balance - primaB, g.escrowWhite, "al bianco il suo");
        assertEq(nero.balance - primaN, g.escrowBlack, "al nero il suo");
        g = game.gameOf(gameId);
        assertEq(bianco.balance - primaB, g.escrowWhite, "i due resti restano scritti");
        assertEq(nero.balance - primaN, g.escrowBlack);
        assertEq(g.status, 2);
        assertEq(g.winner, address(0), "nessun vincitore");
        assertEq(g.endReason, game.ABANDONED());
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.ownerOf(gameId);
    }

    function test_chi_sparisce_lo_si_batte_camminando() public {
        avvia();
        JungleGame.Game memory g = game.gameOf(gameId);
        uint8[63] memory cella = JungleRules.unpack(g.board);
        uint32 rip = g.repetitions;
        for (uint256 passi = 0; passi < 60; passi++) {
            g = game.gameOf(gameId);
            if (g.status == 2) break;
            cella = JungleRules.unpack(g.board);
            rip = g.repetitions;
            (uint8 da, uint8 dove) = versoLaTana(cella, rip, g.repetitionLimit);
            if (passi > 0) vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
            seqAtteso = atteso();
            vm.prank(sessioneBianca);
            game.jungledidakooMove(gameId, seqAtteso, da, dove);
        }
        g = game.gameOf(gameId);
        assertEq(g.status, 2, "finita");
        assertEq(g.winner, bianco);
        assertEq(g.endReason, game.PYRAMID());
    }

    function test_l_arena_accoppia_il_secondo_posto_col_primo() public {
        apri(a, sessionA);
        assertEq(game.waiting(V), a, "il primo aspetta");
        (,, uint256 partita,,,) = game.seats(a);
        assertEq(partita, 0);

        uint64 adesso = uint64(block.timestamp);
        compra(b);
        vm.deal(b, POSTA);
        vm.expectEmit(address(game));
        emit JungleGame.Paired(gameId, a, b, ARENA);
        vm.prank(b, b);
        game.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), V);
        assertEq(game.waiting(V), address(0), "la coda si svuota");

        (, uint128 restoA, uint256 partitaA,,,) = game.seats(a);
        (, uint128 restoB, uint256 partitaB,,,) = game.seats(b);
        assertEq(partitaA, gameId, "la partita e' quella del fixture");
        assertEq(partitaB, gameId);
        assertEq(restoA + restoB, 0, "le poste passano alla partita");

        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 1);
        assertEq(g.category, ARENA);
        assertEq(g.escrowWhite + g.escrowBlack, 2 * (POSTA - game.FLOAT()));
        assertEq(g.seed, bytes32(0), "il seme non c'e' ancora");
        assertEq(g.seedBlock, block.number + 1, "e' l'hash del blocco dopo");
        assertEq(g.lastAt, adesso + game.START_SECONDS(), "il turno del bianco apre dopo l'attesa");
        assertEq(g.white, a, "i lati in ordine di indirizzo, finche' il seme non li decide");
        assertEq(g.black, b);
    }

    function test_versioni_diverse_non_si_accoppiano() public {
        apri(a, sessionA);
        compra(b);
        vm.deal(b, POSTA);
        vm.prank(b, b);
        game.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), V + 1);
        assertEq(game.waiting(V), a);
        assertEq(game.waiting(V + 1), b, "ognuna aspetta la sua");
    }

    function test_il_posto_in_attesa_si_lascia() public {
        apri(a, sessionA);
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(game.waiting(V), address(0), "la coda si svuota");
        apri(b, sessionB);
        assertEq(game.waiting(V), b, "e il prossimo aspetta");
    }

    function test_il_posto_accoppiato_non_si_lascia() public {
        accoppia();
        vm.prank(a);
        vm.expectRevert(JungleGame.SeatBusy.selector);
        game.jungledidakooLeave();
        vm.prank(b);
        vm.expectRevert(JungleGame.SeatBusy.selector);
        game.jungledidakooLeave();
    }

    function test_la_categoria_e_arena_o_privata() public {
        compra(a);
        vm.deal(a, POSTA);
        vm.startPrank(a, a);
        vm.expectRevert(JungleGame.BadCategory.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA, 1, address(0), V);
        vm.expectRevert(JungleGame.BadCategory.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA, ARENA, invito(), V);
        vm.expectRevert(JungleGame.BadCategory.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA, PRIVATA, address(0), V);
        vm.stopPrank();
    }

    function test_l_invito_si_firma_come_il_bundle() public view {
        assertEq(game.inviteHash(a, b), vm.parseJsonBytes32(json, ".game.invite.hash"));
        assertEq(vm.parseJsonAddress(json, ".game.invite.host"), a);
        assertEq(vm.parseJsonAddress(json, ".game.invite.guest"), b);
    }

    function test_la_privata_parte_con_l_invito() public {
        apri(a, sessionA, PRIVATA, invito());
        (,,, uint8 categoria, address chiave,) = game.seats(a);
        assertEq(categoria, PRIVATA);
        assertEq(chiave, invito());
        assertEq(game.waiting(V), address(0), "la privata non sta in coda");

        entra(b, sessionB, a, firmaInvito());
        (,, uint256 partita,, address resta,) = game.seats(a);
        assertEq(partita, gameId, "l'ospite entra e la partita c'e'");
        assertEq(resta, address(0), "l'invito si consuma");
        assertEq(game.gameOf(gameId).category, PRIVATA);
    }

    function test_la_privata_non_si_accoppia_in_arena() public {
        apri(a, sessionA, PRIVATA, invito());
        apri(b, sessionB);
        assertEq(game.waiting(V), b, "l'arena aspetta un'arena");
        (,, uint256 partita,,,) = game.seats(a);
        assertEq(partita, 0);
    }

    function test_l_invito_vale_per_l_ospite_firmato_e_una_volta() public {
        apri(a, sessionA, PRIVATA, invito());
        address altro = address(0xc0ffee);
        compra(altro);
        vm.deal(altro, POSTA);
        bytes memory firma = firmaInvito();
        vm.prank(altro, altro);
        vm.expectRevert(JungleGame.BadSignature.selector);
        game.jungledidakooJoin{value: POSTA}(a, address(0xc0ffee5e55), firma, V);

        entra(b, sessionB, a, firma);
        vm.prank(altro, altro);
        vm.expectRevert(JungleGame.BadInvite.selector);
        game.jungledidakooJoin{value: POSTA}(a, address(0xc0ffee5e55), firma, V);
    }

    function test_l_invito_non_e_per_chi_l_ha_aperto_ne_per_un_altra_versione() public {
        apri(a, sessionA, PRIVATA, invito());
        bytes memory firma = firmaInvito();
        vm.deal(a, POSTA);
        vm.prank(a, a);
        vm.expectRevert(JungleGame.BadInvite.selector);
        game.jungledidakooJoin{value: POSTA}(a, sessionB, firma, V);

        compra(b);
        vm.deal(b, POSTA);
        vm.prank(b, b);
        vm.expectRevert(JungleGame.OtherVersion.selector);
        game.jungledidakooJoin{value: POSTA}(a, sessionB, firma, V + 1);

        vm.prank(b, b);
        vm.expectRevert(JungleGame.BadInvite.selector);
        game.jungledidakooJoin{value: POSTA}(b, sessionB, firma, V);
    }

    function test_il_seme_e_l_hash_del_blocco_dopo() public {
        accoppia();
        (,, uint8 da, uint8 dove) = ply(0);
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.SeedNotReady.selector);
        game.jungledidakooMove(gameId, 0, da, dove);

        semina();
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.seed, seme(), "letto, il seme c'e' gia'");
        assertEq(g.white, bianco, "col suo bianco");
        assertEq(g.board, vm.parseJsonUint(json, ".game.initialBoard"));
        assertEq(g.colors, uint8(vm.parseJsonUint(json, ".game.colors")));

        vm.expectEmit(address(game));
        emit JungleGame.Started(gameId, bianco, nero, ARENA);
        gioca(1);
        assertEq(game.gameOf(gameId).seq, 1, "la prima mossa lo scrive");
    }

    function test_il_nero_apre_la_partita_se_il_bianco_manca() public {
        avvia();
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        (uint8 da, uint8 dove) = mossaNera();
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.seq, 2, "il salto del bianco e la mossa del nero");
        assertEq(g.white, bianco);
    }

    function test_senza_seme_entro_256_blocchi_ognuno_riprende_il_suo() public {
        accoppia();
        JungleGame.Game memory g = game.gameOf(gameId);
        vm.roll(g.seedBlock + game.SEED_BLOCKS());
        vm.expectRevert(JungleGame.StillPlaying.selector);
        game.jungledidakooClose(gameId);

        vm.roll(g.seedBlock + game.SEED_BLOCKS() + 1);
        (,, uint8 da, uint8 dove) = ply(0);
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.SeedExpired.selector);
        game.jungledidakooMove(gameId, 0, da, dove);

        uint256 primaA = a.balance;
        uint256 primaB = b.balance;
        game.jungledidakooClose(gameId);
        assertEq(a.balance - primaA, POSTA - game.FLOAT(), "ad a il suo");
        assertEq(b.balance - primaB, POSTA - game.FLOAT(), "a b il suo");
        g = game.gameOf(gameId);
        assertEq(g.status, 2);
        assertEq(g.winner, address(0), "nessun vincitore");
        assertEq(g.endReason, game.ABANDONED());
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.ownerOf(gameId);
        (address sessione,,,,,) = game.seats(a);
        assertEq(sessione, address(0), "i posti si liberano");
    }

    function test_la_fine_libera_i_posti() public {
        avvia();
        gioca();
        (address sessione,,,,,) = game.seats(a);
        assertEq(sessione, address(0));
        (sessione,,,,,) = game.seats(b);
        assertEq(sessione, address(0));
        apri(a, sessionA);
        assertEq(game.waiting(V), a, "e si riapre");
    }

    function test_il_gas_dell_accoppiamento() public {
        compra(a);
        vm.deal(a, POSTA);
        vm.prank(a, a);
        uint256 prima = gasleft();
        game.jungledidakooOpen{value: POSTA}(sessionA, ARENA, address(0), V);
        uint256 attesa = prima - gasleft();
        compra(b);
        vm.deal(b, POSTA);
        vm.prank(b, b);
        prima = gasleft();
        game.jungledidakooOpen{value: POSTA}(sessionB, ARENA, address(0), V);
        uint256 arena = prima - gasleft();

        apri(address(0xa11ce), address(0xa11ce5e55), PRIVATA, invito());
        compra(address(0xb0b0));
        vm.deal(address(0xb0b0), POSTA);
        bytes memory firma = firmaInvitoPer(address(0xa11ce), address(0xb0b0));
        vm.prank(address(0xb0b0), address(0xb0b0));
        prima = gasleft();
        game.jungledidakooJoin{value: POSTA}(address(0xa11ce), address(0xb0b05e55), firma, V);
        uint256 privata = prima - gasleft();

        emit log_named_uint("Open in attesa", attesa);
        emit log_named_uint("Open che accoppia (Arena)", arena);
        emit log_named_uint("Join (privata)", privata);
        assertLt(arena, 600_000);
        assertLt(privata, 600_000);
    }

    function firmaInvitoPer(address host, address ospite) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x1a7e, game.inviteHash(host, ospite));
        return abi.encodePacked(r, s, v);
    }

    function mossaDi(uint8 lato) internal view returns (uint8, uint8) {
        JungleGame.Game memory g = game.gameOf(gameId);
        uint16[] memory mosse =
            JungleRules.moves(JungleRules.unpack(g.board), g.repetitions, lato, g.repetitionLimit);
        return (uint8(mosse[0] >> 6), uint8(mosse[0] & 63));
    }

    function mossaNera() internal view returns (uint8, uint8) {
        JungleGame.Game memory g = game.gameOf(gameId);
        uint16[] memory mosse =
            JungleRules.moves(JungleRules.unpack(g.board), g.repetitions, 0, g.repetitionLimit);
        return (uint8(mosse[0] >> 6), uint8(mosse[0] & 63));
    }

    function versoLaTana(uint8[63] memory cella, uint32 rip, uint8 limite)
        internal
        pure
        returns (uint8, uint8)
    {
        uint16[] memory mosse = JungleRules.moves(cella, rip, 1, limite);
        uint256 migliore = 0;
        uint256 minima = type(uint256).max;
        for (uint256 i = 0; i < mosse.length; i++) {
            uint8 dove = uint8(mosse[i] & 63);
            uint8 da = uint8(mosse[i] >> 6);
            uint256 distanza = _dist(dove, 3) * 2 + (_dist(da, 3) > _dist(dove, 3) ? 0 : 1);
            if (distanza < minima) {
                minima = distanza;
                migliore = i;
            }
        }
        return (uint8(mosse[migliore] >> 6), uint8(mosse[migliore] & 63));
    }

    function _dist(uint8 x, uint8 y) private pure returns (uint256) {
        uint256 rx = x / 7;
        uint256 cx = x % 7;
        uint256 ry = y / 7;
        uint256 cy = y % 7;
        return (rx > ry ? rx - ry : ry - rx) + (cx > cy ? cx - cy : cy - cx);
    }
}
