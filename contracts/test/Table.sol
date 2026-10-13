// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {JungleArt} from "../src/JungleArt.sol";
import {JungleReplay} from "../src/JungleReplay.sol";
import {JunglePass, IERC1155Balances} from "../src/JunglePass.sol";
import {JungleGame, IJunglePass, IJungleMemento, IStreamRegistry} from "../src/JungleGame.sol";
import {JungleMemento} from "../src/JungleMemento.sol";

contract CollezioneDiProva is IERC1155Balances {
    mapping(address => mapping(uint256 => uint256)) public saldo;
    mapping(uint256 => uint256) public coniate;

    constructor() {
        (coniate[1], coniate[5], coniate[6], coniate[7], coniate[8]) = (20000, 15000, 15000, 15000, 15000);
    }

    function dai(address chi, uint256 id, uint256 n) external {
        saldo[chi][id] = n;
    }

    function conia(uint256 id, uint256 n) external {
        coniate[id] = n;
    }

    function totalMinted(uint256 id) external view returns (uint256) {
        return coniate[id];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory out)
    {
        out = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            out[i] = saldo[accounts[i]][ids[i]];
        }
    }
}

contract RegistroDiProva is IStreamRegistry {
    mapping(string => mapping(address => bool)) public canPublish;
    mapping(string => mapping(address => bool)) public canGrant;

    function concedi(string calldata streamId, address chi) external {
        canGrant[streamId][chi] = true;
    }

    function grantPermission(string calldata streamId, address user, uint8 permissionType) external {
        require(canGrant[streamId][msg.sender], "no grant");
        require(permissionType == 2, "not publish");
        canPublish[streamId][user] = true;
    }

    function revokePermission(string calldata streamId, address user, uint8 permissionType) external {
        require(canGrant[streamId][msg.sender], "no grant");
        require(permissionType == 2, "not publish");
        canPublish[streamId][user] = false;
    }
}

contract RegistroIngordo is IStreamRegistry {
    function grantPermission(string calldata, address, uint8) external pure {
        assembly {
            invalid()
        }
    }

    function revokePermission(string calldata, address, uint8) external pure {
        assembly {
            invalid()
        }
    }
}

abstract contract Table is Test {
    JungleArt art;
    JungleReplay replay;
    JunglePass pass;
    JungleGame game;
    JungleMemento memento;
    RegistroDiProva registro;

    string constant CANALE_P = "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/jungle-didakoo";
    string constant CANALE_A = "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/didakoo-jungle-arena";

    address constant PROPRIETARIO = 0xf1e51457504edc0321DE4B6bA4403A1464c2B897;
    uint256 constant CHIAVE_D = 0xd1d;
    uint256 constant POSTA = 5 ether;
    CollezioneDiProva collezione;

    string json;
    address a;
    address b;
    address sessionA;
    address sessionB;
    address bianco;
    address nero;
    address sessioneBianca;
    address sessioneNera;
    uint256 gameId;
    uint256 quantiPly;
    uint32 seqAtteso;

    function setUp() public virtual {
        vm.chainId(137);
        vm.warp(1_772_000_000);

        art = new JungleArt();
        replay = new JungleReplay();
        collezione = new CollezioneDiProva();
        pass = new JunglePass(collezione);
        registro = new RegistroDiProva();
        json = vm.readFile("test/fixture/game.json");
        address contratto = vm.parseJsonAddress(json, ".game.contract");
        deployCodeTo(
            "JungleGame.sol:JungleGame",
            abi.encode(
                IJunglePass(address(pass)),
                uint16(1),
                IStreamRegistry(address(registro)),
                CANALE_P,
                CANALE_A,
                vm.addr(CHIAVE_D)
            ),
            contratto
        );
        game = JungleGame(contratto);
        registro.concedi(CANALE_P, contratto);
        registro.concedi(CANALE_A, contratto);
        memento = new JungleMemento(game, art, replay, PROPRIETARIO);
        game.setMemento(IJungleMemento(address(memento)));

        a = vm.parseJsonAddress(json, ".game.wallets.a");
        b = vm.parseJsonAddress(json, ".game.wallets.b");
        sessionA = vm.parseJsonAddress(json, ".game.sessions.a");
        sessionB = vm.parseJsonAddress(json, ".game.sessions.b");
        bianco = vm.parseJsonAddress(json, ".game.white");
        nero = vm.parseJsonAddress(json, ".game.black");
        sessioneBianca = bianco == a ? sessionA : sessionB;
        sessioneNera = bianco == a ? sessionB : sessionA;
        gameId = vm.parseJsonUint(json, ".game.match.gameId");
        quantiPly = vm.parseJsonBytes(json, ".game.moves").length / 2;
    }

    function accordo() internal view returns (JungleGame.Match memory m) {
        m.v = uint16(vm.parseJsonUint(json, ".game.match.v"));
        m.gameId = vm.parseJsonUint(json, ".game.match.gameId");
        m.a = vm.parseJsonAddress(json, ".game.match.a");
        m.b = vm.parseJsonAddress(json, ".game.match.b");
        m.commitA = vm.parseJsonBytes32(json, ".game.match.commitA");
        m.commitB = vm.parseJsonBytes32(json, ".game.match.commitB");
        m.category = uint8(vm.parseJsonUint(json, ".game.match.category"));
        m.repetitionLimit = uint8(vm.parseJsonUint(json, ".game.match.repetitionLimit"));
        m.turnS = uint8(vm.parseJsonUint(json, ".game.match.turnS"));
        m.penaltyS = uint8(vm.parseJsonUint(json, ".game.match.penaltyS"));
        m.graceS = uint8(vm.parseJsonUint(json, ".game.match.graceS"));
        m.t = uint64(vm.parseJsonUint(json, ".game.match.t"));
    }

    function firmaA() internal view returns (bytes memory) {
        return vm.parseJsonBytes(json, ".game.signatureA");
    }

    function firmaB() internal view returns (bytes memory) {
        return vm.parseJsonBytes(json, ".game.signatureB");
    }

    function semeA() internal view returns (bytes32) {
        return vm.parseJsonBytes32(json, ".game.seedA");
    }

    function semeB() internal view returns (bytes32) {
        return vm.parseJsonBytes32(json, ".game.seedB");
    }

    // The seq the client sends: the plies written plus the skips the move will record.
    function atteso() internal view returns (uint32) {
        (,,,, uint8 salti) = game.clockOf(gameId);
        return game.gameOf(gameId).seq + salti;
    }

    function ply(uint256 i) internal view returns (uint8 colore, bool saltato, uint8 da, uint8 dove) {
        string memory radice = string.concat(".game.plies[", vm.toString(i), "]");
        colore = uint8(vm.parseJsonUint(json, string.concat(radice, ".colour")));
        saltato = vm.parseJsonBool(json, string.concat(radice, ".skipped"));
        da = uint8(vm.parseJsonUint(json, string.concat(radice, ".from")));
        dove = uint8(vm.parseJsonUint(json, string.concat(radice, ".to")));
    }

    function compra(address chi) internal {
        collezione.dai(chi, 1, 1);
    }

    function apri(address wallet, address session) internal {
        compra(wallet);
        vm.deal(wallet, wallet.balance + POSTA);
        vm.prank(wallet);
        game.jungledidakooOpen{value: POSTA}(session);
    }

    function avvia() internal {
        apri(a, sessionA);
        apri(b, sessionB);
        rivela(sessionA, semeA());
        rivela(sessionB, semeB());
    }

    function rivela(address sessione, bytes32 seme) internal {
        vm.prank(sessione);
        game.jungledidakooStart(accordo(), firmaA(), firmaB(), seme);
    }

    function gioca() internal {
        gioca(quantiPly);
    }

    function gioca(uint256 fino) internal {
        for (uint256 i = 0; i < fino; i++) {
            (uint8 colore, bool saltato, uint8 da, uint8 dove) = ply(i);
            if (saltato) {
                vm.warp(block.timestamp + game.TURN_SECONDS() + 1);
                continue;
            }
            seqAtteso = atteso();
            vm.prank(colore == 1 ? sessioneBianca : sessioneNera);
            game.jungledidakooMove(gameId, seqAtteso, da, dove);
            if (i + 1 < fino) vm.warp(block.timestamp + 2);
        }
    }

    function contiene(string memory testo, string memory ago) internal pure returns (bool) {
        return quante(testo, ago) > 0;
    }

    function quante(string memory testo, string memory ago) internal pure returns (uint256 trovate) {
        bytes memory t = bytes(testo);
        bytes memory ag = bytes(ago);
        if (ag.length == 0 || t.length < ag.length) return 0;

        for (uint256 i = 0; i <= t.length - ag.length; i++) {
            uint256 j = 0;
            while (j < ag.length && t[i + j] == ag[j]) j++;
            if (j == ag.length) trovate++;
        }
    }
}
