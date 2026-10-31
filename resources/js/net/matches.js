import { isAddress } from "ethers";
import { lastMatch, mintedCount, mintedMatches, tokensOf } from "./chain.js";
import { CATEGORY, END_REASON } from "./messages.js";
import { MATCH_ADDRESS, MEMENTO_ADDRESS } from "./constants.js";

export const MATCHES_PAGE = 50;

export const MATCHES_CAP = 500;

export const MATCHES_HEARTBEAT_MS = 60_000;

const CATEGORIES = [CATEGORY.ARENA, CATEGORY.PRIVATE];

const ENDINGS = [END_REASON.PYRAMID, END_REASON.RESIGNED, END_REASON.WIPEOUT];

export function matchesMemory(key) {
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

export const MEMORY_LOCALE = matchesMemory("matches");

export function lineOf(d) {
    return {
        gameId: d.gameId,
        category: d.category,
        endReason: d.endReason,
        moves: d.moveCount,
        mintedAt: d.mintedAt,
        white: d.winnerIsWhite ? d.winner : d.loser,
        black: d.winnerIsWhite ? d.loser : d.winner,
        winnerIsWhite: d.winnerIsWhite,
    };
}

function lineValid(l) {
    return typeof l?.gameId === "string" && /^\d+$/.test(l.gameId)
        && CATEGORIES.includes(l.category) && ENDINGS.includes(l.endReason)
        && Number.isSafeInteger(l.moves) && l.moves >= 0
        && Number.isSafeInteger(l.mintedAt) && l.mintedAt > 0
        && isAddress(l.white) && isAddress(l.black) && typeof l.winnerIsWhite === "boolean";
}

const bare = (l) => ({
    gameId: l.gameId, category: l.category, endReason: l.endReason, moves: l.moves,
    mintedAt: l.mintedAt, white: l.white, black: l.black, winnerIsWhite: l.winnerIsWhite,
});

export function savedMatches(match = MATCH_ADDRESS, memory = MEMORY_LOCALE) {
    if (!isAddress(match)) return { last: 0, lines: [] };
    const entry = memory.read(match);
    const last = Number.isSafeInteger(entry?.last) && entry.last > 0 ? entry.last : 0;
    const lines = Array.isArray(entry?.lines) ? entry.lines.filter(lineValid).map(bare).slice(0, MATCHES_PAGE) : [];
    return { last, lines };
}

export async function latestMatches(network, {
    upTo = MATCHES_PAGE, match = MATCH_ADDRESS, memento = MEMENTO_ADDRESS, memory = MEMORY_LOCALE, chunk,
} = {}) {
    const [last, total] = await Promise.all([
        lastMatch(network, savedMatches(match, memory).last, match),
        mintedCount(network, memento),
    ]);
    if (last === null) return null;
    const listing = await moreMatches(network, { last, total, lines: [], next: last }, upTo, { match, memento, chunk });
    if (!listing) return null;
    memory.write(match, { last, lines: listing.lines.slice(0, MATCHES_PAGE) });
    return listing;
}

export async function moreMatches(network, listing, upTo, { match = MATCH_ADDRESS, memento = MEMENTO_ADDRESS, chunk } = {}) {
    const want = Math.min(upTo, MATCHES_CAP) - listing.lines.length;
    if (want <= 0 || listing.next <= 0) return listing;
    const read = await mintedMatches(network, listing.next, want, { match, memento, chunk });
    if (!read) return null;
    return { ...listing, lines: [...listing.lines, ...read.lines.map(lineOf)], next: read.next };
}

export function matchesCount(listing) {
    if (!listing) return 0;
    const known = listing.next <= 0 ? listing.lines.length : Math.max(listing.total ?? 0, listing.lines.length);
    return Math.min(known, MATCHES_CAP);
}

export function walletsOf(lines) {
    return [...new Set(lines.flatMap((l) => [l.white, l.black]).map((a) => a.toLowerCase()))];
}

export async function mementosOf(network, address, memento = MEMENTO_ADDRESS) {
    if (!isAddress(address)) return [];
    const token = await tokensOf(network, address, memento);
    if (!token) return [];
    return token.slice().reverse().map((tokenId) => ({ address, tokenId }));
}
