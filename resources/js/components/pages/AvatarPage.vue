<template>
    <div id="page4">
        <div class="aligner2">
            <div
                style="
                    padding: 50px 0 50px 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                "
                v-if="userLoading"
            >
                <Loading />
            </div>
            <div v-else>
                <div
                    v-if="userData"
                    style=""
                    class="aligner d-flex container-fluid flex-column justify-content-center px-4 align-items-center"
                >
                    <div
                        :style="{
                            marginBottom: '24px',
                            backgroundColor: 'black',
                            border: '3px solid ' + themeColor,
                        }"
                        class="container-sm avatar mt-4 d-flex flex-column align-items-center px-3"
                    >
                        <div style="background-color: black; width: 100%; margin-top: 40px">
                            <p
                                ref="address"
                                class="avatar-address"
                                :class="{ 'avatar-address--selected': cursor === ADDRESS }"
                                :style="{ color: themeColor }"
                                style="
                                    width: 100%;
                                    padding: 10px;
                                    margin: 0;
                                    overflow-wrap: anywhere;
                                "
                            >
                                <a
                                    :href="linkAddress"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    :style="{ color: themeColor }"
                                >
                                    {{ userData?.alias }}
                                </a>
                            </p>
                        </div>
                        <div
                            v-if="badges.length"
                            class="d-flex flex-wrap justify-content-center mt-2"
                            style="margin-bottom: 24px; gap: 12px"
                        >
                            <span
                                v-for="badge in badges"
                                :key="badge.name"
                                class="icon-tint badge-tint"
                                :title="badge.name"
                                :style="{
                                    color: themeColor,
                                    '--icon': icon(badge.src),
                                    width: badge.ratio * 30 + 'px',
                                    height: '30px',
                                    '--mask-height': badge.scale * 30 + 'px',
                                }"
                            ></span>
                        </div>
                        <p class="mt-3 mb-0 avatar-label">MATCH TOKENS:</p>
                        <p class="mt-3" style="font-size: 33px; color: white">
                            {{ tokensShown }}
                        </p>
                    </div>
                </div>
                <div
                    v-else
                    style="
                        text-align: center;
                        color: #ffffff;
                        font-size: 16px;
                        margin-top: 50px;
                    "
                >
                    <p>User data not found. Please try again.</p>
                </div>
            </div>
        </div>
    </div>
</template>
<script>
import { colorOf, themeColorOf } from "../../utilites/getColorByUserColorId.js";
import { isAddress } from "ethers";
import { getWalletAddress } from "../../game/identity.js";
import { WALLET_NETWORK } from "../../game/wallet.js";
import { readsNetwork } from "../../net/rpc.js";
import { networks, colorKept, stateOf, stateKnown } from "../../net/tokens.js";
import { tokensOf } from "../../net/chain.js";
import Loading from "../includes/Loading.vue";
import { BAR_TARGETS, barTargets } from "../includes/bar.js";
import { onMouseMove } from "../includes/mouse.js";
import { badgesOf, icon } from "../includes/badges.js";

const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const KEYSTROKES_SELECTION = ["Enter", " ", "Spacebar"];
const ADDRESS = "address";

export default {
    components: { Loading },
    data() {
        return {
            userData: null,
            themeColor: "white",
            badges: [],
            userLoading: false,
            wallet: null,
            tokens: null,
            cursor: null,
            ADDRESS,
            scrollingMe: false,
        };
    },
    computed: {
        linkAddress() {
            return `https://opensea.io/${this.userData?.wallet_address}`;
        },
        tokensShown() {
            return this.tokens ?? "-";
        },
        addressVisited() {
            const requested = this.$route.query.wallet_address;
            return typeof requested === "string" && isAddress(requested) ? requested : null;
        },
    },
    methods: {
        icon,
        getPlayerStyles(colorId) {
            this.themeColor = themeColorOf(colorId);
        },

        keyboard(event) {
            if (event.key === "Escape") {
                this.cursor = null;
                return;
            }
            if (this.cursor !== null && KEYSTROKES_SELECTION.includes(event.key)) {
                event.preventDefault();
                if (this.cursor === ADDRESS) window.open(this.linkAddress, "_blank", "noopener");
                else this.$emit("barpress", this.cursor);
                return;
            }
            if (!ARROWS.includes(event.key)) return;
            if (this.cursor === null) {
                event.preventDefault();
                this.goA(ADDRESS);
                return;
            }
            const inBar = BAR_TARGETS.indexOf(this.cursor);
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                if (inBar < 0) {
                    this.cursor = null;
                    return;
                }
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                const bar = barTargets();
                const near = bar[bar.indexOf(this.cursor) + step];
                if (near) this.cursor = near;
                return;
            }
            event.preventDefault();
            if (event.key === "ArrowUp") {
                if (this.cursor === ADDRESS) this.goA(BAR_TARGETS[0]);
                return;
            }
            if (inBar >= 0) this.goA(ADDRESS);
        },

        goA(where) {
            this.cursor = where;
            this.$nextTick(() => {
                const before = window.scrollY;
                if (BAR_TARGETS.includes(where)) window.scrollTo({ top: 0 });
                else this.$refs.address?.scrollIntoView({ block: "nearest" });
                this.scrollingMe = window.scrollY !== before;
            });
        },
        switchOffCursor() {
            if (this.scrollingMe) {
                this.scrollingMe = false;
                return;
            }
            this.cursor = null;
        },
        async colorizeFromToken() {
            const who = this.wallet;
            let its = null;
            try {
                its = (await stateOf(networks(WALLET_NETWORK), [who])).get(who.toLowerCase());
            } catch {}
            if (who !== this.wallet) return;
            this.badges = badgesOf(its?.badges);
            this.getPlayerStyles(colorKept(who, its?.colors) ?? colorOf(who));
            this.userLoading = false;
        },

        async countTokens() {
            const who = this.wallet;
            const ids = await tokensOf(readsNetwork(WALLET_NETWORK), who);
            if (who !== this.wallet) return;
            this.tokens = ids ? ids.length : null;
        },

        load() {
            this.tokens = null;
            this.badges = [];

            const my = getWalletAddress();
            const requested = this.$route.query.wallet_address;
            this.wallet = requested === undefined ? my : this.addressVisited;
            if (!this.wallet) {
                this.$router.replace({ name: "matches" });
                return;
            }

            this.userData = {
                alias: this.wallet,
                wallet_address: this.wallet,
            };
            const known = stateKnown(this.wallet);
            this.userLoading = !known;
            if (known) {
                this.badges = badgesOf(known.badges);
                this.getPlayerStyles(colorKept(this.wallet, known.colors) ?? colorOf(this.wallet));
            }

            this.countTokens();
            this.colorizeFromToken();
        },
    },
    mounted() {
        window.addEventListener("keydown", this.keyboard);
        window.addEventListener("click", this.switchOffCursor);
        window.addEventListener("scroll", this.switchOffCursor, { passive: true });
        this.switchOffOnMouse = onMouseMove(() => { this.cursor = null; });
        this.load();
    },
    beforeDestroy() {
        window.removeEventListener("keydown", this.keyboard);
        window.removeEventListener("click", this.switchOffCursor);
        window.removeEventListener("scroll", this.switchOffCursor);
        this.switchOffOnMouse?.();
    },
    watch: {
        cursor(where) {
            this.$emit("bar", BAR_TARGETS.includes(where) ? where : "");
        },
        "$route.query.wallet_address": function () {
            this.cursor = null;
            this.load();
        },
    },
};
</script>
<style lang="scss">
#page4 .avatar-label {
    font-size: 14px;
    letter-spacing: 2px;
    color: #ffffff;
}
#page4 .avatar-address a:hover {
    text-decoration: none;
}
#page4 .avatar-address--selected a,
html:not(.keyboard) #page4 .avatar-address:hover a {
    text-decoration: underline;
}
#page4 .avatar-address {
    font-size: 16px;
    scroll-margin-top: 90px;
}
@media screen and (min-width: 350px) and (min-height: 150px) {
    #page4 .avatar-address {
        font-size: 25px;
    }
}
</style>
