<template>
    <div id="page1" class="centerer flex-column align-items-center">
        <div class="menu-actions justify-content-center align-content-center d-flex">
            <div class="bt" v-show="!toggleModal">
                <a
                    type="button"
                    class="pointer"
                    ref="action0"
                    @click="openModal"
                >
                    <div
                        class="square"
                        :class="{ 'square--selected': menuSelected === 0 }"
                    >
                        <Icon
                            name="circle"
                            id="led"
                            :style="{ color: walletLoggedIn ? '#46e546' : 'red' }"
                        />
                        <i
                            v-if="walletLoggedIn"
                            style="font-family: monospace; text-align:center;"
                            id="redj"
                            class="label_reduced"
                        >{{ addressBrief[0] }}<br />{{ addressBrief[1] }}</i>
                        <i v-else style="font-family: monospace; text-align:center;" id="redj"
                                >GUEST</i
                            >
                    </div>
                </a>
                <div
                    @click="navigateToRank()"
                    class="pointer"
                    ref="action1"
                >
                    <div id="modalz">
                        <div
                            class="square"
                            :class="{ 'square--selected': menuSelected === 1 }"
                        >

                            <i style="font-family: monospace" id="redj"
                                >JUNGLE</i
                            >
                        </div>
                    </div>
                </div>



                <div
                    @click="navigateToInfo()"
                    ref="action2"
                    class="pointer text-center pt-md-0 pt-3 ml-md-3 ml-0"
                >
                    <div id="modaly">
                        <div
                            class="square"
                            :class="{ 'square--selected': menuSelected === 2 }"
                        >
                            <i style="font-family: monospace" id="redj" class="label_instructions"
                                >HOW TO PLAY</i
                            >
                        </div>
                    </div>
                </div>



            </div>
            <ConnectWalletModal
                :show="toggleModal"
                style="margin: 0"
                @close="closeModal"
                @notify="showNotify"
                @profile="goOnProfile"
            />
            <Notify :text="notifyText" :type="notifyType" />
        </div>
    </div>
</template>
<script>
import store from "../../store/index.js";
import { isWalletAlias, abbreviate } from "../../game/identity.js";
import Icon from "../includes/Icon.vue";
import Notify from "../includes/Notification.vue";
import ConnectWalletModal from "../Modal/ConnectWalletModal.vue";
import { barTargets } from "../includes/bar.js";
import { onMouseMove } from "../includes/mouse.js";
import elephant6 from "../../../images/board/animals/elephant_6.svg";

const NOTIFY_DURATION_MS = 3000;

const roundOfRightNow = () => [...barTargets(), 0, 1, 2];
const departure = () => roundOfRightNow().indexOf(0);

export default {
    data() {
        return {
            currentIndex: departure(),
            keyboardMode: false,
            toggleModal: false,
            notifyText: null,
            notifyType: "info",
            notifyHandle: null,
            elephant6,
        };
    },
    components: {
        Icon,
        Notify,
        ConnectWalletModal,
    },
    watch: {
        barSelectedOne(name) {
            this.$emit("bar", name);
        },
        walletLoggedIn() {
            this.currentIndex = departure();
        },
    },
    computed: {
        barSelectedOne() {
            const where = this.round[this.currentIndex];
            return this.keyboardMode && typeof where === "string" ? where : "";
        },
        menuSelected() {
            const where = this.round[this.currentIndex];
            return this.keyboardMode && typeof where === "number" ? where : null;
        },
        walletLoggedIn() {
            return isWalletAlias(store.state.alias);
        },
        addressBrief() {
            if (!this.walletLoggedIn) return ["", ""];
            const brief = abbreviate(store.state.alias);
            const cutoff = brief.indexOf("…");
            return [brief.slice(0, cutoff), brief.slice(cutoff)];
        },
        round() {
            return roundOfRightNow();
        },
    },
    methods: {
        openModal() {
            this.toggleModal = true;
        },
        showNotify({ text, type }) {
            clearTimeout(this.notifyHandle);
            this.notifyText = text;
            this.notifyType = type ?? "info";
            this.notifyHandle = setTimeout(() => {
                this.notifyText = null;
            }, NOTIFY_DURATION_MS);
        },
        closeModal() {
            this.toggleModal = false;
        },
        goOnProfile() {
            this.closeModal();
            this.$router.push({
                path: "avatar",
                query: {
                    wallet_address: encodeURIComponent(store.state.alias),
                    from: "menu",
                },
            });
        },
        handleKeyboard(event) {
            if (this.toggleModal) {
                if (event.key === "Escape") this.closeModal();
                return;
            }
            this.keyboardMode = true;

            let col = this.currentIndex;

            switch (event.key) {
                case "ArrowLeft":
                case "ArrowUp":
                    col = col === 0 ? this.round.length - 1 : col - 1;
                    break;
                case "ArrowRight":
                case "ArrowDown":
                    col = col === this.round.length - 1 ? 0 : col + 1;
                    break;
                case "Enter":
                    if (typeof this.round[col] === "number") this.triggerSelectedAction(this.round[col]);
                    else this.$emit("barpress", this.round[col]);
                    return;
                default:
                    return;
            }

            this.currentIndex = col;
        },
        switchOffCursor(event) {
            if (event.isTrusted) this.keyboardMode = false;
        },
        triggerSelectedAction(index) {
            const refName = `action${index}`;
            const el = this.$refs[refName];
            if (el) {
                el.click();
            } else {
                console.warn(`Ref ${refName} not found`);
            }
        },

        navigateToRank() {
            this.$router.push({ path: "ranking" });
        },
        navigateToInfo() {
            this.$router.push({ path: "info" });
        },
    },
    mounted() {
        window.addEventListener("keydown", this.handleKeyboard);
        window.addEventListener("click", this.switchOffCursor);
        this.switchOffOnMouse = onMouseMove(() => { this.keyboardMode = false; });
    },

    beforeDestroy() {
        window.removeEventListener("keydown", this.handleKeyboard);
        window.removeEventListener("click", this.switchOffCursor);
        this.switchOffOnMouse?.();
        clearTimeout(this.notifyHandle);
    },
};
</script>

<style>
.pointer {
    cursor: pointer;
}

#redj.label_reduced {
    font-size: 16px;
}

#redj.label_instructions {
    font-size: 17px;
}

@media screen and (max-height: 586px) {
    #redj.label_reduced {
        font-size: 11px;
    }

    #redj.label_instructions {
        font-size: 12px;
    }
}

.square--selected::before,
.square--selected::after {
    position: absolute;
    font-family: monospace;
    color: black;
    font-size: 28px;
    font-weight: bold;
    line-height: 1;
    pointer-events: none;
}

.square--selected::before {
    content: ">";
    right: 100%;
    top: 50%;
    margin-right: 10px;
    transform: translateY(-50%);
}

.square--selected::after {
    content: "<";
    left: 100%;
    top: 50%;
    margin-left: 10px;
    transform: translateY(-50%);
}

@media (min-width: 500px) {
    .square--selected::before {
        right: auto;
        top: auto;
        margin-right: 0;
        left: 50%;
        bottom: 100%;
        margin-bottom: 6px;
        transform: translateX(-50%) rotate(90deg);
    }

    .square--selected::after {
        left: 50%;
        top: 100%;
        margin-left: 0;
        margin-top: 6px;
        transform: translateX(-50%) rotate(90deg);
    }
}
</style>
