// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Table, RegistroIngordo} from "./Table.sol";
import {JungleGame, IJunglePass, IStreamRegistry} from "../src/JungleGame.sol";
import {JungleRules} from "../src/JungleRules.sol";
import {JungleMemento} from "../src/JungleMemento.sol";

contract JungleGameTest is Table {

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
        assertTrue(registro.canPublish(CANALE_P, sessionA), "P");
        assertTrue(registro.canPublish(CANALE_A, sessionA), "A");
        assertFalse(registro.canPublish(CANALE_P, a), "il wallet no: a parlare e' la sessione");
    }

    function test_rendere_il_posto_chiude_i_canali() public {
        apri(a, sessionA);
        vm.prank(a);
        game.jungledidakooLeave();
        assertFalse(registro.canPublish(CANALE_P, sessionA));
        assertFalse(registro.canPublish(CANALE_A, sessionA));
    }

    function test_la_fine_della_partita_chiude_i_canali() public {
        avvia();
        assertTrue(registro.canPublish(CANALE_P, sessionA), "aperti durante la partita");
        assertTrue(registro.canPublish(CANALE_A, sessionB));
        gioca();
        assertFalse(registro.canPublish(CANALE_P, sessionA));
        assertFalse(registro.canPublish(CANALE_A, sessionA));
        assertFalse(registro.canPublish(CANALE_P, sessionB));
        assertFalse(registro.canPublish(CANALE_A, sessionB));
    }

    function test_la_rinuncia_chiude_i_canali() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        vm.warp(block.timestamp + game.REVEAL_SECONDS() + 1);
        game.jungledidakooForfeit(accordo());
        assertFalse(registro.canPublish(CANALE_P, sessionA));
        assertFalse(registro.canPublish(CANALE_P, sessionB));
    }

    function test_una_sessione_e_di_un_wallet_solo() public {
        apri(a, sessionA);
        compra(b);
        vm.deal(b, b.balance + POSTA);
        vm.prank(b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA);
        assertEq(game.sessionOf(sessionA), a, "la sessione e' di a");
        assertTrue(registro.canPublish(CANALE_P, sessionA), "e parla");

        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(game.sessionOf(sessionA), a, "resa la sessione resta di a");
        assertFalse(registro.canPublish(CANALE_P, sessionA), "ma tace");
        vm.prank(b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA);
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
        vm.prank(b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA);

        apri(a, sessionA);
        assertTrue(registro.canPublish(CANALE_P, sessionA), "a la riapre e torna a parlare");
    }

    function test_la_voce_va_con_l_ultimo_posto_o_partita() public {
        avvia();
        assertEq(game.sessionOf(sessionA), a, "la partita in corso tiene la sessione");
        apri(a, sessionA);
        vm.prank(a);
        game.jungledidakooLeave();
        assertTrue(registro.canPublish(CANALE_P, sessionA), "il posto reso non toglie la voce alla partita");
        apri(a, sessionA);
        gioca();
        assertTrue(registro.canPublish(CANALE_P, sessionA), "la fine non toglie la voce al posto aperto");
        assertFalse(registro.canPublish(CANALE_P, sessionB), "l'altra sessione, senza posto, tace");
        assertEq(game.sessionOf(sessionB), b, "ma resta di b");
        vm.prank(a);
        game.jungledidakooLeave();
        assertFalse(registro.canPublish(CANALE_P, sessionA), "con l'ultimo posto la voce se ne va");
        assertEq(game.sessionOf(sessionA), a, "la sessione no");
    }

    function test_la_rinuncia_chiude_le_voci_e_tiene_le_sessioni() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        vm.warp(block.timestamp + game.REVEAL_SECONDS() + 1);
        game.jungledidakooForfeit(accordo());
        assertEq(game.sessionOf(sessionA), a);
        assertEq(game.sessionOf(sessionB), b);
        vm.deal(b, b.balance + POSTA);
        vm.prank(b);
        vm.expectRevert(JungleGame.SessionTaken.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA);
        apri(b, sessionB);
        assertEq(game.sessionOf(sessionB), b);
        assertTrue(registro.canPublish(CANALE_P, sessionB));
    }

    function test_un_registro_che_brucia_il_gas_non_ferma_il_posto() public {
        JungleGame ingordo = new JungleGame(
            IJunglePass(address(pass)),
            1,
            IStreamRegistry(address(new RegistroIngordo())),
            CANALE_P,
            CANALE_A,
            vm.addr(CHIAVE_D)
        );
        compra(a);
        vm.deal(a, a.balance + POSTA);
        vm.prank(a);
        uint256 prima = gasleft();
        ingordo.jungledidakooOpen{value: POSTA}(sessionA);
        uint256 speso = prima - gasleft();
        (address sessione,,) = ingordo.seats(a);
        assertEq(sessione, sessionA, "il posto si apre");
        assertLt(speso, 2 * ingordo.REGISTRY_GAS() + 300_000, "e il registro costa al piu' due tetti");
        vm.prank(a);
        ingordo.jungledidakooLeave();
        (sessione,,) = ingordo.seats(a);
        assertEq(sessione, address(0), "e si rende");
    }

    function test_senza_registro_il_posto_si_apre_lo_stesso() public {
        JungleGame senza = new JungleGame(
            IJunglePass(address(pass)),
            1,
            IStreamRegistry(address(0xdead)),
            CANALE_P,
            CANALE_A,
            vm.addr(CHIAVE_D)
        );
        compra(a);
        vm.deal(a, a.balance + POSTA);
        vm.prank(a);
        senza.jungledidakooOpen{value: POSTA}(sessionA);
        (address sessione,,) = senza.seats(a);
        assertEq(sessione, sessionA);

        JungleGame rifiutato = new JungleGame(
            IJunglePass(address(pass)),
            1,
            IStreamRegistry(address(registro)),
            CANALE_P,
            CANALE_A,
            vm.addr(CHIAVE_D)
        );
        vm.deal(b, b.balance + POSTA);
        compra(b);
        vm.prank(b);
        rifiutato.jungledidakooOpen{value: POSTA}(sessionB);
        (sessione,,) = rifiutato.seats(b);
        assertEq(sessione, sessionB, "il registro rifiuta il grant, il posto si apre");
        assertFalse(registro.canPublish(CANALE_P, sessionB));
    }

    function test_l_accordo_si_hasha_come_il_bundle() public view {
        assertEq(game.matchHash(accordo()), vm.parseJsonBytes32(json, ".game.matchHash"));
    }

    function test_la_posta_va_al_vincitore_e_il_commemorativo_pure() public {
        avvia();
        JungleGame.Game memory g = game.gameOf(gameId);
        uint256 inGioco = uint256(g.escrowWhite) + g.escrowBlack;
        assertEq(inGioco, 2 * (POSTA - game.FLOAT()), "due poste meno i due fondi");

        uint256 prima = bianco.balance;
        gioca();
        assertEq(bianco.balance - prima, inGioco, "i due resti al vincitore");
        assertEq(game.gameOf(gameId).payout, inGioco, "e la vincita e' scritta");
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
        vm.fee(10 gwei);
        vm.txGasPrice(5000 gwei);
        uint256 restoPrima = game.gameOf(gameId).escrowWhite;
        uint256 sessionePrima = sessioneBianca.balance;

        (,, uint8 da, uint8 dove) = ply(0);
        seqAtteso = atteso();
        vm.prank(sessioneBianca);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);

        uint256 rimborso = sessioneBianca.balance - sessionePrima;
        uint256 speso = restoPrima - game.gameOf(gameId).escrowWhite;
        assertEq(speso, rimborso, "dal resto del suo lato");
        assertLt(
            rimborso,
            200_000 * (10 gwei + game.REFUND_PRIORITY_CAP()),
            "al prezzo del tetto, non a quello dichiarato"
        );
    }

    function test_senza_pass_non_si_apre() public {
        vm.deal(a, POSTA);
        vm.prank(a);
        vm.expectRevert(JungleGame.NoPass.selector);
        game.jungledidakooOpen{value: POSTA}(sessionA);
    }

    function test_senza_pass_non_si_rivela() public {
        apri(a, sessionA);
        apri(b, sessionB);
        collezione.dai(a, 1, 0);

        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.NoPass.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());

        rivela(sessionB, semeB());
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, game.REVEALING(), "il seme di chi tiene il pass entra");
        assertEq(g.revealed, 2);

        vm.prank(sessionA);
        vm.expectRevert(JungleGame.NoPass.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());

        vm.warp(block.timestamp + game.REVEAL_SECONDS() + 1);
        uint256 prima = b.balance;
        game.jungledidakooForfeit(m);
        assertEq(game.gameOf(gameId).winner, b, "i due resti a chi ha rivelato");
        assertGt(b.balance, prima);
    }

    function test_senza_pass_la_rinuncia_aspetta_lo_stesso() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        JungleGame.Match memory m = accordo();

        collezione.dai(b, 1, 0);
        vm.expectRevert(JungleGame.StillRevealing.selector);
        game.jungledidakooForfeit(m);
        vm.warp(block.timestamp + game.REVEAL_SECONDS());
        vm.expectRevert(JungleGame.StillRevealing.selector);
        game.jungledidakooForfeit(m);

        (, uint128 escrowA,) = game.seats(a);
        (, uint128 escrowB,) = game.seats(b);
        uint256 prima = a.balance;
        vm.warp(block.timestamp + 1);
        vm.prank(sessionA);
        game.jungledidakooForfeit(m);

        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 2);
        assertEq(g.endReason, game.FORFEITED());
        assertEq(g.winner, a);
        assertEq(a.balance - prima, uint256(escrowA) + escrowB, "i due resti a chi ha rivelato, alla scadenza");
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.ownerOf(gameId);
    }

    function test_la_posta_e_esatta() public {
        compra(a);
        vm.deal(a, 2 * POSTA);
        vm.prank(a);
        vm.expectRevert(JungleGame.BadStake.selector);
        game.jungledidakooOpen{value: POSTA - 1}(sessionA);
        vm.prank(a);
        vm.expectRevert(JungleGame.BadStake.selector);
        game.jungledidakooOpen{value: POSTA + 1}(sessionA);
    }

    function test_l_apertura_anticipa_il_fondo_alla_sessione() public {
        uint256 prima = sessionA.balance;
        apri(a, sessionA);
        assertEq(sessionA.balance - prima, game.FLOAT(), "il fondo alla sessione");
        (address session, uint128 escrow,) = game.seats(a);
        assertEq(session, sessionA);
        assertEq(escrow, POSTA - game.FLOAT());
    }

    function test_il_fondo_si_rabbocca_a_quel_che_manca() public {
        vm.deal(sessionA, 0.25 ether);
        apri(a, sessionA);
        assertEq(sessionA.balance, game.FLOAT(), "la sessione arriva al fondo");
        (, uint128 escrow,) = game.seats(a);
        assertEq(escrow, POSTA - (game.FLOAT() - 0.25 ether), "il resto resta nel posto");
    }

    function test_la_sessione_gia_piena_non_riceve_niente() public {
        vm.deal(sessionA, 2 ether);
        apri(a, sessionA);
        assertEq(sessionA.balance, 2 ether, "niente alla sessione");
        (, uint128 escrow,) = game.seats(a);
        assertEq(escrow, POSTA, "la posta intera nel posto");
        uint256 prima = a.balance;
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(a.balance - prima, POSTA, "e torna intera");
    }

    function test_un_posto_solo_per_wallet() public {
        apri(a, sessionA);
        vm.deal(a, POSTA);
        vm.prank(a);
        vm.expectRevert(JungleGame.SeatOpen.selector);
        game.jungledidakooOpen{value: POSTA}(sessionB);
    }

    function test_il_posto_si_lascia_e_la_posta_torna() public {
        apri(a, sessionA);
        uint256 prima = a.balance;
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(a.balance - prima, POSTA - game.FLOAT(), "la posta meno il fondo gia' dato");
        (address session,,) = game.seats(a);
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
        assertTrue(game.sunset(), "la porta e' chiusa");
    }

    function test_il_tramonto_si_hasha_come_il_bundle() public {
        JungleGame.Deprecation memory d = JungleGame.Deprecation(
            uint16(vm.parseJsonUint(json, ".game.deprecation.minVersion")),
            uint64(vm.parseJsonUint(json, ".game.deprecation.notBefore"))
        );
        assertEq(game.deprecationHash(d), vm.parseJsonBytes32(json, ".game.deprecationHash"));
        game.jungledidakooSunset(d, vm.parseJsonBytes(json, ".game.deprecationSignature"));
        assertTrue(game.sunset());
    }

    function test_dopo_il_tramonto_nessun_posto_si_apre_e_quelli_aperti_tornano() public {
        apri(a, sessionA);
        spegni();

        compra(b);
        vm.deal(b, POSTA);
        vm.prank(b);
        vm.expectRevert(JungleGame.AfterSunset.selector);
        game.jungledidakooOpen{value: POSTA}(sessionB);

        uint256 prima = a.balance;
        vm.prank(a);
        game.jungledidakooLeave();
        assertEq(a.balance - prima, POSTA - game.FLOAT(), "il posto torna come sempre");
    }

    function test_dopo_il_tramonto_nessuna_partita_comincia() public {
        apri(a, sessionA);
        apri(b, sessionB);
        spegni();
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.AfterSunset.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_la_partita_in_rivelazione_parte_lo_stesso() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        spegni();
        rivela(sessionB, semeB());
        assertEq(game.gameOf(gameId).status, 1, "il secondo seme avvia");
    }

    function test_la_partita_in_corso_si_gioca_e_paga_dopo_il_tramonto() public {
        avvia();
        spegni();
        uint256 prima = bianco.balance;
        gioca();
        assertEq(game.gameOf(gameId).status, 2, "finita");
        assertEq(bianco.balance - prima, 2 * (POSTA - game.FLOAT()), "i due resti al vincitore");
        assertEq(memento.ownerOf(gameId), bianco, "e il commemorativo");
    }

    function test_il_tramonto_vuole_la_firma_di_D_e_una_volta_sola() public {
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
        assertTrue(game.sunset());

        vm.expectRevert(JungleGame.AfterSunset.selector);
        game.jungledidakooSunset(d, firma);
    }

    function test_senza_D_nessun_tramonto() public {
        JungleGame senza = new JungleGame(
            IJunglePass(address(pass)), 1, IStreamRegistry(address(registro)), CANALE_P, CANALE_A, address(0)
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

    function test_parte_solo_con_le_due_firme() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadSignature.selector);
        game.jungledidakooStart(m, sigB, sigA, semeA());
    }

    function test_il_seme_deve_tornare_al_commit() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadReveal.selector);
        game.jungledidakooStart(m, sigA, sigB, semeB());
    }

    function test_partono_solo_le_due_sessioni() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(address(0xBAD));
        vm.expectRevert(JungleGame.NotAPlayer.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_senza_i_due_posti_non_si_parte() public {
        apri(a, sessionA);
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.NoSeat.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_lo_stesso_accordo_non_parte_due_volte() public {
        avvia();
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.AlreadyStarted.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_la_categoria_e_arena_o_privata() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        m.category = 1;
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadCategory.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_l_accordo_manomesso_non_parte() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        m.t += 1;
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadMatch.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_i_due_commit_devono_essere_diversi() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        m.commitB = m.commitA;
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.SameCommit.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_il_limite_delle_ripetizioni_e_uno_solo() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        assertEq(m.repetitionLimit, game.REPETITION_LIMIT(), "il fixture porta il limite del motore");
        m.repetitionLimit = 16;
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadMatch.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
        m.repetitionLimit = 0;
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadMatch.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
    }

    function test_il_primo_seme_blocca_i_posti_e_il_secondo_avvia() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());

        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, game.REVEALING(), "in rivelazione");
        assertEq(g.revealed, 1, "il primo seme e' di a");
        assertEq(g.seed, semeA(), "e sta li' da solo");
        assertEq(g.lastAt, uint64(block.timestamp), "l'orologio dell'altro parte da qui");
        (,, uint256 bloccoA) = game.seats(a);
        (,, uint256 bloccoB) = game.seats(b);
        assertEq(bloccoA, gameId, "il posto di a e' della partita");
        assertEq(bloccoB, gameId, "e quello di b pure");

        vm.prank(b);
        vm.expectRevert(JungleGame.SeatBusy.selector);
        game.jungledidakooLeave();
        vm.prank(a);
        vm.expectRevert(JungleGame.SeatBusy.selector);
        game.jungledidakooLeave();

        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.AlreadyRevealed.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
        vm.prank(sessionB);
        vm.expectRevert(JungleGame.BadReveal.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());
        (,, uint8 da, uint8 dove) = ply(0);
        seqAtteso = atteso();
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.NotRunning.selector);
        game.jungledidakooMove(gameId, seqAtteso, da, dove);

        vm.warp(block.timestamp + 5);
        rivela(sessionB, semeB());
        g = game.gameOf(gameId);
        assertEq(g.status, 1, "in corso");
        assertEq(g.seed, semeA() ^ semeB(), "il seme e' lo XOR dei due");
        assertEq(g.seed, vm.parseJsonBytes32(json, ".game.seed"));
        assertEq(g.white, bianco);
        assertEq(g.lastAt, uint64(block.timestamp), "il turno del bianco parte dal secondo seme");
        (address sessione,,) = game.seats(a);
        assertEq(sessione, address(0), "i posti sono consumati");
    }

    function test_l_ordine_dei_due_semi_non_conta() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionB, semeB());
        assertEq(game.gameOf(gameId).revealed, 2, "il primo seme e' di b");
        rivela(sessionA, semeA());
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 1);
        assertEq(g.white, bianco, "lo stesso bianco");
        assertEq(g.board, vm.parseJsonUint(json, ".game.initialBoard"), "la stessa scacchiera");
    }

    function test_il_gas_del_primo_seme_torna_dal_posto() public {
        apri(a, sessionA);
        apri(b, sessionB);
        vm.txGasPrice(30 gwei);
        uint256 prima = sessionA.balance;
        rivela(sessionA, semeA());
        uint256 rimborso = sessionA.balance - prima;
        (, uint128 escrow,) = game.seats(a);
        assertGt(rimborso, 0, "qualcosa e' tornato");
        assertEq(POSTA - game.FLOAT() - escrow, rimborso, "dal posto di chi ha rivelato");
        (, uint128 escrowB,) = game.seats(b);
        assertEq(escrowB, POSTA - game.FLOAT(), "e non dall'altro");
    }

    function test_chi_non_rivela_perde_la_posta() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        JungleGame.Match memory m = accordo();

        vm.expectRevert(JungleGame.StillRevealing.selector);
        game.jungledidakooForfeit(m);
        vm.warp(block.timestamp + game.REVEAL_SECONDS());
        vm.expectRevert(JungleGame.StillRevealing.selector);
        game.jungledidakooForfeit(m);

        (, uint128 escrowA,) = game.seats(a);
        (, uint128 escrowB,) = game.seats(b);
        uint256 prima = a.balance;
        vm.warp(block.timestamp + 1);
        vm.prank(address(0xBAD));
        game.jungledidakooForfeit(m);

        assertEq(a.balance - prima, uint256(escrowA) + escrowB, "i due resti a chi ha rivelato");
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 2);
        assertEq(g.endReason, game.FORFEITED());
        assertEq(g.winner, a);
        assertEq(g.white, address(0), "nessuna partita giocata");
        assertEq(address(game).balance, 0);
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.ownerOf(gameId);
        (address sessione,,) = game.seats(b);
        assertEq(sessione, address(0), "i posti sono consumati");

        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.prank(sessionB);
        vm.expectRevert(JungleGame.AlreadyStarted.selector);
        game.jungledidakooStart(m, sigA, sigB, semeB());
        vm.expectRevert(JungleGame.NotRevealing.selector);
        game.jungledidakooForfeit(m);
    }

    function test_il_secondo_seme_in_ritardo_e_rifiutato() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        vm.warp(block.timestamp + game.REVEAL_SECONDS() + 1);
        vm.prank(sessionB);
        vm.expectRevert(JungleGame.RevealExpired.selector);
        game.jungledidakooStart(m, sigA, sigB, semeB());
        uint256 prima = a.balance;
        vm.prank(sessionB);
        game.jungledidakooForfeit(m);
        assertEq(game.gameOf(gameId).winner, a);
        assertGt(a.balance, prima);
    }

    function test_la_rinuncia_vuole_un_seme_in_attesa_dell_altro() public {
        JungleGame.Match memory m = accordo();
        vm.expectRevert(JungleGame.NotRevealing.selector);
        game.jungledidakooForfeit(m);
        avvia();
        vm.warp(block.timestamp + game.REVEAL_SECONDS() + 1);
        vm.expectRevert(JungleGame.NotRevealing.selector);
        game.jungledidakooForfeit(m);
        m.t += 1;
        vm.expectRevert(JungleGame.BadMatch.selector);
        game.jungledidakooForfeit(m);
    }

    function test_il_primo_seme_ha_una_finestra() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        bytes memory sigA = firmaA();
        bytes memory sigB = firmaB();
        uint256 t = m.t;

        vm.warp(t + game.AGREEMENT_SECONDS() + 1);
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.OutOfWindow.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());

        vm.warp(t - game.CLOCK_DRIFT_SECONDS() - 1);
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.OutOfWindow.selector);
        game.jungledidakooStart(m, sigA, sigB, semeA());

        vm.warp(t - game.CLOCK_DRIFT_SECONDS());
        rivela(sessionA, semeA());
        assertEq(game.gameOf(gameId).status, game.REVEALING(), "l'orologio del telefono avanti di un minuto passa");
        vm.warp(t + game.AGREEMENT_SECONDS());
        vm.prank(sessionB);
        vm.expectRevert(JungleGame.RevealExpired.selector);
        game.jungledidakooStart(m, sigA, sigB, semeB());
    }

    function test_il_secondo_seme_non_vuole_le_firme() public {
        apri(a, sessionA);
        apri(b, sessionB);
        JungleGame.Match memory m = accordo();
        bytes memory nulla = "";
        vm.prank(sessionA);
        vm.expectRevert(JungleGame.BadSignature.selector);
        game.jungledidakooStart(m, nulla, nulla, semeA());

        rivela(sessionA, semeA());
        vm.warp(block.timestamp + game.REVEAL_SECONDS());
        vm.prank(sessionB);
        game.jungledidakooStart(m, nulla, nulla, semeB());
        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 1, "in corso");
        assertEq(g.seed, semeA() ^ semeB());
        assertEq(g.white, bianco);
        assertEq(g.category, m.category, "la categoria e' quella del primo seme");
    }

    function test_il_secondo_seme_e_dei_posti_bloccati() public {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        JungleGame.Match memory m = accordo();
        bytes memory nulla = "";

        vm.prank(address(0xBAD));
        vm.expectRevert(JungleGame.NotAPlayer.selector);
        game.jungledidakooStart(m, nulla, nulla, semeB());

        uint8 firmata = m.category;
        m.category = firmata == game.ARENA() ? game.PRIVATE() : game.ARENA();
        vm.prank(sessionB);
        vm.expectRevert(JungleGame.BadMatch.selector);
        game.jungledidakooStart(m, nulla, nulla, semeB());
        m.category = firmata;

        JungleGame.Match memory altro = accordo();
        altro.t += 1;
        altro.gameId = game.gameIdOf(altro.a, altro.b, altro.commitA, altro.commitB, altro.t);
        vm.prank(sessionB);
        vm.expectRevert(JungleGame.SeatBusy.selector);
        game.jungledidakooStart(altro, nulla, nulla, semeB());
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

    function test_la_mossa_in_ritardo_e_rifiutata() public {
        avvia();
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        (,, uint8 da, uint8 dove) = ply(0);
        (uint64 fine, uint8 turno) = game.turnoDi(gameId);
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
        (uint64 fine, uint8 turno) = game.turnoDi(gameId);
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
            game.deadlineOf(gameId), uint64(block.timestamp) + game.PENALTY_SECONDS(), "e ha dieci secondi"
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
            game.deadlineOf(gameId),
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
        (, uint8 conteggio) = JungleRules.contatore(game.gameOf(gameId).repetitions, 1);
        assertEq(conteggio, 2, "due mosse dello stesso animale");

        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, nDove, nDa);
        vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
        seqAtteso = atteso();
        vm.prank(sessioneNera);
        game.jungledidakooMove(gameId, seqAtteso, nDa, nDove);
        (, conteggio) = JungleRules.contatore(game.gameOf(gameId).repetitions, 1);
        assertEq(conteggio, 0, "azzerato dal salto");
    }

    function test_la_resa_da_la_partita_all_altro() public {
        avvia();
        gioca(4);
        uint256 prima = bianco.balance;
        uint256 inGioco = uint256(game.gameOf(gameId).escrowWhite) + game.gameOf(gameId).escrowBlack;
        vm.prank(sessioneNera);
        game.jungledidakooResign(gameId);

        JungleGame.Game memory g = game.gameOf(gameId);
        assertEq(g.status, 2);
        assertEq(g.winner, bianco);
        assertEq(g.endReason, game.RESIGNED());
        assertEq(bianco.balance - prima, inGioco);
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
        assertEq(g.status, 2);
        assertEq(g.winner, address(0), "nessun vincitore");
        assertEq(g.endReason, game.ABANDONED());
        vm.expectRevert(JungleMemento.NoToken.selector);
        memento.ownerOf(gameId);
    }

    function test_chi_sparisce_lo_si_batte_camminando() public {
        avvia();
        JungleGame.Game memory g = game.gameOf(gameId);
        uint8[63] memory cella = JungleRules.apri(g.board);
        uint32 rip = g.repetitions;
        for (uint256 passi = 0; passi < 60; passi++) {
            g = game.gameOf(gameId);
            if (g.status == 2) break;
            cella = JungleRules.apri(g.board);
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

    function mossaDi(uint8 lato) internal view returns (uint8, uint8) {
        JungleGame.Game memory g = game.gameOf(gameId);
        uint16[] memory mosse =
            JungleRules.mosse(JungleRules.apri(g.board), g.repetitions, lato, g.repetitionLimit);
        return (uint8(mosse[0] >> 6), uint8(mosse[0] & 63));
    }

    function mossaNera() internal view returns (uint8, uint8) {
        JungleGame.Game memory g = game.gameOf(gameId);
        uint16[] memory mosse =
            JungleRules.mosse(JungleRules.apri(g.board), g.repetitions, 0, g.repetitionLimit);
        return (uint8(mosse[0] >> 6), uint8(mosse[0] & 63));
    }

    function versoLaTana(uint8[63] memory cella, uint32 rip, uint8 limite)
        internal
        pure
        returns (uint8, uint8)
    {
        uint16[] memory mosse = JungleRules.mosse(cella, rip, 1, limite);
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
