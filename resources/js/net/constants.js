export const PROTOCOL_V = 6;

export const GAME_VERSION = "1.6";

export const CHAIN_ID = 137;

export const P_CHANNELS = [
    { streamId: "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/jungle-didakoo", partitions: 99 },
];

export const P_GUEST_CHANNELS = [
    { streamId: "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/jungle-didakoo-guest", partitions: 99 },
];

export const STREAMR_REGISTRY = "0x0D483E10612F327FC11965Fc82E90dC19b141641";

export function channelsFor(type) {
    return type === "guest" ? { P: P_GUEST_CHANNELS } : { P: P_CHANNELS };
}

export const TRIAL_STREAM = false;


export const STREAMR_NETWORK = "polygon";

export const MATCH_ADDRESS = "0x08671180Bb07e90de3Ba135908d41368F730aF7d";

export const BLOCK_MATCH = 96416075;

export const MEMENTO_ADDRESS = "0x1F1318ADEC325Ad3338d928738636929B393d60c";

export const PASS_ADDRESS = "0x347D3ae3039b40fd6247d328821387391e113aa1";

export const RPC_POLYGON = Object.freeze([
    "https://polygon.gateway.tenderly.co",
    "https://137.rpc.thirdweb.com",
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
]);
export const RPC_ETHEREUM = Object.freeze([
    "https://ethereum-rpc.publicnode.com",
    "https://mainnet.gateway.tenderly.co",
    "https://eth.drpc.org",
]);

export const URL_NFT = "https://opensea.io/assets/matic/";

export const D_ADDRESS = "0xfBF8d3C5943AdF4564e0b40643d3a641436d8D87";

export const ENS_NAME = "jungle.didakoo.eth";

export const DEPRECATION_URLS = Object.freeze([
    "https://closejungle.didakoo.eth.limo/announcement.json",
    "https://raw.githubusercontent.com/didakoo-hub/jungle-deprecation-announcement/main/announcement.json",
]);

export function placeholdersToReplace() {
    return TRIAL_STREAM
        || STREAMR_NETWORK !== "polygon"
        || [...P_CHANNELS, ...P_GUEST_CHANNELS].some((c) =>
            c.streamId.startsWith("0x0000000000000000000000000000000000000000"))
        || D_ADDRESS === "0x0000000000000000000000000000000000000000"
        || MATCH_ADDRESS === "0x0000000000000000000000000000000000000000"
        || MEMENTO_ADDRESS === "0x0000000000000000000000000000000000000000"
        || PASS_ADDRESS === "0x0000000000000000000000000000000000000000"
        || DEPRECATION_URLS.length === 0;
}
