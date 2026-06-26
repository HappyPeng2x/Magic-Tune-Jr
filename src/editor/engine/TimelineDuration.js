// Duration calculations for timeline clips.
//
// Each function returns the number of milliseconds a block takes to finish,
// derived from the actual tick-by-tick logic in Prims.js.
//
// Conventions that match the Scratch Jr runtime:
//   TICK_MS  — the setInterval period in Runtime.js (32 ms per tick)
//   speed    — Sprite.speed, which is Math.pow(2, speedSetting):
//                speedSetting 0 (slow)   → speed 1
//                speedSetting 1 (medium) → speed 2  (default)
//                speedSetting 2 (fast)   → speed 4

export const TICK_MS = 32;
export const DEFAULT_SPEED = 2; // medium

// ─── helpers ─────────────────────────────────────────────────────────────────

// Movement: forward / back / up / down
// Prims sets distance = |arg| * 24 px, step size = 2 * speed px/tick.
// Ticks = distance / stepSize = |arg| * 24 / (2 * speed) = |arg| * 12 / speed.
function movementDuration(arg, speed) {
    if (arg === 0) return TICK_MS;
    return (Math.abs(arg) * 12 / speed) * TICK_MS;
}

// Rotation: left / right
// Prims: count = floor(|arg| * 30 / speed * 0.25) = floor(|arg| * 7.5 / speed).
// Each step costs 2 ticks (1 exec + 1 waitTimer tick), plus 1 final tick.
function rotationDuration(arg, speed) {
    if (arg === 0) return TICK_MS;
    return (Math.floor(Math.abs(arg) * 7.5 / speed) * 2 + 1) * TICK_MS;
}

// Hop: count = hopList.length = 11, independent of arg (arg only changes amplitude).
// waitTimer per step W = 1 + floor(2^(2 - floor(speed/2)) / 2).
// Total ticks = 11 * (1 + W) + 1.
function hopDuration(speed) {
    const W = 1 + Math.floor(Math.pow(2, 2 - Math.floor(speed / 2)) / 2);
    return (11 * (1 + W) + 1) * TICK_MS;
}

// Show / Hide: count = (speed === 4) ? 0 : floor(15 / speed).
// Each step costs 3 ticks (1 exec + 2 waitTimer ticks), plus 1 final tick.
function showHideDuration(speed) {
    const count = speed === 4 ? 0 : Math.floor(15 / speed);
    return (3 * count + 1) * TICK_MS;
}

// Grow / Shrink: count = floor(5 * |n| / speed).
// Each step costs 2 ticks (1 exec + 1 waitTimer tick), plus 1 final tick.
function growShrinkDuration(n, speed) {
    if (n === 0) return TICK_MS;
    return (2 * Math.floor(5 * Math.abs(n) / speed) + 1) * TICK_MS;
}

// Say: count = max(30, round(textLength / 8) * 30) ticks (≈ 8 chars / 2 s).
// Each step costs 2 ticks (1 exec + 1 waitTimer tick).
function sayDuration(text) {
    const len = String(text || '').length;
    const count = Math.max(30, Math.round(len / 8) * 30);
    return count * 2 * TICK_MS;
}

// ─── public API ──────────────────────────────────────────────────────────────

// Returns duration in milliseconds for a single block, or:
//   null      — unknowable at design time (sound blocks: duration = audio file length)
//   Infinity  — runs forever (forever block)
//
// `speed`  matches Sprite.speed (1 | 2 | 4). Defaults to DEFAULT_SPEED.
// `arg`    is the block's argument value (number or string, matching BlockArg).
export function durationMs(blocktype, arg, speed = DEFAULT_SPEED) {
    const n = Number(arg) || 0;

    switch (blocktype) {
    case 'forward':
    case 'back':
    case 'up':
    case 'down':
        return movementDuration(n, speed);

    case 'left':
    case 'right':
        return rotationDuration(n, speed);

    case 'hop':
        return hopDuration(speed);

    case 'wait':
        // Prims.Wait: waitTimer = round(n * 3.125) ticks — "tenth of a second" per unit.
        return Math.round(n * 3.125) * TICK_MS;

    case 'say':
        return sayDuration(arg);

    case 'show':
    case 'hide':
        return showHideDuration(speed);

    case 'grow':
    case 'shrink':
        return growShrinkDuration(n, speed);

    // Near-instant operations: complete in 1–2 ticks.
    case 'home':
    case 'setspeed':
        return 2 * TICK_MS;

    case 'setcolor':
    case 'same': // reset size: depends on current vs default scale, treated as instant
        return TICK_MS;

    case 'gotopage':
        // Prims.GotoPage: count = 2, then triggers page switch — brief delay ~4 ticks.
        return 4 * TICK_MS;

    case 'stopall':
    case 'stopmine':
        return TICK_MS;

    case 'playsnd':
    case 'playusersnd':
        // Duration equals the audio file's length, unknown at design time.
        return null;

    case 'forever':
        return Infinity;

    case 'repeat':
        // Duration = n * (sum of inner clip durations). Caller must compute recursively.
        return null;

    // Trigger/event blocks are removed from the timeline palette; ignore them.
    case 'onflag':
    case 'onclick':
    case 'ontouch':
    case 'onmessage':
    case 'onchat':
    case 'message':
    case 'done':
    case 'endstack':
    case 'missing':
        return 0;

    default:
        return TICK_MS;
    }
}

// Convenience: return duration for a repeat block given its arg and the total
// duration of its body (in ms, already summed by the caller).
export function repeatDuration(n, bodyMs) {
    return Math.max(1, Math.round(n)) * bodyMs;
}

// Convenience: convert a speed setting (0/1/2, as stored in BlockArg) to the
// Sprite.speed multiplier used by all duration functions here.
export function speedFromSetting(speedSetting) {
    return Math.pow(2, Math.max(0, Math.min(2, Math.round(speedSetting))));
}
