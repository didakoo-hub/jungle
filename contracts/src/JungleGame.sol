// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {JungleRules} from "./JungleRules.sol";
import {JungleSeed} from "./JungleSeed.sol";

interface IJunglePass {
    function balanceOf(address holder) external view returns (uint256);
}

interface IJungleMemento {
    function mint(uint256 gameId) external;
}

interface IStreamRegistry {
    function grantPermission(string calldata streamId, address user, uint8 permissionType) external;
    function revokePermission(string calldata streamId, address user, uint8 permissionType) external;
}

contract JungleGame {

    uint256 public constant STAKE = 5 ether;

    uint256 public constant FLOAT = 1 ether;

    uint64 public constant TURN_SECONDS = 20;

    uint64 public constant PENALTY_SECONDS = 10;

    uint64 public constant IDLE_SECONDS = 600;

    uint8 public constant REPETITION_LIMIT = 6;

    uint64 public constant START_SECONDS = 5;

    uint256 public constant SEED_BLOCKS = 256;

    uint256 public constant REFUND_OVERHEAD = 36_000;

    uint256 public constant REFUND_PRIORITY_CAP = 60 gwei;

    uint256 public constant PASS_GAS = 300_000;

    uint8 private constant NO_SQUARE = 63;

    uint8 private constant BLACK_DEN = 3;
    uint8 private constant WHITE_DEN = 59;

    uint8 public constant ARENA = 2;
    uint8 public constant PRIVATE = 3;

    uint8 public constant PYRAMID = 1;
    uint8 public constant RESIGNED = 2;
    uint8 public constant ABANDONED = 3;
    uint8 public constant WIPEOUT = 4;

    struct Deprecation {
        uint16 minVersion;
        uint64 notBefore;
    }

    struct Seat {
        address session;
        uint128 escrow;
        uint256 gameId;
        uint8 category;
        address invite;
        uint16 v;
    }

    struct Game {
        address white;
        address black;
        address sessionWhite;
        address sessionBlack;
        uint128 escrowWhite;
        uint128 escrowBlack;
        uint256 board;
        uint32 repetitions;
        uint8 turn;
        uint8 penalized;
        uint32 seq;
        uint64 lastAt;
        uint8 repetitionLimit;
        uint8 colors;
        uint8 category;
        bytes32 seed;
        uint8 status;
        uint64 seedBlock;
        address winner;
        uint8 endReason;
        bytes moves;
    }

    IJunglePass public immutable pass;
    uint16 public minVersion;
    bytes32 public immutable gameDomainSeparator;

    address public immutable deprecator;

    IStreamRegistry public immutable registry;
    string public channelP;
    uint8 private constant PUBLISH = 2;
    uint256 public constant REGISTRY_GAS = 200_000;

    address private immutable deployer;
    IJungleMemento public memento;

    mapping(address wallet => Seat) public seats;
    mapping(uint256 gameId => Game) private games;

    mapping(uint16 v => address wallet) public waiting;
    uint256 private paired;

    mapping(address session => address wallet) public sessionOf;
    mapping(address session => uint8 count) private sessionUses;

    mapping(address wallet => uint256 amount) public owed;

    bool private locked;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant DEPRECATION_TYPEHASH =
        keccak256("Deprecation(uint16 minVersion,uint64 notBefore)");

    event Opened(address indexed wallet, address indexed session, uint8 category);
    event Left(address indexed wallet);
    event Paired(uint256 indexed gameId, address indexed a, address indexed b, uint8 category);
    event Started(uint256 indexed gameId, address indexed white, address indexed black, uint8 category);
    event Moved(uint256 indexed gameId, uint32 seq, uint8 colour, uint8 from, uint8 to);
    event Finished(uint256 indexed gameId, address indexed winner, uint8 endReason);
    event Closed(uint256 indexed gameId);
    event Sunset(uint16 minVersion, uint64 notBefore);

    error NotDeployer();
    error MementoSet();
    error BadStake();
    error BadSession();
    error SeatOpen();
    error SessionTaken();
    error NoSeat();
    error SeatBusy();
    error VersionTooOld();
    error OtherVersion();
    error BadCategory();
    error BadInvite();
    error BadSignature();
    error SeedNotReady();
    error SeedExpired();
    error NotRunning();
    error NotAPlayer();
    error NotYourTurn();
    error StaleMove();
    error Idle();
    error BadMove();
    error StillPlaying();
    error PayoutFailed();
    error Reentered();
    error BadDeprecation();
    error NotYet();
    error LowGas();
    error NotOrigin();

    constructor(
        IJunglePass pass_,
        uint16 minVersion_,
        IStreamRegistry registry_,
        string memory channelP_,
        address deprecator_
    ) {
        pass = pass_;
        minVersion = minVersion_;
        deprecator = deprecator_;
        registry = registry_;
        channelP = channelP_;
        deployer = msg.sender;
        gameDomainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("Jungle"), keccak256("1"), block.chainid, address(this))
        );
    }

    function setMemento(IJungleMemento memento_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(memento) != address(0)) revert MementoSet();
        memento = memento_;
    }

    modifier nonReentrant() {
        if (locked) revert Reentered();
        locked = true;
        _;
        locked = false;
    }

    function jungledidakooOpen(address session, uint8 category, address invite, uint16 v)
        external
        payable
        nonReentrant
    {
        if (category == ARENA ? invite != address(0) : category != PRIVATE || invite == address(0)) {
            revert BadCategory();
        }
        _takeSeat(session, category, invite, v);
        if (category != ARENA) return;
        address other = waiting[v];
        if (other == address(0)) {
            waiting[v] = msg.sender;
            return;
        }
        delete waiting[v];
        _pair(other, msg.sender, ARENA);
    }

    function jungledidakooJoin(address host, address session, bytes calldata signature, uint16 v)
        external
        payable
        nonReentrant
    {
        Seat storage hostSeat = seats[host];
        address inviteKey = hostSeat.invite;
        if (inviteKey == address(0) || hostSeat.gameId != 0 || host == msg.sender) revert BadInvite();
        if (hostSeat.v != v) revert OtherVersion();
        if (_recover(inviteHash(host, msg.sender), signature) != inviteKey) revert BadSignature();
        hostSeat.invite = address(0);
        _takeSeat(session, PRIVATE, address(0), v);
        _pair(host, msg.sender, PRIVATE);
    }

    function jungledidakooLeave() external nonReentrant {
        Seat memory seat = seats[msg.sender];
        if (seat.session == address(0)) revert NoSeat();
        if (seat.gameId != 0) revert SeatBusy();

        delete seats[msg.sender];
        if (waiting[seat.v] == msg.sender) delete waiting[seat.v];
        emit Left(msg.sender);
        _releaseSession(seat.session);
        _pay(msg.sender, seat.escrow);
    }

    function _takeSeat(address session, uint8 category, address invite, uint16 v) private {
        if (msg.sender != tx.origin) revert NotOrigin();
        if (v < minVersion || v == 0) revert VersionTooOld();
        if (msg.value != STAKE) revert BadStake();
        if (session == address(0) || session == msg.sender) revert BadSession();
        if (seats[msg.sender].session != address(0)) revert SeatOpen();

        uint256 topUp = session.balance >= FLOAT ? 0 : FLOAT - session.balance;
        seats[msg.sender] = Seat(session, uint128(STAKE - topUp), 0, category, invite, v);
        emit Opened(msg.sender, session, category);
        _takeSession(session);

        if (topUp == 0) return;
        (bool sent,) = session.call{value: topUp}("");
        if (!sent) revert PayoutFailed();
    }

    function _pair(address x, address y, uint8 category) private {
        (address a, address b) = uint160(x) < uint160(y) ? (x, y) : (y, x);
        uint256 gameId = uint256(keccak256(abi.encode(block.chainid, address(this), ++paired)));
        Seat storage seatA = seats[a];
        Seat storage seatB = seats[b];
        Game storage g = games[gameId];
        g.white = a;
        g.black = b;
        g.sessionWhite = seatA.session;
        g.sessionBlack = seatB.session;
        g.escrowWhite = seatA.escrow;
        g.escrowBlack = seatB.escrow;
        (seatA.escrow, seatB.escrow) = (0, 0);
        (seatA.gameId, seatB.gameId) = (gameId, gameId);
        g.turn = 1;
        g.lastAt = uint64(block.timestamp) + START_SECONDS;
        g.seedBlock = uint64(block.number) + 1;
        g.repetitionLimit = REPETITION_LIMIT;
        g.category = category;
        g.status = 1;
        emit Paired(gameId, a, b, category);
    }

    function _seedGame(Game storage g, uint256 gameId) private {
        if (g.seed != 0) return;
        if (block.number <= g.seedBlock) revert SeedNotReady();
        bytes32 seed = blockhash(g.seedBlock);
        if (seed == 0) revert SeedExpired();
        if (!JungleSeed.whiteFirst(seed)) {
            (g.white, g.black) = (g.black, g.white);
            (g.sessionWhite, g.sessionBlack) = (g.sessionBlack, g.sessionWhite);
            (g.escrowWhite, g.escrowBlack) = (g.escrowBlack, g.escrowWhite);
        }
        g.board = JungleSeed.initialBoard(seed);
        g.colors = JungleSeed.colors(seed);
        g.seed = seed;
        emit Started(gameId, g.white, g.black, g.category);
    }

    function jungledidakooMove(uint256 gameId, uint32 seq, uint8 from, uint8 to) external nonReentrant {
        uint256 gas0 = gasleft();
        Game storage g = games[gameId];
        if (g.status != 1) revert NotRunning();
        _seedGame(g, gameId);
        uint8 side = _sideOf(g);

        if (block.timestamp > g.lastAt + IDLE_SECONDS) revert Idle();
        _catchUpSkips(g, gameId);
        if (g.turn != side) revert NotYourTurn();
        if (g.seq != seq) revert StaleMove();
        g.penalized &= ~uint8(1 << side);

        uint8[63] memory cells = JungleRules.unpack(g.board);
        if (!JungleRules.legal(cells, g.repetitions, side, g.repetitionLimit, from, to)) revert BadMove();

        g.repetitions =
            JungleRules.mark(g.repetitions, side, JungleRules.animalAt(cells, from), g.repetitionLimit);
        JungleRules.play(cells, from, to);
        g.board = JungleRules.pack(cells);
        g.seq += 1;
        g.turn = 1 - side;
        g.lastAt = uint64(block.timestamp);
        _record(g, side, false, from, to);
        emit Moved(gameId, g.seq, side, from, to);

        if (to == (side == 1 ? BLACK_DEN : WHITE_DEN)) {
            _finish(g, gameId, side, PYRAMID);
        } else if (_wipedOut(cells, 1 - side)) {
            _finish(g, gameId, side, WIPEOUT);
        } else {
            _refund(g, side, gas0);
        }
    }

    function jungledidakooResign(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        if (g.status != 1) revert NotRunning();
        _seedGame(g, gameId);
        uint8 side = _sideOf(g);
        _finish(g, gameId, 1 - side, RESIGNED);
    }

    function jungledidakooClose(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        if (g.status != 1) revert NotRunning();
        bool unseeded = g.seed == 0 && block.number > g.seedBlock + SEED_BLOCKS;
        if (!unseeded && block.timestamp <= g.lastAt + IDLE_SECONDS) revert StillPlaying();

        g.status = 2;
        g.endReason = ABANDONED;
        (uint256 whiteEscrow, uint256 blackEscrow) = (g.escrowWhite, g.escrowBlack);
        emit Closed(gameId);
        _freeSeats(g);
        _releaseSession(g.sessionWhite);
        _releaseSession(g.sessionBlack);
        _pay(g.white, whiteEscrow);
        _pay(g.black, blackEscrow);
    }

    function jungledidakooSunset(Deprecation calldata d, bytes calldata signature) external {
        if (d.minVersion <= minVersion) revert BadDeprecation();
        if (block.timestamp < d.notBefore) revert NotYet();
        address who = _recover(deprecationHash(d), signature);
        if (who == address(0) || who != deprecator) revert BadSignature();

        minVersion = d.minVersion;
        emit Sunset(d.minVersion, d.notBefore);
    }

    function jungledidakooWithdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        owed[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert PayoutFailed();
    }

    function gameOf(uint256 gameId) external view returns (Game memory g) {
        g = games[gameId];
        if (g.status != 1 || g.seed != 0 || block.number <= g.seedBlock) return g;
        bytes32 seed = blockhash(g.seedBlock);
        if (seed == 0) return g;
        if (!JungleSeed.whiteFirst(seed)) {
            (g.white, g.black) = (g.black, g.white);
            (g.sessionWhite, g.sessionBlack) = (g.sessionBlack, g.sessionWhite);
            (g.escrowWhite, g.escrowBlack) = (g.escrowBlack, g.escrowWhite);
        }
        g.board = JungleSeed.initialBoard(seed);
        g.colors = JungleSeed.colors(seed);
        g.seed = seed;
    }

    function clockOf(uint256 gameId)
        public
        view
        returns (uint8 turn, uint8 penalized, uint64 startedAt, uint64 deadline, uint8 skips)
    {
        Game storage g = games[gameId];
        turn = g.turn;
        penalized = g.penalized;
        startedAt = g.lastAt;
        deadline = startedAt + _turnLengthOf(penalized, turn);
        if (g.status != 1) return (turn, penalized, startedAt, deadline, 0);
        uint64 cap = g.lastAt + IDLE_SECONDS;
        while (block.timestamp > deadline && deadline <= cap) {
            startedAt = deadline;
            penalized |= uint8(1 << turn);
            turn = 1 - turn;
            skips += 1;
            deadline = startedAt + _turnLengthOf(penalized, turn);
        }
    }

    function inviteHash(address host, address guest) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), host, guest));
    }

    function deprecationHash(Deprecation calldata d) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                gameDomainSeparator,
                keccak256(abi.encode(DEPRECATION_TYPEHASH, d.minVersion, d.notBefore))
            )
        );
    }

    function _sideOf(Game storage g) private view returns (uint8) {
        if (g.status != 1) revert NotRunning();
        if (msg.sender == g.sessionWhite) return 1;
        if (msg.sender == g.sessionBlack) return 0;
        revert NotAPlayer();
    }

    function _turnLength(Game storage g) private view returns (uint64) {
        return _turnLengthOf(g.penalized, g.turn);
    }

    function _turnLengthOf(uint8 penalized, uint8 turn) private pure returns (uint64) {
        return (penalized >> turn) & 1 == 1 ? PENALTY_SECONDS : TURN_SECONDS;
    }

    function _catchUpSkips(Game storage g, uint256 gameId) private {
        uint64 t = g.lastAt;
        while (block.timestamp > t + _turnLength(g)) {
            t += _turnLength(g);
            _skip(g, gameId);
        }
    }

    function _skip(Game storage g, uint256 gameId) private {
        uint8 who = g.turn;
        g.repetitions = JungleRules.clear(g.repetitions, who);
        g.penalized |= uint8(1 << who);
        g.seq += 1;
        g.turn = 1 - who;
        _record(g, who, true, NO_SQUARE, NO_SQUARE);
        emit Moved(gameId, g.seq, who, NO_SQUARE, NO_SQUARE);
    }

    function _record(Game storage g, uint8 colour, bool skipped, uint8 from, uint8 to) private {
        uint16 v = (uint16(colour) << 15) | (skipped ? uint16(1) << 14 : 0) | (uint16(from) << 6) | to;
        g.moves.push(bytes1(uint8(v >> 8)));
        g.moves.push(bytes1(uint8(v)));
    }

    function _wipedOut(uint8[63] memory cells, uint8 colour) private pure returns (bool) {
        for (uint8 i = 0; i < 63; i++) {
            if (cells[i] != 0 && JungleRules.sideAt(cells, i) == colour) return false;
        }
        return true;
    }

    function _finish(Game storage g, uint256 gameId, uint8 winnerSide, uint8 reason) private {
        g.status = 2;
        g.endReason = reason;
        g.winner = winnerSide == 1 ? g.white : g.black;
        (uint256 whiteEscrow, uint256 blackEscrow) = (g.escrowWhite, g.escrowBlack);
        emit Finished(gameId, g.winner, reason);

        bool mints = address(memento) != address(0) && _holdsPass(g.winner);
        _freeSeats(g);
        _releaseSession(g.sessionWhite);
        _releaseSession(g.sessionBlack);
        _pay(g.white, whiteEscrow);
        _pay(g.black, blackEscrow);
        if (mints) memento.mint(gameId);
    }

    function _holdsPass(address wallet) private view returns (bool) {
        if (gasleft() < PASS_GAS + PASS_GAS / 63 + 5_000) revert LowGas();
        try pass.balanceOf{gas: PASS_GAS}(wallet) returns (uint256 n) {
            return n > 0;
        } catch {
            return false;
        }
    }

    function _freeSeats(Game storage g) private {
        delete seats[g.white];
        delete seats[g.black];
    }

    function _takeSession(address session) private {
        address who = sessionOf[session];
        if (who != address(0) && who != msg.sender) revert SessionTaken();
        if (who == address(0)) sessionOf[session] = msg.sender;
        uint8 n = sessionUses[session];
        if (n == 0) _openChannel(session);
        sessionUses[session] = n + 1;
    }

    function _releaseSession(address session) private {
        uint8 n = sessionUses[session];
        if (n > 1) {
            sessionUses[session] = n - 1;
            return;
        }
        delete sessionUses[session];
        _closeChannel(session);
    }

    function _openChannel(address session) private {
        if (address(registry).code.length == 0) return;
        try registry.grantPermission{gas: REGISTRY_GAS}(channelP, session, PUBLISH) {} catch {}
    }

    function _closeChannel(address session) private {
        if (address(registry).code.length == 0) return;
        try registry.revokePermission{gas: REGISTRY_GAS}(channelP, session, PUBLISH) {} catch {}
    }

    function _refund(Game storage g, uint8 side, uint256 gas0) private {
        uint256 cost = (gas0 - gasleft() + REFUND_OVERHEAD) * _refundPrice();
        uint128 left = side == 1 ? g.escrowWhite : g.escrowBlack;
        if (left == 0) return;
        uint128 refund = cost < left ? uint128(cost) : left;
        if (side == 1) g.escrowWhite = left - refund;
        else g.escrowBlack = left - refund;
        (bool sent,) = msg.sender.call{value: refund}("");
        if (!sent) revert PayoutFailed();
    }

    function _refundPrice() private view returns (uint256) {
        uint256 cap = block.basefee + REFUND_PRIORITY_CAP;
        return tx.gasprice < cap ? tx.gasprice : cap;
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool sent,) = to.call{value: amount, gas: 30_000}("");
        if (!sent) owed[to] += amount;
    }

    function _recover(bytes32 hash, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);

        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);

        return ecrecover(hash, v, r, s);
    }
}
