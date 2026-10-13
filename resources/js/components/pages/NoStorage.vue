<template>
    <div class="game_main modal-outgame" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex modal-outgame" style="height: 100%">
            <Modal :open="true" :text="TEXT" :start-new-game="true" :buttons="[]"/>
        </div>
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";

export const TEXT = "This browser blocks site data, allow it for this site and reload.";

export default {
    components: { Modal },
    data() {
        return { TEXT };
    },
};
</script>
