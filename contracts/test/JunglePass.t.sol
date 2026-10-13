// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {JunglePass, IERC1155Balances} from "../src/JunglePass.sol";

contract CollezioneFinta is IERC1155Balances {
    mapping(address => mapping(uint256 => uint256)) public saldo;
    mapping(uint256 => uint256) public coniate;
    bool public muta;
    bool public senzaConteggio;

    function dai(address chi, uint256 id, uint256 n) external {
        saldo[chi][id] = n;
    }

    function conia(uint256 id, uint256 n) external {
        coniate[id] = n;
    }

    function ammutolisci() external {
        muta = true;
    }

    function tacIlConteggio() external {
        senzaConteggio = true;
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory out)
    {
        require(!muta, "no");
        out = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            out[i] = saldo[accounts[i]][ids[i]];
        }
    }

    function totalMinted(uint256 id) external view returns (uint256) {
        require(!senzaConteggio, "no");
        return coniate[id];
    }
}

contract JunglePassTest is Test {
    CollezioneFinta collezione;
    JunglePass pass;
    address a = address(0xA1FA);
    address b = address(0xBE7A);

    function setUp() public {
        collezione = new CollezioneFinta();
        pass = new JunglePass(collezione);
        collezione.conia(1, pass.MINTED_1());
        collezione.conia(5, pass.MINTED_5());
        collezione.conia(6, pass.MINTED_6());
        collezione.conia(7, pass.MINTED_7());
        collezione.conia(8, pass.MINTED_8());
    }

    function test_il_pass_e_una_delle_cinque_edizioni() public {
        collezione.dai(a, 1, 1);
        collezione.dai(b, 8, 2);
        assertEq(pass.balanceOf(a), 1, "l'edizione 1");
        assertEq(pass.balanceOf(b), 2, "la rosa, due copie");
        assertEq(pass.balanceOf(address(0xC0FFEE)), 0, "chi non ne ha");
    }

    function test_le_edizioni_si_sommano() public {
        collezione.dai(a, 5, 1);
        collezione.dai(a, 7, 1);
        assertEq(pass.balanceOf(a), 2);
    }

    function test_un_altra_edizione_non_e_un_pass() public {
        collezione.dai(a, 2, 5);
        assertEq(pass.balanceOf(a), 0);
    }

    function test_una_collezione_che_non_risponde_e_nessun_pass() public {
        collezione.dai(a, 1, 1);
        collezione.ammutolisci();
        assertEq(pass.balanceOf(a), 0);
    }

    function test_i_conteggi_congelati_sono_quelli_del_2024() public view {
        assertEq(pass.MINTED_1(), 20000);
        assertEq(pass.MINTED_5(), 15000);
        assertEq(pass.MINTED_6(), 15000);
        assertEq(pass.MINTED_7(), 15000);
        assertEq(pass.MINTED_8(), 15000);
    }

    function test_una_copia_in_piu_spegne_la_sua_edizione_e_solo_quella() public {
        collezione.dai(a, 5, 3);
        collezione.dai(a, 1, 1);
        assertEq(pass.balanceOf(a), 4, "prima del conio");
        collezione.conia(5, pass.MINTED_5() + 1);
        assertEq(pass.balanceOf(a), 1, "la gialla non vale piu', la 1 si'");
        collezione.conia(1, pass.MINTED_1() + 1);
        assertEq(pass.balanceOf(a), 0, "nessuna delle due");
    }

    function test_una_copia_bruciata_non_riapre_niente() public {
        collezione.dai(a, 6, 1);
        collezione.conia(6, pass.MINTED_6() - 1);
        assertEq(pass.balanceOf(a), 1, "meno copie di quelle congelate vanno bene");
    }

    function test_un_conteggio_che_non_risponde_e_nessun_pass() public {
        collezione.dai(a, 1, 1);
        collezione.tacIlConteggio();
        assertEq(pass.balanceOf(a), 0);
    }

    function test_la_collezione_e_quella_nominata() public view {
        assertEq(address(pass.collection()), address(collezione));
    }
}
