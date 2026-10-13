<template>
    <div id="page2">
        <div
            id="_box1_"
            class="container-sm d-flex justify-content-center align-items-center flex-column"
        >
            <div
                class="d-flex flex-column justify-content-center alingn-items-center"
            >
                <div class="d-flex justify-content-center alingn-items-center">
                    <img
                        style="
                            height: 60px;
                            margin-top: 20px;
                            display: 1;
                            transform: scaleX(-1);
                        "
                        :src="icon06"
                        alt="didakoo"
                    />
                    <div
                        @click="startGame()"
                        style="display: contents"
                        class="pointer"
                    >
                        <button
                            id="modalx"
                            class="no-wrap align-items-center text-big d-flex call_button"
                            :class="{ 'call_button--selected': cursor === 'play' }"
                        >
                            <span
                                style="
                                    font-size: 20px;
                                    font-family: monospace;
                                    padding: 20px;
                                "
                            >PLAY JUNGLE</span>
                        </button>
                    </div>
                    <img
                        style="
                            height: 60px;
                            margin-top: 20px;
                            display: 1;
                        "
                        :src="icon05"
                        alt="didakoo"
                    />
                </div>
            </div>
        </div>
        <div
            style="max-width: 800px"
            class="rank d-flex container-sm flex-column align-items-center text-white"
        >
            <div
                v-for="(player, playerListIndex) in players"
                :key="player.alias"
                ref="lines"
                class="record record-pointer"
                :class="{ 'record--selected': cursor === playerListIndex }"
                :style="{ backgroundColor: 'black', textDecoration: 'none' }"
                @click="openProfile(player.alias)"
            >
                <div
                    :style="{
                        color: player.themeColor,
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                    }"
                >
                    <p
                        :style="{
                            color: player.themeColor,
                            fontSize: '14.5px',
                            padding: '10px',
                            margin: '0',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            fontWeight: 'bold',
                        }"
                    >
                        <span
                            :style="{
                                color: player.themeColor,
                                fontSize: '16px',
                                fontWeight: 'bold',
                            }"
                            >{{ getUserRank(playerListIndex) }}°</span
                        >
                        <span
                            class="icon-tint"
                            :style="{
                                color: player.themeColor,
                                '--icon': icon(player.avatarSrc),
                                width: '20px',
                                height: '20px',
                                marginLeft: '5px',
                                marginRight: '5px',
                                marginBottom: '-3px',
                            }"
                        ></span>
                        {{ player.alias }}
                    </p>
                </div>

                <div
                    :style="{
                        flex: '1',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '7px',
                        color: player.themeColor,
                    }"
                >
                    <span
                        v-for="badge in player.badges"
                        :key="badge.name"
                        class="icon-tint"
                        :title="badge.name"
                        :style="{
                            '--icon': icon(badge.src),
                            width: '16px',
                            height: '16px',
                        }"
                    ></span>
                </div>

                <span
                    class="align-items-center"
                    :style="{
                        color: player.themeColor,
                        marginRight: '10px',
                        whiteSpace: 'nowrap',
                        backgroundColor: '',
                        padding: '0 10px',
                        borderRadius: '20px',
                        display: 'flex',
                        fontWeight: 'bold',
                    }"
                >
                    {{ player.power }}
                    <Icon
                        name="bolt"
                        class="ml-1"
                        :style="{ color: player.themeColor }"
                    />
                </span>
            </div>
            <PlayersPagination
                ref="pages"
                :current-page="currentPage"
                :pages-count="pagesCount"
                @previous="currentPage -= 1"
                @next="currentPage += 1"
                @goto="currentPage = $event"
            />

            <div class="my-5" v-if="isLoading || !pageReady">
                <Loading />
            </div>
        </div>
    </div>
</template>
<script>
import store from "../../store/index.js";
import { colorOf, getColorStyles } from "../../utilites/getColorByUserColorId.js";
import { ensureIdentity } from "../../game/identity.js";
import { WALLET_NETWORK } from "../../game/wallet.js";
import { ranking, savedRanking, RANKING_HEARTBEAT_MS } from "../../net/ranking.js";
import { networks, choose, stateOf } from "../../net/tokens.js";
import PlayersPagination from "./PlayersPagination.vue";
import Icon from "../includes/Icon.vue";
import Loading from "../includes/Loading.vue";
import icon06 from "../../../images/extra_objects/icon-06.svg";
import icon05 from "../../../images/extra_objects/icon-05.svg";
import iconaplayB from "../../../images/extra_objects/iconaplayB.svg";
import { BAR_TARGETS, barTargets } from "../includes/bar.js";
import { onMouseMove } from "../includes/mouse.js";
import { badgesOf, icon } from "../includes/badges.js";

const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const KEYSTROKES_SELECTION = ["Enter", " ", "Spacebar"];
const PLAY = "play";
const PAGES = "pages";
const inLines = (listing) => listing.map(({ address, wins }) => ({ alias: address, power: wins }));
const STATES = new Map();
const REQUESTED = new Set();
export default {
    components: {
        PlayersPagination,
        Icon,
        Loading,
    },
    data() {
        return {
            lines: [],
            states: Object.fromEntries(STATES),
            currentPage: 1,
            offset: 50,
            url: "",
            backgroundBord: "",
            colorAddress: "",
            colorPower: "",
            avatarSrc: "",
            textDecorationAddress: "",
            colorId: "",
            isLoading: false,
            cursor: null,
            scrollingMe: false,
            icon06,
            icon05,
        };
    },
    computed: {
        page() {
            const from = (this.currentPage - 1) * this.offset;
            return this.lines.slice(from, from + this.offset);
        },
        pageReady() {
            return this.page.every((line) => line.alias.toLowerCase() in this.states);
        },
        players() {
            if (!this.pageReady) return [];
            return this.page.map((line) => {
                const state = this.states[line.alias.toLowerCase()];
                return {
                    ...line,
                    badges: badgesOf(state?.badges),
                    ...this.getPlayerStyles(choose(state?.colors) ?? colorOf(line.alias)),
                };
            });
        },
        uponOneLine() {
            return typeof this.cursor === "number";
        },
        pagesCount() {
            const pages = Math.ceil(this.lines.length / this.offset);
            return pages > 1 ? pages : 0;
        },
    },
    watch: {
        cursor(where, before) {
            this.$emit("bar", BAR_TARGETS.includes(where) ? where : "");
            if (before === PAGES && where !== PAGES) this.$refs.pages?.switchOff();
        },
        currentPage() {
            if (this.uponOneLine) this.cursor = null;
            this.decoratePage();
        },
    },
    methods: {
        icon,
        keyboard(event) {
            if (event.key === "Escape") {
                this.cursor = null;
                return;
            }
            if (this.cursor !== null && KEYSTROKES_SELECTION.includes(event.key)) {
                event.preventDefault();
                if (this.cursor === PLAY) this.startGame();
                else if (this.cursor === PAGES) this.$refs.pages?.press();
                else if (this.uponOneLine) this.openProfile(this.players[this.cursor].alias);
                else this.$emit("barpress", this.cursor);
                return;
            }
            if (!ARROWS.includes(event.key)) return;
            if (this.cursor === null) {
                event.preventDefault();
                this.cursor = PLAY;
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
                if (this.uponOneLine) {
                    event.preventDefault();
                    this.goA(this.cursor === 0 ? PLAY : this.cursor - 1);
                    return;
                }
                if (this.cursor === PAGES) {
                    event.preventDefault();
                    this.goA(this.players.length ? this.players.length - 1 : PLAY);
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
            if (inBar >= 0) {
                event.preventDefault();
                this.cursor = PLAY;
                return;
            }
            if (this.cursor === PAGES) {
                event.preventDefault();
                return;
            }
            const next = this.cursor === PLAY ? 0 : this.cursor + 1;
            if (next >= this.players.length) {
                event.preventDefault();
                if (this.pagesCount > 0) this.goA(PAGES);
                return;
            }
            event.preventDefault();
            this.goA(next);
        },

        goA(where) {
            this.cursor = where;
            if (where === PAGES) this.$refs.pages?.switchOn();
            this.$nextTick(() => {
                const before = window.scrollY;
                if (where === PLAY) {
                    window.scrollTo({ top: 0 });
                } else {
                    const line = where === PAGES ? this.$refs.pages?.$el : this.$refs.lines?.[where];
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
        openProfile(address) {
            this.$router.push({
                path: "avatar",
                query: { wallet_address: address, from: "ranking" },
            });
        },
        startGame() {
            store.commit("SET_ALIAS", ensureIdentity());
            this.$router.push({ path: "jungle" });
        },
        async loadRanking() {
            this.lines = inLines(savedRanking());
            this.isLoading = !this.lines.length;
            if (this.lines.length) this.decorate(this.page, { reread: true });
            await this.update();
            this.heartbeat = setInterval(() => {
                if (!document.hidden) this.update();
            }, RANKING_HEARTBEAT_MS);
        },

        async update() {
            if (this.reading) return;
            this.reading = true;
            try {
                const lines = inLines(await ranking(networks(WALLET_NETWORK)));
                const from = (this.currentPage - 1) * this.offset;
                await this.decorate(lines.slice(from, from + this.offset));
                if (!this.alive) return;
                this.lines = lines;
            } catch {
                // The saved lines stay on screen.
            } finally {
                this.reading = false;
                this.isLoading = false;
            }
        },

        onComeback() {
            if (!document.hidden) this.update();
        },

        decoratePage() {
            return this.decorate(this.page);
        },

        async decorate(lines, { reread = false } = {}) {
            const newOnes = lines
                .map((line) => line.alias)
                .filter((address) => reread || !REQUESTED.has(address.toLowerCase()));
            if (!newOnes.length) return;
            newOnes.forEach((address) => REQUESTED.add(address.toLowerCase()));

            let state;
            try {
                state = await stateOf(networks(WALLET_NETWORK), newOnes);
            } catch {
                newOnes.forEach((address) => REQUESTED.delete(address.toLowerCase()));
                return;
            }
            newOnes.forEach((address) => {
                const key = address.toLowerCase();
                const its = state.get(key) ?? {};
                STATES.set(key, its);
                if (this.alive) this.$set(this.states, key, its);
            });
        },

        getUserRank(index) {
            return `${(this.currentPage - 1) * this.offset + index + 1}`;
        },

        getPlayerStyles(colorId) {
            const colorStyles = getColorStyles(colorId);

            let themeColor = colorStyles.backgroundBord ?? "#EDEB52";

            if (colorStyles.backgroundBord === "black") {
                themeColor = "#CCCCCC";
            }

            return {
                backgroundBord: colorStyles.backgroundBord ?? "#EDEB52",
                themeColor: themeColor,
                colorAddress: colorStyles.colorAddress ?? "black",
                colorPower: colorStyles.colorPower ?? "black",
                avatarSrc: iconaplayB,
                textDecorationAddress:
                    colorStyles.textDecorationAddress ?? "black",
                colorId: colorStyles.colorId,
            };
        },
    },
    created() {
        this.alive = true;
        this.heartbeat = null;
        this.reading = false;
    },
    mounted() {
        window.addEventListener("keydown", this.keyboard);
        window.addEventListener("click", this.switchOffCursor);
        window.addEventListener("scroll", this.switchOffCursor, { passive: true });
        this.switchOffOnMouse = onMouseMove(() => { this.cursor = null; });
        document.addEventListener("visibilitychange", this.onComeback);
        this.loadRanking();
    },
    beforeDestroy() {
        this.alive = false;
        clearInterval(this.heartbeat);
        window.removeEventListener("keydown", this.keyboard);
        window.removeEventListener("click", this.switchOffCursor);
        window.removeEventListener("scroll", this.switchOffCursor);
        document.removeEventListener("visibilitychange", this.onComeback);
        this.switchOffOnMouse?.();
    },
};
</script>
