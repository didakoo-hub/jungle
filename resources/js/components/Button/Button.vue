<template>
    <button
        @click="onClick"
        class="btn-button"
        :class="[variant ? `btn-button--${variant}` : '']"
    >
        <div class="btn-content" :style="styleContent">
            <span v-if="title" class="btn-label">{{ title }}</span>
            <img v-if="image" class="btn-image" alt="" :src="image" :style="styleImage">
            <Icon v-if="icon" class="btn-icon" :name="icon" :style="styleIcon"/>
        </div>
    </button>
</template>
<script>
  import Icon from "../includes/Icon.vue";
  export default {
      name: "Button",
      components: { Icon },
      props: {
          image: {
              type: String
          },
          variant: {
              type: String
          },
          imageWidth: {
              type: Number
          },
          icon: {
              type: String
          },
          iconSize: {
              type: Number
          },
          gap: {
              type: Number
          },
          title: {
              type: String
          }
      },
      computed: {
          styleContent() {
              return this.gap != null ? { gap: `${this.gap}px` } : null;
          },
          styleImage() {
              return this.imageWidth ? { maxWidth: `${this.imageWidth}px` } : null;
          },
          styleIcon() {
              return this.iconSize ? { fontSize: `${this.iconSize}px` } : null;
          }
      },
      methods: {
          onClick() {
              this.$emit("handelClick")
          }
      }
  }
</script>
<style lang="scss">
  .btn-button {
    position: relative;
    background: black;
    border-radius: 8px;
    min-height: auto;
    height: 42px;
    border: 2px solid #3c3c3c;
    padding: 0 5px;
    width: 150px;
  }
  .btn-content{
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 10px;
  }
  .btn-label{
      font-size: 12px;
      color: #ffffff;
  }
  .btn-button--selected::before,
  .btn-button--selected::after,
  html:not(.keyboard) .btn-button:hover::before,
  html:not(.keyboard) .btn-button:hover::after {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      color: #ffffff;
      font-size: 20px;
      line-height: 1;
      pointer-events: none;
  }
  .btn-button--selected::before,
  html:not(.keyboard) .btn-button:hover::before {
      content: ">";
      right: 100%;
      margin-right: 8px;
  }
  .btn-button--selected::after,
  html:not(.keyboard) .btn-button:hover::after {
      content: "<";
      left: 100%;
      margin-left: 8px;
  }
  .btn-image{
        max-width: 24px;
        height: auto;
  }
  .btn-icon{
      font-size: 20px;
      color: #ffffff;
  }
  @media screen and (max-width: 610px) {
      .btn-button {
          width: 120px;
      }
  }
  @media screen and (max-height: 450px) {
      .btn-button {
          width: 120px;
      }
  }
</style>
