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
                            border: '3px solid ' + boardColorAvatar,
                        }"
                        class="container-sm avatar mt-4 d-flex flex-column align-items-center px-3"
                    >
                        <p
                            style="
                                position: absolute;
                                display: block;
                                font-size: 20px;
                                left: 84px;
                                top: 25px;
                                color: white;
                            "
                        ></p>
                        <p
                            style="
                                position: absolute;
                                display: block;
                                margin-top: 10px;
                                font-size: 33px;
                                right: 15px;
                                top: 5px;
                                color: white;
                            "
                        >
                            {{ positionShown }}
                        </p>
                        <img
                            id="avataricon"
                            style="margin-top: 80px; margin-bottom: 20px"
                            :src="iconaplayW"
                            alt=""
                        />
                        <div style="background-color: black; width: 100%">
                            <p
                                ref="address"
                                class="avatar-address"
                                :class="{ 'avatar-address--selected': cursor === ADDRESS }"
                                style="
                                    color: white;
                                    width: 100%;
                                    font-size: x-smal;
                                    padding: 10px;
                                    margin: 0;
                                    text-overflow: ellipsis;
                                    white-space: nowrap;
                                    overflow: hidden;
                                "
                            >
                                <img
                                    style="
                                        width: 20px;
                                        margin-left: 5px;
                                        margin-right: 5px;
                                        margin-bottom: 3px;
                                        filter: invert(1);
                                    "
                                    :src="logomarkBlue"
                                />
                                <a
                                    :href="linkAddress"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style="color: #fff"
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
                                class="icon-tint"
                                :title="badge.name"
                                :style="{
                                    color: 'white',
                                    '--icon': icon(badge.src),
                                    width: '30px',
                                    height: '30px',
                                }"
                            ></span>
                        </div>
                        <p class="mt-3" style="font-size: 33px; color: white">
                            {{ scoreShown }}
                            <Icon name="bolt" style="color: #feb442" />
                        </p>
                    </div>
                    <div v-if="wallet" class="container-sm records">
                        <div v-if="recordsLoading" class="records-empty">
                            <Loading />
                        </div>
                        <p v-else-if="!records.length" class="records-empty">
                            NO GAMES ON-CHAIN
                        </p>
                        <div
                            v-else
                            v-for="(r, i) in recordShown"
                            :key="String(r.tokenId)"
                            ref="lines"
                            class="record"
                            :class="{ 'record--selected': cursor === i }"
                            @click="openNft(r)"
                        >
                            <p class="record-line">
                                <span v-if="detail(r)">{{ data(detail(r)) }}</span>
                                <span v-if="detail(r)">{{ now(detail(r)) }}</span>
                                <span v-if="detail(r) && mode(detail(r))">{{ mode(detail(r)) }}</span>
                                <span
                                    v-for="side in sides(r)"
                                    :key="side.color"
                                    class="record-side"
                                    :class="{ 'record-winning': side.wins }"
                                >{{ side.address }}</span>
                            </p>
                        </div>
                        <PlayersPagination
                            ref="pages"
                            :current-page="pageRecord"
                            :pages-count="pagesRecord"
                            @previous="pageRecord -= 1"
                            @next="pageRecord += 1"
                            @goto="pageRecord = $event"
                        />
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
import { colorOf, getColorStyles } from "../../utilites/getColorByUserColorId.js";
import { isAddress } from "ethers";
import { getWalletAddress, abbreviate } from "../../game/identity.js";
import { WALLET_NETWORK } from "../../game/wallet.js";
import { readsNetwork } from "../../net/rpc.js";
import { ranking, positionOf, winsOf, mementosOf } from "../../net/ranking.js";
import { URL_NFT, MEMENTO_ADDRESS } from "../../net/constants.js";
import { networks, choose, stateOf } from "../../net/tokens.js";
import { mementoOf } from "../../net/chain.js";
import Icon from "../includes/Icon.vue";
import Loading from "../includes/Loading.vue";
import PlayersPagination from "./PlayersPagination.vue";
import { BAR_TARGETS, barTargets } from "../includes/bar.js";
import { onMouseMove } from "../includes/mouse.js";
import { badgesOf, icon } from "../includes/badges.js";
import iconaplayW from "../../../images/extra_objects/iconaplayW.svg";
import logomarkBlue from "../../../images/extra_objects/Logomark-BlueB.svg";

const CATEGORIES = ["", "", "A", "P"];
const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const KEYSTROKES_SELECTION = ["Enter", " ", "Spacebar"];
const ADDRESS = "address";
const PAGES = "pages";

export default {
    components: { Icon, Loading, PlayersPagination },
    data() {
        return {
            playersArray: [],
            userData: null,
            boardColorAvatar: "",
            position: null,
            score: null,
            badges: [],
            userLoading: false,
            iconaplayW,
            logomarkBlue,
            wallet: null,
            own: false,
            records: [],
            pageRecord: 1,
            stepRecord: 50,
            recordsLoading: false,
            details: {},
            cursor: null,
            ADDRESS,
            scrollingMe: false,
        };
    },
    computed: {
        uponOneLine() {
            return typeof this.cursor === "number";
        },
        linkAddress() {
            return `https://opensea.io/${this.userData?.wallet_address}`;
        },
        recordShown() {
            const from = (this.pageRecord - 1) * this.stepRecord;
            return this.records.slice(from, from + this.stepRecord);
        },
        pagesRecord() {
            const pages = Math.ceil(this.records.length / this.stepRecord);
            return pages > 1 ? pages : 0;
        },

        positionShown() {
            return `${this.position ?? "-"}°`;
        },
        scoreShown() {
            return this.score === null ? "-" : this.score;
        },
        addressVisited() {
            const requested = this.$route.query.wallet_address;
            return typeof requested === "string" && isAddress(requested) ? requested : null;
        },
    },
    methods: {
        icon,
        getPlayerStyles(colorId) {
            const colorStyles = getColorStyles(colorId);
            this.boardColorAvatar = colorStyles.boardColorAvatar;
        },

        async loadPosition() {
            const who = this.wallet;
            const [count, listing] = await Promise.all([
                winsOf(networks(WALLET_NETWORK), who),
                ranking(networks(WALLET_NETWORK)),
            ]);
            if (who !== this.wallet) return;
            this.score = count;
            this.position = positionOf(listing, who)?.position ?? null;
        },

        keyboard(event) {
            if (event.key === "Escape") {
                this.cursor = null;
                return;
            }
            if (this.cursor !== null && KEYSTROKES_SELECTION.includes(event.key)) {
                event.preventDefault();
                if (this.cursor === PAGES) this.$refs.pages?.press();
                else if (this.cursor === ADDRESS) window.open(this.linkAddress, "_blank", "noopener");
                else if (this.uponOneLine) this.openNft(this.recordShown[this.cursor]);
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
                if (this.cursor === PAGES) {
                    event.preventDefault();
                    this.$refs.pages?.shift(event.key === "ArrowRight" ? 1 : -1);
                    return;
                }
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
            if (event.key === "ArrowUp") {
                if (inBar >= 0) {
                    event.preventDefault();
                    return;
                }
                if (this.cursor === ADDRESS) {
                    event.preventDefault();
                    this.goA(BAR_TARGETS[0]);
                    return;
                }
                if (this.uponOneLine) {
                    event.preventDefault();
                    this.goA(this.cursor === 0 ? ADDRESS : this.cursor - 1);
                    return;
                }
                if (this.cursor === PAGES) {
                    event.preventDefault();
                    this.goA(this.recordShown.length ? this.recordShown.length - 1 : ADDRESS);
                    return;
                }
                if (window.scrollY > 0) {
                    this.cursor = null;
                    return;
                }
                event.preventDefault();
                this.cursor = BAR_TARGETS[0];
                return;
            }
            event.preventDefault();
            if (this.cursor === PAGES) return;
            if (inBar >= 0) {
                this.goA(ADDRESS);
                return;
            }
            const next = this.cursor === ADDRESS ? 0 : this.cursor + 1;
            if (next < this.recordShown.length) this.goA(next);
            else if (this.pagesRecord > 0) this.goA(PAGES);
        },

        goA(where) {
            this.cursor = where;
            if (where === PAGES) this.$refs.pages?.switchOn();
            this.$nextTick(() => {
                const before = window.scrollY;
                if (BAR_TARGETS.includes(where)) {
                    window.scrollTo({ top: 0 });
                } else {
                    const line = where === PAGES ? this.$refs.pages?.$el
                        : where === ADDRESS ? this.$refs.address
                        : this.$refs.lines?.[where];
                    if (!line) return;
                    line.scrollIntoView({ block: "nearest" });
                }
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
        openNft(line) {
            if (line) window.open(this.explorer(line), "_blank", "noopener");
        },

        explorer(line) {
            return `${URL_NFT}${MEMENTO_ADDRESS}/${line.tokenId}`;
        },

        async colorizeFromToken() {
            const who = this.wallet;
            const state = await stateOf(networks(WALLET_NETWORK), [who]);
            if (who !== this.wallet) return;
            const its = state.get(who.toLowerCase());
            this.badges = badgesOf(its?.badges);
            const color = choose(its?.colors);
            if (color) this.getPlayerStyles(color);
        },

        async loadRecord() {
            const who = this.wallet;
            this.recordsLoading = true;
            const entries = await mementosOf(readsNetwork(WALLET_NETWORK), who);
            if (who !== this.wallet) return;
            this.records = entries;
            await this.readDetails();
        },

        async readDetails() {
            const who = this.wallet;
            const fromRead = this.recordShown.filter((line) => !(String(line.tokenId) in this.details));
            if (!fromRead.length) {
                this.recordsLoading = false;
                return;
            }
            this.recordsLoading = true;
            const haveReadAll = await Promise.all(fromRead.map((line) => mementoOf(readsNetwork(WALLET_NETWORK), line.tokenId)));
            if (who !== this.wallet) return;
            fromRead.forEach((line, i) => this.$set(this.details, String(line.tokenId), haveReadAll[i]));
            this.recordsLoading = false;
        },

        detail(line) {
            return this.details[String(line.tokenId)] ?? null;
        },

        mode(d) {
            return CATEGORIES[Number(d.category)] ?? "";
        },
        sides(line) {
            const d = this.detail(line);
            if (!d) return [];
            const white = d.winnerIsWhite ? d.winner : d.loser;
            const black = d.winnerIsWhite ? d.loser : d.winner;
            return [
                { color: "white", address: abbreviate(white), wins: d.winnerIsWhite },
                { color: "black", address: abbreviate(black), wins: !d.winnerIsWhite },
            ];
        },

        now(d) {
            const t = new Date(Number(d.mintedAt) * 1000);
            const two = (n) => String(n).padStart(2, "0");
            return `${two(t.getHours())}:${two(t.getMinutes())}`;
        },
        data(d) {
            const t = new Date(Number(d.mintedAt) * 1000);
            const two = (n) => String(n).padStart(2, "0");
            return `${two(t.getDate())}-${two(t.getMonth() + 1)}-${t.getFullYear()}`;
        },

        load() {
            this.records = [];
            this.pageRecord = 1;
            this.details = {};
            this.position = null;
            this.score = null;
            this.badges = [];

            const my = getWalletAddress();
            const requested = this.$route.query.wallet_address;
            this.wallet = requested === undefined ? my : this.addressVisited;
            if (!this.wallet) {
                this.$router.replace({ name: "ranking" });
                return;
            }
            this.own = !!my && this.wallet.toLowerCase() === my.toLowerCase();

            this.userData = {
                alias: this.wallet,
                wallet_address: this.wallet,
            };
            this.getPlayerStyles(colorOf(this.wallet));

            this.loadRecord();
            this.loadPosition();
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
        cursor(where, before) {
            this.$emit("bar", BAR_TARGETS.includes(where) ? where : "");
            if (before === PAGES && where !== PAGES) this.$refs.pages?.switchOff();
        },
        "$route.query.wallet_address": function () {
            this.cursor = null;
            this.load();
        },
        pageRecord() {
            if (this.uponOneLine) this.cursor = null;
            this.readDetails();
        },
    },
};
</script>
<style lang="scss">
.records {
    margin-top: 24px;
    color: #ffffff;
}
#page4 .records {
    width: fit-content;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
}
.records-title {
    font-size: 14px;
    letter-spacing: 2px;
    margin-bottom: 8px;
    text-align: center;
}
.records-empty {
    font-size: 12px;
    opacity: 0.6;
    padding: 12px 0;
}
#page4 .records .record {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background-color: black;
    padding: 10px 12px;
    margin-bottom: 0;
    cursor: pointer;
}
#page4 .avatar-address--selected,
html:not(.keyboard) #page4 .avatar-address:hover {
    outline: 2px solid #ffffff;
    outline-offset: -2px;
}
#page4 .avatar-address a:hover {
    text-decoration: none;
}
#page4 .avatar-address {
    scroll-margin-top: 90px;
}
.record-line {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.record-line > span:not(:last-child)::after {
    content: "\00b7";
    display: inline-block;
    margin: 0 6px;
    font-size: 13px;
    opacity: 0.5;
}
.record-side {
    font-size: 12px;
    opacity: 0.75;
}
.record-winning {
    color: #46e546;
    opacity: 1;
}
.icons-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 0;
    gap: 5px;
    & > div {
        width: 50px;
        height: 50px;
        display: flex;
        justify-content: center;
        align-items: center;
    }
}
</style>
