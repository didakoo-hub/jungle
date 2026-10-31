<template>
    <div class="game_main modal-outgame" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex modal-outgame" style="height: 100%">
            <Modal :open="true" :text="text" :start-new-game="true" :buttons="buttons"/>
        </div>
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";
import { popupSuspended, releasePopup } from "../../game/wallet.js";
import icon17 from "../../../images/board/animals/icon-17.svg";
import { inMiniApp } from "../../farcaster/host.js";

const CONNECTING = "Connecting your wallet ...";
const TX_ELSEWHERE = "Sign the pending transaction to proceed.";
const TEXTS = {
    tx: "Sign the pending transaction. Press QUIT only if you rejected the transaction.",
    login: "Connecting MetaMask ...",
    chain: "Switching network ...",
};

export default {
    components: { Modal },
    props: {
        elsewhere: { type: Boolean, default: false },
    },
    data() {
        return { type: popupSuspended()?.type ?? "" };
    },
    computed: {
        text() {
            if (this.type === "login" && inMiniApp()) return CONNECTING;
            if (this.type === "tx" && this.elsewhere) return TX_ELSEWHERE;
            return TEXTS[this.type] ?? "";
        },
        buttons() {
            return this.elsewhere ? [] : [{ title: "QUIT", image: icon17, onclick: releasePopup }];
        },
    },
};
</script>
