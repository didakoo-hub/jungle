import { Interface, isAddress } from "ethers";
import { ETHEREUM_NETWORK, readsNetwork } from "./rpc.js";

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const GROUPS = Object.freeze([
    {
        name: "Jungle didakoo pass",
        chain: "polygon",
        network: "polygon",
        contract: "0x38dbFDf679445CB9cF423b106b5aB808c72192c5",
        token: [
            { id: "1" },
            { id: "5", colorId: 1 },
            { id: "6", colorId: 3 },
            { id: "7", colorId: 2 },
            { id: "8", colorId: 4 },
        ],
    },
    {
        name: "OpenSea Shared Storefront",
        chain: "ethereum",
        network: "ethereum",
        contract: "0x495f947276749Ce646f68AC8c248420045cb7b5e",
        token: [
            { id: "109412144875301169681210938441685435107180596113732411917774090355625099803288", badge: "leopard" },
            { id: "109412144875301169681210938441685435107180596113732411917774090356724611429064", badge: "tiger" },
            { id: "109412144875301169681210938441685435107180596113732411917774090357824123055840", badge: "lion" },
            { id: "109412144875301169681210938441685435107180596113732411917774090342430960255976", badge: "elephant", colorId: 4 },
            { id: "109412144875301169681210938441685435107180596113732411917774090343530471883752", badge: "elephant", colorId: 3 },
            { id: "109412144875301169681210938441685435107180596113732411917774090344629983511528", badge: "elephant", colorId: 2 },
            { id: "109412144875301169681210938441685435107180596113732411917774090345729495139304", badge: "elephant", colorId: 1 },
        ],
    },
    {
        name: "CryptoKitties",
        chain: "ethereum",
        network: "ethereum",
        type: "erc721",
        contract: "0x06012c8cf97BEaD5deAe237070F9587f8E7A266d",
        token: [{ badge: "cat" }],
    },
    {
        name: "Bored Ape Yacht Club",
        chain: "ethereum",
        network: "ethereum",
        type: "erc721",
        contract: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
        token: [{ badge: "monkey" }],
    },
].map(Object.freeze));

const ABI = new Interface([
    "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
    "function balanceOf(address owner) view returns (uint256)",
    "function aggregate3((address target, bool allowFailure, bytes callData)[] calls)"
        + " view returns ((bool success, bytes returnData)[])",
]);

export function callOf(addresses, group) {
    if (group.type === "erc721") {
        const calls = addresses.map((address) => ({
            target: group.contract,
            allowFailure: true,
            callData: ABI.encodeFunctionData("balanceOf", [address]),
        }));
        return { a: MULTICALL3, data: ABI.encodeFunctionData("aggregate3", [calls]) };
    }

    const counts = [];
    const ids = [];
    for (const address of addresses) {
        for (const { id } of group.token) {
            counts.push(address);
            ids.push(id);
        }
    }
    return {
        a: group.contract,
        data: ABI.encodeFunctionData("balanceOfBatch", [counts, ids]),
    };
}

function balancesFrom(response, group) {
    if (group.type === "erc721") {
        const [outcomes] = ABI.decodeFunctionResult("aggregate3", response);
        return outcomes.map(({ success, returnData }) =>
            (success && returnData?.length === 66 ? BigInt(returnData) : 0n));
    }
    const [balances] = ABI.decodeFunctionResult("balanceOfBatch", response);
    return balances;
}

export async function ownedOf(network, addresses, group) {
    const owned = new Map();
    const list = normalize(addresses);
    if (!network || !list.length) return owned;

    let balances;
    try {
        const { a, data } = callOf(list, group);
        balances = balancesFrom(await network.call(a, data), group);
    } catch {
        return owned;
    }
    if (balances?.length !== list.length * group.token.length) return owned;

    list.forEach((address, i) => {
        const itsMany = group.token.filter((_, k) => balances[i * group.token.length + k] > 0n);
        if (itsMany.length) owned.set(address, itsMany);
    });
    return owned;
}

export async function stateOf(networks, addresses) {
    const list = normalize(addresses);
    const state = new Map(list.map((a) => [a, { badges: [], colors: [] }]));
    if (!list.length) return state;

    const reads = await Promise.all(
        GROUPS.map((group) => ownedOf(networks[group.network], list, group)));

    GROUPS.forEach((group, i) => {
        for (const [address, itsMany] of reads[i]) {
            const entry = state.get(address);
            for (const { badge, colorId } of itsMany) {
                if (badge && !entry.badges.includes(badge)) {
                    entry.badges.push(badge);
                }
                if (colorId && !entry.colors.includes(colorId)) entry.colors.push(colorId);
            }
        }
    });
    return state;
}

export async function balances721(network, addresses, contract) {
    const list = normalize(addresses);
    if (!network || !list.length || !isAddress(contract)) return [];
    const group = { type: "erc721", contract, token: [{}] };
    try {
        const { a, data } = callOf(list, group);
        const balances = balancesFrom(await network.call(a, data), group);
        if (balances.length !== list.length) return [];
        return balances.map(Number);
    } catch {
        return [];
    }
}

export function networks(wallet) {
    return {
        polygon: readsNetwork(wallet),
        ethereum: ETHEREUM_NETWORK,
    };
}

export function choose(colors, rnd = Math.random) {
    if (!colors?.length) return null;
    return colors[Math.floor(rnd() * colors.length)];
}

function normalize(addresses) {
    return [...new Set((addresses ?? []).filter(isAddress).map((a) => a.toLowerCase()))];
}
