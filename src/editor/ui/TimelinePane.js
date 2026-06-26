import ScratchJr from '../ScratchJr';
import TransportControls from './TransportControls';
import {newHTML, gn} from '../../utils/lib';

// ── Layout constants ──────────────────────────────────────────────────────────

// Horizontal scale: pixels per millisecond.  At 0.25, one second = 250 px.
// A forward(1) clip (192 ms) renders at 48 px — the practical minimum for a
// readable label.  This will be adjustable via a zoom control in a later step.
export const PX_PER_MS = 0.25;

// Height of the ruler row and each sprite track row, in pixels.
const RULER_H  = 28;
export const ROW_H    = 48;

// Height of a single clip sub-track within a row.
// Tall enough to fit a block icon (32 px content = TRACK_H - 4).
export const TRACK_H  = 36;

// Width of the fixed sprite-label column on the left.
const LABEL_W  = 80;

// Ruler tick interval in milliseconds (one tick label per second).
const RULER_TICK_MS = 1000;

// Empty space (ms) appended after the last clip so there is room to add more.
const TAIL_MS = 2000;

// Minimum clip width so single-tick (32 ms) clips are visible.
const MIN_CLIP_W = 8;

// Minimum total visible duration (ms) even when the timeline is empty.
const MIN_DURATION_MS = 5000;

// Playhead update rate during playback (ms between DOM updates).
const PLAYHEAD_INTERVAL_MS = 50;

// Pixels from the right edge of a clip that trigger resize mode.
const RESIZE_HANDLE_W = 8;

// ── Block category colours, matching BlockSpecs colour groups ─────────────────
// These inline colours let the pane render without a CSS file.  A real CSS
// stylesheet will override them with polished values.

const CLIP_COLOR = {
    // Motion  (Scratch Jr blue)
    forward: '#4C97FF', back: '#4C97FF',
    up:      '#4C97FF', down: '#4C97FF',
    left:    '#4C97FF', right: '#4C97FF',
    home:    '#4C97FF', hop:   '#4C97FF',
    // Control (Scratch Jr orange)
    wait:     '#FFAB19', setspeed: '#FFAB19', stopmine: '#FFAB19',
    // Looks   (Scratch Jr purple/pink)
    say:      '#CF63CF', show:  '#CF63CF', hide:   '#CF63CF',
    grow:     '#CF63CF', shrink:'#CF63CF', same:   '#CF63CF',
    setcolor: '#CF63CF',
    // Sound   (Scratch Jr green)
    playsnd: '#59C059', playusersnd: '#59C059',
    // Scene / end (Scratch Jr red)
    stopall: '#FF6680', gotopage: '#FF6680',
};

const DEFAULT_CLIP_COLOR = '#888888';

// Map blocktype → SVG icon filename (inside assets/blockicons/).
// Filenames match the scratchjr asset tree exactly (note "Foward" typo).
const BLOCK_ICON = {
    forward:     'Foward',
    back:        'Back',
    up:          'Up',
    down:        'Down',
    right:       'Right',
    left:        'Left',
    home:        'Home',
    hop:         'Hop',
    wait:        'Wait',
    stopmine:    'Stop',
    stopall:     'Stop',
    say:         'Say',
    show:        'Appear',
    hide:        'Disappear',
    grow:        'Grow',
    shrink:      'Shrink',
    same:        'Reset',
    playsnd:     'Speaker',
    playusersnd: 'Microphone',
    repeat:      'Repeat',
    forever:     'Forever',
    setspeed:    'speed1',
};

// ── Module-level state ────────────────────────────────────────────────────────

let _playheadId = null;

// Active clip drag (move or resize).  Null when idle.
let _clipDrag = null;

// ── Exported utility ──────────────────────────────────────────────────────────

// Compute the rendered height of a sprite's track row.
// Exported so TimelinePalette can mirror the calculation without duplicating it.
export function rowHeight (spr) {
    var maxTrack = 0;
    if (spr.timeline) {
        for (var k = 0; k < spr.timeline.length; k++) {
            var t = spr.timeline[k].track || 0;
            if (t > maxTrack) maxTrack = t;
        }
    }
    return Math.max(ROW_H, (maxTrack + 1) * TRACK_H + 4);
}

// ── TimelinePane ──────────────────────────────────────────────────────────────

export default class TimelinePane {

    // Build the full timeline pane under `parent` and start the playhead
    // updater.  Returns the outer pane element.
    //
    // Typical call from the app's layout function:
    //   TimelinePane.create(document.getElementById('frame'));
    static create (parent) {
        var pane = newHTML('div', 'timeline-pane', parent);
        pane.setAttribute('id', 'timeline-pane');

        // Transport bar occupies the top strip of the pane.
        TransportControls.create(pane);

        // ── Main editor area ──────────────────────────────────────────────
        var editor = newHTML('div', 'timeline-editor', pane);
        editor.setAttribute('id', 'timeline-editor');

        // Left column: fixed, shows one label cell per sprite.
        var labels = newHTML('div', 'timeline-labels', editor);
        labels.setAttribute('id', 'timeline-labels');
        labels.style.width = LABEL_W + 'px';

        // Corner spacer: same height as the ruler so rows stay aligned.
        var corner = newHTML('div', 'timeline-corner', labels);
        corner.setAttribute('id', 'timeline-corner');
        corner.style.height = RULER_H + 'px';

        // Sprite label cells live here; their scrollTop syncs with track-list.
        var labelList = newHTML('div', 'timeline-label-list', labels);
        labelList.setAttribute('id', 'timeline-label-list');

        // Right area: horizontally (and vertically) scrollable.
        var scrollArea = newHTML('div', 'timeline-scrollarea', editor);
        scrollArea.setAttribute('id', 'timeline-scrollarea');
        scrollArea.style.position = 'relative';  // anchor for the playhead

        // Ruler: tick labels across the top.  Click or drag to seek.
        var ruler = newHTML('div', 'timeline-ruler', scrollArea);
        ruler.setAttribute('id', 'timeline-ruler');
        ruler.style.height   = RULER_H + 'px';
        ruler.style.position = 'relative';
        ruler.style.cursor   = 'col-resize';
        ruler.style.userSelect = 'none';
        ruler.onmousedown  = TimelinePane._rulerSeekStart;
        ruler.ontouchstart = TimelinePane._rulerSeekStart;

        // Track list: one row per sprite.
        var trackList = newHTML('div', 'timeline-track-list', scrollArea);
        trackList.setAttribute('id', 'timeline-track-list');
        trackList.style.position = 'relative';

        // Playhead: absolutely positioned over the scrollable area so it
        // spans ruler + tracks.  z-index keeps it above clip rectangles.
        var playhead = newHTML('div', 'timeline-playhead', scrollArea);
        playhead.setAttribute('id', 'timeline-playhead');
        playhead.style.position = 'absolute';
        playhead.style.top = '0';
        playhead.style.bottom = '0';
        playhead.style.width = '2px';
        playhead.style.backgroundColor = '#E53935';
        playhead.style.zIndex = '10';
        playhead.style.pointerEvents = 'none';
        playhead.style.left = '0px';

        // Keep label-list vertical scroll in sync with the track-list.
        trackList.addEventListener('scroll', function () {
            labelList.scrollTop = trackList.scrollTop;
        });

        TimelinePane.refresh();
        TimelinePane._startPlayheadUpdater();
        return pane;
    }

    // Rebuild every label cell and clip track from scratch.  Call after:
    //   – switching pages / scenes
    //   – adding or removing a sprite
    //   – adding, removing, or moving a clip (Steps 7–8)
    static refresh () {
        var labelList = gn('timeline-label-list');
        var trackList = gn('timeline-track-list');
        var ruler     = gn('timeline-ruler');
        var scrollArea = gn('timeline-scrollarea');
        if (!labelList || !trackList || !ruler) return;

        var sprites  = TimelinePane._getSprites();
        var totalMs  = TimelinePane._totalDuration(sprites);
        var totalPx  = Math.max(totalMs * PX_PER_MS, scrollArea ? scrollArea.offsetWidth : 0);

        // Clear previous content.
        TimelinePane._clearEl(labelList);
        TimelinePane._clearEl(trackList);
        TimelinePane._clearEl(ruler);

        // Ruler ticks (re-built before clip rows so the DOM order is clean).
        TimelinePane._buildRuler(ruler, totalMs, totalPx);

        // Sprite rows.
        for (var i = 0; i < sprites.length; i++) {
            TimelinePane._buildRow(sprites[i], labelList, trackList, totalPx);
        }
    }

    // Move the playhead to match the current runtime time.
    // Called by the 50 ms poll interval, and may also be called directly.
    static updatePlayhead () {
        var rt = ScratchJr.runtime;
        var el = gn('timeline-playhead');
        if (!rt || !el) return;
        el.style.left = (rt.currentTime * PX_PER_MS) + 'px';
    }

    // ── Internal: DOM builders ────────────────────────────────────────────────

    static _buildRuler (ruler, totalMs, totalPx) {
        ruler.style.width = totalPx + 'px';
        var ticks = Math.ceil(totalMs / RULER_TICK_MS) + 2;
        for (var i = 0; i < ticks; i++) {
            var tick = newHTML('div', 'timeline-tick', ruler);
            var ms = i * RULER_TICK_MS;
            tick.style.position   = 'absolute';
            tick.style.left       = (ms * PX_PER_MS) + 'px';
            tick.style.top        = '0';
            tick.style.height     = RULER_H + 'px';
            tick.style.fontSize   = '11px';
            tick.style.fontWeight = 'bold';
            tick.style.color      = '#0277BD';
            tick.style.borderLeft = '2px solid #81D4FA';
            tick.style.paddingLeft = '4px';
            tick.style.boxSizing  = 'border-box';
            tick.style.whiteSpace = 'nowrap';
            tick.style.lineHeight = RULER_H + 'px';
            tick.textContent = TransportControls.formatTime(ms);
        }
    }

    static _buildRow (spr, labelList, trackList, totalPx) {
        var rowH = rowHeight(spr);

        // ── Label cell ────────────────────────────────────────────────────
        var label = newHTML('div', 'timeline-label', labelList);
        label.setAttribute('data-sprite-id', spr.id);
        label.style.height       = rowH + 'px';
        label.style.width        = LABEL_W + 'px';
        label.style.boxSizing    = 'border-box';
        label.style.borderBottom = '2px solid #C8E6C9';
        label.style.overflow     = 'hidden';
        label.style.display      = 'flex';
        label.style.alignItems   = 'center';
        label.style.gap          = '4px';
        label.style.padding      = '0 4px';
        label.style.fontSize     = '11px';

        if (spr.img) {
            var thumb = document.createElement('img');
            thumb.src       = spr.img.src;
            thumb.className = 'label-thumb';
            thumb.style.width  = '24px';
            thumb.style.height = '24px';
            thumb.style.objectFit = 'contain';
            thumb.style.flexShrink = '0';
            label.appendChild(thumb);
        }

        var nameEl = newHTML('span', 'label-name', label);
        nameEl.textContent = spr.name || spr.id;
        nameEl.style.overflow     = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
        nameEl.style.whiteSpace   = 'nowrap';

        // ── Track row ─────────────────────────────────────────────────────
        var track = newHTML('div', 'timeline-track', trackList);
        track.setAttribute('data-sprite-id', spr.id);
        track.style.position     = 'relative';
        track.style.height       = rowH + 'px';
        track.style.width        = totalPx + 'px';
        track.style.boxSizing    = 'border-box';
        track.style.borderBottom = '2px solid #FFD180';
        track.style.background   = '#FFFDE7';

        // Soft vertical grid lines at each second.
        track.style.backgroundImage =
            'repeating-linear-gradient(to right, transparent, transparent ' +
            (RULER_TICK_MS * PX_PER_MS - 1) + 'px, #FFE082 ' +
            (RULER_TICK_MS * PX_PER_MS - 1) + 'px, #FFE082 ' +
            (RULER_TICK_MS * PX_PER_MS) + 'px)';

        if (spr.timeline) {
            for (var i = 0; i < spr.timeline.length; i++) {
                TimelinePane._buildClip(spr.timeline[i], track, spr);
            }
        }
    }

    static _buildClip (clip, track, spr) {
        var left  = clip.startTime * PX_PER_MS;
        var width = Math.max(
            clip.duration === Infinity ? 200 : clip.duration * PX_PER_MS,
            MIN_CLIP_W
        );
        var subTrack = clip.track || 0;
        var top   = subTrack * TRACK_H + 2;
        var clipH = TRACK_H - 4;   // 32 px tall at default TRACK_H=36

        var color = CLIP_COLOR[clip.blocktype] || DEFAULT_CLIP_COLOR;

        var el = newHTML('div', 'timeline-clip', track);
        el.setAttribute('data-clip-id', clip.id);
        el.style.position    = 'absolute';
        el.style.left        = left + 'px';
        el.style.width       = width + 'px';
        el.style.top         = top + 'px';
        el.style.height      = clipH + 'px';
        el.style.borderRadius = '10px';
        el.style.overflow    = 'hidden';
        el.style.boxSizing   = 'border-box';
        el.style.border      = '2px solid rgba(255,255,255,0.65)';
        el.style.boxShadow   = '0 3px 8px rgba(0,0,0,0.25)';
        el.style.cursor      = 'grab';
        el.style.display     = 'flex';
        el.style.alignItems  = 'center';
        el.style.padding     = '0 5px';
        el.style.gap         = '3px';
        // Solid colour + top-shine gradient (both layers work together)
        el.style.backgroundColor = color;
        el.style.backgroundImage =
            'linear-gradient(to bottom, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 55%)';

        // Block icon — white silhouette via CSS filter
        var iconName = BLOCK_ICON[clip.blocktype];
        var iconSize = clipH - 6;   // 26 px at default
        if (iconName) {
            var iconEl = document.createElement('img');
            iconEl.src    = 'assets/blockicons/' + iconName + '.svg';
            iconEl.style.width        = iconSize + 'px';
            iconEl.style.height       = iconSize + 'px';
            iconEl.style.flexShrink   = '0';
            iconEl.style.filter       = 'brightness(0) invert(1)';
            iconEl.style.pointerEvents = 'none';
            el.appendChild(iconEl);
        }

        // Argument badge (the number or text value of the block)
        var arg = clip.arg;
        if (arg !== null && arg !== undefined && String(arg) !== '') {
            var argEl = newHTML('span', 'clip-arg', el);
            argEl.textContent           = String(arg);
            argEl.style.fontSize        = '12px';
            argEl.style.fontWeight      = 'bold';
            argEl.style.color           = '#fff';
            argEl.style.textShadow      = '0 1px 2px rgba(0,0,0,0.45)';
            argEl.style.background      = 'rgba(0,0,0,0.18)';
            argEl.style.borderRadius    = '7px';
            argEl.style.padding         = '1px 5px';
            argEl.style.whiteSpace      = 'nowrap';
            argEl.style.pointerEvents   = 'none';
            argEl.style.flexShrink      = '0';
        }

        // Cursor hint: right edge → ew-resize, body → grab.
        el.onmousemove = function (e) {
            var r = el.getBoundingClientRect();
            el.style.cursor = (e.clientX >= r.right - RESIZE_HANDLE_W) ? 'ew-resize' : 'grab';
        };
        el.onmouseleave = function () { el.style.cursor = 'grab'; };

        // Drag interaction (move / resize).
        el.onmousedown = function (e) { TimelinePane._clipDragStart(e, el, clip, spr); };
        el.ontouchstart = function (e) { TimelinePane._clipDragStart(e, el, clip, spr); };
    }

    // ── Internal: helpers ─────────────────────────────────────────────────────

    // Human-readable clip label: "forward 5", "say Hello", "show", etc.
    static _clipLabel (clip) {
        if (clip.arg !== null && clip.arg !== undefined && String(clip.arg) !== '') {
            return clip.blocktype + ' ' + clip.arg;
        }
        return clip.blocktype;
    }

    // Compute the total timeline duration needed to show all clips plus tail.
    static _totalDuration (sprites) {
        var max = MIN_DURATION_MS;
        for (var i = 0; i < sprites.length; i++) {
            var tl = sprites[i].timeline || [];
            for (var j = 0; j < tl.length; j++) {
                if (tl[j].duration !== Infinity) {
                    var end = tl[j].startTime + tl[j].duration;
                    if (end > max) max = end;
                }
            }
        }
        return max + TAIL_MS;
    }

    // Return all sprite-type owners on the current page, in DOM order.
    static _getSprites () {
        if (!ScratchJr.stage || !ScratchJr.stage.currentPage) return [];
        var page = ScratchJr.stage.currentPage;
        var result = [];
        for (var i = 0; i < page.div.childElementCount; i++) {
            var owner = page.div.childNodes[i].owner;
            if (owner && owner.type === 'sprite') {
                result.push(owner);
            }
        }
        return result;
    }

    static _clearEl (el) {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    // Poll at 50 ms — fast enough for smooth playhead movement without
    // burning CPU (compare: the runtime tick fires every 32 ms).
    static _startPlayheadUpdater () {
        if (_playheadId != null) return;
        _playheadId = window.setInterval(function () {
            TimelinePane.updatePlayhead();
        }, PLAYHEAD_INTERVAL_MS);
    }

    static _stopPlayheadUpdater () {
        if (_playheadId != null) {
            window.clearInterval(_playheadId);
            _playheadId = null;
        }
    }

    // ── Ruler seek: click or drag on the ruler to move the playhead ──────────

    // mousedown / touchstart on the ruler.
    // Pauses playback immediately so seekTo won't auto-resume on mouseup.
    static _rulerSeekStart (e) {
        e.preventDefault();
        var rt = ScratchJr.runtime;
        if (rt && rt.playing) rt.pause();

        var ms = TimelinePane._rulerXtoMs(e);
        if (rt) rt.currentTime = Math.max(0, ms);
        TimelinePane.updatePlayhead();

        window.onmousemove = TimelinePane._rulerSeekMove;
        window.ontouchmove = TimelinePane._rulerSeekMove;
        window.onmouseup   = TimelinePane._rulerSeekEnd;
        window.ontouchend  = TimelinePane._rulerSeekEnd;
    }

    // Drag: update currentTime for visual feedback without fast-forwarding.
    // Sprites stay in their pre-drag state; seekTo on mouseup corrects them.
    static _rulerSeekMove (e) {
        e.preventDefault();
        var ms = TimelinePane._rulerXtoMs(e);
        var rt = ScratchJr.runtime;
        if (rt) rt.currentTime = Math.max(0, ms);
        TimelinePane.updatePlayhead();
    }

    // mouseup / touchend: commit with seekTo so sprites reach the right state.
    // Because we paused in _rulerSeekStart, seekTo won't restart playback.
    static _rulerSeekEnd (e) {
        e.preventDefault();
        window.onmousemove = null;
        window.ontouchmove = null;
        window.onmouseup   = null;
        window.ontouchend  = null;

        var ms = TimelinePane._rulerXtoMs(e);
        var rt = ScratchJr.runtime;
        if (rt) rt.seekTo(Math.max(0, ms));
        TimelinePane.updatePlayhead();
    }

    // Convert a mouse/touch event to milliseconds on the timeline.
    // getBoundingClientRect already accounts for the ruler's scroll position
    // inside the scrollArea, so (pt.x - rect.left) gives content-space X.
    static _rulerXtoMs (e) {
        var ruler = gn('timeline-ruler');
        if (!ruler) return 0;
        var pt   = TimelinePane._clipDragPoint(e);
        var rect = ruler.getBoundingClientRect();
        return Math.round((pt.x - rect.left) / PX_PER_MS);
    }

    // ── Clip drag: move (body) and resize (right edge) ────────────────────────

    static _clipDragStart (e, clipEl, clip, spr) {
        e.preventDefault();
        e.stopPropagation();  // don't bubble to the track background

        var pt   = TimelinePane._clipDragPoint(e);
        var rect = clipEl.getBoundingClientRect();
        var type = (pt.x >= rect.right - RESIZE_HANDLE_W) ? 'resize' : 'move';

        // Ghost: a dashed outline at the clip's current position.
        var trackList = gn('timeline-track-list');
        var ghost = document.createElement('div');
        ghost.style.position        = 'absolute';
        ghost.style.left            = clipEl.style.left;
        ghost.style.top             = clipEl.style.top;
        ghost.style.width           = clipEl.style.width;
        ghost.style.height          = clipEl.style.height;
        ghost.style.borderRadius    = '3px';
        ghost.style.backgroundColor = clipEl.style.backgroundColor;
        ghost.style.opacity         = '0.55';
        ghost.style.border          = '2px dashed rgba(0,0,0,0.45)';
        ghost.style.boxSizing       = 'border-box';
        ghost.style.pointerEvents   = 'none';
        ghost.style.zIndex          = '9';
        trackList.appendChild(ghost);

        clipEl.style.opacity = '0.3';
        document.body.style.cursor = (type === 'resize') ? 'ew-resize' : 'grabbing';

        _clipDrag = {
            type: type,
            spr:  spr,
            clip: clip,
            clipEl: clipEl,
            startX: pt.x,
            origStartTime: clip.startTime,
            origDuration:  clip.duration,
            ghost: ghost,
        };

        window.onmousemove = TimelinePane._clipDragMove;
        window.ontouchmove = TimelinePane._clipDragMove;
        window.onmouseup   = TimelinePane._clipDragEnd;
        window.ontouchend  = TimelinePane._clipDragEnd;
    }

    static _clipDragMove (e) {
        if (!_clipDrag) return;
        e.preventDefault();

        var pt = TimelinePane._clipDragPoint(e);
        var dx = pt.x - _clipDrag.startX;

        if (_clipDrag.type === 'move') {
            var newStart = Math.max(0, Math.round(_clipDrag.origStartTime + dx / PX_PER_MS));
            _clipDrag.ghost.style.left = (newStart * PX_PER_MS) + 'px';
        } else {
            // resize: drag right edge to change duration
            var newDur = Math.max(32, Math.round(_clipDrag.origDuration + dx / PX_PER_MS));
            _clipDrag.ghost.style.width = Math.max(newDur * PX_PER_MS, MIN_CLIP_W) + 'px';
        }
    }

    static _clipDragEnd (e) {
        if (!_clipDrag) return;
        e.preventDefault();

        window.onmousemove = null;
        window.ontouchmove = null;
        window.onmouseup   = null;
        window.ontouchend  = null;
        document.body.style.cursor = '';

        var pt = TimelinePane._clipDragPoint(e);
        var dx = pt.x - _clipDrag.startX;

        if (_clipDrag.type === 'move') {
            var newStart = Math.max(0, Math.round(_clipDrag.origStartTime + dx / PX_PER_MS));
            _clipDrag.spr.updateClip(_clipDrag.clip.id, {startTime: newStart});
        } else {
            var newDur = Math.max(32, Math.round(_clipDrag.origDuration + dx / PX_PER_MS));
            _clipDrag.spr.updateClip(_clipDrag.clip.id, {duration: newDur});
        }

        if (_clipDrag.ghost.parentNode) _clipDrag.ghost.parentNode.removeChild(_clipDrag.ghost);
        _clipDrag.clipEl.style.opacity = '';
        _clipDrag = null;

        TimelinePane.refresh();
    }

    static _clipDragPoint (e) {
        if (e.touches && e.touches.length > 0) {
            return {x: e.touches[0].pageX, y: e.touches[0].pageY};
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return {x: e.changedTouches[0].pageX, y: e.changedTouches[0].pageY};
        }
        return {x: e.pageX, y: e.pageY};
    }
}
