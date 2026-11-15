import ScratchJr from '../ScratchJr';
import Prims from './Prims';
import Thread from './Thread';
import {TICK_MS, MOVE_PATH_BLOCKTYPE} from './TimelineDuration';

// Block types that are not valid standalone timeline clips.
// 'repeat'/'forever' require inner content; trigger blocks belong to Scratch Jr's
// event model, not the timeline.
const SKIP_BLOCKTYPES = new Set([
    'repeat', 'forever',
    'onflag', 'onclick', 'ontouch', 'onmessage', 'onchat',
    'done', 'endstack', 'missing',
    'caretcmd', 'caretstart', 'caretend', 'caretrepeat',
]);

// ─── VirtualBlock ─────────────────────────────────────────────────────────────
//
// Wraps a timeline clip as a lightweight object that satisfies the interface
// Prims.js and Thread.js expect from a Block, without needing a DOM element.
//
// Prims access:  thisblock.blocktype, .getArgValue(), .next, .inside,
//                .repeatCounter, .getSoundName(), .highlight(), .unhighlight()
// Thread access: block.findFirst(), firstBlock.aStart, firstBlock.next

class VirtualBlock {
    constructor (clip) {
        this.blocktype = clip.blocktype;
        this._arg = clip.arg;

        // Single-block chain: no predecessor, no successor, no nested content.
        this.next = null;
        this.prev = null;
        this.inside = null;
        this.repeatCounter = -1;

        // Metadata flags read by Thread and Prims.
        this.aStart = false;   // not a trigger/start block
        this.anEnd = false;
        this.cShape = false;   // not a container (repeat) block
        this.isCaret = false;
    }

    getArgValue () {
        return this._arg;
    }

    // Sound prims call getSoundName(spr.sounds) to resolve a sound asset.
    // arg is stored as either a filename string or a numeric index into sounds[].
    getSoundName (sounds) {
        var n = this._arg;
        if (typeof n === 'number') {
            return sounds[n] !== undefined ? sounds[n] : sounds[0];
        }
        return n;
    }

    highlight () {}
    unhighlight () {}

    findFirst () { return this; }
    findLast ()  { return this; }
}


// Linearly interpolate the recorded (dx, dy) offset at `t` ms into a
// recorded gesture's sample list. Clamps to the first/last sample outside
// the recorded range.
export function samplePath (samples, t) {
    if (samples.length === 0) return {dx: 0, dy: 0};
    var first = samples[0];
    if (t <= first.t) return {dx: first.dx, dy: first.dy};
    var last = samples[samples.length - 1];
    if (t >= last.t) return {dx: last.dx, dy: last.dy};

    for (var i = 1; i < samples.length; i++) {
        if (samples[i].t >= t) {
            var a = samples[i - 1];
            var b = samples[i];
            var span = b.t - a.t;
            var frac = span > 0 ? (t - a.t) / span : 0;
            return {
                dx: a.dx + ((b.dx - a.dx) * frac),
                dy: a.dy + ((b.dy - a.dy) * frac)
            };
        }
    }
    return {dx: last.dx, dy: last.dy};
}

// ─── TimelineRuntime ──────────────────────────────────────────────────────────

export default class TimelineRuntime {
    constructor () {
        this.currentTime = 0;   // ms — current playhead position
        this.playing = false;
        this.intervalId = null;

        // Prims signal end-of-quantum by setting ScratchJr.runtime.yield = true.
        // That resolves to this property because ScratchJr.runtime === this.
        this.yield = false;

        // clipId → Thread for every clip whose time range includes currentTime.
        this._activeThreads = new Map();

        // clipId → {clip, spr, baseX, baseY} for every active movepath clip.
        // Kept separate from _activeThreads because path clips replay a
        // recorded (dx, dy) offset each tick instead of running through the
        // Prims/Thread block-execution machinery.
        this._activePaths = new Map();
    }

    // ── Compatibility with Prims that read ScratchJr.runtime.threadsRunning ──

    get threadsRunning () {
        return Array.from(this._activeThreads.values());
    }

    // Stock Stage.mouseUp re-merges threads paused for a drag via
    // `runtime.threadsRunning = runtime.threadsRunning.concat(spr.threads)`.
    // removeRunScript() always returns [] in timeline mode, so this is a
    // no-op; the setter only exists so that assignment doesn't throw
    // (threadsRunning would otherwise be a getter-only accessor).
    set threadsRunning (list) {}

    // ── Transport ─────────────────────────────────────────────────────────────

    play () {
        if (this.playing) return;
        this.playing = true;
        var rt = this;
        this.intervalId = window.setInterval(function () {
            rt.tick();
        }, TICK_MS);
    }

    pause () {
        if (!this.playing) return;
        this.playing = false;
        if (this.intervalId != null) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    stop () {
        this.pause();
        this.rewind();
    }

    rewind () {
        this._stopAllThreads();
        this.currentTime = 0;
        if (ScratchJr.stage) {
            ScratchJr.stage.resetPages();
        }
    }

    // Jump the playhead to timeMs by fast-simulating from 0.
    // Sprites are reset to home first, then the runtime runs synchronously
    // (no setInterval delay) for the required number of ticks so every clip
    // arrives at the correct in-progress state.
    seekTo (timeMs) {
        var wasPlaying = this.playing;
        this.pause();
        this._stopAllThreads();
        this.currentTime = 0;
        if (ScratchJr.stage) {
            ScratchJr.stage.resetPages();
        }

        var targetTicks = Math.floor(timeMs / TICK_MS);
        for (var i = 0; i < targetTicks; i++) {
            this._advanceTick();
        }

        if (wasPlaying) {
            this.play();
        }
    }

    // ── Main tick ─────────────────────────────────────────────────────────────

    tick () {
        this._advanceTick();
    }

    _advanceTick () {
        this.currentTime += TICK_MS;
        this._syncActiveThreads();
        this._stepAllThreads();
        this._stepActivePaths();
    }

    // ── Clip → Thread lifecycle ───────────────────────────────────────────────

    // Compare each sprite's timeline against currentTime.
    // Activate threads for clips that just entered their range;
    // deactivate threads for clips that left their range or finished early.
    _syncActiveThreads () {
        var t = this.currentTime;
        var sprites = this._getSprites();

        for (var si = 0; si < sprites.length; si++) {
            var spr = sprites[si];
            if (!spr.timeline) continue;

            for (var ci = 0; ci < spr.timeline.length; ci++) {
                var clip = spr.timeline[ci];
                if (SKIP_BLOCKTYPES.has(clip.blocktype)) continue;

                var clipEnd = clip.startTime + clip.duration;
                var shouldBeActive = (t > clip.startTime) &&
                                     (clip.duration === Infinity || t <= clipEnd);
                var isPath = clip.blocktype === MOVE_PATH_BLOCKTYPE;
                var isActive = isPath ? this._activePaths.has(clip.id) : this._activeThreads.has(clip.id);

                if (shouldBeActive && !isActive) {
                    if (isPath) {
                        this._startPath(spr, clip);
                    } else {
                        this._startClip(spr, clip);
                    }
                } else if (!shouldBeActive && isActive) {
                    if (isPath) {
                        this._stopPath(clip.id);
                    } else {
                        this._stopClip(clip.id, false);
                    }
                }
            }
        }

        // Remove threads that ran to natural completion (Prims.Done set isRunning = false).
        for (var entry of this._activeThreads) {
            if (!entry[1].isRunning) {
                this._activeThreads.delete(entry[0]);
            }
        }
    }

    _startClip (spr, clip) {
        var block = new VirtualBlock(clip);
        var thread = new Thread(spr, block);
        this._activeThreads.set(clip.id, thread);
    }

    _stopClip (clipId, stopMine) {
        var thread = this._activeThreads.get(clipId);
        if (thread) {
            thread.stop(stopMine);
            this._activeThreads.delete(clipId);
        }
    }

    // Capture the sprite's position at the moment this movepath clip becomes
    // active; every tick then re-applies the clip's recorded offsets on top
    // of that base, so the clip is relative to wherever the sprite is.
    _startPath (spr, clip) {
        this._activePaths.set(clip.id, {clip: clip, spr: spr, baseX: spr.xcoor, baseY: spr.ycoor});
    }

    _stopPath (clipId) {
        var entry = this._activePaths.get(clipId);
        if (!entry) return;
        // Snap to the recorded end position so playback lands exactly where
        // the gesture ended even if a tick boundary was skipped (e.g. seekTo).
        var last = entry.clip.arg[entry.clip.arg.length - 1];
        if (last) {
            entry.spr.xcoor = entry.baseX + last.dx;
            entry.spr.ycoor = entry.baseY + last.dy;
            entry.spr.render();
        }
        this._activePaths.delete(clipId);
    }

    _stepActivePaths () {
        for (var entry of this._activePaths.values()) {
            var elapsed = this.currentTime - entry.clip.startTime;
            var pt = samplePath(entry.clip.arg, elapsed);
            entry.spr.xcoor = entry.baseX + pt.dx;
            entry.spr.ycoor = entry.baseY + pt.dy;
            entry.spr.render();
        }
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    _stepAllThreads () {
        // Snapshot values() so that modifications inside _stepThread (e.g. StopAll
        // clearing _activeThreads) do not crash the iteration.
        var threads = Array.from(this._activeThreads.values());
        for (var i = 0; i < threads.length; i++) {
            if (threads[i].isRunning) {
                this._stepThread(threads[i]);
            }
        }
    }

    _stepThread (thread) {
        this.yield = false;
        while (true) {
            if (!thread.isRunning) return;
            if (thread.waitTimer > 0) {
                thread.waitTimer--;
                return;
            }
            if (this.yield) return;
            if (thread.thisblock == null) {
                // Block chain ended. For single-block clips the stack is always
                // empty, so this immediately calls Prims.Done (sets isRunning=false).
                // Nested-repeat stacks are handled for completeness.
                if (thread.stack.length === 0) {
                    Prims.Done(thread);
                } else {
                    thread.thisblock = thread.stack.pop();
                    this._runPrim(thread);
                }
                this.yield = true;
            } else {
                this._runPrim(thread);
            }
        }
    }

    _runPrim (thread) {
        if (thread.oldblock != null) {
            thread.oldblock.unhighlight();
        }
        thread.oldblock = null;

        var token = Prims.table[thread.thisblock.blocktype];
        if (token == null) {
            token = Prims.table.missing;
        } else {
            thread.thisblock.highlight();
            thread.oldblock = thread.thisblock;
        }
        token(thread);
    }

    // ── Compatibility methods (called by Prims or ScratchJr glue code) ────────

    stopThreads () {
        this._stopAllThreads();
    }

    stopThreadSprite (spr) {
        for (var entry of this._activeThreads) {
            if (entry[1].spr === spr) {
                entry[1].stop();
                this._activeThreads.delete(entry[0]);
            }
        }
    }

    // Called by Prims.StopMine to stop threads OTHER than the caller's.
    // threadsRunning getter already exposes the active threads as an array.

    // Not used in timeline mode; exists so call sites in ScratchJr don't throw.
    stopThreadBlock () {}
    addRunScript () {}
    removeRunScript () { return []; }

    restartThread (spr, b) {
        // Message broadcasts are not used in timeline mode.
        return new Thread(spr, b);
    }

    beginTimer () {
        // In Scratch Jr this starts the runtime interval.  In timeline mode,
        // play() controls the interval; this stub prevents errors on startup.
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _stopAllThreads () {
        for (var thread of this._activeThreads.values()) {
            thread.stop(true);
        }
        this._activeThreads.clear();
        this._activePaths.clear();
    }

    // Returns all sprites on the current page that have a timeline array.
    _getSprites () {
        if (!ScratchJr.stage || !ScratchJr.stage.currentPage) return [];
        var page = ScratchJr.stage.currentPage;
        var result = [];
        for (var i = 0; i < page.div.childElementCount; i++) {
            var owner = page.div.childNodes[i].owner;
            if (owner && owner.timeline) {
                result.push(owner);
            }
        }
        return result;
    }
}
