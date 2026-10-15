<template>
  <g class="chesspiece">
    <svg
      :x="x"
      :y="y"
      :width="width"
      :height="height"
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
        <image :href="pyramidSrc(color)" ></image>
        <Eye v-if="pyramidRim(color)" :center="{ x: x + width / 2, y: y + height * 0.58 }" :target="target" :rim="pyramidRim(color)" />
    </svg>
  </g>
</template>
<script>
import { pyramidRim, pyramidSrc } from "./boardAssets.js";
import Eye from "./Eye.vue";
  export default {
    components: { Eye },
    methods: { pyramidRim, pyramidSrc },
    props:{
      x: {
        type: Number,
        required: true,
      },
      y: {
        type: Number,
        required: true,
      },
      width: {
        type: Number,
        required: true,
      },
      height: {
        type: Number,
        required: true,
      },
      color: {
          type: Number,
      },
      target: {
          type: Object,
          default: null,
      },
    }
  }
</script>
