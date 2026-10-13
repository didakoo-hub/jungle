<template>
    <span class="dots" aria-hidden="true"><span class="point">.</span><span class="point">.</span><span class="point">.</span></span>
</template>

<script>
export default {
    name: "Dots",
};
</script>

<style>
.point {
    animation: calc(var(--heartbeat, 0.2s) * 4) steps(1, end) infinite;
}
.point:nth-child(1) { animation-name: point1; }
.point:nth-child(2) { animation-name: point2; }
.point:nth-child(3) { animation-name: point3; }
@keyframes point1 {
    0% { opacity: 1; }
    25% { opacity: 0; }
    50% { opacity: 1; }
    100% { opacity: 1; }
}
@keyframes point2 {
    0% { opacity: 1; }
    25% { opacity: 0; }
    75% { opacity: 1; }
    100% { opacity: 1; }
}
@keyframes point3 {
    0% { opacity: 1; }
    25% { opacity: 0; }
    100% { opacity: 0; }
}
</style>
