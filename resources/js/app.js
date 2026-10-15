import "./net/environment.js";
import '../sass/app.scss';
import Vue from "vue";
import VueRouter from "vue-router";
import store from "./store/index.js";
import router from "./router/index.js";
import App from "./App.vue";
import { currentIdentity, getWalletAddress, saveWalletAddress } from "./game/identity.js";
import { clearSession, leaveWallet, walletGone, setFloatNetwork, resumeFloatReturns, leaveWarning, keyOwner, adoptedAtBoot } from "./net/logout.js";
import {
    onAccountsChanged, onPopup, popupOpen, readAuthorizedAccounts, resumePopup, sameAddress, walletLocked,
} from "./game/wallet.js";
import { clientOff, downloadAnnouncement, uponShutdown } from "./net/deprecation.js";
import { createSentinel } from "./net/pending.js";
import { keySessionSaved, addressOf, onKeySession } from "./net/keys.js";
import { createTransmitter, matchAbsent } from "./net/chain.js";
import { POLYGON_NETWORK } from "./net/rpc.js";
import { MATCH_ADDRESS, RPC_POLYGON } from "./net/constants.js";
import { CATEGORY } from "./net/messages.js";
import OldVersion from "./components/pages/OldVersion.vue";
import NoStorage from "./components/pages/NoStorage.vue";
import { storageBlocked } from "./game/storage.js";
import WalletWait from "./components/pages/WalletWait.vue";
import { switchOffLoader, switchOffFreeLoader } from "./components/includes/loader.js";
import { installControllers } from "./components/includes/controllers.js";

Vue.use(VueRouter);

installControllers();

if (storageBlocked()) {
    new Vue({ el: "#app", render: (h) => h(NoStorage) });
    switchOffLoader();
} else if (clientOff()) {
    new Vue({ el: "#app", render: (h) => h(OldVersion) });
    switchOffLoader();
} else {
    store.commit("SET_POPUP", popupOpen());
    onPopup((opened) => store.commit("SET_POPUP", opened));
    awaitTheWallet().then(start).then(switchOffFreeLoader);
}

async function awaitTheWallet() {
    if (!popupOpen()) return;
    const waiting = new Vue({ el: "#app", store, render: (h) => h(WalletWait) });
    switchOffLoader();
    const resumed = await resumePopup();
    const seat = document.createElement("div");
    seat.id = "app";
    waiting.$el.parentNode.replaceChild(seat, waiting.$el);
    waiting.$destroy();
    if (resumed?.refused && resumed.type !== "login") location.hash = "#/jungle";
    if (resumed?.type !== "login" || !resumed.account) return;
    const saved = saveWalletAddress(resumed.account);
    if (saved) store.commit("SET_ALIAS", saved);
}

function start() {
    const app = new Vue({
        el: '#app',
        store,
        render: h => h(App),
        router
    });

    uponShutdown(() => switchOff(app));
    downloadAnnouncement();
    if (RPC_POLYGON.length) {
        setFloatNetwork(POLYGON_NETWORK);
        resumeFloatReturns();
    }

    let sentinel = null;
    function alignSentinel() {
        sentinel?.halt();
        sentinel = null;
        const key = keySessionSaved();
        const wallet = key ? keyOwner() ?? getWalletAddress() : null;
        if (!wallet || !key || matchAbsent() || !RPC_POLYGON.length) return;
        const me = { type: "wallet", wallet, key, address: addressOf(key) };
        sentinel = createSentinel({
            chain: { reads: POLYGON_NETWORK, transmitter: createTransmitter(POLYGON_NETWORK, key), address: MATCH_ADDRESS },
            me,
            // On #/online the page patrols, unless it is closed on the account gate.
            active: () => router.currentRoute.path !== "/online" || !sameAddress(wallet, getWalletAddress()),
            onStarted: (entry) => {
                if (router.currentRoute.path === "/online") return;
                const query = entry.match.category === CATEGORY.ARENA ? { mode: "arena" } : {};
                router.push({ path: "/online", query });
            },
            onError: (e) => console.warn("pending agreement", e?.message ?? e),
        });
        sentinel.start();
    }
    alignSentinel();
    store.watch((s) => s.alias, alignSentinel);
    onKeySession(alignSentinel);

    // Another tab changed the wallet or the key.
    window.addEventListener("storage", (e) => {
        if (e.key !== null && e.key !== "walletAddress" && e.key !== "sessionKey") return;
        store.commit("SET_ALIAS", currentIdentity());
        if (e.key !== "walletAddress") alignSentinel();
    });

    async function alignIdentity(accounts) {
        if (!getWalletAddress()) return;
        const locked = accounts.length ? null : await walletLocked();
        if (!walletGone(accounts, locked)) return;
        leaveWallet({ force: true });
        store.commit("SET_ALIAS", currentIdentity());
    }

    readAuthorizedAccounts().then((accounts) => {
        const adopted = adoptedAtBoot(accounts);
        if (adopted && saveWalletAddress(adopted)) return store.commit("SET_ALIAS", adopted);
        return alignIdentity(accounts);
    });

    onAccountsChanged((accounts) => {
        const saved = getWalletAddress();
        if (!saved) return;
        const owner = keyOwner();
        const backToOwner = !!owner && sameAddress(accounts[0], owner) && !sameAddress(saved, owner);
        if (accounts.length && (backToOwner || !accounts.some((a) => sameAddress(a, saved)))) {
            if (saveWalletAddress(accounts[0])) {
                store.commit("SET_ALIAS", accounts[0]);
                if (leaveWarning() === null) clearSession({ to: saved });
                return;
            }
        }
        alignIdentity(accounts);
    });
}

function switchOff(app) {
    if (!clientOff()) return;
    const node = app.$el;
    if (!node?.parentNode) return;
    app.$destroy();
    const seat = document.createElement("div");
    node.parentNode.replaceChild(seat, node);
    new Vue({ el: seat, render: (h) => h(OldVersion) });
}
