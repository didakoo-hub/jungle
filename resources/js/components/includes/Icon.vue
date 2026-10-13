<template>
    <svg
        class="icon"
        :viewBox="icon.viewBox"
        role="img"
        aria-hidden="true"
        focusable="false"
    >
        <path :d="icon.path" />
    </svg>
</template>

<script>
import { icons } from "./icons.js";

export default {
    name: "Icon",
    props: {
        name: { type: String, required: true },
    },
    computed: {
        icon() {
            const found = icons[this.name];
            if (found) return found;
            console.warn(`Icon: unknown name "${this.name}"`);
            return { viewBox: "0 0 512 512", path: "" };
        },
    },
};
</script>

<style lang="scss">
.icon {
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
    fill: currentColor;
}
</style>
