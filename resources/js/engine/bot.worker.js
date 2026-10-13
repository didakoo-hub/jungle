import { calculateBestMove } from "./minimax.js";

self.onmessage = ({ data: { id, board, color, depth, slice, repetitions } }) => {
    const outcome = calculateBestMove(board, color, depth, -Infinity, Infinity, {
        slice,
        raw: true,
        repetitions,
    });
    self.postMessage({ id, outcome });
};
