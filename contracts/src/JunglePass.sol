// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

interface IERC1155Balances {
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory);

    function totalMinted(uint256 id) external view returns (uint256);
}

contract JunglePass {
    IERC1155Balances public immutable collection;

    uint256 public constant ID_1 = 1;
    uint256 public constant ID_5 = 5;
    uint256 public constant ID_6 = 6;
    uint256 public constant ID_7 = 7;
    uint256 public constant ID_8 = 8;

    uint256 public constant MINTED_1 = 20000;
    uint256 public constant MINTED_5 = 15000;
    uint256 public constant MINTED_6 = 15000;
    uint256 public constant MINTED_7 = 15000;
    uint256 public constant MINTED_8 = 15000;

    constructor(IERC1155Balances collection_) {
        collection = collection_;
    }

    function balanceOf(address wallet) external view returns (uint256 total) {
        address[] memory chi = new address[](5);
        uint256[] memory ids = new uint256[](5);
        uint256[] memory coniati = new uint256[](5);
        (ids[0], ids[1], ids[2], ids[3], ids[4]) = (ID_1, ID_5, ID_6, ID_7, ID_8);
        (coniati[0], coniati[1], coniati[2], coniati[3], coniati[4]) =
            (MINTED_1, MINTED_5, MINTED_6, MINTED_7, MINTED_8);
        for (uint256 i = 0; i < 5; i++) {
            chi[i] = wallet;
        }
        try collection.balanceOfBatch(chi, ids) returns (uint256[] memory saldi) {
            for (uint256 i = 0; i < saldi.length && i < 5; i++) {
                if (saldi[i] == 0 || !_intatta(ids[i], coniati[i])) continue;
                total += saldi[i];
            }
        } catch {
            return 0;
        }
    }

    function _intatta(uint256 id, uint256 coniate) internal view returns (bool) {
        try collection.totalMinted(id) returns (uint256 n) {
            return n <= coniate;
        } catch {
            return false;
        }
    }
}
