// Real-time video export via captureStream + MediaRecorder.
//
// The export loop is driven by requestAnimationFrame, advancing the
// TimelineRuntime one TICK_MS step at a time to match real-world elapsed time.
// This keeps the video's internal timing identical to the live preview.
//
// Usage:
//   VideoExporter.start(onProgress, onDone);  // onProgress(0..1), onDone()
//   VideoExporter.cancel();                    // abort mid-export

import ScratchJr from '../ScratchJr';
import {TICK_MS} from '../engine/TimelineDuration';

const STAGE_W = 480;
const STAGE_H = 360;

// Extra milliseconds recorded after the last clip ends so the final action
// completes before the video cuts to black.
const EXPORT_TAIL_MS = 500;

let _rafId    = null;
let _recorder = null;

export default class VideoExporter {

    static get exporting () { return _recorder !== null; }

    // ── Public API ────────────────────────────────────────────────────────────

    // Begin a video export.
    //   onProgress(ratio)  called each frame with a 0–1 progress ratio
    //   onDone()           called after the download has been triggered
    static start (onProgress, onDone) {
        if (VideoExporter.exporting) return;

        var rt   = ScratchJr.runtime;
        var page = ScratchJr.stage ? ScratchJr.stage.currentPage : null;
        if (!rt || !page) { alert('No project loaded.'); return; }

        if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
            alert('Your browser does not support video export.\n' +
                  'Use a Chromium-based browser (Chrome, Edge, Brave).');
            return;
        }

        var totalMs = VideoExporter._computeEndMs(page);
        if (totalMs <= EXPORT_TAIL_MS) {
            alert('Add some clips to the timeline before exporting.');
            return;
        }

        // Stop live playback and jump to the beginning.
        rt.pause();
        rt.seekTo(0);

        // Off-screen render canvas.
        var canvas = document.createElement('canvas');
        canvas.width  = STAGE_W;
        canvas.height = STAGE_H;
        var ctx = canvas.getContext('2d');

        // Pick the best available WebM codec.
        var mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
            .find(function (m) { return MediaRecorder.isTypeSupported(m); });
        if (!mimeType) {
            alert('No supported video codec found in this browser.');
            return;
        }

        var chunks = [];
        var stream;
        try {
            stream = canvas.captureStream(30);
        } catch (err) {
            alert('captureStream failed: ' + err.message + '\n' +
                  'Make sure all images are loaded from the same origin.');
            return;
        }

        _recorder = new MediaRecorder(stream, {
            mimeType: mimeType,
            videoBitsPerSecond: 4000000,
        });

        _recorder.ondataavailable = function (e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        _recorder.onstop = function () {
            _recorder = null;
            _rafId    = null;
            VideoExporter._download(chunks, mimeType);
            if (onDone) onDone();
        };

        _recorder.start(100);  // emit data chunks every 100 ms

        // Render a first frame immediately so the stream is not blank.
        VideoExporter._renderFrame(ctx, page);

        var lastT = performance.now();
        var accMs = 0;

        function loop (now) {
            var dt = now - lastT;
            lastT  = now;
            accMs += dt;

            // Advance simulation to match real-time elapsed.
            while (accMs >= TICK_MS) {
                rt._advanceTick();
                accMs -= TICK_MS;
            }

            VideoExporter._renderFrame(ctx, page);

            var progress = Math.min(rt.currentTime / totalMs, 1);
            if (onProgress) onProgress(progress);

            if (rt.currentTime >= totalMs) {
                // Recording done — onstop assembles the blob and downloads it.
                _recorder.stop();
            } else {
                _rafId = requestAnimationFrame(loop);
            }
        }

        _rafId = requestAnimationFrame(loop);
    }

    // Abort an in-progress export without saving anything.
    static cancel () {
        if (_rafId != null) {
            cancelAnimationFrame(_rafId);
            _rafId = null;
        }
        if (_recorder && _recorder.state !== 'inactive') {
            // Suppress the onstop download by clearing onstop first.
            _recorder.onstop = null;
            _recorder.stop();
        }
        _recorder = null;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    // Draw the current animation frame onto ctx.
    static _renderFrame (ctx, page) {
        ctx.clearRect(0, 0, STAGE_W, STAGE_H);

        // Background.
        var bkgImg = page.bkg ? page.bkg.img : null;
        if (bkgImg && bkgImg.complete) {
            ctx.drawImage(bkgImg, 0, 0, STAGE_W, STAGE_H);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        }

        // Sprites in DOM order (painter's algorithm — last child on top).
        var sprites = VideoExporter._getSprites(page);
        for (var i = 0; i < sprites.length; i++) {
            VideoExporter._drawSprite(ctx, sprites[i]);
        }
    }

    // Draw a single sprite onto ctx using the same transform as the DOM render.
    //
    // The Scratch Jr CSS transform is:
    //   translate3d(xcoor-cx, ycoor-cy, 0)  rotate(angle)  scale(±s, s)
    // with transform-origin at the element's center (cx, cy).
    // This places the sprite's visual center at (xcoor, ycoor) in stage coords.
    //
    // The canvas equivalent translates to the center, rotates, scales, then
    // draws the image offset so its own center sits at the canvas origin.
    static _drawSprite (ctx, spr) {
        if (!spr.shown) return;
        if (!spr.img || !spr.img.complete) return;
        if (!spr.w || !spr.h) return;

        ctx.save();
        ctx.translate(spr.xcoor, spr.ycoor);
        if (spr.angle) {
            ctx.rotate(spr.angle * Math.PI / 180);
        }
        ctx.scale(spr.flip ? -spr.scale : spr.scale, spr.scale);
        ctx.drawImage(spr.img, -spr.cx, -spr.cy, spr.w, spr.h);
        ctx.restore();
    }

    // Return all sprite-type owners on page in DOM order.
    static _getSprites (page) {
        var result = [];
        for (var i = 0; i < page.div.childElementCount; i++) {
            var owner = page.div.childNodes[i].owner;
            if (owner && owner.type === 'sprite') result.push(owner);
        }
        return result;
    }

    // Find the millisecond after which all finite-duration clips have ended,
    // then add a short tail so the last action completes before the cut.
    static _computeEndMs (page) {
        var max = 0;
        var sprites = VideoExporter._getSprites(page);
        for (var i = 0; i < sprites.length; i++) {
            var tl = sprites[i].timeline || [];
            for (var j = 0; j < tl.length; j++) {
                if (tl[j].duration !== Infinity) {
                    var end = tl[j].startTime + tl[j].duration;
                    if (end > max) max = end;
                }
            }
        }
        return max + EXPORT_TAIL_MS;
    }

    // Trigger a browser download of the recorded blob.
    static _download (chunks, mimeType) {
        var blob = new Blob(chunks, {type: mimeType});
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'magictunejr.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Release the object URL after the browser has had time to start the download.
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }
}
