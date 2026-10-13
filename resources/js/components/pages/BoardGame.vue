<template>
    <div class="game_main" :class="{ 'modal-outgame': modalOpen }" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex" :class="{ 'modal-outgame': modalOpen }" style="height: 100%">
            <template v-if="playing">
                <Navbar
                    v-if="!modalOpen"
                    pause-mode
                    :selected="barSelectedOne"
                    :label="labelBar"
                    @menu="openMenu"
                />
                <div
                    class="aligner d-flex flex-column align-items-center"
                >
                    <div class="aligner-inner-container">
                        <div v-show="!modalOpen">
                            <div
                                class="board d-flex justify-content-center bg-transparent align-items-center"
                            >
                                <Game
                                    ref="board"
                                    :game="game"
                                    :menu-open="modalOpen"
                                    @bar="barSelectedOne = $event"
                                    @menu="openMenu"
                                    @gameover="gameOver"
                                    @turnstate="onTurnState"
                                    @ready="onReady"
                                    @fallback="onFallback"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
        <Modal
            :open="modalOpen"
            :gameStarted="playing || finished"
            :buttons="buttons"
            :startNewGame="!playing && !finished"
            :message="message"
            :inline-note="outcomeNote"
            :pass="pass"
            :seat="seat"
            :chain="chain"
            :chain-down="chainDown"
            :blinking-chain="haltBlinking"
            :without-choice="refundUponScreen"
            :opponent="labelBar"
            :notice="notice"
            :notice-type="noticeType"
            :blinking-notice="notice === arenaPerWallet"
            :introDeadline="introDeadline"
            :turn="turn"
            :turnDeadline="turnDeadline"
            @introfinished="introFinished"
        />
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";
import Game from "../Game/Game.vue";
import Icon from "../includes/Icon.vue";
import Navbar from "../includes/Navbar.vue";
import helper from "../Game/GameHelper.js";
import { rollColors } from "../../game/colors.js";
import { generator, randomSeed } from "../../game/random.js";
import { initialRepetitions } from "../../engine/minimax.js";
import { loadGame, saveGame, patchGame, clearGame } from "../../game/snapshot.js";
import { openTurn, openIdle } from "../../game/timer.js";
import { levelFromSeed, levelOfDepth, BOT_FALLBACK_DEPTH } from "../../game/botEngine.js";
import { ensureIdentity, getWalletAddress } from "../../game/identity.js";
import { WALLET_NETWORK } from "../../game/wallet.js";
import { readsNetwork } from "../../net/rpc.js";
import { hasThePass, matchAbsent, chainDown, seatOf } from "../../net/chain.js";
import { formatEther } from "ethers";
import { keySessionSaved, addressOf } from "../../net/keys.js";
import { sameAddress } from "../../game/wallet.js";
import { RPC_POLYGON } from "../../net/constants.js";
import { takeRefund } from "../../net/refund.js";
import store from "../../store/index.js";
import { clearFinished } from "../../net/onlineCache.js";
import icon17 from "../../../images/board/animals/icon-17.svg";
import tree from "../../../images/board/tree.svg";
import ddd from "../../../images/extra_objects/ddd.svg";
import iconaplay1 from "../../../images/extra_objects/iconaplay1.svg";

const INTRO_MS = 5000;
const READY_WAIT_MS = 1000;



const NOTICE_DURATION_MS = 3000;
const CHAIN_HEARTBEAT_MS = 15_000;
const REFUND_DONE = "LOBBY REFUND COMPLETED";
const ARENA_PER_WALLET = "Guest players can not play Arena mode.";
const WITHOUT_CHAIN = "Wallets play on-chain only: this build has no contract.";
const VICTORY = "You win";
const DEFEAT = "GAME OVER";


export default {
    components: { Modal, Game, Icon, Navbar },
    data() {
        return {
            game: null,
            playing: false,
            finished: false,
            modalOpen: true,
            notice: "",
            noticeType: "warning",
            noticeHandle: null,
            pass: false,
            seat: "",
            chainDown: false,
            chainHandle: null,
            haltBlinking: false,
            haltHandle: null,
            message: "",
            introDeadline: 0,
            botReady: false,
            introExpired: false,
            newMatch: false,
            turn: "white",
            turnDeadline: 0,
            barSelectedOne: "",
            fallbackLevel: null,
            ddd,
        };
    },
    computed: {
        chain() {
            return !matchAbsent() && RPC_POLYGON.length > 0;
        },
        arenaPerWallet() {
            return ARENA_PER_WALLET;
        },
        refundUponScreen() {
            return this.notice === REFUND_DONE;
        },
        alias() {
            return store.state.alias;
        },
        labelBar() {
            return `BOT LV ${this.fallbackLevel ?? levelFromSeed(this.game?.seed ?? "")}`;
        },
        outcomeNote() {
            return this.finished && this.message === VICTORY ? this.labelBar : "";
        },
        buttons() {
            if (!this.playing && !this.finished) {
                return [
                    {
                        title: "BOT",
                        icon: "bolt",
                        iconSize: 16,
                        onclick: this.startGame,
                    },
                    {
                        title: "PRIVATE",
                        image: iconaplay1,
                        imageWidth: 22,
                        onclick: this.goOnline,
                    },
                    {
                        title: "ARENA",
                        icon: "globe",
                        onclick: this.goArena,
                    },
                    {
                        title: "QUIT",
                        image: icon17,
                        onclick: this.leave,
                    },
                ];
            }
            if (this.message) {
                return [{ title: "END", onclick: this.leave }];
            }
            return [
                {
                    title: "RESUME",
                    image: tree,
                    onclick: this.closeMenu,
                },
                {
                    title: "QUIT",
                    image: icon17,
                    onclick: this.quitGame,
                },
            ];
        },
    },
    watch: {
        modalOpen() {
            this.switchOffNotice();
        },
        alias() {
            this.switchOffNotice();
            this.readPass();
            this.readSeat();
            this.readChain();
        },
    },
    beforeDestroy() {
        clearTimeout(this.noticeHandle);
        clearTimeout(this.haltHandle);
        clearInterval(this.chainHandle);
    },
    mounted() {
        this.readPass();
        this.readSeat();
        this.readChain();
        this.chainHandle = setInterval(() => {
            if (this.modalOpen && !document.hidden) this.readChain();
        }, CHAIN_HEARTBEAT_MS);
        if (takeRefund()) this.showNotice(REFUND_DONE, "success");
        const saved = loadGame();
        this.fallbackLevel = saved?.fallback ? levelOfDepth(BOT_FALLBACK_DEPTH) : null;
        if (saved?.finished) {
            this.game = saved;
            this.finished = true;
            this.message = saved.finished.winner === "white" ? VICTORY : DEFEAT;
            this.modalOpen = true;
            return;
        }
        if (saved) {
            this.game = saved;
            this.playing = true;
            this.newMatch = false;
            this.introExpired = true;
            this.uncoverMatch();
        }
    },
    methods: {
        goOnline() {
            if (this.refuseChainHalt()) return;
            store.commit("SET_ALIAS", ensureIdentity());
            clearFinished();
            this.$router.push({ path: "online" });
        },

        refuseChainHalt() {
            if (!getWalletAddress()) return false;
            if (!this.chain) {
                this.showNotice(WITHOUT_CHAIN, "error");
                return true;
            }
            if (!this.chainDown) return false;
            clearTimeout(this.haltHandle);
            this.haltBlinking = true;
            this.haltHandle = setTimeout(() => { this.haltBlinking = false; }, NOTICE_DURATION_MS);
            return true;
        },

        showNotice(text, type = "warning", duration = NOTICE_DURATION_MS) {
            clearTimeout(this.noticeHandle);
            this.notice = text;
            this.noticeType = type;
            if (!duration) return;
            this.noticeHandle = setTimeout(() => { this.notice = ""; }, duration);
        },

        switchOffNotice() {
            clearTimeout(this.noticeHandle);
            this.notice = "";
        },

        goArena() {
            this.switchOffNotice();
            if (!getWalletAddress()) return this.showNotice(ARENA_PER_WALLET, "error");
            if (this.refuseChainHalt()) return;
            store.commit("SET_ALIAS", ensureIdentity());
            clearFinished();
            this.$router.push({ path: "online", query: { mode: "arena" } });
        },

        async readPass() {
            const who = getWalletAddress();
            this.pass = false;
            if (!who) return;
            const has = await hasThePass(readsNetwork(WALLET_NETWORK), who);
            if (who !== getWalletAddress()) return;
            this.pass = has;
        },

        async readSeat() {
            const who = getWalletAddress();
            const key = keySessionSaved();
            this.seat = "";
            if (!who || !key || !this.chain) return;
            const seat = await seatOf(readsNetwork(WALLET_NETWORK), who);
            if (who !== getWalletAddress()) return;
            const my = seat?.session && sameAddress(seat.session, addressOf(key));
            this.seat = my ? `${Number(formatEther(seat.escrow)).toFixed(2)} POL` : "";
        },

        async readChain() {
            if (!this.chain || !getWalletAddress()) {
                this.chainDown = false;
                return;
            }
            const halt = await chainDown(readsNetwork(WALLET_NETWORK));
            if (!getWalletAddress()) return;
            this.chainDown = halt;
        },

        startGame() {
            const seedGame = randomSeed();
            const now = Date.now();
            const start = now + INTRO_MS;
            this.game = {
                seed: seedGame,
                state: helper.getInitialState(seedGame),
                colors: rollColors(generator(seedGame, "colors")),
                turn: "white",
                moves: 0,
                repetitions: initialRepetitions(),
                penalized: false,
                ...openTurn("white", false, start),
                idleDeadline: openIdle(start),
            };
            saveGame(this.game);
            this.fallbackLevel = null;
            this.message = "";
            this.playing = true;
            this.botReady = false;
            this.introExpired = false;
            this.newMatch = true;
            this.introDeadline = start;
        },
        introFinished() {
            this.introExpired = true;
            this.uncoverMatch();
        },
        onReady() {
            this.botReady = true;
            this.uncoverMatch();
        },
        onFallback(level) {
            this.fallbackLevel = level;
        },
        uncoverMatch() {
            if (!this.introExpired) return;
            if (!this.botReady) {
                this.introDeadline = Date.now() + READY_WAIT_MS;
                return;
            }
            this.introDeadline = 0;
            this.modalOpen = false;
            if (this.newMatch) this.$refs.board?.reopenTurn();
        },
        onTurnState({ turn, turnDeadline }) {
            this.turn = turn;
            this.turnDeadline = turnDeadline;
        },
        openMenu() {
            this.modalOpen = true;
        },
        closeMenu() {
            this.modalOpen = false;
        },
        gameOver(winner) {
            this.$refs.board?.endGame();
            patchGame({ finished: { winner: winner, t: Date.now() } });
            this.finished = true;
            this.message = winner === "white" ? VICTORY : DEFEAT;
            this.modalOpen = true;
        },
        quitGame() {
            this.gameOver("black");
        },
        leave() {
            clearGame();
            this.$router.push("/ranking");
        },
    },
};
</script>

<style>
.error-modal-font {
    font-family: monospace;
}
</style>
