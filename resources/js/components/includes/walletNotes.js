import { ENS_NAME } from "../../net/constants.js";

export const WALLET_CLOSED = {
    gateway: "MetaMask is off on shared IPFS gateways. Open the game at " + ENS_NAME + ".",
    iframe: "MetaMask is off inside another site. Open the game directly at " + ENS_NAME + ".",
};

export const CONNECT_REFUSED = "Connection rejected.";
export const CONNECT_FAILED = "Could not connect. Try again.";
export const WAITING_APPROVAL = "Waiting for approval ...";

export const OPENING_FARCASTER = "Opening Farcaster ...";
export const OPEN_IN_FARCASTER = "Jungle is open in the Farcaster app. You can close this page.";
export const OPEN_IN_FARCASTER_TAB = "Jungle is open in a new tab on Farcaster.";
export const OPEN_IN_NEW_TAB = "Jungle is open in a new tab on Farcaster. You can close this page.";
