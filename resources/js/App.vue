<template>
    <div class="shell">
        <router-view :key="keyView"></router-view>
        <div v-if="popup" class="block-popup"><WalletWait v-if="popupElsewhere" elsewhere /></div>
    </div>
</template>
<script>
import { inviteOf } from "./components/includes/invite.js";
import WalletWait from "./components/pages/WalletWait.vue";

export default {
    name: "App",
    components: { WalletWait },
    computed: {
        popup() {
            return this.$store.state.popup;
        },
        popupElsewhere() {
            return this.$store.state.popupElsewhere;
        },
        keyView() {
            return this.$route.path === "/online" ? inviteOf(this.$route.query) : "";
        },
    },
    mounted() {
        window.addEventListener("keydown", this.lockDown, true);
        window.addEventListener("click", this.lockDown, true);
    },
    beforeDestroy() {
        window.removeEventListener("keydown", this.lockDown, true);
        window.removeEventListener("click", this.lockDown, true);
    },
    methods: {
        lockDown(event) {
            if (!this.popup) return;
            event.stopImmediatePropagation();
            if (event.type === "click") event.preventDefault();
        },
    },
};
</script>
<style scoped>
.shell {
    height: 100%;
}
.block-popup {
    position: fixed;
    inset: 0;
    z-index: 2000;
}
</style>
