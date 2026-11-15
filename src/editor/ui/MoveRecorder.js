// Movement recorder: record a character's movement by dragging it on the
// stage, then drop it into the timeline as a movepath clip at the playhead.
//
// Opened from the record button at the end of the blue Motion palette. Like
// the sound recorder it has record / stop / play controls plus keep (✓) and
// discard (✕), but it is not modal: it floats beside the stage so the child
// can drag the character while it records. While open, the stage gets a red
// frame (pulsing while recording) so it's obvious we're in recording mode,
// and only the character being recorded can be dragged.

import ScratchJr from '../ScratchJr';
import TimelinePane from './TimelinePane';
import TransportControls from './TransportControls';
import {samplePath} from '../engine/TimelineRuntime';
import {TICK_MS} from '../engine/TimelineDuration';
import {setProps} from '../../utils/lib';

// Longest recording, matching the sound recorder's limit.
const MAX_RECORD_MS = 30000;

const PANEL_GAP = 16;
const BTN = 52;

let _panel = null;
let _spr = null;          // character being recorded
let _base = null;         // {x, y} where the character started
let _samples = null;      // finished recording: [{t, dx, dy}] or null
let _recording = null;    // {start, samples, intervalId} while recording
let _preview = null;      // requestAnimationFrame id while previewing
let _ui = {};

export default class MoveRecorder {

    static get isOpen () { return !!_panel; }

    // True when `spr` is the character being recorded. Stage uses this to
    // allow dragging it (even mid-timeline) and to block other characters.
    static isRecordingSprite (spr) { return !!_panel && spr === _spr; }

    static open () {
        var spr = ScratchJr.getSprite();
        if (!spr || spr.type !== 'sprite') return;
        if (_panel) MoveRecorder.cancel();

        var rt = ScratchJr.runtime;
        if (rt && rt.playing) {
            rt.pause();
            TransportControls.updateDisplay();
        }
        _spr = spr;
        _base = {x: spr.xcoor, y: spr.ycoor};
        _samples = null;
        MoveRecorder._buildPanel();
        MoveRecorder._setState('idle');
        window.addEventListener('resize', MoveRecorder._position);
    }

    // ✓ — add the recording to the timeline at the playhead and close.
    static keep () {
        var samples = _samples;
        var spr = _spr;
        MoveRecorder._close();
        var rt = ScratchJr.runtime;
        if (samples && spr) {
            spr.addPathClip(samples, rt ? rt.currentTime : 0);
            ScratchJr.changed = true;
        }
        TimelinePane.refresh();
    }

    // ✕ — throw the recording away and close.
    static cancel () {
        MoveRecorder._close();
    }

    // ── Recording ────────────────────────────────────────────────────────────

    static record () {
        MoveRecorder._stopPreview();
        MoveRecorder._restoreBase();
        var start = Date.now();
        _recording = {start: start, samples: [{t: 0, dx: 0, dy: 0}], intervalId: null};
        _recording.intervalId = window.setInterval(function () {
            var t = Date.now() - start;
            _recording.samples.push({t: t, dx: _spr.xcoor - _base.x, dy: _spr.ycoor - _base.y});
            _ui.timer.textContent = TransportControls.formatTime(t);
            if (t >= MAX_RECORD_MS) MoveRecorder.stop();
        }, TICK_MS);
        MoveRecorder._setState('recording');
    }

    static stop () {
        if (_recording) {
            window.clearInterval(_recording.intervalId);
            _samples = MoveRecorder._trim(_recording.samples);
            _recording = null;
            MoveRecorder._restoreBase();
        }
        MoveRecorder._stopPreview();
        MoveRecorder._setState(_samples ? 'recorded' : 'idle');
    }

    // Replay the recording on the stage, then put the character back.
    static play () {
        if (!_samples) return;
        MoveRecorder._stopPreview();
        var start = performance.now();
        var total = _samples[_samples.length - 1].t;
        var step = function (now) {
            var t = now - start;
            var p = samplePath(_samples, t);
            _spr.xcoor = _base.x + p.dx;
            _spr.ycoor = _base.y + p.dy;
            _spr.render();
            _ui.timer.textContent = TransportControls.formatTime(Math.min(t, total));
            if (t < total) {
                _preview = requestAnimationFrame(step);
            } else {
                _preview = null;
                MoveRecorder._restoreBase();
                MoveRecorder._setState('recorded');
            }
        };
        _preview = requestAnimationFrame(step);
        MoveRecorder._setState('playing');
    }

    // Drop the still moments before the first move and after the last one,
    // so the clip is just the movement. Returns null if nothing moved.
    static _trim (samples) {
        var moved = function (s, ref) { return s.dx !== ref.dx || s.dy !== ref.dy; };
        var first = -1;
        for (var i = 1; i < samples.length; i++) {
            if (moved(samples[i], samples[0])) { first = i; break; }
        }
        if (first < 0) return null;
        var last = samples.length - 1;
        while (last > first && !moved(samples[last - 1], samples[last])) last--;
        var t0 = samples[first - 1].t;
        var out = samples.slice(first - 1, last + 1).map(function (s) {
            return {t: s.t - t0, dx: s.dx, dy: s.dy};
        });
        return out[out.length - 1].t >= TICK_MS ? out : null;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    static _restoreBase () {
        if (!_spr) return;
        _spr.xcoor = _base.x;
        _spr.ycoor = _base.y;
        _spr.render();
    }

    static _stopPreview () {
        if (_preview != null) cancelAnimationFrame(_preview);
        _preview = null;
    }

    static _close () {
        if (_recording) window.clearInterval(_recording.intervalId);
        _recording = null;
        MoveRecorder._stopPreview();
        MoveRecorder._restoreBase();
        window.removeEventListener('resize', MoveRecorder._position);
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = null;
        MoveRecorder._frameStage(null);
        _spr = null;
        _samples = null;
        // Put every character back where the timeline says it is.
        var rt = ScratchJr.runtime;
        if (rt) rt.seekTo(rt.currentTime);
    }

    static _setState (state) {
        var on = function (btn, enabled) {
            btn.style.opacity = enabled ? '1' : '0.35';
            btn.style.pointerEvents = enabled ? 'auto' : 'none';
        };
        on(_ui.record, state === 'idle' || state === 'recorded');
        on(_ui.stop, state === 'recording' || state === 'playing');
        on(_ui.play, state === 'recorded');
        on(_ui.keep, state === 'recorded');
        _ui.record.style.backgroundImage = 'url(assets/lib/record' + (state === 'recording' ? 'on' : 'off') + '.svg)';
        _ui.dot.style.visibility = state === 'recording' ? 'visible' : 'hidden';
        if (state === 'idle') _ui.timer.textContent = TransportControls.formatTime(0);
        if (state === 'recorded') {
            _ui.timer.textContent = TransportControls.formatTime(_samples[_samples.length - 1].t);
        }
        MoveRecorder._frameStage(state === 'recording' ? 'recording' : 'armed');
    }

    // Red frame around the stage: dashed while the recorder is open, solid
    // and pulsing while recording.
    static _frameStage (mode) {
        var stage = ScratchJr.stage && ScratchJr.stage.div;
        if (!stage) return;
        if (!mode) {
            stage.style.outline = '';
            stage.style.animation = '';
            return;
        }
        stage.style.outline = mode === 'recording' ? '6px solid #E53935' : '4px dashed #E53935';
        stage.style.outlineOffset = '2px';
        stage.style.animation = mode === 'recording' ? 'moverecpulse 1s ease-in-out infinite' : '';
    }

    static _buildPanel () {
        MoveRecorder._injectStyles();
        _panel = document.createElement('div');
        _panel.id = 'moverecorder';
        setProps(_panel.style, {
            position:      'fixed',
            zIndex:        '9000',
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           '10px',
            padding:       '14px',
            background:    '#fff',
            borderRadius:  '22px',
            border:        '4px solid #4C97FF',
            boxShadow:     '0 6px 18px rgba(0,0,0,0.3)',
            userSelect:    'none',
        });

        // Header: the character being recorded + pulsing dot + timer.
        var head = document.createElement('div');
        setProps(head.style, {display: 'flex', alignItems: 'center', gap: '8px'});
        if (_spr.img) {
            var thumb = document.createElement('img');
            thumb.src = _spr.img.src;
            setProps(thumb.style, {width: '48px', height: '48px', objectFit: 'contain'});
            head.appendChild(thumb);
        }
        _ui.dot = document.createElement('div');
        setProps(_ui.dot.style, {
            width: '14px', height: '14px', borderRadius: '50%', background: '#E53935',
            animation: 'moverecblink 1s ease-in-out infinite',
        });
        head.appendChild(_ui.dot);
        _ui.timer = document.createElement('div');
        setProps(_ui.timer.style, {
            fontFamily: 'monospace', fontSize: '20px', fontWeight: 'bold', color: '#333',
            minWidth: '70px',
        });
        head.appendChild(_ui.timer);
        _panel.appendChild(head);

        // Record / stop / play, same artwork as the sound recorder.
        var row = document.createElement('div');
        setProps(row.style, {display: 'flex', gap: '10px'});
        _ui.record = MoveRecorder._svgButton(row, 'record', 'Record', MoveRecorder.record);
        _ui.stop = MoveRecorder._svgButton(row, 'stop', 'Stop', MoveRecorder.stop);
        _ui.play = MoveRecorder._svgButton(row, 'play', 'Play', MoveRecorder.play);
        _panel.appendChild(row);

        // Keep / discard.
        var row2 = document.createElement('div');
        setProps(row2.style, {display: 'flex', gap: '18px'});
        _ui.cancel = MoveRecorder._roundButton(row2, '✕', '#FF6680', 'Cancel', MoveRecorder.cancel);
        _ui.keep = MoveRecorder._roundButton(row2, '✓', '#59C059', 'Add to timeline', MoveRecorder.keep);
        _panel.appendChild(row2);

        document.body.appendChild(_panel);
        MoveRecorder._position();
    }

    // Beside the stage on the left if there's room, else over its bottom edge.
    static _position () {
        var stage = ScratchJr.stage && ScratchJr.stage.div;
        if (!_panel || !stage) return;
        var r = stage.getBoundingClientRect();
        var w = _panel.offsetWidth;
        var h = _panel.offsetHeight;
        if (r.left - PANEL_GAP - w >= 8) {
            _panel.style.left = (r.left - PANEL_GAP - w) + 'px';
            _panel.style.top = Math.max(8, r.top + ((r.height - h) / 2)) + 'px';
        } else {
            _panel.style.left = Math.max(8, r.left + ((r.width - w) / 2)) + 'px';
            _panel.style.top = Math.max(8, r.bottom - h - PANEL_GAP) + 'px';
        }
    }

    static _svgButton (parent, name, title, fn) {
        var b = document.createElement('div');
        b.title = title;
        setProps(b.style, {
            width: BTN + 'px', height: BTN + 'px', cursor: 'pointer',
            backgroundImage: 'url(assets/lib/' + name + 'off.svg)', backgroundSize: '101%',
        });
        MoveRecorder._onTap(b, fn);
        parent.appendChild(b);
        return b;
    }

    static _roundButton (parent, glyph, color, title, fn) {
        var b = document.createElement('div');
        b.title = title;
        b.textContent = glyph;
        setProps(b.style, {
            width: BTN + 'px', height: BTN + 'px', borderRadius: '50%', background: color,
            color: '#fff', fontSize: '28px', lineHeight: BTN + 'px', textAlign: 'center',
            border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
            cursor: 'pointer', boxSizing: 'border-box',
        });
        MoveRecorder._onTap(b, fn);
        parent.appendChild(b);
        return b;
    }

    static _onTap (el, fn) {
        el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            fn();
        });
    }

    static _injectStyles () {
        if (document.getElementById('moverecorder-styles')) return;
        var st = document.createElement('style');
        st.id = 'moverecorder-styles';
        st.textContent =
            '@keyframes moverecpulse { 0%,100% { outline-color: #E53935; } 50% { outline-color: rgba(229,57,53,0.25); } }' +
            '@keyframes moverecblink { 0%,100% { opacity: 1; } 50% { opacity: 0.15; } }';
        document.head.appendChild(st);
    }
}
