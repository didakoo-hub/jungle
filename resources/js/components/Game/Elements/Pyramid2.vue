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
    </svg>
  </g>
</template>
<script>
import { pyramidSrc } from "./boardAssets.js";
  export default {
    methods: { pyramidSrc },
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
    },
  }
</script>
