<template>
    <div class="game_main modal-outgame" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex modal-outgame" style="height: 100%">
            <Modal :open="true" :text="TEXT" :highlighted-text="ENS_NAME" :start-new-game="true" :buttons="[]"/>
        </div>
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";
import { ENS_NAME } from "../../net/constants.js";

export const TEXT = "This game version is no longer active. Play the current one at:";

export default {
    components: { Modal },
    data() {
        return { TEXT, ENS_NAME };
    },
};
</script>
