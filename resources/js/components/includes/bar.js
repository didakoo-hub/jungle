import store from "../../store/index.js";
import { isWalletAlias } from "../../game/identity.js";

export const BAR_TARGETS = ["burger", "profile"];

export function barTargets() {
    return isWalletAlias(store.state.alias) ? BAR_TARGETS : MATCH_TARGETS;
}

export const MATCH_TARGETS = ["burger"];
