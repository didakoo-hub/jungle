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
            <div class="matches">
                <p v-if="heading" class="matches-heading">{{ heading }}</p>
                <div
                    v-for="(match, matchIndex) in records"
                    :key="match.gameId"
                    ref="lines"
                    class="match record-pointer"
                    :class="{ 'match--selected': cursor === matchIndex || pressed === matchIndex }"
                    @pointerdown="press($event, matchIndex)"
                    @click="openToken(match)"
                >
                    <p class="match-line">
                        <span class="match-text">
                            <span>{{ dateOf(match) }}</span>
                            <span>{{ timeOf(match) }}</span>
                            <span>{{ modeOf(match) }}</span>
                            <span>{{ endingOf(match) }}</span>
                            <span>{{ movesOf(match) }}</span>
                        </span>
                    </p>
                    <div
                        v-for="side in match.sides"
                        :key="side.color"
                        class="match-side"
                        :style="{ color: side.themeColor }"
                    >
                        <span class="match-address">{{ side.address }}</span>
                        <span v-if="side.badges.length" class="match-badges">
                            <span
                                v-for="badge in side.badges"
                                :key="badge.name"
                                class="icon-tint badge-tint"
                                :title="badge.name"
                                :style="{
                                    '--icon': icon(badge.src),
                                    width: badge.ratio * 14 + 'px',
                                    height: '14px',
                                    '--mask-height': badge.scale * 14 + 'px',
                                }"
                            ></span>
                        </span>
                        <span v-if="side.wins" class="match-win">WIN</span>
                    </div>
                </div>
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
import { colorOf, themeColorOf } from "../../utilites/getColorByUserColorId.js";
import { ensureIdentity } from "../../game/identity.js";
import { WALLET_NETWORK } from "../../game/wallet.js";
import {
    MATCHES_HEARTBEAT_MS, MATCHES_PAGE, latestMatches, matchesCount, moreMatches, savedMatches, walletsOf,
} from "../../net/matches.js";
import { END_REASON } from "../../net/messages.js";
import { MEMENTO_ADDRESS, URL_NFT } from "../../net/constants.js";
import { networks, colorKept, stateOf } from "../../net/tokens.js";
import PlayersPagination from "./PlayersPagination.vue";
import Loading from "../includes/Loading.vue";
import icon06 from "../../../images/extra_objects/icon-06.svg";
import icon05 from "../../../images/extra_objects/icon-05.svg";
import { BAR_TARGETS, barTargets } from "../includes/bar.js";
import { onMouseMove } from "../includes/mouse.js";
import { badgesOf, icon } from "../includes/badges.js";

const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const KEYSTROKES_SELECTION = ["Enter", " ", "Spacebar"];
const PLAY = "play";
const PAGES = "pages";
const CATEGORIES = ["", "", "A", "P"];
const ENDINGS = {
    [END_REASON.PYRAMID]: "PYRAMID",
    [END_REASON.RESIGNED]: "RESIGNED",
    [END_REASON.WIPEOUT]: "WIPEOUT",
};
const HEADING = "MINTED WINS";
const HEADING_EMPTY = "NO MINTED WINS YET";
const two = (n) => String(n).padStart(2, "0");
const STATES = new Map();
const REQUESTED = new Set();
export default {
    components: {
        PlayersPagination,
        Loading,
    },
    data() {
        return {
            listing: null,
            saved: [],
            states: Object.fromEntries(STATES),
            currentPage: 1,
            offset: MATCHES_PAGE,
            isLoading: false,
            cursor: null,
            pressed: null,
            scrollingMe: false,
            icon06,
            icon05,
        };
    },
    computed: {
        lines() {
            return this.listing ? this.listing.lines : this.saved;
        },
        page() {
            const from = (this.currentPage - 1) * this.offset;
            return this.lines.slice(from, from + this.offset);
        },
        pageReady() {
            return walletsOf(this.page).every((address) => address in this.states);
        },
        records() {
            if (!this.pageReady) return [];
            return this.page.map((line) => ({
                ...line,
                sides: [
                    this.sideOf(line.white, "white", line.winnerIsWhite),
                    this.sideOf(line.black, "black", !line.winnerIsWhite),
                ],
            }));
        },
        heading() {
            if (this.records.length) return HEADING;
            return this.listing && !this.lines.length ? HEADING_EMPTY : "";
        },
        uponOneLine() {
            return typeof this.cursor === "number";
        },
        pagesCount() {
            const count = this.listing ? matchesCount(this.listing) : this.saved.length;
            const pages = Math.ceil(count / this.offset);
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
            this.readPage();
        },
    },
    methods: {
        icon,
        sideOf(address, color, wins) {
            const state = this.states[address.toLowerCase()];
            return {
                address,
                color,
                wins,
                badges: badgesOf(state?.badges, { fitted: true }),
                themeColor: themeColorOf(colorKept(address, state?.colors) ?? colorOf(address)),
            };
        },
        dateOf(match) {
            const t = new Date(match.mintedAt * 1000);
            return `${two(t.getDate())}-${two(t.getMonth() + 1)}-${t.getFullYear()}`;
        },
        timeOf(match) {
            const t = new Date(match.mintedAt * 1000);
            return `${two(t.getHours())}:${two(t.getMinutes())}`;
        },
        modeOf(match) {
            return CATEGORIES[match.category] ?? "";
        },
        endingOf(match) {
            return ENDINGS[match.endReason] ?? "";
        },
        movesOf(match) {
            return match.moves === 1 ? "1 MOVE" : `${match.moves} MOVES`;
        },
        keyboard(event) {
            if (event.key === "Escape") {
                this.cursor = null;
                return;
            }
            if (this.cursor !== null && KEYSTROKES_SELECTION.includes(event.key)) {
                event.preventDefault();
                if (this.cursor === PLAY) this.startGame();
                else if (this.cursor === PAGES) this.$refs.pages?.press();
                else if (this.uponOneLine) this.openToken(this.records[this.cursor]);
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
                    this.goA(this.records.length ? this.records.length - 1 : PLAY);
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
            if (next >= this.records.length) {
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
        press(event, where) {
            if (event.button === 0) this.pressed = where;
        },
        release() {
            this.pressed = null;
        },
        openToken(match) {
            if (match) window.open(`${URL_NFT}${MEMENTO_ADDRESS}/${match.gameId}`, "_blank", "noopener");
        },
        startGame() {
            store.commit("SET_ALIAS", ensureIdentity());
            this.$router.push({ path: "jungle" });
        },
        async loadMatches() {
            this.saved = savedMatches().lines;
            this.isLoading = !this.saved.length;
            if (this.saved.length) this.decorate(this.page, { reread: true });
            await this.update();
            this.heartbeat = setInterval(() => {
                if (!document.hidden) this.update();
            }, MATCHES_HEARTBEAT_MS);
        },

        async update() {
            if (this.reading) return;
            this.reading = true;
            try {
                const listing = await latestMatches(networks(WALLET_NETWORK).polygon, {
                    upTo: this.currentPage * this.offset,
                });
                if (!listing) return;
                const from = (this.currentPage - 1) * this.offset;
                await this.decorate(listing.lines.slice(from, from + this.offset));
                if (!this.alive) return;
                this.listing = listing;
            } catch {
            } finally {
                this.reading = false;
                this.isLoading = false;
            }
        },

        async readPage() {
            const upTo = this.currentPage * this.offset;
            if (this.listing && this.listing.lines.length < upTo && !this.reading) {
                this.reading = true;
                try {
                    const listing = await moreMatches(networks(WALLET_NETWORK).polygon, this.listing, upTo);
                    if (listing && this.alive) this.listing = listing;
                } catch {
                } finally {
                    this.reading = false;
                }
            }
            this.decorate(this.page);
        },

        onComeback() {
            if (!document.hidden) this.update();
        },

        async decorate(lines, { reread = false } = {}) {
            const newOnes = walletsOf(lines).filter((address) => reread || !REQUESTED.has(address));
            if (!newOnes.length) return;
            newOnes.forEach((address) => REQUESTED.add(address));

            let state;
            try {
                state = await stateOf(networks(WALLET_NETWORK), newOnes);
            } catch {
                newOnes.forEach((address) => REQUESTED.delete(address));
                return;
            }
            newOnes.forEach((address) => {
                const its = state.get(address) ?? {};
                STATES.set(address, its);
                if (this.alive) this.$set(this.states, address, its);
            });
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
        window.addEventListener("pointerup", this.release);
        window.addEventListener("pointercancel", this.release);
        this.switchOffOnMouse = onMouseMove(() => { this.cursor = null; });
        document.addEventListener("visibilitychange", this.onComeback);
        this.loadMatches();
    },
    beforeDestroy() {
        this.alive = false;
        clearInterval(this.heartbeat);
        window.removeEventListener("keydown", this.keyboard);
        window.removeEventListener("click", this.switchOffCursor);
        window.removeEventListener("scroll", this.switchOffCursor);
        window.removeEventListener("pointerup", this.release);
        window.removeEventListener("pointercancel", this.release);
        document.removeEventListener("visibilitychange", this.onComeback);
        this.switchOffOnMouse?.();
    },
};
</script>
<style>
#page2 .matches {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(10px, 1fr) auto minmax(10px, 1fr);
}
#page2 .matches-heading {
    grid-column: 1 / -1;
    margin: 0 0 15px;
    text-align: center;
    text-wrap: balance;
    font-size: 13px;
    line-height: 1.2;
    color: #ffffff;
}
#page2 .match {
    position: relative;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    row-gap: 2px;
    padding: 27px 0 25px;
    line-height: 1.2;
    scroll-margin-top: 90px;
}
#page2 .match > * {
    grid-column: 2;
    min-width: 0;
}
#page2 .match-line {
    position: relative;
    justify-self: start;
    max-width: 100%;
    margin: 0 0 4px;
    font-size: 13px;
    color: #ffffff;
}
#page2 .match-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#page2 .match--selected .match-line {
    box-shadow: 0 1px 0 #ffffff;
}
#page2 .match--selected .match-line::before,
#page2 .match--selected .match-line::after {
    position: absolute;
    top: 0;
    font-size: 20px;
    line-height: 15.6px;
    pointer-events: none;
}
#page2 .match--selected .match-line::before {
    content: ">";
    right: 100%;
    margin-right: 6px;
}
#page2 .match--selected .match-line::after {
    content: "<";
    left: 100%;
    margin-left: 6px;
}
#page2 .match-text > span:not(:last-child)::after {
    content: "\00b7";
    display: inline-block;
    margin: 0 6px;
    opacity: 0.5;
}
#page2 .match-side {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
#page2 .match-address {
    min-width: 0;
    font-size: 14.5px;
    padding: 3px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#page2 .match-badges {
    display: flex;
    flex: none;
    gap: 7px;
    margin-top: -5px;
    position: relative;
    top: 2px;
}
#page2 .match-win {
    flex: none;
    margin-left: 6px;
    font-size: 14.5px;
}
@media (max-width: 575.98px) {
    #page2 .rank {
        padding-left: 12px;
        padding-right: 12px;
    }
}
</style>
