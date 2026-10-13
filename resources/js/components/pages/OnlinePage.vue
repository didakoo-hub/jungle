<template>
    <div class="game_main" :class="{ 'modal-outgame': covered }" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex" :class="{ 'modal-outgame': covered }" style="height: 100%">
            <Navbar
                v-if="!covered"
                pause-mode
                :selected="barSelectedOne"
                :label="labelBar"
                @menu="openMenu"
            />
            <div class="aligner d-flex flex-column align-items-center">
                <div class="aligner-inner-container">
                    <div v-show="!covered">
                        <div class="board d-flex justify-content-center bg-transparent align-items-center">
                            <Game
                                ref="board"
                                :key="keyBoard"
                                :game="game"
                                :waiting="waiting"
                                :waiting-text="waitingLine"
                                :waiting-spinner="waitingSpinner"
                                :syncing="syncing"
                                :error="error"
                                :funds-finished="fundsFinished"
                                :locked="wrongAccount"
                                :held="held"
                                :my-color="myColor"
                                :chain="!!chain"
                                :menu-open="menuOpen"
                                @bar="barSelectedOne = $event"
                                @menu="openMenu"
                                online
                                @move="sendMove"
                                @expired="sendDeadline"
                                @verifydeadline="verifyBeforeOfDeclare"
                                @turnstate="stateTurn"
                                @gameover="end"
                                @confirmwin="confirmVictory"
                                @checkmate="concede"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <Modal
            :open="menuOpen"
            :gameStarted="true"
            :buttons="buttons"
            :startNewGame="false"
            :message="message"
            :inline-note="outcomeNote"
            :payout="payout"
            :turn="turn"
            :turnDeadline="deadlineTurn"
            :turnCaption="turnCaption"
            :animated-label="waitingSpinner"
            :opponent="opponent"
            :stake="stake"
            :header="header"
            :notification="inviteLink"
            :notice="menuNotice"
            :notice-type="menuNoticeType"
            :second-notice="briefNotice"
        />
        <Modal
            :open="loginOpened"
            :gameStarted="false"
            :startNewGame="true"
            :text="textInvite"
            :text-type="inviteFromGuest ? '' : 'error'"
            :notice="inviteWarning"
            notice-type="warning"
            :buttons="buttonsInvite"
        />
        <Modal
            :open="gateOpen"
            :gameStarted="false"
            :startNewGame="true"
            :text="gateText"
            :buttons="gateButtons"
            :notice="gateNotice"
            :notice-type="gateNoticeType"
        />
    </div>
</template>
<script>
import Navbar from "../includes/Navbar.vue";
import Modal from "../Modal/Modal.vue";
import Game from "../Game/Game.vue";
import helper from "../Game/GameHelper.js";
import { initialState } from "../Game/constants.js";
import { createMatchOnline, plyLegal } from "../../net/onlineGame.js";
import { generator } from "../../game/random.js";
import { rollColors } from "../../game/colors.js";
import { initialRepetitions } from "../../engine/minimax.js";
import { isAddress, formatEther, hexlify, randomBytes } from "ethers";
import { openTurn, openIdle, transitOf } from "../../game/timer.js";
import { END_REASON, CATEGORY } from "../../net/messages.js";
import {
    matchAbsent, createTransmitter, openSeat, leaveSeat, topUpSession, awaitReceipt, hasThePass, seatOf, sessionOf,
    deviceClockWrong,
    REASONS, STATUS, MOVE_MARGIN_S,
} from "../../net/chain.js";
import { POLYGON_NETWORK, readsNetwork } from "../../net/rpc.js";
import { CHAIN_ID, RPC_POLYGON, MATCH_ADDRESS } from "../../net/constants.js";
import { getWalletAddress, isWalletAlias, ensureIdentity, hasGuest, getGuestId } from "../../game/identity.js";
import { leaveWallet, clearSession, leaveWarning, warningText, leaveStake, keyOwner } from "../../net/logout.js";
import store from "../../store/index.js";
import ghost from "../../../images/extra_objects/ghost.svg";
import { WALLET_NETWORK, sameAddress, uponChain } from "../../game/wallet.js";
import { localSigner, keySessionSaved, keyFromGuestId, addressOf } from "../../net/keys.js";
import { readCache, saveCache, resetCache } from "../../net/onlineCache.js";
import { createTabLock } from "../../net/tab.js";
import { holdLoader, switchOffLoader } from "../includes/loader.js";
import { inviteOf, inviteBase } from "../includes/invite.js";
import { rememberRefusal, refusalRemembered, forgetRefusal } from "../includes/gate.js";
import { markRefund } from "../../net/refund.js";
import tree from "../../../images/board/tree.svg";
import icon17 from "../../../images/board/animals/icon-17.svg";

const COPY_NOTICE_MS = 3000;
const NOTICE_DURATION_MS = 3000;
const COPY_DONE = "Link copied.";
const COPY_FAILED = "Copy failed: select the link below.";
const INVITE_IN_MATCH = "Finish this game before accepting an invite.";
const INVITE_IN_ARENA = "You can not accept an invite while in the ARENA lobby.";
const INVITE_UPON_OUTCOME = "Press END before accepting an invite.";

const MINTING_IN_PROGRESS = "Minting in progress ...";
const payoutInPol = (wei) => (wei ? `+${Number(formatEther(wei)).toFixed(2)} POL` : "");
const withPayout = (text, wei) => (wei ? `${text}\n${payoutInPol(wei)}` : text);
const inPol = (wei) => `${Number(formatEther(wei)).toFixed(2)} POL`;
const lossInPol = (wei) => (wei > 0n ? `-${inPol(wei)}` : "");
const MINTING_DONE = "MATCH TOKEN MINTED!";
const MOVE_LOST = "Turn lost: the move did not reach the chain";
const MOVE_LATE = "Turn lost: your move arrived after the deadline.";
const MOVE_REFUSED = "Move refused";
const FUNDS_FINISHED = "Funds finished. ADD FUNDS sends 1 POL to the session key.";
const FUNDS_ADDED = "Funds added.";
const SWITCH_BACK = (wallet) => `Wrong account: switch back to ${wallet} to keep playing.`;
const ACCOUNT_PER_GAME = (wallet) => `Game in progress for ${wallet}. Switch back to it to keep playing.`;
const FUNDS_NOT_ADDED = "Funds not added.";
const METAMASK_WAIT = "Waiting for MetaMask ...";
const PASS_REQUESTED = "Token pass required.";
const POPUP_REFUSED = "popup refused";

function addressLocale() {
    if (getWalletAddress()) {
        const key = keySessionSaved();
        return key ? addressOf(key) : null;
    }
    return hasGuest() ? addressOf(keyFromGuestId(getGuestId())) : null;
}

function savedCache() {
    const address = addressLocale();
    return address ? readCache(address) : null;
}

function initialGate() {
    if (!getWalletAddress() || matchAbsent() || !RPC_POLYGON.length) return "";
    return savedCache() ? "" : "seat";
}

function arenaFromGuest(route) {
    return route.query.mode === "arena" && !getWalletAddress();
}

const SEAT_NOTES = {
    [REASONS.CONTRACT]: "Online play is not available in this build.",
    [REASONS.NETWORK]: "Wrong network.",
    [REASONS.PASS]: PASS_REQUESTED,
    [REASONS.SESSION]: "Session key in use by another seat: press QUIT, then enter again.",
    [REASONS.CLOCK]: "Your device clock is wrong: set it right, then enter again.",
    [REASONS.CHAIN]: "Polygon did not answer: try again.",
    [POPUP_REFUSED]: "Transaction rejected.",
};
const SEAT_FAILED = "Seat not opened.";
const SEAT_NOT_RETURNED = "Seat not given back.";
const PASS_PER_MODE = (mode) => `You need a pass to play ${mode} On-chain.`;
const ENTRANCE_PER_MODE = (mode) => `${mode} On-chain mode. Sign the entry transaction.`;
const TAB_PER_MODE = (mode) => `${mode} is already open in another tab.`;

const newCode = () => hexlify(randomBytes(8)).slice(2);
const CODE_VALID = /^[0-9a-f]{8,64}$/i;

const INVITE_PER_WALLET = "Guest players can not accept this invite.";
const INVITE_PER_GUEST = "This game is for guests only: to play, switch to NO WALLET mode.";


async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
    }
    try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const done = document.execCommand("copy");
        area.remove();
        return done;
    } catch {
        return false;
    }
}

const WAITING_STATE = Object.fromEntries(
    Object.entries(initialState).filter(([, v]) => v.color === "white"),
);

function matchOfWaiting() {
    return { state: WAITING_STATE, colors: rollColors() };
}

const WAITING_CONNECTION = "Connecting ...";
const WAITING_INVITE = 'Press "COPY LINK" and share with Player 2 ...';
const ARENA_WAIT = "Searching for an opponent ...";
const EXIT_IN_PROGRESS = "QUITTING LOBBY ...";

const NETWORK_WRONG = "Wrong network.";
const SIGNATURE_FAILED = "Signature failed.";
const REFUSAL_OPPONENT = "Opponent refused.";
const HANDSHAKE_REASONS = Object.freeze({
    WAITING: "Opponent did not answer.",
    EXIT: "Opponent left.",
    DELEGATION: REFUSAL_OPPONENT,
    AGREEMENT: REFUSAL_OPPONENT,
    COMMIT: REFUSAL_OPPONENT,
    SEAT: SEAT_FAILED,
    FORFEIT: "Opponent did not reveal. Both stakes are yours.",
    FORFEIT_PASS: "Opponent has no pass. Both stakes are yours.",
});
const RESYNC_REASONS = Object.freeze({
    position: "Opponent's move was signed on a different board.",
    sequence: "Opponent's move is out of order.",
    signature: "Move not signed by the opponent's session.",
    illegal: "Opponent's move is not allowed by the rules.",
});
const HANDSHAKE_WAIT = "Opponent found, starting ...";
const WAITING_SEED_WITHOUT_COUNTDOWN = "Waiting for the opponent's seed ...";
const WAITING_SEED = (s) => `Waiting for the opponent's seed (${s} s) ...`;
const SEED_COUNTDOWN_DELAY_MS = 5000;
const SHOW_FOUND_MS = 1200;
const VICTORY = "You win";
const DEFEAT = "GAME OVER";
const OUTCOME_NOTES = ["", "you quit", "opponent quit", "no moves", "you needed the pass to play, the stake is lost"];
const NOTE_PASS = OUTCOME_NOTES[4];

const SENTINEL_MS = 8000;
const STALL_MS = 6000;

const SYNC_WAIT_MS = 12000;

const VERIFY_WAIT_MS = 4000;
const REOPEN_WAIT_MS = 6000;
const CONFIRM_WAIT_MS = 5000;
const CONFIRM_REPEAT_MS = 1000;
// The move into the den keeps the board's pause; the chain's end waits for it at most this long.
const CHAIN_END_WAIT_MS = 1500;

export default {
    components: { Navbar, Modal, Game },
    data() {
        return {
            network: null,
            match: null,
            game: matchOfWaiting(),
            waiting: true,
            waitingState: WAITING_CONNECTION,
            arena: false,
            chain: null,
            reconstructions: 0,
            finishedChain: false,
            deadlineSeed: null,
            beginningWaitingSeed: null,
            tickerSeed: null,
            seedCurrent: null,
            loginOpened: false,
            inviteWarning: "",
            gate: initialGate(),
            tab: createTabLock(),
            gateNotice: "",
            gateNoticeType: "warning",
            crossing: false,
            passageTried: false,
            code: null,
            codeChallenge: null,
            returning: false,
            fundsFinished: false,
            keyOwner: null,
            toppingUp: false,
            syncing: false,
            held: false,
            reopensTheTurn: false,
            sentinel: null,
            deadlineSync: null,
            notice: "",
            noticeType: "success",
            noticeTimer: null,
            reopenLater: null,
            briefNotice: "",
            noticeBriefTimer: null,
            myColor: "white",
            opponent: "",
            reentry: false,
            error: "",
            menuOpen: false,
            message: "",
            outcomeNote: "",
            payout: "",
            stake: "",
            escrows: null,
            foundA: 0,
            turn: "white",
            deadlineTurn: 0,
            finished: false,
            pendingVictory: null,
            chainEnd: null,
            chainEndTimer: null,
            confirmTimer: null,
            confirmRepeat: null,
            barSelectedOne: "",
        };
    },
    beforeRouteEnter(to, from, next) {
        next(arenaFromGuest(to) ? { path: "/jungle" } : undefined);
    },

    beforeRouteUpdate(to, from, next) {
        if (arenaFromGuest(to)) return next({ path: "/jungle" });
        const invite = inviteOf(to.query);
        if (!invite || invite === inviteOf(from.query)) return next();
        if (this.message || this.inProgress || this.arena) {
            this.menuOpen = true;
            this.transientNotice(this.message ? INVITE_UPON_OUTCOME : this.inProgress ? INVITE_IN_MATCH : INVITE_IN_ARENA);
            return next(false);
        }
        next();
    },

    created() {
        if (savedCache()) holdLoader();
    },

    async mounted() {
        this.arena = this.$route.query.mode === "arena";
        if (!await this.tab.take(this.mode)) {
            this.gate = "tab";
            switchOffLoader();
            return;
        }
        await this.startPage();
    },

    async beforeDestroy() {
        switchOffLoader();
        forgetRefusal();
        this.tab.leave();
        clearTimeout(this.noticeTimer);
        clearTimeout(this.reopenLater);
        clearTimeout(this.noticeBriefTimer);
        this.haltWaitingSeed();
        this.haltSentinel();
        clearTimeout(this.deadlineSync);
        this.dropPendingVictory();
        clearTimeout(this.chainEndTimer);
        await this.network?.close();
    },
    watch: {
        alias(now) {
            if (this.gate === "account") {
                if (!sameAddress(now, this.keyOwner)) return;
                this.gate = "";
                this.keyOwner = null;
                this.startPage();
                return;
            }
            // Under the login modal the director has not opened: NO WALLET recreates it.
            if (this.loginOpened) return;
            // The account change took the key away: the director would go on with a key nobody holds.
            const key = this.chain ? this.network?.me?.key : null;
            if (key && keySessionSaved()?.privateKey !== key.privateKey) this.$router.push({ path: "/jungle" });
        },
        wrongAccount(on) {
            if (on) this.menuOpen = true;
        },
    },
    computed: {
        alias() {
            return store.state.alias;
        },
        // The session key plays for the wallet that opened the seat, not for the account MetaMask shows now.
        wrongAccount() {
            return !!this.chain && this.match !== null && !this.message
                && !sameAddress(this.alias, this.network?.me?.wallet);
        },
        labelBar() {
            return this.mode + (this.chain ? " ON-CHAIN" : " (GUEST)");
        },
        itsColor() {
            return this.myColor === "white" ? "black" : "white";
        },
        keyBoard() {
            return this.match ? `${this.match.gameId}#${this.reconstructions}` : "waiting";
        },
        waitingLine() {
            return this.waitingState === WAITING_INVITE ? "" : this.waitingState;
        },
        waitingSpinner() {
            return this.waiting
                && this.waitingState !== WAITING_INVITE
                && this.waitingState !== EXIT_IN_PROGRESS
                && !this.loginOpened && !this.gateOpen;
        },
        found() {
            return this.waitingState === HANDSHAKE_WAIT || this.deadlineSeed !== null;
        },
        inProgress() {
            return (this.match !== null && !this.message) || this.found;
        },
        covered() {
            return this.menuOpen || this.loginOpened || this.gateOpen;
        },
        gateOpen() {
            return !!this.gate;
        },
        mode() {
            return this.arena ? "ARENA" : "PRIVATE";
        },
        gateText() {
            if (this.gate === "pass") return PASS_PER_MODE(this.mode);
            if (this.gate === "tab") return TAB_PER_MODE(this.tab.takenBy() ?? this.mode);
            if (this.gate === "account") return ACCOUNT_PER_GAME(this.keyOwner);
            return ENTRANCE_PER_MODE(this.mode);
        },
        gateButtons() {
            if (this.gate === "tab" || this.gate === "account") return [{ title: "QUIT", image: icon17, onclick: this.back }];
            if (this.crossing || !this.passageTried) return [];
            return [{ title: "QUIT", image: icon17, onclick: this.back }];
        },
        inviteFromGuest() {
            return this.$route.query.guest === "1";
        },
        textInvite() {
            return this.inviteFromGuest ? INVITE_PER_GUEST : INVITE_PER_WALLET;
        },
        buttonsInvite() {
            return [
                ...(this.inviteFromGuest ? [{ title: "NO WALLET", image: ghost, onclick: this.chooseGuest }] : []),
                { title: "QUIT", image: icon17, onclick: this.back },
            ];
        },
        header() {
            const inWaiting = this.waitingState === WAITING_INVITE || this.waitingState === ARENA_WAIT;
            return inWaiting && this.chain ? `${this.arena ? "ARENA" : "PRIVATE LOBBY"} On-chain.` : "";
        },
        turnCaption() {
            if (this.waiting) return this.waitingState;
            return this.turn === this.myColor ? "Your turn" : "Opponent turn";
        },
        menuNotice() {
            if (this.notice) return this.notice;
            if (this.message) return "";
            if (this.wrongAccount) return SWITCH_BACK(this.network.me.wallet);
            return this.error || (this.fundsFinished ? FUNDS_FINISHED : "");
        },
        menuNoticeType() {
            if (this.notice) return this.noticeType;
            if (this.wrongAccount && !this.message) return "warning";
            return this.error && !this.message ? "error" : "warning";
        },
        inviteShown() {
            return this.waiting && !this.returning && !this.arena;
        },
        inviteLink() {
            return this.inviteShown && this.network ? this.linkInvite() : "";
        },
        buttons() {
            if (this.message) return [{ title: "END", onclick: this.goOut }];
            if (this.waiting) {
                if (this.returning) return [];
                return [
                    ...(this.inviteShown ? [{ title: "COPY LINK", onclick: this.copyInvite }] : []),
                    { title: "RESUME", image: tree, onclick: this.closeMenu },
                    { title: "QUIT", image: icon17, onclick: this.chain && !this.found ? this.giveBackSeat : this.goOut },
                ];
            }
            if (this.toppingUp) return [];
            return [
                ...(this.fundsFinished && !this.wrongAccount ? [{ title: "ADD FUNDS", onclick: this.addFunds }] : []),
                { title: "RESUME", image: tree, onclick: this.closeMenu },
                { title: "QUIT", image: icon17, onclick: this.resign },
            ];
        },
    },
    methods: {
        createNetwork() {
            const me = localSigner();
            this.chain = me.type === "wallet" && !matchAbsent() && RPC_POLYGON.length
                ? {
                    reads: POLYGON_NETWORK,
                    transmitter: createTransmitter(POLYGON_NETWORK, me.key),
                    address: MATCH_ADDRESS,
                }
                : null;
            this.network = createMatchOnline({
                category: this.arena ? CATEGORY.ARENA : CATEGORY.PRIVATE,
                chain: this.chain,
                reads: RPC_POLYGON.length ? POLYGON_NETWORK : null,
                openSeat: (request) => this.openSeat(request),
                beforeSigning: async () => {
                    if (!await this.ensureChain()) throw new Error(NETWORK_WRONG);
                },
                onMatch: (outcome) => this.startMatch(outcome),
                onHandshake: () => {
                    this.waitingState = HANDSHAKE_WAIT;
                    this.foundA = Date.now();
                },
                onSearch: () => {
                    if (!this.waiting) return;
                    this.error = "";
                    this.waitingState = ARENA_WAIT;
                },
                onSynced: (info) => {
                    if (info?.silent) this.reopenInSilence(info.answered);
                    if (info?.itsRest > 0) this.$refs.board?.extendItsTurn(info.itsRest);
                    this.resumeTheClock();
                },
                onLagging: () => this.reopenItsTurn(),
                onHeld: (on) => { this.held = on; },
                onRebuild: (replay, info) => this.replay(replay, info),
                onMove: (m) => {
                    const b = this.$refs.board;
                    if (!b) return;
                    b.playComputer(m);
                    if (m.sentAt && b.turn === this.myColor) b.realignDeadline(b.turnDeadline - transitOf(m.sentAt));
                    // Its move during my verification opens my turn: the clock runs at once.
                    if (this.syncing && !this.reentry) this.resumeTheClock();
                },
                onDeadline: (jump) => {
                    const b = this.$refs.board;
                    if (!b) return;
                    b.applyDeadline(jump?.color ?? b.turn);
                },
                onOutcome: (data) => {
                    if (this.pendingVictory) return this.confirmedVictory();
                    if (data?.endReason !== END_REASON.RESIGNED) return;
                    this.closeMatch(VICTORY, "opponent quit");
                },
                onChain: (event) => this.fromChain(event),
                onStarted: (entry) => this.enterStarted(entry),
                onError: (e) => {
                    if (e?.code === 4001 || this.message) return;
                    // Another tab took the key: this director signs with a key nobody holds.
                    if (e?.code === "KEY") return this.$router.push({ path: "/jungle" });
                    if (e?.code === "PASS_LOST") {
                        this.haltWaitingSeed();
                        this.closeMatch(DEFEAT, NOTE_PASS);
                        return;
                    }
                    const forfeit = e?.code === "FORFEIT" || e?.code === "FORFEIT_PASS";
                    const resync = e?.code === "RESYNC" || e?.code === "CACHE";
                    const reason = e?.code === "STARTUP" || e?.code === "PASS" || e?.code === "ARENA" || e?.code === "NO_CHAIN" ? e.message
                        : forfeit ? withPayout(HANDSHAKE_REASONS[e.code], e.payout)
                        : resync ? RESYNC_REASONS[e.message] ?? e.message : HANDSHAKE_REASONS[e?.code];
                    if (e?.code === "SEAT" && this.notice) return;
                    if (reason && this.waiting) {
                        this.haltWaitingSeed();
                        this.waitingState = this.arena ? ARENA_WAIT : WAITING_INVITE;
                        this.showNotice(reason, forfeit ? "success" : "error");
                        return;
                    }
                    this.error = reason
                        ?? (typeof e?.code === "number" ? SIGNATURE_FAILED : (e?.message ?? String(e)));
                },
            });
        },

        identityWrong() {
            const inviter = this.$route.query.challenge;
            if (!isAddress(inviter) || this.amMe(inviter)) return false;
            return this.inviteFromGuest === (this.network.me.type === "wallet");
        },

        askLogin() {
            this.uncover();
            this.waitingState = WAITING_INVITE;
            this.loginOpened = true;
            this.warnBeforeLeaving();
        },

        async warnBeforeLeaving() {
            const kind = leaveWarning();
            this.inviteWarning = kind ? warningText(kind, null, "NO WALLET") : "";
            if (!kind) return;
            const stake = await leaveStake(readsNetwork(WALLET_NETWORK));
            if (stake && this.loginOpened && this.inviteWarning === warningText(kind, null, "NO WALLET")) this.inviteWarning = warningText(kind, stake, "NO WALLET");
        },

        chooseGuest() {
            leaveWallet();
            const identity = ensureIdentity();
            store.commit("SET_ALIAS", identity);
            this.afterTheLogin(identity);
        },

        async afterTheLogin(identity) {
            if (this.inviteFromGuest === isWalletAlias(identity)) return;
            await this.network.close();
            this.createNetwork();
            this.loginOpened = false;
            await this.enter();
        },

        async enter() {
            if (!await this.cross()) return;
            const inviter = this.$route.query.challenge;
            const challenging = !this.arena && isAddress(inviter) && !this.amMe(inviter);
            try {
                await this.network.open({
                    announcing: !this.arena,
                    ...(this.arena ? {} : challenging
                        ? { inviter, code: this.codeChallenge }
                        : { code: this.code }),
                });
            } catch (e) {
                this.error = e?.message ?? String(e);
                return;
            }
            if (this.arena) {
                this.waitingState = ARENA_WAIT;
                await this.network.listenForChallenges();
                await this.network.search();
                return;
            }
            this.waitingState = WAITING_INVITE;
            if (challenging && await this.network.challenge(inviter, { code: this.codeChallenge })) return;
            await this.network.listenForChallenges({ code: this.code });
        },

        prepareCodes() {
            const { challenge, code } = this.$route.query;
            const valid = typeof code === "string" && CODE_VALID.test(code) ? code : null;
            if (isAddress(challenge)) {
                this.codeChallenge = valid;
                this.code = newCode();
                return;
            }
            this.code = valid ?? newCode();
            if (!this.arena && code !== this.code) {
                this.$router.replace({ query: { ...this.$route.query, code: this.code } }).catch(() => {});
            }
        },

        stateTurn({ turn, turnDeadline }) {
            this.turn = turn;
            this.deadlineTurn = turnDeadline;
            this.save();
        },

        save() {
            const b = this.$refs.board;
            const snapshot = this.network?.snapshot;
            if (!b || !snapshot || this.message || this.reentry) return;
            saveCache({
                ...snapshot,
                penalized: b.penalized,
                idleDeadline: b.idleDeadline,
            });
        },

        saveFinished() {
            if (!this.message) return;
            const snapshot = this.network?.snapshot;
            if (!snapshot) return resetCache();
            saveCache({
                ...snapshot,
                outcomes: this.network.outcomes,
                finished: {
                    message: this.message,
                    outcomeNote: this.outcomeNote,
                    payout: this.payout,
                    minted: this.finishedChain,
                },
            });
        },

        async resumeFinishedMatch(cache) {
            this.finished = true;
            this.message = cache.finished.message === VICTORY ? VICTORY : DEFEAT;
            this.outcomeNote = OUTCOME_NOTES.includes(cache.finished.outcomeNote) ? cache.finished.outcomeNote : "";
            this.payout = /^[+-]\d+\.\d{2} POL$/.test(cache.finished.payout ?? "") ? cache.finished.payout : "";
            this.finishedChain = !!cache.finished.minted;
            this.menuOpen = true;
            this.myColor = this.network.sidesOf(cache).myColor;
            this.opponent = this.nameOpponent(this.network.sidesOf(cache).sides);
            this.game = {
                state: helper.getInitialState(cache.seed),
                colors: rollColors(generator(cache.seed, "colors")),
                turn: "white",
                repetitions: initialRepetitions(),
                penalized: { white: false, black: false },
            };
            this.match = cache.match;
            this.waiting = false;
            await this.$nextTick();
            let session = null;
            try {
                session = this.network.resumeFinished(
                    cache,
                    () => ({
                        board: this.$refs.board.squares,
                        repetitions: this.$refs.board.repetitions,
                        turn: this.$refs.board.turn,
                    }),
                    () => this.$refs.board.settle(),
                );
            } catch (e) {
                console.warn("finished game not replayed, discarded", e?.message ?? e);
            }
            if (!session) {
                resetCache();
                switchOffLoader();
                this.$router.replace({ path: "/ranking" });
                return false;
            }
            this.$refs.board?.endGame();
            if (this.finishedChain && this.message === VICTORY) this.showNotice(MINTING_DONE, "success", 0);
            switchOffLoader();
            return true;
        },

        async resumeMatch(cache) {
            this.seedCurrent = cache.seed;
            this.myColor = this.network.sidesOf(cache).myColor;
            this.opponent = this.nameOpponent(this.network.sidesOf(cache).sides);
            this.game = {
                state: helper.getInitialState(cache.seed),
                colors: rollColors(generator(cache.seed, "colors")),
                turn: "white",
                repetitions: initialRepetitions(),
                penalized: { white: false, black: false },
            };
            this.match = cache.match;
            this.waiting = false;
            this.uncover();
            await this.$nextTick();

            let session = null;
            this.reentry = true;
            this.suspendTheTime({ reopens: true });
            try {
                session = await this.network.resume(cache, () => ({
                    board: this.$refs.board.squares,
                    repetitions: this.$refs.board.repetitions,
                    turn: this.$refs.board.turn,
                    deadline: this.$refs.board.turnDeadline,
                }), () => this.$refs.board.settle());
            } catch (e) {
                this.error = e?.message ?? String(e);
            } finally {
                this.reentry = false;
            }
            if (!session) {
                resetCache();
                this.match = null;
                this.opponent = "";
                this.game = matchOfWaiting();
                this.waiting = true;
                this.waitingState = WAITING_CONNECTION;
                this.resumeTheClock();
                switchOffLoader();
                return false;
            }
            const b = this.$refs.board;
            Object.assign(this.game, {
                turn: b.turn,
                penalized: cache.penalized,
                idleDeadline: cache.idleDeadline,
            });
            b.penalized = cache.penalized ?? b.penalized;
            b.idleDeadline = cache.idleDeadline ?? b.idleDeadline;
            b.resumeTimer();
            b.suspendTime();
            this.startSentinel();
            if (!this.chain) switchOffLoader();
            return true;
        },

        replay(replay, { lost = false } = {}) {
            if (lost) {
                this.dropPendingVictory();
                this.showNotice(MOVE_LATE, "error");
            }
            const b = this.$refs.board;
            if (!b) return replay();
            const idleDeadline = b.idleDeadline;
            this.game.state = helper.getInitialState(this.seedCurrent);
            b.restart(this.game.state);
            replay();
            b.settle();
            b.idleDeadline = idleDeadline;
            b.armTimer();
        },

        async enterStarted(entry) {
            this.haltWaitingSeed();
            this.closeMenu();
            this.error = "";
            await this.resumeMatch({
                ...entry, penalized: { white: false, black: false }, idleDeadline: openIdle(),
            });
        },

        openMenu() { this.menuOpen = true; },
        closeMenu() {
            this.menuOpen = false;
            clearTimeout(this.noticeTimer);
            this.notice = "";
        },

        async cross() {
            if (!this.chain) return true;
            if (this.crossing) return false;
            this.crossing = true;
            this.gate = "seat";
            this.gateNotice = "";
            try {
                const held = await hasThePass(this.chain.reads, getWalletAddress());
                if (held === null) return this.seatRefusal(REASONS.CHAIN);
                if (held === false) {
                    this.gate = "pass";
                    return false;
                }
                if (await deviceClockWrong(this.chain.reads)) return this.seatRefusal(REASONS.CLOCK);
                let opened = false;
                try {
                    opened = await this.network.ensureSeat();
                } catch (e) {
                    this.seatRefusal(undefined, e?.message);
                }
                if (!opened) return false;
                forgetRefusal();
                this.gate = "";
                return true;
            } finally {
                this.crossing = false;
                this.passageTried = true;
            }
        },

        async renewKeyTaken() {
            const wallet = getWalletAddress();
            const key = keySessionSaved();
            if (!wallet || !key || matchAbsent() || !RPC_POLYGON.length) return true;
            const who = keyOwner() ?? await sessionOf(POLYGON_NETWORK, addressOf(key));
            if (!who || sameAddress(who, wallet)) return true;
            if (leaveWarning() !== null) {
                this.keyOwner = who;
                this.gate = "account";
                switchOffLoader();
                return false;
            }
            clearSession({ to: wallet });
            return true;
        },

        uncover() {
            if (!this.crossing) this.gate = "";
        },

        back() {
            forgetRefusal();
            this.$router.push("/jungle");
        },

        async startPage() {
            this.prepareCodes();
            if (!await this.renewKeyTaken()) return;
            this.createNetwork();
            if (!store.state.alias) store.commit("SET_ALIAS", ensureIdentity());
            let cache = readCache(this.network.me.address);
            if (cache?.finished && inviteOf(this.$route.query) && !this.matchInvite(cache)) {
                resetCache();
                cache = null;
            }
            if (cache?.finished) {
                this.uncover();
                await this.resumeFinishedMatch(cache);
                return;
            }
            if (cache && await this.resumeMatch(cache)) return;
            switchOffLoader();
            if (this.chain && await this.network.checkSuspended()) return;
            if (this.network.me.type === "wallet" ? !this.chain : this.arena) return this.$router.replace({ path: "/jungle" });
            if (this.identityWrong()) return this.askLogin();
            if (this.chain && !inviteOf(this.$route.query) && this.showRememberedRefusal()) return;
            await this.enter();
        },

        matchInvite(cache) {
            const inviter = this.$route.query.challenge;
            return sameAddress(inviter, cache.match.a) || sameAddress(inviter, cache.match.b);
        },

        showRememberedRefusal() {
            const reason = refusalRemembered();
            if (reason === null) return false;
            this.gate = "seat";
            this.passageTried = true;
            this.seatRefusal(reason || undefined);
            return true;
        },

        async giveBackSeat() {
            if (this.returning) return;
            this.returning = true;
            const beforeOfExiting = this.waitingState;
            this.waitingState = EXIT_IN_PROGRESS;
            this.showNotice(METAMASK_WAIT, "info", 0);
            let exited = false;
            try {
                if (!await this.ensureChain()) return this.showNotice(NETWORK_WRONG);
                const seat = await seatOf(this.chain.reads, getWalletAddress(), MATCH_ADDRESS);
                if (seat && !seat.session) {
                    this.switchOffNotice();
                    exited = true;
                    resetCache();
                    this.$router.push({ path: "/jungle" });
                    return;
                }
                const exit = await leaveSeat(WALLET_NETWORK, { from: getWalletAddress() });
                if (!exit.ok) {
                    const note = SEAT_NOTES[exit.reason];
                    return note ? this.showNotice(note) : this.showNotice(SEAT_NOT_RETURNED, "error");
                }
                if (await awaitReceipt(this.chain.reads, exit.hash) !== true) return this.showNotice(SEAT_NOT_RETURNED, "error");
                this.switchOffNotice();
                exited = true;
                resetCache();
                markRefund(this.arena ? "arena" : "private");
                this.$router.push({ path: "/jungle" });
            } catch (e) {
                if (e?.code === 4001) this.switchOffNotice();
                else this.showNotice(SEAT_NOT_RETURNED, "error");
            } finally {
                if (!exited) this.waitingState = beforeOfExiting;
                this.returning = false;
            }
        },

        async addFunds() {
            if (this.toppingUp || !this.chain || this.wrongAccount) return;
            this.toppingUp = true;
            this.showNotice(METAMASK_WAIT, "info", 0);
            try {
                if (!await this.ensureChain()) return this.showNotice(NETWORK_WRONG);
                const outcome = await topUpSession(WALLET_NETWORK, { from: getWalletAddress(), session: this.chain.transmitter.sender });
                if (!outcome.ok) return this.showNotice(SEAT_NOTES[outcome.reason] ?? FUNDS_NOT_ADDED, "error");
                if (await awaitReceipt(this.chain.reads, outcome.hash) !== true) return this.showNotice(FUNDS_NOT_ADDED, "error");
                this.fundsFinished = false;
                this.showNotice(FUNDS_ADDED, "success");
            } catch (e) {
                this.showNotice(e?.code === 4001 ? SEAT_NOTES[POPUP_REFUSED] : FUNDS_NOT_ADDED, "error");
            } finally {
                this.toppingUp = false;
            }
        },

        async openSeat({ leave, session }) {
            const from = getWalletAddress();
            this.seatNotice(METAMASK_WAIT, "info", 0);
            try {
                if (leave) {
                    const exit = await leaveSeat(WALLET_NETWORK, { from });
                    if (!exit.ok) return this.seatRefusal(exit.reason);
                    if (await awaitReceipt(this.chain.reads, exit.hash) !== true) return this.seatRefusal();
                }
                const outcome = await openSeat(WALLET_NETWORK, this.chain.reads, { from, session });
                if (!outcome.ok) return this.seatRefusal(outcome.reason);
                const gone = await awaitReceipt(this.chain.reads, outcome.hash);
                if (gone !== true) return this.seatRefusal();
                this.switchOffNotice();
                this.gateNotice = "";
                return true;
            } catch (e) {
                this.seatRefusal(e?.code === 4001 ? POPUP_REFUSED : undefined);
                return false;
            }
        },

        seatNotice(text, type = "warning", duration = NOTICE_DURATION_MS) {
            if (this.gate) {
                this.gateNotice = text;
                this.gateNoticeType = type;
                return;
            }
            this.showNotice(text, type, duration);
        },

        seatRefusal(reason, text = SEAT_NOTES[reason] ?? SEAT_FAILED) {
            // A chain that did not answer is not remembered: the refresh asks again.
            if (this.gate) rememberRefusal(reason in SEAT_NOTES && reason !== REASONS.CHAIN ? reason : "");
            else this.menuOpen = true;
            const recoverable = reason in SEAT_NOTES && reason !== POPUP_REFUSED && reason !== REASONS.CLOCK;
            this.seatNotice(text, recoverable ? "warning" : "error");
            return false;
        },

        async resign() {
            if (this.pendingVictory) return this.closeMenu();
            const sending = this.network?.sendOutcome({ endReason: END_REASON.RESIGNED, winner: this.itsColor });
            this.closeMatch(DEFEAT, "you quit");
            await sending;
        },

        async end(winner, reason) {
            if (this.finished) return;
            this.haltSentinel();
            if (this.chainEnd) return this.settleChainEnd();
            if (reason === "inactivity") {
                this.closeMatch(DEFEAT, "no moves");
                this.network?.closeForInactivity();
                return;
            }
            this.closeMatch(winner === this.myColor ? VICTORY : DEFEAT, "");
        },

        // On the guest channel the loser signs at once: the winner's modal waits for it.
        concede(winner, reason) {
            if (this.chain || winner !== this.itsColor) return;
            const endReason = reason === "wipeout" ? END_REASON.WIPEOUT : END_REASON.PYRAMID;
            this.network?.sendOutcome({ endReason, winner }).catch(() => {});
        },

        // My winning move waits for the loser's Outcome or its Timeout over the move, at most
        // CONFIRM_WAIT_MS; meanwhile the move goes again, in case the opponent never had it.
        confirmVictory(winner, reason) {
            this.pendingVictory = { winner, reason };
            if (this.network?.outcomes.its) return this.confirmedVictory();
            clearTimeout(this.confirmTimer);
            clearInterval(this.confirmRepeat);
            this.confirmTimer = setTimeout(() => this.confirmedVictory(), CONFIRM_WAIT_MS);
            this.confirmRepeat = setInterval(() => this.network?.resendLast(), CONFIRM_REPEAT_MS);
            this.network?.resendLast();
            this.network?.resync();
        },

        confirmedVictory() {
            const pending = this.pendingVictory;
            this.dropPendingVictory();
            if (pending) this.$refs.board?.alertWin(pending.winner, pending.reason);
        },

        dropPendingVictory() {
            clearTimeout(this.confirmTimer);
            clearInterval(this.confirmRepeat);
            this.confirmTimer = this.confirmRepeat = null;
            this.pendingVictory = null;
        },

        closeMatch(message, outcomeNote) {
            if (this.message) return;
            this.network?.conclude();
            this.message = message;
            this.outcomeNote = outcomeNote;
            this.fundsFinished = false;
            this.$refs.board?.endGame();
            this.menuOpen = true;
            if (this.chain && message === VICTORY && !this.finishedChain) {
                this.showNotice(MINTING_IN_PROGRESS, "neutral", 0);
            }
            this.saveFinished();
        },

        async fromChain(event) {
            if (event.type === "revelation") return this.awaitSeed(event.rest);
            if (event.type === "reconstruction") {
                if (event.block) this.reopensTheTurn = false;
                await this.rebuild(event.ply, event.penalized, event.block);
                if (event.lost) this.showNotice(MOVE_LOST + ".", "error");
                return;
            }
            if (event.type === "lost") {
                this.$refs.board?.lostMove();
                if (event.funds) { this.fundsFinished = true; this.switchOffNotice(); return; }
                // The verdict shown is not covered by the move it made fall.
                if (this.message) return;
                if (!event.refused) this.showNotice(MOVE_LOST + ".", "error");
                else this.showNotice(event.reason ? `${MOVE_REFUSED} (${event.reason}).` : MOVE_REFUSED + ".", "error");
                return;
            }
            if (event.type === "pending") { this.fundsFinished = false; return; }
            if (event.type === "state") return this.realignFromBlock(event);
            if (event.type !== "end") return;
            this.finishedChain = true;
            if (this.$refs.board?.winReveal && !this.message) {
                this.chainEnd = event;
                clearTimeout(this.chainEndTimer);
                this.chainEndTimer = setTimeout(() => this.settleChainEnd(), CHAIN_END_WAIT_MS);
                return;
            }
            this.closeUponChain(event);
        },

        settleChainEnd() {
            clearTimeout(this.chainEndTimer);
            const event = this.chainEnd;
            this.chainEnd = this.chainEndTimer = null;
            if (event) this.closeUponChain(event);
        },

        closeUponChain(event) {
            const winner = event.winner && sameAddress(event.winner, event.sides?.white) ? "white"
                : event.winner && sameAddress(event.winner, event.sides?.black) ? "black" : null;
            if (!this.message) {
                if (!winner) this.closeMatch(DEFEAT, "no moves");
                else if (winner === this.myColor) this.closeMatch(VICTORY, event.endReason === END_REASON.RESIGNED ? "opponent quit" : "");
                else this.closeMatch(DEFEAT, "");
            }
            if (winner === this.myColor) {
                this.payout = payoutInPol(event.payout);
                this.showNotice(MINTING_DONE, "success", 0);
            } else {
                if (winner) this.payout = lossInPol(this.lostStake(event, winner));
                this.switchOffNotice();
            }
            this.saveFinished();
        },

        // The end zeroes both escrows: the loss comes from the last read, on the side the last refund did not touch.
        lostStake(event, winner) {
            const escrows = this.escrows;
            if (!escrows || typeof event.payout !== "bigint") return 0n;
            if (event.endReason === END_REASON.RESIGNED) return event.payout - escrows[winner];
            return escrows[winner === "white" ? "black" : "white"];
        },

        awaitSeed(rest) {
            if (!this.waiting) return;
            if (this.deadlineSeed === null) this.beginningWaitingSeed = Date.now();
            this.deadlineSeed = Date.now() + rest * 1000;
            if (this.tickerSeed === null) this.tickerSeed = setInterval(() => this.tickSeed(), 250);
            this.tickSeed();
        },

        tickSeed() {
            if (!this.waiting || this.deadlineSeed === null) return this.haltWaitingSeed();
            if (Date.now() - this.beginningWaitingSeed < SEED_COUNTDOWN_DELAY_MS) {
                this.waitingState = WAITING_SEED_WITHOUT_COUNTDOWN;
                return;
            }
            this.waitingState = WAITING_SEED(Math.max(0, Math.ceil((this.deadlineSeed - Date.now()) / 1000)));
        },

        haltWaitingSeed() {
            if (this.tickerSeed !== null) clearInterval(this.tickerSeed);
            this.tickerSeed = null;
            this.deadlineSeed = null;
            this.beginningWaitingSeed = null;
        },

        realignFromBlock({ status, aligned, seq, turn, lastAt, duration, timeBlock, penalized, stake, escrows, deadline }) {
            if (typeof stake === "bigint") this.stake = status === STATUS.FINISHED ? "" : inPol(stake);
            if (escrows && status !== STATUS.FINISHED) this.escrows = escrows;
            const b = this.$refs.board;
            if (!b || status !== 1 || !aligned || timeBlock === null) return;
            if (penalized) b.penalized = penalized;
            if (b.turn !== (turn === 1 ? "white" : "black")) return;
            const margin = b.turn === this.myColor ? MOVE_MARGIN_S : 0;
            const at = Number.isFinite(deadline) ? deadline : Date.now() + (lastAt + duration - timeBlock) * 1000;
            b.realignDeadline(at - margin * 1000);
        },

        async rebuild(ply, penalized = null, block = null) {
            const b0 = this.$refs.board;
            const idleDeadline = b0?.idleDeadline;
            this.reentry = true;
            this.game = {
                state: helper.getInitialState(this.seedCurrent),
                colors: this.game.colors,
                turn: "white",
                repetitions: initialRepetitions(),
                penalized: { white: false, black: false },
            };
            this.reconstructions += 1;
            await this.$nextTick();
            const b = this.$refs.board;
            for (const p of ply) {
                if (!plyLegal({ board: b.squares, repetitions: b.repetitions, turn: b.turn }, p)) {
                    this.network?.diverged();
                    break;
                }
                if (p.skipped) b.applyDeadline(b.turn);
                else b.playComputer({
                    fromRow: Math.floor(p.from / 7), fromCol: p.from % 7,
                    toRow: Math.floor(p.a / 7), toCol: p.a % 7,
                });
            }
            b.settle();
            this.reentry = false;
            switchOffLoader();
            b.penalized = penalized ?? b.penalized;
            b.idleDeadline = idleDeadline ?? b.idleDeadline;
            b.resumeTimer();
            if (block) this.realignFromBlock({ ...block, status: 1, aligned: true, penalized });
            this.save();
        },

        async ensureChain() {
            if (!getWalletAddress()) return true;
            return await uponChain(CHAIN_ID);
        },

        goOut() {
            resetCache();
            this.$router.push("/ranking");
        },

        async startMatch(outcome) {
            const seed = outcome.seed;
            this.seedCurrent = seed;
            this.myColor = outcome.myColor;
            this.opponent = this.nameOpponent(outcome.sides);
            this.game = {
                state: helper.getInitialState(seed),
                colors: rollColors(generator(seed, "colors")),
                turn: "white",
                repetitions: initialRepetitions(),
                penalized: { white: false, black: false },
                ...openTurn("white", false, Date.now(), { symmetric: true }),
                idleDeadline: openIdle(),
            };
            this.match = outcome.match;
            this.waiting = false;
            const haveRead = Date.now() - this.foundA;
            if (haveRead >= SHOW_FOUND_MS) this.menuOpen = false;
            else setTimeout(() => { this.menuOpen = false; }, SHOW_FOUND_MS - haveRead);
            await this.$nextTick();
            await this.network.startSession(outcome, () => ({
                board: this.$refs.board.squares,
                repetitions: this.$refs.board.repetitions,
                turn: this.$refs.board.turn,
                deadline: this.$refs.board.turnDeadline,
            }));
            this.save();
            this.startSentinel();
        },

        nameOpponent(sides) {
            const its = sides?.[this.itsColor];
            if (!its || this.network?.me?.type !== "wallet") return "GUEST";
            return its;
        },

        amMe(address) {
            return String(address).toLowerCase() === String(this.network?.invite).toLowerCase();
        },

        linkInvite() {
            const base = inviteBase(window.location.href);
            const guest = this.network?.me?.type === "wallet" ? "" : "&guest=1";
            const code = this.code ? `&code=${this.code}` : "";
            return `${base}#/online?challenge=${this.network?.invite ?? ""}${guest}${code}`;
        },

        showNotice(text, type = "warning", duration = NOTICE_DURATION_MS) {
            clearTimeout(this.noticeTimer);
            this.noticeTimer = null;
            this.notice = text;
            this.noticeType = type;
            if (!duration) return;
            this.noticeTimer = setTimeout(() => { this.noticeTimer = null; this.notice = ""; }, duration);
        },

        transientNotice(text) {
            clearTimeout(this.noticeBriefTimer);
            this.briefNotice = text;
            this.noticeBriefTimer = setTimeout(() => { this.briefNotice = ""; }, NOTICE_DURATION_MS);
        },

        switchOffNotice() {
            clearTimeout(this.noticeTimer);
            this.noticeTimer = null;
            this.notice = "";
        },

        async copyInvite() {
            if (await copyToClipboard(this.linkInvite())) this.showNotice(COPY_DONE, "success", COPY_NOTICE_MS);
            else this.showNotice(COPY_FAILED, "warning", COPY_NOTICE_MS);
        },

        sendMove(move) {
            this.network?.sendMove(move);
        },
        sendDeadline(color) {
            if (color === this.myColor) {
                if (!this.chain) this.network?.resync();
                return;
            }
            this.network?.sendDeadline();
        },

        startSentinel() {
            this.haltSentinel();
            if (this.chain) return;
            this.sentinel = setInterval(() => {
                const b = this.$refs.board;
                if (!b || this.message || !this.network?.session) return;
                if (!b.turnDeadline || Date.now() < b.turnDeadline + STALL_MS) return;
                if (this.network.resyncing) return;
                this.network.resync();
            }, SENTINEL_MS);
        },

        // My turn expired and nobody signs the Timeout: the turn reopens, as at re-entry. With
        // the opponent alive, that answered the log without a Timeout, its Timeout may still be on
        // its way: the reopening waits REOPEN_WAIT_MS, and a Timeout held or applied cancels it.
        reopenInSilence(answered = false) {
            clearTimeout(this.reopenLater);
            this.reopenLater = null;
            const b = this.$refs.board;
            if (!b || b.winner || !b.waitingDeadline || b.turn !== this.myColor || this.held || this.message) return;
            if (answered) { this.reopenLater = setTimeout(() => this.reopenInSilence(false), REOPEN_WAIT_MS); return; }
            if (this.syncing) { this.reopensTheTurn = true; return; }
            b.changeTurn(b.turn);
        },

        // Its log stops under my move: it never had it, and its clock starts again.
        reopenItsTurn() {
            const b = this.$refs.board;
            if (!b || b.winner || b.turn !== this.itsColor || b.waitingDeadline || this.message) return;
            if (this.syncing) { this.reopensTheTurn = true; return; }
            b.changeTurn(b.turn);
        },

        haltSentinel() {
            if (this.sentinel !== null) clearInterval(this.sentinel);
            this.sentinel = null;
        },

        suspendTheTime({ reopens = false, waiting = SYNC_WAIT_MS } = {}) {
            this.syncing = true;
            this.reopensTheTurn = reopens;
            this.$refs.board?.suspendTime();
            clearTimeout(this.deadlineSync);
            this.deadlineSync = setTimeout(() => this.resumeTheClock(), waiting);
        },

        verifyBeforeOfDeclare() {
            if (this.chain) {
                this.$refs.board?.resumeAfterSync(false);
                return;
            }
            this.suspendTheTime({ waiting: VERIFY_WAIT_MS });
            this.network?.resync();
        },

        async resumeTheClock() {
            clearTimeout(this.deadlineSync);
            this.deadlineSync = null;
            if (!this.syncing) return;
            this.syncing = false;
            switchOffLoader();
            await this.$nextTick();
            this.$refs.board?.resumeAfterSync(this.reopensTheTurn);
        },
    },
};
</script>
<style lang="scss" scoped>
</style>
