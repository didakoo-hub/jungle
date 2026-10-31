import { Interface, isAddress } from "ethers";
import { arenaCountsOf, tokenListsOf } from "./chain.js";
import { ETHEREUM_NETWORK, readsNetwork } from "./rpc.js";

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const GROUPS = Object.freeze([
    {
        name: "Jungle didakoo pass",
        chain: "polygon",
        network: "polygon",
        contract: "0x38dbFDf679445CB9cF423b106b5aB808c72192c5",
        token: [
            { id: "1", badge: "dog" },
            { id: "5", badge: "dog", colorId: 1 },
            { id: "6", badge: "dog", colorId: 3 },
            { id: "7", badge: "dog", colorId: 2 },
            { id: "8", badge: "dog", colorId: 4 },
        ],
    },
    {
        name: "OpenSea Shared Storefront",
        chain: "ethereum",
        network: "ethereum",
        contract: "0x495f947276749Ce646f68AC8c248420045cb7b5e",
        allColorsBadge: "mouse",
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

export const TOKENS_NEEDED = Object.freeze({ leopard: 50, tiger: 150, lion: 300 });

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

const known = new Map();

export function stateKnown(address) {
    return known.get(String(address ?? "").toLowerCase()) ?? null;
}

export async function stateOf(networks, addresses) {
    const list = normalize(addresses);
    const state = new Map(list.map((a) => [a, { badges: [], colors: [] }]));
    if (!list.length) return state;

    const [reads, lists] = await Promise.all([
        Promise.all(GROUPS.map((group) => ownedOf(networks[group.network], list, group))),
        tokenListsOf(networks.polygon, list),
    ]);
    const holders = list.filter((address) =>
        reads.some((owned) => owned.get(address)?.some((t) => TOKENS_NEEDED[t.badge])));
    const counts = lists && holders.length
        ? await arenaCountsOf(networks.polygon, new Map(holders.map((address) => [address, lists.get(address) ?? []])))
        : null;

    GROUPS.forEach((group, i) => {
        for (const [address, itsMany] of reads[i]) {
            const entry = state.get(address);
            const count = counts?.get(address) ?? 0;
            for (const { badge, colorId } of itsMany) {
                const needed = TOKENS_NEEDED[badge];
                if (badge && !entry.badges.includes(badge) && (!needed || count >= needed)) {
                    entry.badges.push(badge);
                }
                if (colorId && !entry.colors.includes(colorId)) entry.colors.push(colorId);
            }
            if (group.allColorsBadge && !entry.badges.includes(group.allColorsBadge)
                && group.token.every((t) => !t.colorId || itsMany.includes(t))) {
                entry.badges.push(group.allColorsBadge);
            }
        }
    });
    for (const [address, entry] of state) known.set(address, entry);
    return state;
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

const chosen = new Map();

export function colorKept(address, colors, rnd = Math.random) {
    const key = String(address ?? "").toLowerCase();
    if (colors?.includes(chosen.get(key))) return chosen.get(key);
    const color = choose(colors, rnd);
    if (color) chosen.set(key, color);
    return color;
}

function normalize(addresses) {
    return [...new Set((addresses ?? []).filter(isAddress).map((a) => a.toLowerCase()))];
}
