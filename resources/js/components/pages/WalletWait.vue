<template>
    <div class="game_main modal-outgame" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex modal-outgame" style="height: 100%">
            <Modal :open="true" :text="text" :text-type="textType" :start-new-game="true" :buttons="buttons"/>
        </div>
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";
import { popupSuspended, releasePopup } from "../../game/wallet.js";
import icon17 from "../../../images/board/animals/icon-17.svg";

const TEXTS = {
    tx: "Sign the pending transaction. Press QUIT only if you rejected the transaction ...",
    login: "Connect MetaMask ...",
    chain: "Switch network ...",
};

export default {
    components: { Modal },
    data() {
        return { type: popupSuspended()?.type ?? "" };
    },
    computed: {
        text() {
            return TEXTS[this.type] ?? "";
        },
        textType() {
            return this.type === "tx" ? "" : "info";
        },
        buttons() {
            return [{ title: "QUIT", image: icon17, onclick: releasePopup }];
        },
    },
};
</script>
