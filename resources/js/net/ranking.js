import { isAddress } from "ethers";
import { holders, tokensOf } from "./chain.js";
import { balances721 } from "./tokens.js";
import { MEMENTO_ADDRESS } from "./constants.js";

export const RANKING_CAP = 200;

export const RANKING_HEARTBEAT_MS = 60_000;

export function linesMemory(key) {
    return Object.freeze({
        read(contract) {
            try {
                const entry = JSON.parse(localStorage.getItem(key) ?? "null");
                if (!entry || entry.contract?.toLowerCase() !== contract.toLowerCase()) return null;
                return entry;
            } catch {
                return null;
            }
        },
        write(contract, entry) {
            try {
                localStorage.setItem(key, JSON.stringify({ contract, ...entry }));
            } catch {
            }
        },
    });
}

export const MEMORY_LOCALE = linesMemory("mementoHolders");

export async function ranking(networks, memento = MEMENTO_ADDRESS, memory = MEMORY_LOCALE) {
    const haveReadAll = await holders(networks.polygon, memento);
    if (haveReadAll === null) return savedRanking(memento, memory);
    const lines = haveReadAll
        .map((r, order) => ({ ...r, order }))
        .sort((a, b) => b.wins - a.wins || (a.from ?? 0) - (b.from ?? 0) || a.order - b.order)
        .slice(0, RANKING_CAP)
        .map(({ address, wins }) => ({ address, wins }));
    memory.write(memento, { lines });
    return lines;
}

export function savedRanking(memento = MEMENTO_ADDRESS, memory = MEMORY_LOCALE) {
    if (!isAddress(memento)) return [];
    const lines = memory.read(memento)?.lines;
    return Array.isArray(lines)
        ? lines.filter((r) => isAddress(r?.address) && Number.isInteger(r.wins) && r.wins > 0)
            .map(({ address, wins }) => ({ address, wins }))
        : [];
}

export async function winsOf(networks, address, memento = MEMENTO_ADDRESS) {
    const [count] = await balances721(networks.polygon, [address], memento);
    return Number.isInteger(count) ? count : null;
}

export function positionOf(listing, address) {
    if (!address) return null;
    const its = address.toLowerCase();
    const i = listing.findIndex((line) => line.address.toLowerCase() === its);
    return i < 0 ? null : { position: i + 1, ...listing[i] };
}

export async function mementosOf(network, address, memento = MEMENTO_ADDRESS) {
    if (!isAddress(address)) return [];
    const token = await tokensOf(network, address, memento);
    if (!token) return [];
    return token.slice().reverse().map((tokenId) => ({ address, tokenId }));
}
