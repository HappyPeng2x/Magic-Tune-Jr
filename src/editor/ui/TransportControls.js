import ScratchJr from '../ScratchJr';
import VideoExporter from './VideoExporter';
import {newHTML, gn} from '../../utils/lib';

// How often the time display refreshes.  The runtime ticks every 32 ms but the
// human eye can't read a counter that fast — 100 ms (10 fps) is plenty.
const DISPLAY_INTERVAL_MS = 100;

let _updaterId = null;

export default class TransportControls {

    // Build the transport bar, attach it to parent, start the display updater.
    // Returns the bar element so the caller can position or style it.
    //
    //   [ ⏮ Rewind ]  [ ▶ Play / ⏸ Pause ]  [ ⏹ Stop ]  |  0:00.0  |  [ ⬇ Export ]
    static create (parent) {
        var bar = newHTML('div', 'transport-bar', parent);
        bar.setAttribute('id', 'transport');

        TransportControls._makeButton(bar, 'transport-rewind', '⏮', 'Rewind',
            TransportControls.onRewind);

        TransportControls._makeButton(bar, 'transport-play', '▶', 'Play',
            TransportControls.onPlayPause);

        TransportControls._makeButton(bar, 'transport-stop', '⏹', 'Stop',
            TransportControls.onStop);

        var timeDisplay = newHTML('div', 'transport-time', bar);
        timeDisplay.setAttribute('id', 'transport-time');
        timeDisplay.textContent = TransportControls.formatTime(0);

        // Separator between the playback controls and the export button.
        var sep = newHTML('div', 'transport-sep', bar);
        sep.style.flex = '1';

        TransportControls._makeButton(bar, 'transport-export', '⬇', 'Export Video',
            TransportControls.onExport);

        TransportControls._startUpdater();
        return bar;
    }

    // ── Button handlers ───────────────────────────────────────────────────────

    static onPlayPause () {
        var rt = ScratchJr.runtime;
        if (!rt) return;
        if (rt.playing) {
            rt.pause();
        } else {
            rt.play();
        }
        // Refresh immediately so the button flips without waiting for the poll.
        TransportControls.updateDisplay();
    }

    static onStop () {
        var rt = ScratchJr.runtime;
        if (!rt) return;
        rt.stop();
        TransportControls.updateDisplay();
    }

    static onRewind () {
        var rt = ScratchJr.runtime;
        if (!rt) return;
        rt.rewind();
        TransportControls.updateDisplay();
    }

    static onExport () {
        var btn = gn('transport-export');
        if (VideoExporter.exporting) {
            VideoExporter.cancel();
            if (btn) { btn.textContent = '⬇'; btn.title = 'Export Video'; }
            return;
        }
        VideoExporter.start(
            function (progress) {
                var b = gn('transport-export');
                if (b) { b.textContent = Math.round(progress * 100) + '%'; b.title = 'Cancel Export'; }
            },
            function () {
                var b = gn('transport-export');
                if (b) { b.textContent = '⬇'; b.title = 'Export Video'; }
            }
        );
    }

    // ── Display ───────────────────────────────────────────────────────────────

    // Sync button appearance and time readout to the current runtime state.
    // Called by the poll interval and also immediately after each button click.
    static updateDisplay () {
        var rt = ScratchJr.runtime;
        if (!rt) return;

        // Play/Pause button label and class switch when playback state changes.
        var playBtn = gn('transport-play');
        if (playBtn) {
            if (rt.playing) {
                playBtn.className = 'transport-btn transport-pause';
                playBtn.title = 'Pause';
                playBtn.textContent = '⏸';
            } else {
                playBtn.className = 'transport-btn transport-play';
                playBtn.title = 'Play';
                playBtn.textContent = '▶';
            }
        }

        var timeEl = gn('transport-time');
        if (timeEl) {
            timeEl.textContent = TransportControls.formatTime(rt.currentTime);
        }
    }

    // Format milliseconds as "m:ss.t"  (tenths of a second).
    //   0       → "0:00.0"
    //   2400    → "0:02.4"
    //   65000   → "1:05.0"
    //   3600000 → "60:00.0"
    static formatTime (ms) {
        var tenths      = Math.floor(ms / 100) % 10;
        var totalSecs   = Math.floor(ms / 1000);
        var seconds     = totalSecs % 60;
        var minutes     = Math.floor(totalSecs / 60);
        return minutes + ':' + String(seconds).padStart(2, '0') + '.' + tenths;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    static _makeButton (parent, id, label, title, handler) {
        var btn = newHTML('div', 'transport-btn ' + id, parent);
        btn.setAttribute('id', id);
        btn.title = title;
        btn.textContent = label;
        btn.onclick = handler;
        return btn;
    }

    // Start a 100 ms poll that keeps the time display and button state current
    // during playback.  Safe to call multiple times — only one interval runs.
    static _startUpdater () {
        if (_updaterId != null) return;
        _updaterId = window.setInterval(function () {
            TransportControls.updateDisplay();
        }, DISPLAY_INTERVAL_MS);
    }

    // Call this if the transport bar is removed from the DOM.
    static _stopUpdater () {
        if (_updaterId != null) {
            window.clearInterval(_updaterId);
            _updaterId = null;
        }
    }
}
