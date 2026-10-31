import Vue from "vue";
import Vuex from "vuex";
import { currentIdentity } from "../game/identity.js";
import { storageBlocked } from "../game/storage.js";

Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        alias: storageBlocked() ? null : currentIdentity(),
        turn: "white",
        popup: false,
        popupElsewhere: false,
    },

    mutations: {
        SET_ALIAS(state, alias) {
            state.alias = alias;
        },
        CHANGE_TURN(state, val) {
            state.turn = val;
        },
        SET_POPUP(state, opened) {
            state.popup = opened;
        },
        SET_POPUP_ELSEWHERE(state, elsewhere) {
            state.popupElsewhere = elsewhere;
        },
    },
});

export default store;
