<template>
    <div>
        <Navbar ref="bar" :selected="barSelectedOne"/>
        <router-view
            @bar="barSelectedOne = $event"
            @barpress="pressInBar"
        ></router-view>
    </div>
</template>
<script>
import Navbar from "../includes/Navbar.vue";
export default {
    name: "DefaultContainer",
    components: {
        Navbar
    },
    data() {
        return {
            barSelectedOne: "",
        };
    },
    watch: {
        $route() {
            this.barSelectedOne = "";
        },
    },
    methods: {
        pressInBar(name) {
            this.$refs.bar?.press(name);
        },
    },
}
</script>
<style scoped>
</style>
