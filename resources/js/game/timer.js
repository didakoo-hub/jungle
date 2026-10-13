export const TURN_SECONDS = 15;
export const PENALTY_SECONDS = 5;
export const IDLE_MS = 10 * 60 * 1000;

export const GRACE_SECONDS = 1;
// The most my turn gives up to the delivery of the opponent's move.
export const TRANSIT_CAP_S = 3;

export function penalizedOf(penalized, color) {
    return penalized && typeof penalized === "object" ? !!penalized[color] : !!penalized;
}

export function withPenalty(penalized, color, value) {
    if (penalized && typeof penalized === "object") return { ...penalized, [color]: value };
    return color === "white" ? value : penalized;
}

export function turnDurationFor(color, penalized, { symmetric = false } = {}) {
    if (!symmetric && color !== "white") return 0;
    return penalizedOf(penalized, color) ? PENALTY_SECONDS : TURN_SECONDS;
}

export function openTurn(color, penalized, now = Date.now(), options) {
    const seconds = turnDurationFor(color, penalized, options);
    return { turnDeadline: seconds ? now + seconds * 1000 : 0 };
}

// On the guest channel my clock starts from the signed `t` (whole seconds) of the opponent's move,
// as its own does; the device clocks differ, hence the cap.
export function transitOf(sentAtS, now = Date.now()) {
    if (!Number.isFinite(sentAtS)) return 0;
    return Math.min(Math.max(0, now - (sentAtS + 1) * 1000), TRANSIT_CAP_S * 1000);
}

export function openTurnOpponent(color, penalized, now = Date.now()) {
    const seconds = turnDurationFor(color, penalized, { symmetric: true });
    return { turnDeadline: now + (seconds + GRACE_SECONDS) * 1000 };
}

export function openIdle(now = Date.now()) {
    return now + IDLE_MS;
}

export function shownDeadline(deadline, { grace = false } = {}) {
    if (!deadline) return 0;
    return grace ? deadline - GRACE_SECONDS * 1000 : deadline;
}

export function secondsLeft(deadline, now = Date.now()) {
    if (!deadline) return 0;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function restore(snapshot, now = Date.now()) {
    if (!snapshot) return { action: "restart" };
    if (snapshot.idleDeadline && now >= snapshot.idleDeadline) {
        return { action: "abandon" };
    }
    if (!snapshot.turnDeadline) return { action: "restart" };
    if (now >= snapshot.turnDeadline) return { action: "expired" };
    return { action: "resume" };
}

export function createTurnTimer({
    onTick,
    onTurnExpired,
    onIdleExpired,
    now = Date.now,
} = {}) {
    let handle = null;
    let turnDeadline = 0;
    let idleDeadline = 0;

    function stop() {
        if (handle !== null) {
            clearInterval(handle);
            handle = null;
        }
    }

    function tick() {
        if (handle === null) return;
        const t = now();
        if (idleDeadline && t >= idleDeadline) {
            stop();
            onIdleExpired?.();
            return;
        }
        if (turnDeadline && t >= turnDeadline) {
            stop();
            onTurnExpired?.();
            return;
        }
        onTick?.(secondsLeft(turnDeadline, t));
    }

    return {
        start(deadlines) {
            stop();
            turnDeadline = deadlines?.turnDeadline ?? 0;
            idleDeadline = deadlines?.idleDeadline ?? 0;
            onTick?.(secondsLeft(turnDeadline, now()));
            handle = setInterval(tick, 1000);
        },
        stop,
        tick,
        get running() {
            return handle !== null;
        },
    };
}
