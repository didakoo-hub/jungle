<template>
    <div class="game_main modal-outgame" style="height: 100%">
        <div class="aligner2 align-items-center flex-column d-flex modal-outgame" style="height: 100%">
            <Modal :open="true" :text="NOTE" :note="label" :start-new-game="true" :buttons="buttons"/>
        </div>
    </div>
</template>
<script>
import Modal from "../Modal/Modal.vue";
import { botMode, setBotMode, drawnLevelsOf, RANDOM, FIXED_LEVELS } from "../../game/botEngine.js";

export const NOTE = "Choose the bot level.";

function drawnRange() {
    const drawn = drawnLevelsOf();
    return `${Math.min(...drawn)}-${Math.max(...drawn)}`;
}

export function labelMode(mode) {
    return `BOT LV = ${mode === RANDOM ? drawnRange() : mode}`;
}

export default {
    components: { Modal },
    data() {
        return { mode: botMode(), NOTE };
    },
    computed: {
        label() {
            return labelMode(this.mode);
        },
        buttons() {
            return [
                { title: `LV ${drawnRange()}`, onclick: this.choose, params: RANDOM },
                ...FIXED_LEVELS.map((level) => ({ title: `LV ${level}`, onclick: this.choose, params: level })),
                { title: "CONFIRM", icon: "bolt", iconSize: 16, onclick: this.confirm },
            ];
        },
    },
    methods: {
        choose(mode) {
            setBotMode(mode);
            this.mode = botMode();
        },
        confirm() {
            this.$router.replace({ name: "jungle", params: { start: true } });
        },
    },
};
</script>
