<template>
    <transition name="notify">
        <div v-if="text" class="notify" :class="'notify-' + type">{{ text }}</div>
    </transition>
</template>
<script>
export default {
    name: "Notification",
    props: {
        text: {
            type: String,
            default: null,
        },
        type: {
            type: String,
            default: "info",
            validator: (v) => ["success", "info", "warning", "error"].includes(v),
        },
    },
};
</script>

<style scoped>
.notify {
    position: fixed;
    right: 20px;
    top: 20px;
    z-index: 1080;
    background-color: #000000;
    font-family: monospace;
    font-size: 14px;
    padding: 10px 20px;
    border-radius: 5px;
    max-width: calc(100vw - 40px);
}

.notify-success {
    color: #46e546;
}

.notify-info {
    color: white;
}

.notify-warning {
    color: #f89406;
}

.notify-error {
    color: red;
}

.notify-enter-active,
.notify-leave-active {
    transition: opacity 0.25s ease;
}

.notify-enter,
.notify-leave-to {
    opacity: 0;
}
</style>
