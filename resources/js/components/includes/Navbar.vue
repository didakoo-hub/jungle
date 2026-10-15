<template>
    <div class="navbar d-flex banner-board-helper align-items-center sticky-top">
        <div style="max-width:350px" class="d-flex align-items-center flex-wrap container-sm justify-content-around">


            <div class="flex-column d-flex align-items-center">
                    <img
                        @click="getLinkBurger()"
                        class="didakoo"
                        style="margin-right:10px"
                        :src="ddd"
                        alt="didakoo"
                    />
                    <span @click="getLinkBurger()" style='font-size:13px; color:white;' class="version_sign"> Jungle v 1.2</span>
            </div>



            <div
                @click="getLinkBurger()"
                class="pointer"
                :class="{ 'bar-selected': indicated('burger') }"
            >
                <Icon name="bars" class="burger_menu" />
            </div>



            <span
                v-if="label"
                style='font-size:13px; color:white;'
                class="version_sign"
            >{{ label }}</span>
            <div
                v-else-if="userAddress"
                class="avatar_link pointer"
                :class="{ 'bar-selected': indicated('profile') }"
                @click="identityClick()"
            >
                <img :src="iconaplay1" alt="your profile" />
                PROFILE
            </div>
            <span
                v-else
                style='font-size:13px; color:white;'
                class="version_sign"
            >
                <img :src="ghost" alt="guest" class="icon_identity" />
                GUEST
            </span>



        </div>
    </div>
</template>
<script>
import store from "../../store/index.js";
import { isWalletAlias } from "../../game/identity.js";
import Icon from "./Icon.vue";
import ddd from "../../../images/extra_objects/ddd.svg";
import iconaplay1 from "../../../images/extra_objects/iconaplay1.svg";
import ghost from "../../../images/extra_objects/ghost.svg";
import { barTargets } from "./bar.js";
import { onMouseMove } from "./mouse.js";

const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const KEYSTROKES_SELECTION = ["Enter", " ", "Spacebar"];
export default {
    name: "Navbar",
    components: { Icon },
    props: {
        pauseMode: {
            type: Boolean,
            default: false,
        },
        selected: {
            type: String,
            default: "",
        },
        label: {
            type: String,
            default: "",
        },
    },
    data() {
        return {
            currentPlayer: {},
            userAddress: false,
            cursor: "",
            ddd,
            iconaplay1,
            ghost,
        };
    },
    computed: {
        address() {
            return store.state.alias;
        },
        indicatedNow() {
            return this.selected || this.cursor;
        },
        ownKeyboard() {
            return this.$route.name === "info";
        },
        returnFromAvatar() {
            const from = this.$route.query.from;
            const allowed = ["menu", "ranking", "info"];
            return allowed.includes(from) ? from : "ranking";
        },
    },
    mounted() {
        this.checkToAddress();
        window.addEventListener("keydown", this.keyboard);
        window.addEventListener("click", this.switchOffCursor);
        window.addEventListener("scroll", this.switchOffCursor, { passive: true });
        this.switchOffOnMouse = onMouseMove(this.switchOffCursor);
    },
    beforeDestroy() {
        window.removeEventListener("keydown", this.keyboard);
        window.removeEventListener("click", this.switchOffCursor);
        window.removeEventListener("scroll", this.switchOffCursor);
        this.switchOffOnMouse?.();
    },
    methods: {
        keyboard(event) {
            if (!this.ownKeyboard) return;
            if (event.key === "Escape") {
                this.cursor = "";
                return;
            }
            if (this.cursor && KEYSTROKES_SELECTION.includes(event.key)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.press(this.cursor);
                return;
            }
            if (!ARROWS.includes(event.key)) return;
            if (this.cursor && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                const bar = barTargets();
                const i = bar.indexOf(this.cursor) + step;
                if (bar[i]) this.cursor = bar[i];
                return;
            }
            if (event.key !== "ArrowUp" || window.scrollY > 0) {
                this.cursor = "";
                return;
            }
            event.preventDefault();
            this.cursor = barTargets()[0];
        },
        indicated(name) {
            return this.indicatedNow === name;
        },
        press(name) {
            if (name === "profile") this.identityClick();
            else this.getLinkBurger();
        },
        switchOffCursor() {
            this.cursor = "";
        },
        identityClick() {
            if (this.userAddress && !this.pauseMode) {
                this.navigateToAvatar();
                return;
            }
            this.getLinkBurger();
        },
        navigateToAvatar() {
            const others = this.$route.query.wallet_address !== this.address;
            if (this.userAddress && (this.$route.name !== "avatar" || others)) {
                this.$router.push({
                    path: "avatar",
                    query: {
                        wallet_address: encodeURIComponent(this.address),
                        from: this.$route.name,
                    },
                });
            }
        },
        getLinkBurger() {
            if (this.pauseMode) {
                this.$emit("menu");
                return;
            }
            if (this.$route.name === "avatar") {
                this.$router.push({ path: this.returnFromAvatar });
            } else if (this.$route.name !== "menu") {
                this.$router.push({ path: "menu" });
            } else {
                return;
            }
        },
        checkToAddress() {
            this.userAddress = isWalletAlias(this.address);
            return this.userAddress;
        },
    },
    watch: {
        address() {
            this.checkToAddress();
        },
        $route() {
            this.cursor = "";
        },
    },
};
</script>

<style scoped lang="scss">
.navbar {
    background-color: black;
    height: 80px;
    color: black;
    .burger_menu {
        display: inline;
        position: relative;
        margin-right: 0px;
    }
    .bar-selected {
        outline: 3px solid #ffffff;
        outline-offset: 4px;
        border-radius: 4px;
    }
    img.didakoo {
        width: 60px;
        margin-left: 5px;
        margin-bottom: 3px;
    }
    .avatar_link {
        font-size: 13px;
        color: white;
        img {
            display: inline;
            width: 18px;
            margin-right: 4px;
            margin-bottom: 2px;
        }
    }
    img.icon_identity {
        display: inline;
        width: 18px;
        margin-right: 4px;
        margin-bottom: 2px;
    }
}
.pointer {
    cursor: pointer;
}
</style>
