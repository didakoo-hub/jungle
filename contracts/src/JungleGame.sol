// SPDX-License-Identifier: MIT
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

    uint256 public constant FLOAT = 0.6 ether;

    uint64 public constant TURN_SECONDS = 20;

    uint64 public constant PENALTY_SECONDS = 10;

    uint64 public constant IDLE_SECONDS = 600;

    uint8 public constant REPETITION_LIMIT = 6;

    uint64 public constant REVEAL_SECONDS = 30;

    uint64 public constant AGREEMENT_SECONDS = 120;

    uint64 public constant CLOCK_DRIFT_SECONDS = 60;

    uint256 public constant REFUND_OVERHEAD = 36_000;

    uint256 public constant REFUND_PRIORITY_CAP = 60 gwei;

    uint8 private constant NESSUNA_CASELLA = 63;

    uint8 private constant TANA_NERA = 3;
    uint8 private constant TANA_BIANCA = 59;

    uint8 public constant ARENA = 2;
    uint8 public constant PRIVATE = 3;

    uint8 public constant PYRAMID = 1;
    uint8 public constant RESIGNED = 2;
    uint8 public constant ABANDONED = 3;
    uint8 public constant WIPEOUT = 4;
    uint8 public constant FORFEITED = 5;

    uint8 public constant REVEALING = 3;

    struct Deprecation {
        uint16 minVersion;
        uint64 notBefore;
    }

    struct Match {
        uint16 v;
        uint256 gameId;
        address a;
        address b;
        bytes32 commitA;
        bytes32 commitB;
        uint8 category;
        uint8 repetitionLimit;
        uint8 turnS;
        uint8 penaltyS;
        uint8 graceS;
        uint64 t;
    }

    struct Seat {
        address session;
        uint128 escrow;
        uint256 gameId;
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
        uint8 revealed;
        address winner;
        uint8 endReason;
        uint128 payout;
        bytes moves;
    }

    IJunglePass public immutable pass;
    uint16 public immutable minVersion;
    bytes32 public immutable gameDomainSeparator;

    address public immutable deprecator;
    bool public sunset;

    IStreamRegistry public immutable registry;
    string public channelP;
    string public channelA;
    uint8 private constant PUBLISH = 2;
    uint256 public constant REGISTRY_GAS = 200_000;

    address private immutable deployer;
    IJungleMemento public memento;

    mapping(address wallet => Seat) public seats;
    mapping(uint256 gameId => Game) private games;

    mapping(address session => address wallet) public sessionOf;
    mapping(address session => uint8 count) private usiSessione;

    mapping(address wallet => uint256 amount) public owed;

    bool private locked;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant DEPRECATION_TYPEHASH =
        keccak256("Deprecation(uint16 minVersion,uint64 notBefore)");

    bytes32 private constant MATCH_TYPEHASH = keccak256(
        "Match(uint16 v,uint256 gameId,address a,address b,bytes32 commitA,bytes32 commitB,"
        "uint8 category,uint8 repetitionLimit,uint8 turnS,uint8 penaltyS,uint8 graceS,uint64 t)"
    );

    event Opened(address indexed wallet, address indexed session);
    event Left(address indexed wallet);
    event Revealed(uint256 indexed gameId, address indexed wallet);
    event Started(uint256 indexed gameId, address indexed white, address indexed black, uint8 category);
    event Moved(uint256 indexed gameId, uint32 seq, uint8 colour, uint8 from, uint8 to);
    event Finished(uint256 indexed gameId, address indexed winner, uint8 endReason);
    event Closed(uint256 indexed gameId);
    event Sunset(uint16 minVersion, uint64 notBefore);

    error NotDeployer();
    error MementoSet();
    error NoPass();
    error BadStake();
    error BadSession();
    error SeatOpen();
    error SessionTaken();
    error NoSeat();
    error SeatBusy();
    error VersionTooOld();
    error BadMatch();
    error SameCommit();
    error BadCategory();
    error BadSignature();
    error OutOfWindow();
    error BadReveal();
    error AlreadyRevealed();
    error RevealExpired();
    error AlreadyStarted();
    error NotRevealing();
    error StillRevealing();
    error NotRunning();
    error NotAPlayer();
    error NotYourTurn();
    error StaleMove();
    error Idle();
    error BadMove();
    error StillPlaying();
    error PayoutFailed();
    error Reentered();
    error AfterSunset();
    error BadDeprecation();
    error NotYet();

    constructor(
        IJunglePass pass_,
        uint16 minVersion_,
        IStreamRegistry registry_,
        string memory channelP_,
        string memory channelA_,
        address deprecator_
    ) {
        pass = pass_;
        minVersion = minVersion_;
        deprecator = deprecator_;
        registry = registry_;
        channelP = channelP_;
        channelA = channelA_;
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

    function jungledidakooOpen(address session) external payable nonReentrant {
        if (sunset) revert AfterSunset();
        if (pass.balanceOf(msg.sender) == 0) revert NoPass();
        if (msg.value != STAKE) revert BadStake();
        if (session == address(0) || session == msg.sender) revert BadSession();
        if (seats[msg.sender].session != address(0)) revert SeatOpen();

        uint256 rabbocco = session.balance >= FLOAT ? 0 : FLOAT - session.balance;
        seats[msg.sender] = Seat(session, uint128(STAKE - rabbocco), 0);
        emit Opened(msg.sender, session);
        _prendiSessione(session);

        if (rabbocco == 0) return;
        (bool andata,) = session.call{value: rabbocco}("");
        if (!andata) revert PayoutFailed();
    }

    function jungledidakooLeave() external nonReentrant {
        Seat memory seat = seats[msg.sender];
        if (seat.session == address(0)) revert NoSeat();
        if (seat.gameId != 0) revert SeatBusy();

        delete seats[msg.sender];
        emit Left(msg.sender);
        _lasciaSessione(seat.session);
        _pay(msg.sender, seat.escrow);
    }

    function jungledidakooStart(
        Match calldata m,
        bytes calldata signatureA,
        bytes calldata signatureB,
        bytes32 seed
    ) external nonReentrant {
        uint256 gas0 = gasleft();

        if (m.v < minVersion || m.v == 0) revert VersionTooOld();
        if (m.category != ARENA && m.category != PRIVATE) revert BadCategory();
        if (m.repetitionLimit != REPETITION_LIMIT || uint160(m.a) >= uint160(m.b)) revert BadMatch();
        if (m.commitA == m.commitB) revert SameCommit();
        if (m.gameId != gameIdOf(m.a, m.b, m.commitA, m.commitB, m.t)) revert BadMatch();
        Game storage g = games[m.gameId];
        if (g.status != 0 && g.status != REVEALING) revert AlreadyStarted();
        if (sunset && g.status == 0) revert AfterSunset();

        (Seat memory seatA, Seat memory seatB) = _posti(m);
        uint8 lato = msg.sender == seatA.session ? 1 : 2;
        if (g.revealed == lato) revert AlreadyRevealed();
        if (keccak256(abi.encodePacked(seed)) != (lato == 1 ? m.commitA : m.commitB)) revert BadReveal();
        if (pass.balanceOf(lato == 1 ? m.a : m.b) == 0) revert NoPass();

        if (g.status == 0) {
            if (m.t > block.timestamp + CLOCK_DRIFT_SECONDS || block.timestamp > m.t + AGREEMENT_SECONDS) {
                revert OutOfWindow();
            }
            _firme(m, signatureA, signatureB, seatA, seatB);
            seats[m.a].gameId = m.gameId;
            seats[m.b].gameId = m.gameId;
            g.status = REVEALING;
            g.revealed = lato;
            g.seed = seed;
            g.category = m.category;
            g.lastAt = uint64(block.timestamp);
            emit Revealed(m.gameId, lato == 1 ? m.a : m.b);
            _rimborsaPosto(lato == 1 ? m.a : m.b, gas0);
            return;
        }

        if (seatA.gameId != m.gameId || seatB.gameId != m.gameId) revert SeatBusy();
        if (m.category != g.category) revert BadMatch();
        if (block.timestamp > g.lastAt + REVEAL_SECONDS) revert RevealExpired();
        delete seats[m.a];
        delete seats[m.b];
        _avvia(m, g.seed ^ seed, seatA, seatB);
        _rimborsa(g, msg.sender == g.sessionWhite ? 1 : 0, gas0);
    }

    function jungledidakooForfeit(Match calldata m) external nonReentrant {
        if (m.gameId != gameIdOf(m.a, m.b, m.commitA, m.commitB, m.t)) revert BadMatch();
        Game storage g = games[m.gameId];
        if (g.status != REVEALING) revert NotRevealing();
        if (block.timestamp <= g.lastAt + REVEAL_SECONDS) revert StillRevealing();

        Seat memory seatA = seats[m.a];
        Seat memory seatB = seats[m.b];
        delete seats[m.a];
        delete seats[m.b];
        address chi = g.revealed == 1 ? m.a : m.b;
        g.status = 2;
        g.endReason = FORFEITED;
        g.winner = chi;
        emit Finished(m.gameId, chi, FORFEITED);
        _lasciaSessione(seatA.session);
        _lasciaSessione(seatB.session);
        _pay(chi, uint256(seatA.escrow) + seatB.escrow);
    }

    function _posti(Match calldata m) private view returns (Seat memory seatA, Seat memory seatB) {
        seatA = seats[m.a];
        seatB = seats[m.b];
        if (seatA.session == address(0) || seatB.session == address(0)) revert NoSeat();
        if (seatA.gameId != 0 && seatA.gameId != m.gameId) revert SeatBusy();
        if (seatB.gameId != 0 && seatB.gameId != m.gameId) revert SeatBusy();
        if (msg.sender != seatA.session && msg.sender != seatB.session) revert NotAPlayer();
    }

    function _firme(
        Match calldata m,
        bytes calldata signatureA,
        bytes calldata signatureB,
        Seat memory seatA,
        Seat memory seatB
    ) private view {
        bytes32 signed = matchHash(m);
        if (_recover(signed, signatureA) != seatA.session) revert BadSignature();
        if (_recover(signed, signatureB) != seatB.session) revert BadSignature();
    }

    function _avvia(Match calldata m, bytes32 seed, Seat memory seatA, Seat memory seatB)
        private
        returns (Game storage g)
    {
        bool aBianco = JungleSeed.primoBianco(seed);
        g = games[m.gameId];
        g.white = aBianco ? m.a : m.b;
        g.black = aBianco ? m.b : m.a;
        g.sessionWhite = aBianco ? seatA.session : seatB.session;
        g.sessionBlack = aBianco ? seatB.session : seatA.session;
        g.escrowWhite = aBianco ? seatA.escrow : seatB.escrow;
        g.escrowBlack = aBianco ? seatB.escrow : seatA.escrow;
        g.board = JungleSeed.scacchieraIniziale(seed);
        g.turn = 1;
        g.lastAt = uint64(block.timestamp);
        g.repetitionLimit = m.repetitionLimit;
        g.colors = JungleSeed.colori(seed);
        g.category = m.category;
        g.seed = seed;
        g.status = 1;
        emit Started(m.gameId, g.white, g.black, m.category);
    }

    function jungledidakooMove(uint256 gameId, uint32 seq, uint8 from, uint8 to) external nonReentrant {
        uint256 gas0 = gasleft();
        Game storage g = games[gameId];
        uint8 mio = _lato(g);

        if (block.timestamp > g.lastAt + IDLE_SECONDS) revert Idle();
        _recuperaSalti(g, gameId);
        if (g.turn != mio) revert NotYourTurn();
        // The ply the move was chosen for: a late transaction lands on another one.
        if (g.seq != seq) revert StaleMove();
        g.penalized &= ~uint8(1 << mio);

        uint8[63] memory cella = JungleRules.apri(g.board);
        if (!JungleRules.legale(cella, g.repetitions, mio, g.repetitionLimit, from, to)) revert BadMove();

        g.repetitions =
            JungleRules.segna(g.repetitions, mio, JungleRules.animale(cella, from), g.repetitionLimit);
        JungleRules.applica(cella, from, to);
        g.board = JungleRules.chiudi(cella);
        g.seq += 1;
        g.turn = 1 - mio;
        g.lastAt = uint64(block.timestamp);
        _scrivi(g, mio, false, from, to);
        emit Moved(gameId, g.seq, mio, from, to);

        if (to == (mio == 1 ? TANA_NERA : TANA_BIANCA)) {
            _fine(g, gameId, mio, PYRAMID);
        } else if (_spazzato(cella, 1 - mio)) {
            _fine(g, gameId, mio, WIPEOUT);
        }

        _rimborsa(g, mio, gas0);
    }

    function jungledidakooResign(uint256 gameId) external nonReentrant {
        uint256 gas0 = gasleft();
        Game storage g = games[gameId];
        uint8 mio = _lato(g);
        _fine(g, gameId, 1 - mio, RESIGNED);
        _rimborsa(g, mio, gas0);
    }

    function jungledidakooClose(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        if (g.status != 1) revert NotRunning();
        if (block.timestamp <= g.lastAt + IDLE_SECONDS) revert StillPlaying();

        g.status = 2;
        g.endReason = ABANDONED;
        (uint256 bianco, uint256 nero) = (g.escrowWhite, g.escrowBlack);
        (g.escrowWhite, g.escrowBlack) = (0, 0);
        emit Closed(gameId);
        _lasciaSessione(g.sessionWhite);
        _lasciaSessione(g.sessionBlack);
        _pay(g.white, bianco);
        _pay(g.black, nero);
    }

    function jungledidakooSunset(Deprecation calldata d, bytes calldata signature) external {
        if (sunset) revert AfterSunset();
        if (d.minVersion <= minVersion) revert BadDeprecation();
        if (block.timestamp < d.notBefore) revert NotYet();
        address chi = _recover(deprecationHash(d), signature);
        if (chi == address(0) || chi != deprecator) revert BadSignature();

        sunset = true;
        emit Sunset(d.minVersion, d.notBefore);
    }

    function jungledidakooWithdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        owed[msg.sender] = 0;
        (bool andata,) = msg.sender.call{value: amount}("");
        if (!andata) revert PayoutFailed();
    }

    function gameOf(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function deadlineOf(uint256 gameId) external view returns (uint64) {
        (uint64 fine,) = turnoDi(gameId);
        return fine;
    }

    function turnoDi(uint256 gameId) public view returns (uint64 fine, uint8 turno) {
        (turno,,, fine,) = clockOf(gameId);
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
        deadline = startedAt + _durataDi(penalized, turn);
        if (g.status != 1) return (turn, penalized, startedAt, deadline, 0);
        uint64 tetto = g.lastAt + IDLE_SECONDS;
        while (block.timestamp > deadline && deadline <= tetto) {
            startedAt = deadline;
            penalized |= uint8(1 << turn);
            turn = 1 - turn;
            skips += 1;
            deadline = startedAt + _durataDi(penalized, turn);
        }
    }

    function gameIdOf(address a, address b, bytes32 commitA, bytes32 commitB, uint64 t)
        public
        view
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(block.chainid, address(this), a, b, commitA, commitB, t)));
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

    function matchHash(Match calldata m) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                gameDomainSeparator,
                keccak256(
                    bytes.concat(
                        abi.encode(MATCH_TYPEHASH, m.v, m.gameId, m.a, m.b, m.commitA, m.commitB),
                        abi.encode(m.category, m.repetitionLimit, m.turnS, m.penaltyS, m.graceS, m.t)
                    )
                )
            )
        );
    }

    function _lato(Game storage g) private view returns (uint8) {
        if (g.status != 1) revert NotRunning();
        if (msg.sender == g.sessionWhite) return 1;
        if (msg.sender == g.sessionBlack) return 0;
        revert NotAPlayer();
    }

    function _durata(Game storage g) private view returns (uint64) {
        return _durataDi(g.penalized, g.turn);
    }

    function _durataDi(uint8 penalizzati, uint8 turno) private pure returns (uint64) {
        return (penalizzati >> turno) & 1 == 1 ? PENALTY_SECONDS : TURN_SECONDS;
    }

    function _recuperaSalti(Game storage g, uint256 gameId) private {
        uint64 t = g.lastAt;
        while (block.timestamp > t + _durata(g)) {
            t += _durata(g);
            _salta(g, gameId);
        }
    }

    function _salta(Game storage g, uint256 gameId) private {
        uint8 chi = g.turn;
        g.repetitions = JungleRules.azzera(g.repetitions, chi);
        g.penalized |= uint8(1 << chi);
        g.seq += 1;
        g.turn = 1 - chi;
        _scrivi(g, chi, true, NESSUNA_CASELLA, NESSUNA_CASELLA);
        emit Moved(gameId, g.seq, chi, NESSUNA_CASELLA, NESSUNA_CASELLA);
    }

    function _scrivi(Game storage g, uint8 colore, bool saltato, uint8 from, uint8 to) private {
        uint16 v = (uint16(colore) << 15) | (saltato ? uint16(1) << 14 : 0) | (uint16(from) << 6) | to;
        g.moves.push(bytes1(uint8(v >> 8)));
        g.moves.push(bytes1(uint8(v)));
    }

    function _spazzato(uint8[63] memory cella, uint8 colore) private pure returns (bool) {
        for (uint8 i = 0; i < 63; i++) {
            if (cella[i] != 0 && JungleRules.lato(cella, i) == colore) return false;
        }
        return true;
    }

    function _fine(Game storage g, uint256 gameId, uint8 vincitore, uint8 motivo) private {
        g.status = 2;
        g.endReason = motivo;
        g.winner = vincitore == 1 ? g.white : g.black;
        uint256 totale = uint256(g.escrowWhite) + g.escrowBlack;
        (g.escrowWhite, g.escrowBlack) = (0, 0);
        g.payout = uint128(totale);
        emit Finished(gameId, g.winner, motivo);

        _lasciaSessione(g.sessionWhite);
        _lasciaSessione(g.sessionBlack);
        _pay(g.winner, totale);
        if (address(memento) != address(0)) memento.mint(gameId);
    }

    function _prendiSessione(address session) private {
        address chi = sessionOf[session];
        if (chi != address(0) && chi != msg.sender) revert SessionTaken();
        if (chi == address(0)) sessionOf[session] = msg.sender;
        uint8 n = usiSessione[session];
        if (n == 0) _apriCanali(session);
        usiSessione[session] = n + 1;
    }

    function _lasciaSessione(address session) private {
        uint8 n = usiSessione[session];
        if (n > 1) {
            usiSessione[session] = n - 1;
            return;
        }
        delete usiSessione[session];
        _chiudiCanali(session);
    }

    function _apriCanali(address session) private {
        if (address(registry).code.length == 0) return;
        try registry.grantPermission{gas: REGISTRY_GAS}(channelP, session, PUBLISH) {} catch {}
        try registry.grantPermission{gas: REGISTRY_GAS}(channelA, session, PUBLISH) {} catch {}
    }

    function _chiudiCanali(address session) private {
        if (address(registry).code.length == 0) return;
        try registry.revokePermission{gas: REGISTRY_GAS}(channelP, session, PUBLISH) {} catch {}
        try registry.revokePermission{gas: REGISTRY_GAS}(channelA, session, PUBLISH) {} catch {}
    }

    function _rimborsa(Game storage g, uint8 lato, uint256 gas0) private {
        uint256 costo = (gas0 - gasleft() + REFUND_OVERHEAD) * _prezzoRimborsato();
        uint128 resto = lato == 1 ? g.escrowWhite : g.escrowBlack;
        if (resto == 0) return;
        uint128 rimborso = costo < resto ? uint128(costo) : resto;
        if (lato == 1) g.escrowWhite = resto - rimborso;
        else g.escrowBlack = resto - rimborso;
        (bool andata,) = msg.sender.call{value: rimborso}("");
        if (!andata) revert PayoutFailed();
    }

    function _rimborsaPosto(address wallet, uint256 gas0) private {
        uint256 costo = (gas0 - gasleft() + REFUND_OVERHEAD) * _prezzoRimborsato();
        uint128 resto = seats[wallet].escrow;
        if (resto == 0) return;
        uint128 rimborso = costo < resto ? uint128(costo) : resto;
        seats[wallet].escrow = resto - rimborso;
        (bool andata,) = msg.sender.call{value: rimborso}("");
        if (!andata) revert PayoutFailed();
    }

    function _prezzoRimborsato() private view returns (uint256) {
        uint256 tetto = block.basefee + REFUND_PRIORITY_CAP;
        return tx.gasprice < tetto ? tx.gasprice : tetto;
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool andata,) = to.call{value: amount, gas: 30_000}("");
        if (!andata) owed[to] += amount;
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
