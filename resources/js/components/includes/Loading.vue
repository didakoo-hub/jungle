<template>
    <p class="loading" role="status">Loading <Dots /></p>
</template>

<script>
import Dots from "./Dots.vue";

export default {
    name: "Loading",
    components: { Dots },
};
</script>

<style>
.loading {
    margin: 0;
    color: #ffffff;
    text-align: center;
    white-space: nowrap;
}
</style>
