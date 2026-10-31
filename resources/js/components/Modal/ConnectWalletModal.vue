<template>
    <div class="modal1" v-if="show">
        <div class="modal-overlay1" @click="closeModal"></div>
        <div class="connect-modal-content">
            <div
                style="margin-bottom: 10px"
                class="d-flex container-sm align-items-center justify-content-between flex-row"
            >
                <img class="modal_logo" :src="ddd" alt="didakoo" />
                <span class="version_sign text-white">{{ connected ? "Account" : "Login" }}</span>
                <span class="version_sign text-white version-modal">v {{ version }}</span>
            </div>

            <template v-if="connected">
                <div class="connected-player pointer" @click="$emit('profile')">
                    <span class="connected-address">{{ alias }}</span>
                </div>
                <div class="web3-login-buttons" v-if="!miniApp">
                    <button
                        class="WalletCoinButton"
                        :class="{ 'WalletCoinButton--selected': cursor === 0 }"
                        id="logout"
                        @click="logout"
                    >
                        <p class="WalletCoinButtonText">DISCONNECT</p>
                    </button>
                </div>
            </template>

            <p v-if="!connected" class="description-login">
                You are in guest mode.<br>To play <span class="text-nowrap">on-chain</span>, connect MetaMask on the Polygon network{{ farcaster ? " or use the Farcaster app." : "." }}
            </p>
            <div v-if="!connected" class="web3-login-buttons">
                <button
                    class="WalletCoinButton"
                    :class="{ 'WalletCoinButton--selected': cursor === 0 }"
                    id="metamask"
                    :disabled="waiting"
                    @click="loginMetamask"
                >
                    <p class="WalletCoinButtonText">METAMASK</p>
                    <img :src="MetamaskWalletImg" alt="MetaMask" class="imgSize" />
                </button>
                <button
                    v-if="farcaster"
                    class="WalletCoinButton"
                    :class="{ 'WalletCoinButton--selected': cursor === 1 }"
                    id="farcaster"
                    :disabled="waiting"
                    @click="loginFarcaster"
                >
                    <p class="WalletCoinButtonText">FARCASTER</p>
                    <img :src="FarcasterImg" alt="Farcaster" class="imgSize imgFarcaster" />
                </button>
            </div>

            <p
                class="text-center mt-2 metamask-message"
                :style="metamskMessageStyles"
                v-if="metamaskMessage"
            >{{ metamaskMessage }}</p>
            <span
                class="close1"
                :class="{ 'close1--selectedOne': cursor === indexClosing }"
                @click="closeModal"
            >&times;</span>
        </div>
    </div>
</template>
<script>
import store from "../../store/index.js";
import { onMouseMove } from "../includes/mouse.js";
import {
    ensureIdentity,
    isWalletAlias,
    saveWalletAddress,
    abbreviate,
} from "../../game/identity.js";
import { hasProvider, walletClosed, requestAccounts, WALLET_NETWORK } from "../../game/wallet.js";
import { readsNetwork } from "../../net/rpc.js";
import { GAME_VERSION } from "../../net/constants.js";
import { WALLET_CLOSED, CONNECT_REFUSED, CONNECT_FAILED, OPENING_FARCASTER, OPEN_IN_FARCASTER_TAB } from "../includes/walletNotes.js";
import { inMiniApp, farcasterOffered, openInFarcaster, touchScreen, handToFarcaster } from "../../farcaster/host.js";
import { leaveWallet, leaveWarning, warningText, leaveStake } from "../../net/logout.js";
import ddd from "../../../images/extra_objects/ddd.svg";
import MetamaskWalletImg from "../../../images/extra_objects/MetaMask_Fox.svg";
import FarcasterImg from "../../../images/extra_objects/farcaster.svg";

const RESET_MESSAGE_MS = 4000;

const WAIT_THRESHOLD_MS = 500;

const DISCONNECTED = "DISCONNECTED ...";

const KEYSTROKES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"]);

const RED = "#D1230F";
const ORANGE = "#f89406";
const WHITE = "white";

export default {
    name: "ConnectWalletModal",
    props: {
        show: {
            type: Boolean,
            required: true,
        },
    },
    data() {
        return {
            ddd,
            MetamaskWalletImg,
            FarcasterImg,
            metamaskMessage: null,
            metamskMessageStyles: {},
            waiting: false,
            resetHandle: null,
            waitingHandle: null,
            cursor: -1,
            miniApp: inMiniApp(),
            farcaster: farcasterOffered(),
            version: GAME_VERSION,
        };
    },
    computed: {
        alias() {
            return store.state.alias;
        },
        connected() {
            return isWalletAlias(this.alias);
        },
        actions() {
            const buttons = this.connected
                ? (this.miniApp ? [] : [{ press: this.logout }])
                : [
                    { press: this.loginMetamask, suspended: true },
                    ...(this.farcaster ? [{ press: this.loginFarcaster, suspended: true }] : []),
                ];
            return [...buttons, { press: this.closeModal }];
        },
        indexClosing() {
            return this.actions.length - 1;
        },
    },
    methods: {
        switchOffCursor() {
            this.cursor = -1;
        },
        keyboard(event) {
            if (!this.show || !KEYSTROKES.has(event.key)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const last = this.actions.length - 1;
            const switchedOff = this.cursor < 0;
            switch (event.key) {
                case "ArrowUp":
                case "ArrowLeft":
                    this.cursor = switchedOff ? 0 : (this.cursor === 0 ? last : this.cursor - 1);
                    break;
                case "ArrowDown":
                case "ArrowRight":
                    this.cursor = switchedOff ? 0 : (this.cursor === last ? 0 : this.cursor + 1);
                    break;
                case "Enter": {
                    if (switchedOff) return;
                    const action = this.actions[this.cursor];
                    if (action.suspended && this.waiting) return;
                    action.press();
                    return;
                }
            }
        },
        closeModal() {
            this.$emit("close");
        },
        async warnBeforeLeaving() {
            const kind = leaveWarning();
            if (!kind) return;
            this.showMessage(warningText(kind), ORANGE, 0);
            const stake = await leaveStake(readsNetwork(WALLET_NETWORK));
            if (stake && this.show && this.metamaskMessage === warningText(kind)) this.showMessage(warningText(kind, stake), ORANGE, 0);
        },
        showMessage(text, color, reset = RESET_MESSAGE_MS) {
            clearTimeout(this.resetHandle);
            this.metamaskMessage = text;
            this.metamskMessageStyles = { color };
            if (!reset) return;
            this.resetHandle = setTimeout(this.cleanMessage, reset);
        },
        cleanMessage() {
            this.metamaskMessage = null;
            this.metamskMessageStyles = {};
        },
        adopt(identity, text, type) {
            store.commit("SET_ALIAS", identity);
            this.cleanMessage();
            this.$emit("notify", { text, type });
            this.$emit("login", identity);
        },
        async loginMetamask() {
            this.cleanMessage();
            const closed = walletClosed();
            if (closed) {
                this.showMessage(WALLET_CLOSED[closed], RED, 0);
                return;
            }
            if (!hasProvider()) {
                this.showMessage("MetaMask not detected.", RED, 0);
                this.$emit("notify", { text: "METAMASK NOT FOUND.", type: "error" });
                return;
            }
            this.waiting = true;
            clearTimeout(this.waitingHandle);
            this.waitingHandle = setTimeout(() => {
                this.showMessage("Waiting for MetaMask ...", WHITE, 0);
            }, WAIT_THRESHOLD_MS);
            try {
                const address = await requestAccounts();
                const saved = saveWalletAddress(address);
                if (!saved) throw Object.assign(new Error("Malformed address"), { code: "BAD" });
                this.adopt(saved, abbreviate(saved) + " CONNECTED.", "success");
                this.closeModal();
            } catch (err) {
                this.cleanMessage();
                this.$emit("notify", { text: this.messageError(err), type: "error" });
            } finally {
                clearTimeout(this.waitingHandle);
                this.waitingHandle = null;
                this.waiting = false;
            }
        },
        async loginFarcaster() {
            if (!touchScreen()) {
                this.cleanMessage();
                const behind = await openInFarcaster();
                if (behind && this.show && !this.waiting && !this.metamaskMessage) this.showMessage(OPEN_IN_FARCASTER_TAB, WHITE, 0);
                return;
            }
            this.waiting = true;
            this.showMessage(OPENING_FARCASTER, WHITE, 0);
            const underneath = await handToFarcaster();
            this.waiting = false;
            if (!this.show) return;
            if (underneath) this.$emit("farcaster");
            this.closeModal();
        },
        messageError(err) {
            if (err?.code === 4001) return CONNECT_REFUSED;
            return CONNECT_FAILED;
        },
        logout() {
            leaveWallet();
            this.adopt(ensureIdentity(), DISCONNECTED, "info");
        },
    },
    watch: {
        show(opened) {
            if (opened) {
                this.warnBeforeLeaving();
                return;
            }
            clearTimeout(this.resetHandle);
            clearTimeout(this.waitingHandle);
            this.cleanMessage();
            this.cursor = -1;
        },
        connected() {
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
        clearTimeout(this.resetHandle);
        clearTimeout(this.waitingHandle);
    },
};
</script>

<style scoped>
.modal1 {
    position: fixed;
    z-index: 1050;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 20px 15px;
    display: flex;
    justify-content: center;
    align-items: center;
}

.modal-overlay1 {
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
}

.connect-modal-content {
    background: black;
    padding: 20px;
    width: 100%;
    max-width: 350px;
    overflow: auto;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 15px;
    justify-content: center;
    margin: auto;
    border-radius: 20px;
    align-items: center;
    font-family: monospace;
}

.modal_logo {
    width: 80px;
    max-width: 30%;
}

.version_sign {
    font-size: 13px;
    white-space: nowrap;
}

.web3-login-buttons {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.pointer {
    cursor: pointer;
}

.connected-player {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 20px;
}

.connected-address {
    color: #fff;
    font-size: 16px;
    margin: 0;
    letter-spacing: 1px;
    overflow-wrap: anywhere;
}

.version-modal {
    margin-right: 15px;
}

.close1 {
    color: red;
    font-size: 28px;
    font-weight: bold;
    position: absolute;
    top: 5px;
    right: 10px;
    cursor: pointer;
    z-index: 0;
}

.close1:hover {
    color: darkred;
}

.close1--selectedOne {
    color: #fff;
}

.close1--selectedOne::before {
    content: "";
    position: absolute;
    left: -5px;
    right: -5px;
    top: 50%;
    transform: translateY(-50%);
    height: 26px;
    background: red;
    border-radius: 6px;
    z-index: -1;
}

.WalletCoinButtonText {
    margin: 0;
    align-self: center;
    text-transform: uppercase;
    background-clip: border-box;
    color: #fff;
    font-size: 12px;
}

.WalletCoinButton {
    position: relative;
    background: black;
    border-radius: 8px;
    min-height: auto;
    height: 42px;
    border: 2px solid #3c3c3c;
    padding: 0 5px;
    width: 150px;
    max-width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    cursor: pointer;
}

.WalletCoinButton--selected::before,
.WalletCoinButton--selected::after,
html:not(.keyboard) .WalletCoinButton:hover::before,
html:not(.keyboard) .WalletCoinButton:hover::after {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: #ffffff;
    font-size: 20px;
    line-height: 1;
    pointer-events: none;
}

.WalletCoinButton--selected::before,
html:not(.keyboard) .WalletCoinButton:hover::before {
    content: ">";
    right: 100%;
    margin-right: 8px;
}

.WalletCoinButton--selected::after,
html:not(.keyboard) .WalletCoinButton:hover::after {
    content: "<";
    left: 100%;
    margin-left: 8px;
}

@media screen and (max-width: 610px), screen and (max-height: 450px) {
    .WalletCoinButton {
        width: 120px;
    }
}

.WalletCoinButton:disabled {
    opacity: 0.5;
    cursor: default;
}

.imgSize {
    max-width: 24px;
    margin: 0;
}

.imgFarcaster {
    max-width: 20px;
}

.description-login {
    font-size: 13px;
    color: white;
    max-width: min(300px, 100%);
    margin: 5px;
}

.metamask-message {
    font-size: 17px;
    max-width: min(280px, 100%);
    margin-bottom: 0;
    white-space: pre-line;
}

</style>
