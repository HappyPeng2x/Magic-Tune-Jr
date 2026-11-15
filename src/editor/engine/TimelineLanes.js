// Timeline lanes: each sprite row is split into one lane per action type.
//
// A clip's lane is derived from its blocktype — never chosen by where the
// user dropped it — so e.g. a sound block always ends up in the sound lane.
// Within a lane only one clip may be active at any moment: clips in the same
// lane never overlap in time.

import {MOVE_PATH_BLOCKTYPE} from './TimelineDuration';

// Top-to-bottom display order of lanes within a sprite row.
export const LANES = ['motion', 'looks', 'control', 'sound'];

// Lanes shown on every sprite row even when empty, so there is always a
// visible home for the most common actions.
const ALWAYS_VISIBLE = new Set(['motion', 'sound']);

const LANE_OF = {
    forward: 'motion', back: 'motion', up: 'motion', down: 'motion',
    left: 'motion', right: 'motion', home: 'motion', hop: 'motion',
    [MOVE_PATH_BLOCKTYPE]: 'motion',

    say: 'looks', show: 'looks', hide: 'looks', grow: 'looks',
    shrink: 'looks', same: 'looks', setcolor: 'looks',

    playsnd: 'sound', playusersnd: 'sound'
};

// Anything not listed above (wait, setspeed, stop, gotopage, …) is control.
export function laneOf (blocktype) {
    return LANE_OF[blocktype] || 'control';
}

// Lanes to render for a sprite, in display order.
export function visibleLanes (spr) {
    var used = new Set(ALWAYS_VISIBLE);
    var tl = (spr && spr.timeline) || [];
    for (var i = 0; i < tl.length; i++) used.add(laneOf(tl[i].blocktype));
    return LANES.filter(function (l) { return used.has(l); });
}

// Other clips in the same lane as `blocktype`, sorted by start time.
function laneNeighbours (timeline, blocktype, excludeId) {
    var lane = laneOf(blocktype);
    return (timeline || []).filter(function (c) {
        return c.id !== excludeId && laneOf(c.blocktype) === lane;
    }).sort(function (a, b) { return a.startTime - b.startTime; });
}

function endOf (c) {
    return c.duration === Infinity ? Infinity : c.startTime + c.duration;
}

function fits (others, start, duration) {
    var end = start + duration;
    for (var i = 0; i < others.length; i++) {
        if (start < endOf(others[i]) && others[i].startTime < end) return false;
    }
    return true;
}

// Start time closest to `desired` at which a clip of `duration` ms fits in
// its lane without overlapping any other clip there.
export function freeStart (timeline, blocktype, desired, duration, excludeId) {
    var others = laneNeighbours(timeline, blocktype, excludeId);
    desired = Math.max(0, desired);
    if (fits(others, desired, duration)) return desired;

    // The best slot always touches a neighbour: right after one ends, or
    // right before one starts.
    var best = null;
    for (var i = 0; i < others.length; i++) {
        var candidates = [endOf(others[i]), others[i].startTime - duration];
        for (var j = 0; j < candidates.length; j++) {
            var s = candidates[j];
            if (s < 0 || s === Infinity || !fits(others, s, duration)) continue;
            if (best === null || Math.abs(s - desired) < Math.abs(best - desired)) best = s;
        }
    }
    return best === null ? desired : best;
}

// Longest duration a clip starting at `start` may have before it runs into
// the next clip in its lane.
export function maxDuration (timeline, blocktype, start, excludeId) {
    var others = laneNeighbours(timeline, blocktype, excludeId);
    for (var i = 0; i < others.length; i++) {
        if (others[i].startTime >= start) return others[i].startTime - start;
    }
    return Infinity;
}
