<template>
    <div class="game_main modal-outgame" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex modal-outgame" style="height: 100%">
            <Modal :open="true" :text="TEXT" :highlighted-text="ENS_NAME" :highlighted-href="BROWSER_URL" :start-new-game="true" :buttons="[]"/>
        </div>
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";
import { ENS_NAME } from "../../net/constants.js";
import { BROWSER_URL } from "../../farcaster/constants.js";

export const TEXT = "This game version is no longer active. Current version at:";

export default {
    components: { Modal },
    data() {
        return { TEXT, ENS_NAME, BROWSER_URL };
    },
};
</script>
