<template>
    <div v-show="open" class="aligner2">
        <div class="modal d-flex main_modal align-items-center modal-outgame" :style="{background: modalBackground}">
            <div class="modal-content container-sm d-flex flex-column align-items-center">
                <div class="d-flex container-sm align-items-center justify-content-between flex-wrap flex-row">
                    <img class="modal_logo" :src="ddd" alt="didakoo">
                    <span style='font-size:13px;' class="version_sign"> Jungle </span>
                    <span style='font-size:13px;' class="version_sign"> v {{ version }}</span>
                </div>
                <div v-if="checkGameStatus" class="console-screen d-flex justify-content-center align-items-center">
                    <p  class="main_message" :class="{ centered: !!message }">
                        <span :class="klassText" :style="{fontSize: gameFinished ? '25px' : '16px', color: finishedText ?? finishedText}">
                            <template v-if="finishedText"><span v-if="outcomeMarks.before" class="blink-text">{{ outcomeMarks.before }}</span>{{ mainMessage }}<span class="blink-text">{{ outcomeMarks.after }}</span></template>
                            <template v-else-if="textAround">{{ textAround[0] }}<span class="profile-tag">{{ textAround[1] }}</span>{{ textAround[2] }}</template>
                            <template v-else-if="mainMessage">{{ mainMessage }}</template>
                            <template v-else-if="aliasWallet"><span class="profile-tag" style="color: white;">{{ aliasWallet }}</span><template v-if="pass && !withoutChoice">{{ " " }}<span style="white-space: nowrap; color: #46e546;">(PASS HOLDER)</span></template></template>
                            <span v-else-if="blinkingNotice" class="blink-text" style="color: red;">{{ notice }}</span>
                            <template v-else><span style="color: white;">GUEST PLAYER</span><span v-if="!withoutChoice" class="choice-line">Choose a game mode.</span></template>
                        </span>
                        <a v-if="highlightedText && highlightedHref" class="highlighted" :href="highlightedHref" target="_blank" rel="noopener noreferrer">{{ highlightedText }}</a>
                        <span v-else-if="highlightedText" class="highlighted">{{ highlightedText }}</span>
                        <span v-if="inlineNote" class="inline-note">({{ inlineNote }})</span>
                        <span v-if="payout" class="note-payout">{{ payout }}</span>
                        <span v-if="note" class="outcome-note" :class="finishedText ? 'blink-text' : ''" :style="{color: finishedText ?? finishedText}">{{ note }}</span>
                        <span v-if="noteChain" class="note-chain" :class="{ halt: chainDown, 'blink-text': blinkingChain }">{{ noteChain }}</span>
                        <span v-if="noticeLine" class="notice" :class="klassNotice">{{ textNotice }}<template v-if="noticeAnimated">{{ " " }}<Dots /></template></span>
                        <span v-if="secondNotice" class="notice" :class="'notice-' + secondNoticeType">{{ secondNotice }}</span>
                    </p>
                </div>
                <div v-if="counting" class="console-screen d-flex justify-content-center align-items-center">
                    <p  class="main_message">
                        <span >Your game will start in {{timeoutIndicator}}</span>
                    </p>
                </div>
                <div v-if="pauseMode" class="console-screen d-flex justify-content-center align-items-center">
                    <p  class="main_message">
                        <span v-if="opponent" class="challengers"><span v-for="(side, i) in sides" :key="i">{{ i ? " vs " : "" }}<template v-if="side.head"><span class="profile-tag">{{ side.head }}</span>{{ side.tail }}</template><template v-else>{{ side.name }}</template></span></span>
                        <span v-else-if="header" class="challengers">{{ header }}</span>
                        <span>{{ textTurn }}<template v-if="turnAnimated">{{ " " }}<Dots /></template><template v-if="turnDeadline">: {{ pauseSeconds }}s</template></span>
                        <span v-if="stake" class="stake">Stake left: {{ stake }}</span>
                        <span v-if="noticeLine" class="notice" :class="klassNotice">{{ textNotice }}<template v-if="noticeAnimated">{{ " " }}<Dots /></template></span>
                        <span v-if="secondNotice" class="notice" :class="'notice-' + secondNoticeType">{{ secondNotice }}</span>
                        <span v-if="notification" class="fallback-link">{{ notification }}</span>
                    </p>
                </div>
                <template v-if="showButtons">
                    <div id='buttons_collection' class="d-flex flex-wrap flex-column justify-content-center" :style="{paddingTop : (checkGameStatus || pauseMode) ? 0 : '30px'}">
                        <div class="mb-3" v-for="(item, index) in buttons" :key="index">
                            <Button
                                v-on:handelClick="() => item.onclick(item.params ?? '')"
                                :title="item.title"
                                :icon="item.icon"
                                :icon-size="item.iconSize"
                                :image="item.image"
                                :image-width="item.imageWidth"
                                :gap="item.gap"
                                :variant="index === cursor ? 'selected' : null"
                            />
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>
<script>
import Button from "../Button/Button.vue";
import Dots from "../includes/Dots.vue";
import { onMouseMove } from "../includes/mouse.js";
import store from "../../store/index.js";
import { isWalletAlias, abbreviate } from "../../game/identity.js";
import { secondsLeft } from "../../game/timer.js";
import ddd from "../../../images/extra_objects/ddd.svg";
import { WAITING_APPROVAL } from "../includes/walletNotes.js";
import { CHAIN_ID, GAME_VERSION } from "../../net/constants.js";

const NOTE_CHAIN = "Wallets play PRIVATE and ARENA on-chain, 5\u00a0POL stake required for gas. Unspent stake refunded at match end.";
const NOTE_SEAT = (stake) => `Your seat is open (${stake} staked): no new stake needed.`;
const CHAIN_HALT = `Polygon network (chain\u00a0ID\u00a0${CHAIN_ID}) is down: PRIVATE and ARENA are off until it restarts.`;

const KEYSTROKES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"]);
export default {
    props: {
        open: Boolean,
        gameStarted: Boolean,
        text: {
            type: String,
            default: "",
        },
        profile: {
            type: String,
            default: "",
        },
        textType: {
            type: String,
            default: "",
            validator: (v) => ["", "warning", "success", "info", "neutral", "error"].includes(v),
        },
        highlightedText: {
            type: String,
            default: "",
        },
        highlightedHref: {
            type: String,
            default: "",
        },
        message: {
            type: String,
        },
        note: {
            type: String,
            default: "",
        },
        inlineNote: {
            type: String,
            default: "",
        },
        payout: {
            type: String,
            default: "",
        },
        introDeadline: {
            type: Number,
            default: 0
        },
        turn: {
            type: String,
            default: "white"
        },
        turnDeadline: {
            type: Number,
            default: 0
        },
        turnCaption: {
            type: String,
            default: null
        },
        animatedLabel: {
            type: Boolean,
            default: false
        },
        startNewGame: {
            type: Boolean,
            default: false
        },
        notice: {
            type: String,
            default: ""
        },
        noticeType: {
            type: String,
            default: "warning",
            validator: (v) => ["warning", "success", "info", "neutral", "error"].includes(v),
        },
        secondNotice: {
            type: String,
            default: ""
        },
        secondNoticeType: {
            type: String,
            default: "warning",
            validator: (v) => ["warning", "success", "info", "neutral", "error"].includes(v),
        },
        blinkingNotice: {
            type: Boolean,
            default: false,
        },
        stake: {
            type: String,
            default: "",
        },
        opponent: {
            type: String,
            default: "",
        },
        header: {
            type: String,
            default: "",
        },
        withoutChoice: {
            type: Boolean,
            default: false,
        },
        pass: {
            type: Boolean,
            default: false,
        },
        chain: {
            type: Boolean,
            default: false,
        },
        seat: {
            type: String,
            default: "",
        },
        chainDown: {
            type: Boolean,
            default: false,
        },
        blinkingChain: {
            type: Boolean,
            default: false,
        },
        notification: {
            type: String,
            default: ""
        },
        buttons: {
            type: Array,
            default: () => [],
        },
    },
    components: { Button, Dots },
    data () {
        return {
            counting: false,
            timeoutIndicator: null,
            introHandle: null,
            pauseSeconds: 0,
            pauseHandle: null,
            cursor: -1,
            ddd,
            version: GAME_VERSION,
        }
    },
    computed: {
        alias(){
            return store.state.alias
        },
        whoAmI(){
            return isWalletAlias(this.alias) ? this.alias : "GUEST"
        },
        sides() {
            return [this.whoAmI, this.opponent].map((name) => (isWalletAlias(name)
                ? { head: name.slice(0, 6), tail: name.slice(6) }
                : { name }));
        },
        noticeLine(){
            if (store.state.popup) return WAITING_APPROVAL
            return this.blinkingNotice ? "" : this.notice
        },
        noticeAnimated() {
            return /\.\.\.$/.test(this.noticeLine);
        },
        textNotice() {
            return this.noticeLine.replace(/\s*\.\.\.$/, "");
        },
        klassText(){
            return this.text && this.textType ? "notice-" + this.textType : ""
        },
        klassNotice(){
            return "notice-" + (store.state.popup ? "info" : this.noticeType)
        },
        noteChain(){
            const chooses = !this.text && !this.message && !this.withoutChoice
            if (!this.chain || !chooses || !isWalletAlias(this.alias)) return ""
            if (this.chainDown) return CHAIN_HALT
            return this.seat ? NOTE_SEAT(this.seat) : NOTE_CHAIN
        },
        checkGameStatus(){
            return !this.gameStarted || !!this.message
        },
        pauseMode(){
            return this.gameStarted && !this.message && !this.counting
        },
        showButtons(){
            return (this.gameStarted && !this.counting) || this.startNewGame
        },
        scrollable(){
            return this.open && this.showButtons && this.buttons.length > 0
        },
        turnLabel(){
            if (this.turnCaption !== null) return this.turnCaption
            return this.turn === "black" ? "Bot turn" : "Your turn"
        },
        turnAnimated() {
            return this.animatedLabel && /\.\.\.$/.test(this.turnLabel);
        },
        textTurn() {
            return this.turnAnimated ? this.turnLabel.replace(/\s*\.\.\.$/, "") : this.turnLabel;
        },
        pauseTicking(){
            return this.open && this.pauseMode && !!this.turnDeadline
        },
        modalBackground() {
          if(!this.message){
            if(this.gameStarted && !this.counting){
              return 'transparent';
            }
          }
        },
        outcomeMarks() {
            return this.finishedText === "red" ? { before: "", after: "." } : { before: "* ", after: " *" };
        },
        gameFinished() {
            return !this.text && !!this.message;
        },
        finishedText() {
            if (!this.gameFinished) return null;
            return this.message === 'GAME OVER' ? 'red' : 'green';
        },
        textAround() {
            if (!this.text || !isWalletAlias(this.profile)) return null;
            const short = abbreviate(this.profile);
            const at = this.text.indexOf(short);
            if (at < 0) return null;
            return [this.text.slice(0, at), short, this.text.slice(at + short.length)];
        },
        mainMessage(){
            return this.text || this.message || null
        },
        aliasWallet() {
            return isWalletAlias(this.alias) ? abbreviate(this.alias) : null
        },
    },
    watch: {
        introDeadline: {
            immediate: true,
            handler(deadline) {
                this.stopIntro();
                if (!deadline) return;
                this.counting = true;
                this.drawIntro(deadline);
                this.introHandle = setInterval(() => this.drawIntro(deadline), 1000);
            },
        },
        pauseTicking: {
            immediate: true,
            handler(on) {
                on ? this.startPause() : this.stopPause();
            },
        },
        turnDeadline() {
            if (this.pauseTicking) this.startPause();
        },
        scrollable(on) {
            if (!on) this.cursor = -1;
        },
        buttons() {
            this.cursor = -1;
        },
    },
    mounted() {
        window.addEventListener("keydown", this.keyboard);
        window.addEventListener("click", this.switchOffCursor);
        this.switchOffOnMouse = onMouseMove(this.switchOffCursor);
    },
    beforeDestroy() {
        window.removeEventListener("keydown", this.keyboard);
        window.removeEventListener("click", this.switchOffCursor);
        this.switchOffOnMouse?.();
        clearInterval(this.introHandle);
        clearInterval(this.pauseHandle);
    },
    methods: {
        switchOffCursor(){
            this.cursor = -1
        },
        keyboard(event){
            if (!this.scrollable || !KEYSTROKES.has(event.key)) return
            event.preventDefault()
            event.stopImmediatePropagation()
            const last = this.buttons.length - 1
            const switchedOff = this.cursor < 0
            switch (event.key) {
                case "ArrowUp":
                case "ArrowLeft":
                    this.cursor = switchedOff ? 0 : (this.cursor === 0 ? last : this.cursor - 1)
                    break
                case "ArrowDown":
                case "ArrowRight":
                    this.cursor = switchedOff ? 0 : (this.cursor === last ? 0 : this.cursor + 1)
                    break
                case "Enter": {
                    if (switchedOff) return
                    const item = this.buttons[this.cursor]
                    item?.onclick(item.params ?? '')
                    return
                }
            }
        },
        drawIntro(deadline){
            const left = secondsLeft(deadline)
            if(!left){
                this.stopIntro()
                this.$emit("introfinished")
                return
            }
            this.timeoutIndicator = this.numberToTime(left)
        },
        stopIntro(){
            clearInterval(this.introHandle)
            this.introHandle = null
            this.counting = false
        },
        startPause(){
            clearInterval(this.pauseHandle)
            this.drawPause()
            this.pauseHandle = setInterval(this.drawPause, 1000)
        },
        stopPause(){
            clearInterval(this.pauseHandle)
            this.pauseHandle = null
        },
        drawPause(){
            this.pauseSeconds = secondsLeft(this.turnDeadline)
        },
        numberToTime(time){
            let minutes = Math.floor(time/60);
            minutes = minutes < 10 ? '0' + minutes : minutes
            let seconds = time % 60
            seconds = seconds < 10 ? '0' + seconds : seconds
            return minutes + ':' + seconds

        },
        closeModal() {
            this.$emit("closeModal")
        },
        quitGame() {
            this.$emit("quitGame")
        }
    },
}
</script>

<style lang="scss">

@keyframes blink {
    0% { opacity: 0; }
    35% { opacity: 0; }
    36% { opacity: 1; }
    100% { opacity: 1; }
}

.blink-text {
    animation: blink 0.4s infinite;
}


.main_modal {
    .modal_logo {
        width:60px
    }
    .version_sign {
        color: white;
        margin-top: 5px;
    }
    .main_message {
        padding: 10px;
        margin-bottom: 0;
        width: 100%;
        text-align: left;
        overflow-wrap: anywhere;

        &.centered {
            text-align: center;
        }

        & > span.notice {
            display: block;
            margin-top: 6px;
            white-space: pre-line;
        }
        & > span.fallback-link {
            display: block;
            margin-top: 6px;
            word-break: break-all;
            color: white;
            font-size: 12px;
            user-select: all;
        }
        & > span.challengers {
            display: block;
            margin-bottom: 4px;
            overflow-wrap: anywhere;
        }
        & > span.stake {
            display: block;
            margin-top: 4px;
        }
        & > span.outcome-note {
            display: block;
            margin-top: 4px;
        }
        & > span.inline-note {
            display: block;
            margin-top: 4px;
        }
        & > .highlighted {
            display: block;
            margin-top: 6px;
            font-size: 16px;
            user-select: all;
            overflow-wrap: anywhere;
        }
        & > span.note-payout {
            display: block;
            margin-top: 4px;
            color: white;
        }
        & > span.note-chain {
            display: block;
            color: white;
            &.halt { color: red; }
        }
        & > span.notice-warning { color: #f89406; }
        & > span.notice-success { color: #46e546; }
        & > span.notice-info { color: yellow; }
        & > span.notice-neutral { color: white; }

        .profile-tag {
            white-space: nowrap;
        }
        .choice-line {
            display: block;
            margin-top: 6px;
        }
        & > span.notice-error { color: red; }

        & > span {
            color: white;
            font-size: 16px;
            img {
                width: auto;
                height: 1em;
            }
        }
    }
}
</style>
