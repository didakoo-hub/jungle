// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {JungleGame} from "./JungleGame.sol";
import {JungleArt} from "./JungleArt.sol";
import {JungleReplay} from "./JungleReplay.sol";
import {JungleSeed} from "./JungleSeed.sol";

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

contract JungleMemento {

    string public constant name = "Jungle didakoo records";
    string public constant symbol = "JUNGLE";

    JungleGame public immutable game;
    JungleArt public immutable art;
    JungleReplay public immutable replay;

    address public immutable owner;

    uint256 private constant PYRAMID_BLACK = 3;
    uint256 private constant PYRAMID_WHITE = 59;

    uint256 private constant BAND = 44;

    uint256 public constant REPLAY_PLY_CAP = 2000;

    struct Drawing {
        uint128 board;
        uint8 colors;
        uint8 category;
        uint8 endReason;
        uint32 moveCount;
        uint64 mintedAt;
        address winner;
        address loser;
        bool winnerIsWhite;
        bytes32 seed;
    }

    mapping(uint256 tokenId => Drawing) public drawing;

    mapping(uint256 tokenId => address holder) private _owner;
    mapping(address holder => uint256 count) private _balance;
    mapping(uint256 tokenId => address spender) public getApproved;
    mapping(address holder => mapping(address operator => bool)) public isApprovedForAll;

    address[] private _holders;
    mapping(address holder => uint256 index) private _holderIndex;
    mapping(address holder => uint256[] tokens) private _owned;
    mapping(uint256 tokenId => uint256 index) private _ownedIndex;

    mapping(address holder => uint64 since) private _da;

    uint256 public totalMinted;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed holder, address indexed spender, uint256 indexed tokenId);
    event ApprovalForAll(address indexed holder, address indexed operator, bool approved);

    error NotTheGame();
    error NotOver();
    error AlreadyMinted();
    error NoToken();
    error NotAuthorized();
    error BadRecipient();
    error ZeroAddress();

    constructor(JungleGame game_, JungleArt art_, JungleReplay replay_, address owner_) {
        game = game_;
        art = art_;
        replay = replay_;
        owner = owner_;
    }

    function mint(uint256 gameId) external {
        if (msg.sender != address(game)) revert NotTheGame();
        JungleGame.Game memory g = game.gameOf(gameId);
        if (g.status != 2 || g.winner == address(0)) revert NotOver();
        if (_owner[gameId] != address(0)) revert AlreadyMinted();

        drawing[gameId] = Drawing({
            board: uint128(g.board),
            colors: g.colors,
            category: g.category,
            endReason: g.endReason,
            moveCount: g.seq,
            mintedAt: uint64(block.timestamp),
            winner: g.winner,
            loser: g.winner == g.white ? g.black : g.white,
            winnerIsWhite: g.winner == g.white,
            seed: g.seed
        });

        _aggiungi(g.winner, gameId);
        totalMinted += 1;
        emit Transfer(address(0), g.winner, gameId);
    }

    function holdersCount() external view returns (uint256) {
        return _holders.length;
    }

    function holdersPage(uint256 from, uint256 n)
        external
        view
        returns (address[] memory chi, uint256[] memory saldi, uint64[] memory da)
    {
        uint256 fine = from + n;
        if (fine > _holders.length) fine = _holders.length;
        uint256 quanti = fine > from ? fine - from : 0;
        chi = new address[](quanti);
        saldi = new uint256[](quanti);
        da = new uint64[](quanti);
        for (uint256 i = 0; i < quanti; i++) {
            chi[i] = _holders[from + i];
            saldi[i] = _balance[chi[i]];
            da[i] = _da[chi[i]];
        }
    }

    function heldSince(address holder) external view returns (uint64) {
        return _da[holder];
    }

    function tokensOf(address holder) external view returns (uint256[] memory) {
        return _owned[holder];
    }

    function _aggiungi(address to, uint256 tokenId) private {
        if (_balance[to] == 0) {
            _holders.push(to);
            _holderIndex[to] = _holders.length;
        }
        unchecked {
            _balance[to] += 1;
        }
        _owned[to].push(tokenId);
        _ownedIndex[tokenId] = _owned[to].length;
        _owner[tokenId] = to;
        _da[to] = uint64(block.timestamp);
    }

    function _togli(address from, uint256 tokenId) private {
        uint256[] storage suoi = _owned[from];
        uint256 i = _ownedIndex[tokenId] - 1;
        uint256 ultimo = suoi[suoi.length - 1];
        suoi[i] = ultimo;
        _ownedIndex[ultimo] = i + 1;
        suoi.pop();
        delete _ownedIndex[tokenId];
        unchecked {
            _balance[from] -= 1;
        }
        if (_balance[from] == 0) {
            uint256 h = _holderIndex[from] - 1;
            address last = _holders[_holders.length - 1];
            _holders[h] = last;
            _holderIndex[last] = h + 1;
            _holders.pop();
            delete _holderIndex[from];
            delete _da[from];
        } else {
            _da[from] = uint64(block.timestamp);
        }
    }

    function winnerOf(uint256 tokenId) external view returns (address) {
        if (_owner[tokenId] == address(0)) revert NoToken();
        return drawing[tokenId].winner;
    }

    function opponentOf(uint256 tokenId) external view returns (address) {
        if (_owner[tokenId] == address(0)) revert NoToken();
        return drawing[tokenId].loser;
    }

    function mintedAt(uint256 tokenId) external view returns (uint64) {
        if (_owner[tokenId] == address(0)) revert NoToken();
        return drawing[tokenId].mintedAt;
    }

    function ownerOf(uint256 tokenId) public view returns (address holder) {
        holder = _owner[tokenId];
        if (holder == address(0)) revert NoToken();
    }

    function balanceOf(address holder) external view returns (uint256) {
        if (holder == address(0)) revert ZeroAddress();
        return _balance[holder];
    }

    function approve(address spender, uint256 tokenId) external {
        address holder = ownerOf(tokenId);
        if (msg.sender != holder && !isApprovedForAll[holder][msg.sender]) revert NotAuthorized();

        getApproved[tokenId] = spender;
        emit Approval(holder, spender, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (from != ownerOf(tokenId)) revert NotAuthorized();
        if (to == address(0)) revert BadRecipient();
        if (msg.sender != from && msg.sender != getApproved[tokenId] && !isApprovedForAll[from][msg.sender]) {
            revert NotAuthorized();
        }

        delete getApproved[tokenId];
        _togli(from, tokenId);
        _aggiungi(to, tokenId);
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            bytes4 answer = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
            if (answer != IERC721Receiver.onERC721Received.selector) revert BadRecipient();
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    function contractURI() external view returns (string memory) {
        string memory json = string.concat(
            '{"name":"',
            name,
            '","description":"Match tokens of Jungle didakoo on Polygon.',
            " One token per game won on-chain; each token held is one ranking point.",
            '","image":"data:image/svg+xml;base64,',
            _base64(bytes(emblem())),
            '"}'
        );
        return string.concat("data:application/json;base64,", _base64(bytes(json)));
    }

    function emblem() public view returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 245 800 800" width="800" height="800">'
            '<rect x="100" y="245" width="800" height="800" fill="#000000"/><g fill="',
            _pieceColor(4),
            '" fill-rule="evenodd">',
            art.animal(7),
            "</g></svg>"
        );
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        Drawing memory d = drawing[tokenId];
        if (_owner[tokenId] == address(0)) revert NoToken();

        bytes memory moves = game.gameOf(tokenId).moves;
        string memory json = string.concat(
            '{"name":"Jungle didakoo #',
            _short(tokenId),
            '","image":"data:image/svg+xml;base64,',
            _base64(bytes(_draw(d, uint128(d.board), false))),
            moves.length > 2 * REPLAY_PLY_CAP
                ? ""
                : string.concat('","animation_url":"data:text/html;base64,', _base64(bytes(_page(d, moves)))),
            '","attributes":[',
            _attributes(d),
            "]}"
        );
        return string.concat("data:application/json;base64,", _base64(bytes(json)));
    }

    function image(uint256 tokenId) external view returns (string memory) {
        Drawing memory d = drawing[tokenId];
        if (_owner[tokenId] == address(0)) revert NoToken();
        return _draw(d, uint128(d.board), false);
    }

    function animation(uint256 tokenId) external view returns (string memory) {
        Drawing memory d = drawing[tokenId];
        if (_owner[tokenId] == address(0)) revert NoToken();
        return _page(d, game.gameOf(tokenId).moves);
    }

    function attributes(uint256 tokenId) external view returns (string memory) {
        Drawing memory d = drawing[tokenId];
        if (_owner[tokenId] == address(0)) revert NoToken();
        return _attributes(d);
    }

    function _attributes(Drawing memory d) private pure returns (string memory) {
        string memory out = string.concat(
            '{"trait_type":"Winner","value":"',
            _hex(d.winner),
            '"},{"trait_type":"Opponent","value":"',
            _opponent(d),
            '"}'
        );
        out = string.concat(
            out,
            ',{"trait_type":"Category","value":"',
            _categoryName(d.category),
            '"},{"display_type":"date","trait_type":"Minted","value":',
            _u(d.mintedAt),
            "}"
        );
        out = string.concat(
            out,
            ',{"trait_type":"Ending","value":"',
            _endName(d.endReason),
            '"},{"trait_type":"Moves","value":',
            _u(d.moveCount),
            "}"
        );
        return out;
    }

    function _opponent(Drawing memory d) private pure returns (string memory) {
        return _hex(d.loser);
    }

    function _categoryName(uint8 category) private pure returns (string memory) {
        if (category == 1) return "Bot";
        if (category == 2) return "Arena";
        if (category == 3) return "Private";
        return "None";
    }

    function _endName(uint8 endReason) private pure returns (string memory) {
        if (endReason == 1) return "Pyramid";
        if (endReason == 2) return "Quit";
        if (endReason == 3) return "Abandoned";
        if (endReason == 4) return "Wipeout";
        return "None";
    }

    function _draw(Drawing memory d, uint128 board, bool ids) private view returns (string memory) {
        bytes memory out = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
            ' viewBox="0 -',
            _u(BAND),
            ' 560 ',
            _u(720 + BAND * 2),
            '" width="560" height="',
            _u(720 + BAND * 2),
            '">',
            _defs(d, board),
            '<rect width="560" height="720" fill="',
            ((d.colors >> 6) & 1) == 1 ? "#89cd9f" : "#feb442",
            '"/>',
            _place("r", 80, 240, ".04"),
            _place("r", 320, 240, ".04")
        );

        out = abi.encodePacked(
            out,
            _place("t", 160, 0, ".08"),
            _place("t", 320, 0, ".08"),
            _place("t", 240, 80, ".08"),
            _place("t", 160, 640, ".08"),
            _place("t", 320, 640, ".08"),
            _place("t", 240, 560, ".08")
        );

        if (!_occupied(board, PYRAMID_BLACK)) out = abi.encodePacked(out, _place(ids ? "d0\" id=\"d0" : "d0", 240, 0, ".08"));
        if (!_occupied(board, PYRAMID_WHITE)) out = abi.encodePacked(out, _place(ids ? "d1\" id=\"d1" : "d1", 240, 640, ".08"));

        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 cell = (uint256(board) >> (slot * 7)) & 0x7f;
            if (cell & 64 == 0) continue;
            if ((cell & 63) > 62) continue;
            out = abi.encodePacked(out, _piece(d, slot, cell & 63, ids));
        }

        return string(abi.encodePacked(out, _bands(d), "</svg>"));
    }

    function _bands(Drawing memory d) private pure returns (string memory) {
        string memory winner = _hex(d.winner);
        string memory loser = _opponent(d);
        return string.concat(
            _band(d.winnerIsWhite ? loser : winner, d.colors & 7, true),
            _band(d.winnerIsWhite ? winner : loser, (d.colors >> 3) & 7, false)
        );
    }

    function _band(string memory who, uint8 color, bool above) private pure returns (string memory) {
        return string.concat(
            '<rect y="',
            above ? string.concat("-", _u(BAND)) : _u(720),
            '" width="560" height="',
            _u(BAND),
            '" fill="#111111"/><text x="280" y="',
            above ? string.concat("-", _u(BAND - 30)) : _u(720 + 30),
            '" fill="',
            _bandColor(color),
            '" font-family="monospace" font-size="20" text-anchor="middle">',
            who,
            "</text>"
        );
    }

    function _bandColor(uint8 id) private pure returns (string memory) {
        return id == 5 ? "#fefffe" : _pieceColor(id);
    }

    function _defs(Drawing memory d, uint128 board) private view returns (string memory) {
        bytes memory out =
            abi.encodePacked("<defs>", _river(), '<g id="t" fill-rule="evenodd">', art.trap(), "</g>");

        if (!_occupied(board, PYRAMID_BLACK)) {
            out = abi.encodePacked(out, '<g id="d0" fill-rule="evenodd">', art.pyramid(d.colors & 7), "</g>");
        }
        if (!_occupied(board, PYRAMID_WHITE)) {
            out = abi.encodePacked(out, '<g id="d1" fill-rule="evenodd">', art.pyramid((d.colors >> 3) & 7), "</g>");
        }

        for (uint256 animal = 0; animal < 8; animal++) {
            if (!_alive(board, animal) && !_alive(board, animal + 8)) continue;
            out = abi.encodePacked(
                out, '<g id="a', _u(animal), '" fill-rule="evenodd">', art.animal(animal), "</g>"
            );
        }
        return string(abi.encodePacked(out, "</defs>"));
    }

    function _alive(uint128 board, uint256 slot) private pure returns (bool) {
        return ((uint256(board) >> (slot * 7)) & 64) != 0;
    }

    function _occupied(uint128 board, uint256 square) private pure returns (bool) {
        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 cell = (uint256(board) >> (slot * 7)) & 0x7f;
            if (cell & 64 != 0 && (cell & 63) == square) return true;
        }
        return false;
    }

    function _place(string memory id, uint256 x, uint256 y, string memory scale)
        private
        pure
        returns (string memory)
    {
        return string.concat(
            '<use xlink:href="#',
            id,
            '" href="#',
            id,
            '" transform="translate(',
            _u(x),
            " ",
            _u(y),
            ") scale(",
            scale,
            ')"/>'
        );
    }

    function _piece(Drawing memory d, uint256 slot, uint256 cell, bool ids) private view returns (string memory) {
        uint256 animal = slot % 8;
        uint8 color = slot < 8 ? d.colors & 7 : (d.colors >> 3) & 7;
        string memory fill = (animal == 0 && color == 3 && _water(cell)) ? "#99b3e6" : _pieceColor(color);

        return string.concat(
            '<use xlink:href="#a',
            _u(animal),
            '" href="#a',
            _u(animal),
            ids ? string.concat('" id="p', _u(slot)) : "",
            '" fill="',
            fill,
            ids ? '" style="transform:translate(' : '" transform="translate(',
            _u((cell % 7) * 80),
            ids ? "px," : " ",
            _u((cell / 7) * 80),
            ids ? 'px) scale(.08)"/>' : ') scale(.08)"/>'
        );
    }

    function _page(Drawing memory d, bytes memory moves) private view returns (string memory) {
        uint128 iniziale = uint128(JungleSeed.scacchieraIniziale(d.seed));
        return string.concat(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}'
            "svg{display:block;width:100%;height:100%}</style></head><body>",
            _draw(d, iniziale, true),
            "<script>var S=",
            _slots(iniziale),
            ",M=",
            _plies(moves),
            ",B=",
            _blueSide(d.colors),
            ",C=['",
            _pieceColor(d.colors & 7),
            "','",
            _pieceColor((d.colors >> 3) & 7),
            "'];</script>",
            replay.script(),
            "</body></html>"
        );
    }

    function _slots(uint128 board) private pure returns (string memory) {
        bytes memory out = "[";
        for (uint256 slot = 0; slot < 16; slot++) {
            uint256 cell = (uint256(board) >> (slot * 7)) & 0x7f;
            out = abi.encodePacked(out, slot == 0 ? "" : ",", cell & 64 != 0 ? _u(cell & 63) : "-1");
        }
        return string(abi.encodePacked(out, "]"));
    }

    function _plies(bytes memory moves) private pure returns (string memory) {
        uint256 n = moves.length / 2;
        bytes memory out = new bytes(2 + n * 8);
        uint256 p;
        out[p++] = "[";
        for (uint256 i = 0; i < n; i++) {
            uint16 v = (uint16(uint8(moves[2 * i])) << 8) | uint8(moves[2 * i + 1]);
            if (i != 0) out[p++] = ",";
            out[p++] = "[";
            p = _digits(out, p, (v >> 6) & 63);
            out[p++] = ",";
            p = _digits(out, p, v & 63);
            out[p++] = "]";
        }
        out[p++] = "]";
        assembly {
            mstore(out, p)
        }
        return string(out);
    }

    function _digits(bytes memory out, uint256 p, uint256 value) private pure returns (uint256) {
        if (value >= 10) out[p++] = bytes1(uint8(48 + value / 10));
        out[p++] = bytes1(uint8(48 + value % 10));
        return p;
    }

    function _blueSide(uint8 colors) private pure returns (string memory) {
        if (((colors >> 3) & 7) == 3) return "1";
        if ((colors & 7) == 3) return "0";
        return "-1";
    }

    function _water(uint256 cell) private pure returns (bool) {
        uint256 row = cell / 7;
        uint256 col = cell % 7;
        return row > 2 && row < 6 && col != 0 && col != 3 && col != 6;
    }

    string constant WAVE = "M-860 -102c349 0 333 407 682 407c349 0 333-407 682-407c349 0 333 407 682 407c349 0 333-407 682-407c349 0 333 407 682 407c349 0 333-407 682-407c349 0 333 407 682 407c349 0 333-407 682-407";

    function _river() private pure returns (string memory) {
        bytes memory out = abi.encodePacked(
            '<path id="v" fill="none" d="',
            WAVE,
            '"/><clipPath id="cr"><rect width="4000" height="6000"/></clipPath>',
            '<g id="r" clip-path="url(#cr)"><rect width="4000" height="6000" fill="#07569c"/>'
        );
        for (uint256 k = 0; k < 8; k++) {
            out = abi.encodePacked(
                out, _wave(782 * k, "#47b8ec", 92), _wave(391 + 782 * k, "#0a75ba", 73)
            );
        }
        return string(abi.encodePacked(out, "</g>"));
    }

    function _wave(uint256 y, string memory color, uint256 width) private pure returns (string memory) {
        return string.concat(
            '<use xlink:href="#v" href="#v" y="',
            _u(y),
            '" stroke="',
            color,
            '" stroke-width="',
            _u(width),
            '"/>'
        );
    }

    function _pieceColor(uint8 id) private pure returns (string memory) {
        if (id == 1) return "#e9e954";
        if (id == 2) return "#ed3634";
        if (id == 3) return "#3a60a3";
        if (id == 4) return "#ed5d80";
        if (id == 5) return "#000000";
        return "#fefffe";
    }

    function _i(int256 value) private pure returns (string memory) {
        return value < 0 ? string.concat("-", _u(uint256(-value))) : _u(uint256(value));
    }

    function _hex(address who) private pure returns (string memory) {
        bytes memory digits = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 value = uint160(who);
        for (uint256 i = 0; i < 40; i++) {
            out[41 - i] = digits[(value >> (i * 4)) & 15];
        }
        return string(out);
    }

    function _short(uint256 value) private pure returns (string memory) {
        bytes memory digits = "0123456789abcdef";
        bytes memory out = new bytes(10);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 8; i++) {
            out[9 - i] = digits[(value >> (224 + i * 4)) & 15];
        }
        return string(out);
    }

    function _u(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 length;
        for (uint256 n = value; n != 0; n /= 10) {
            length++;
        }
        bytes memory out = new bytes(length);
        while (value != 0) {
            length--;
            out[length] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(out);
    }

    function _base64(bytes memory data) internal pure returns (string memory result) {
        if (data.length == 0) return "";
        string memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory pairs = new bytes(8192);
        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        result = new string(encodedLen + 64);

        assembly {
            let tablePtr := add(table, 32)
            let pairsPtr := add(pairs, 32)
            let low := mload(0x40)
            mstore(low, 0)
            mstore(add(low, 32), 0)
            mstore(add(low, 64), 0)
            mstore(add(low, 96), 0)
            for { let j := 0 } lt(j, 64) { j := add(j, 1) } {
                let p := add(low, shl(5, shr(4, j)))
                mstore(p, or(mload(p), shl(sub(240, shl(4, and(j, 15))), byte(0, mload(add(tablePtr, j))))))
            }
            let spread := mul(div(not(0), 0xffff), 0x100)
            for { let hi := 0 } lt(hi, 64) { hi := add(hi, 1) } {
                let h := mul(byte(0, mload(add(tablePtr, hi))), spread)
                let row := add(pairsPtr, shl(7, hi))
                mstore(row, or(h, mload(low)))
                mstore(add(row, 32), or(h, mload(add(low, 32))))
                mstore(add(row, 64), or(h, mload(add(low, 64))))
                mstore(add(row, 96), or(h, mload(add(low, 96))))
            }

            let resultPtr := add(result, 32)
            let dataPtr := add(data, 32)
            let endPtr := add(dataPtr, mload(data))
            for {} lt(dataPtr, endPtr) {} {
                let input := mload(dataPtr)
                let w := 0
                w := or(w, shl(240, shr(240, mload(add(pairsPtr, shl(1, and(shr(244, input), 0xfff)))))))
                w := or(w, shl(224, shr(240, mload(add(pairsPtr, shl(1, and(shr(232, input), 0xfff)))))))
                w := or(w, shl(208, shr(240, mload(add(pairsPtr, shl(1, and(shr(220, input), 0xfff)))))))
                w := or(w, shl(192, shr(240, mload(add(pairsPtr, shl(1, and(shr(208, input), 0xfff)))))))
                w := or(w, shl(176, shr(240, mload(add(pairsPtr, shl(1, and(shr(196, input), 0xfff)))))))
                w := or(w, shl(160, shr(240, mload(add(pairsPtr, shl(1, and(shr(184, input), 0xfff)))))))
                w := or(w, shl(144, shr(240, mload(add(pairsPtr, shl(1, and(shr(172, input), 0xfff)))))))
                w := or(w, shl(128, shr(240, mload(add(pairsPtr, shl(1, and(shr(160, input), 0xfff)))))))
                w := or(w, shl(112, shr(240, mload(add(pairsPtr, shl(1, and(shr(148, input), 0xfff)))))))
                w := or(w, shl(96, shr(240, mload(add(pairsPtr, shl(1, and(shr(136, input), 0xfff)))))))
                w := or(w, shl(80, shr(240, mload(add(pairsPtr, shl(1, and(shr(124, input), 0xfff)))))))
                w := or(w, shl(64, shr(240, mload(add(pairsPtr, shl(1, and(shr(112, input), 0xfff)))))))
                w := or(w, shl(48, shr(240, mload(add(pairsPtr, shl(1, and(shr(100, input), 0xfff)))))))
                w := or(w, shl(32, shr(240, mload(add(pairsPtr, shl(1, and(shr(88, input), 0xfff)))))))
                w := or(w, shl(16, shr(240, mload(add(pairsPtr, shl(1, and(shr(76, input), 0xfff)))))))
                w := or(w, shl(0, shr(240, mload(add(pairsPtr, shl(1, and(shr(64, input), 0xfff)))))))
                mstore(resultPtr, w)
                resultPtr := add(resultPtr, 32)
                dataPtr := add(dataPtr, 24)
            }
            let tail := add(add(result, 32), encodedLen)
            switch mod(mload(data), 3)
            case 1 { mstore(sub(tail, 2), shl(240, 0x3d3d)) }
            case 2 { mstore(sub(tail, 1), shl(248, 0x3d)) }
            mstore(result, encodedLen)
        }
    }
}
