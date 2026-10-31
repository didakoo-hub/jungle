import { isAddress } from "ethers";
import { PROTOCOL_V } from "./constants.js";
import { sameAddress } from "../game/wallet.js";
import { seatOf } from "./chain.js";

const KEY = "openSeat";

export const SEAT_HEARTBEAT_MS = 10_000;
export const SEAT_SETTLE_MS = 120_000;

const INVITE_KEY = /^0x[0-9a-f]{64}$/i;

export function rememberSeat({ wallet, session, category, inviteKey = null }, now = Date.now()) {
    localStorage.setItem(KEY, JSON.stringify({ v: PROTOCOL_V, wallet, session, category, inviteKey, t: now }));
}

export function seatRemembered(session = null) {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (s?.v !== PROTOCOL_V || !isAddress(s.wallet) || !isAddress(s.session) || !Number.isInteger(s.category)) return null;
        if (s.inviteKey !== null && !INVITE_KEY.test(String(s.inviteKey))) return null;
        if (!Number.isFinite(s.t)) return null;
        return session && !sameAddress(s.session, session) ? null : s;
    } catch {
        return null;
    }
}

export function forgetSeat() {
    localStorage.removeItem(KEY);
}

export function seatGone(record, seat, now = Date.now()) {
    if (!record || !seat) return false;
    if (seat.session && sameAddress(seat.session, record.session)) return false;
    return now - record.t > SEAT_SETTLE_MS;
}

export function createSentinel({
    reads, address, me, onPaired = () => {}, active = () => true, heartbeatMs = SEAT_HEARTBEAT_MS, now = Date.now,
}) {
    let work = null, checking = false;

    async function check() {
        if (checking || !active()) return false;
        const record = seatRemembered(me.address);
        if (!record || !sameAddress(record.wallet, me.wallet)) return false;
        checking = true;
        try {
            const seat = await seatOf(reads, me.wallet, address);
            if (seatGone(record, seat, now())) forgetSeat();
            if (!seat?.gameId || !sameAddress(seat.session, me.address)) return false;
            await onPaired(record, seat);
            return true;
        } finally {
            checking = false;
        }
    }

    return {
        check,

        start() {
            this.halt();
            work = setInterval(check, heartbeatMs);
            check();
        },

        halt() {
            if (work !== null) clearInterval(work);
            work = null;
        },
    };
}
