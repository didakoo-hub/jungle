export const PROTOCOL_V = 1;

export const CHAIN_ID = 137;

export const P_CHANNELS = [
    { streamId: "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/jungle-didakoo", partitions: 99 },
];

export const A_CHANNELS = [
    { streamId: "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/didakoo-jungle-arena", partitions: 99 },
];

export const P_GUEST_CHANNELS = [
    { streamId: "0x2be52242593369ec5fbaa9e36801ce4dc95cb04c/jungle-didakoo-guest", partitions: 99 },
];

export const STREAMR_REGISTRY = "0x0D483E10612F327FC11965Fc82E90dC19b141641";

export function channelsFor(type) {
    return type === "guest" ? { P: P_GUEST_CHANNELS, A: null } : { P: P_CHANNELS, A: A_CHANNELS };
}

export const TRIAL_STREAM = false;


export const STREAMR_NETWORK = "polygon";

export const MATCH_ADDRESS = "0xB4E544179A2892f0982F8E468e316CcB213C712A";

export const BLOCK_MATCH = 94904362;

export const MEMENTO_ADDRESS = "0x936ad1A3dF9f70d26be95e479E02b2Cf15f96Cd6";

export const PASS_ADDRESS = "0x8049461bE5C04e91957D5c5Fb1Bd6829edc08396";

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
        || [...P_CHANNELS, ...A_CHANNELS, ...P_GUEST_CHANNELS].some((c) =>
            c.streamId.startsWith("0x0000000000000000000000000000000000000000"))
        || D_ADDRESS === "0x0000000000000000000000000000000000000000"
        || MATCH_ADDRESS === "0x0000000000000000000000000000000000000000"
        || MEMENTO_ADDRESS === "0x0000000000000000000000000000000000000000"
        || PASS_ADDRESS === "0x0000000000000000000000000000000000000000"
        || DEPRECATION_URLS.length === 0;
}
