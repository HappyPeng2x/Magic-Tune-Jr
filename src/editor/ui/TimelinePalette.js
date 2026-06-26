// Drag-from-palette callbacks that create timeline clips.
//
// Replace the ScriptsPane callbacks in paletteMouseDown with these:
//
//   Events.startDrag(e, blockEl,
//       TimelinePalette.prepareForDrag,  // atstart  (was Palette.prepareForDrag)
//       TimelinePalette.dropBlock,        // atend    (was Palette.dropBlockFromPalette)
//       TimelinePalette.draggingBlock,    // atdrag   (was ScriptsPane.draggingBlock)
//       Palette.showHelp,                 // atclick  (unchanged)
//       Palette.startShaking              // athold   (unchanged)
//   );

import ScratchJr from '../ScratchJr';
import Events from '../../utils/Events';
import TimelinePane, {PX_PER_MS, TRACK_H, rowHeight} from './TimelinePane';
import {durationMs} from '../engine/TimelineDuration';
import {frame, gn, localx, localy} from '../../utils/lib';

// Ghost preview element while a drag is in progress over the track list.
let _ghost = null;

export default class TimelinePalette {

    // Called when the user has moved far enough to start the drag gesture.
    // Creates a floating duplicate Block element that follows the cursor.
    // This mirrors Palette.prepareForDrag but omits the Scripts caret logic.
    static prepareForDrag (e) {
        e.preventDefault();
        var pt = Events.getTargetPoint(e);
        Events.dragmousex = pt.x;
        Events.dragmousey = pt.y;
        if (!Events.dragthumbnail || !Events.dragthumbnail.parentNode) {
            Events.cancelAll();
            return;
        }
        var mx = Events.dragmousex - frame.offsetLeft -
                 localx(Events.dragthumbnail, Events.dragmousex);
        var my = Events.dragmousey - frame.offsetTop -
                 localy(Events.dragthumbnail, Events.dragmousey);
        var spr = ScratchJr.getSprite ? ScratchJr.getSprite() : null;
        Events.dragcanvas = Events.dragthumbnail.owner.duplicateBlock(mx, my, spr).div;
        Events.dragcanvas.style.zIndex = ScratchJr.dragginLayer;
        Events.dragDiv.appendChild(Events.dragcanvas);
    }

    // Called on every mouse move.
    // Moves the floating block and shows/updates the ghost clip preview.
    static draggingBlock (e) {
        e.preventDefault();
        var pt = Events.getTargetPoint(e);
        var dx = pt.x - Events.dragmousex;
        var dy = pt.y - Events.dragmousey;
        Events.move3D(Events.dragcanvas, dx, dy);

        var info = TimelinePalette._getDropInfo(e);
        if (info) {
            TimelinePalette._showGhost(info);
        } else {
            TimelinePalette._clearGhost();
        }
    }

    // Called when the user releases the mouse.
    // Creates a clip on the target sprite if the drop is over a track row.
    static dropBlock (e, dragcanvas) {
        e.preventDefault();
        TimelinePalette._clearGhost();

        var info = TimelinePalette._getDropInfo(e);
        if (info && dragcanvas && dragcanvas.owner) {
            var block = dragcanvas.owner;
            info.spr.addClip(block.blocktype, block.getArgValue(), info.startTime, 0);
            TimelinePane.refresh();
        }

        // Remove the floating block ghost from the drag overlay.
        if (dragcanvas && dragcanvas.parentNode) {
            dragcanvas.parentNode.removeChild(dragcanvas);
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    // Return { spr, startTime } if the event falls over a sprite track row.
    // Returns null if over the palette, ruler, label column, or empty space.
    static _getDropInfo (e) {
        var scrollArea = gn('timeline-scrollarea');
        var trackList  = gn('timeline-track-list');
        if (!scrollArea || !trackList) return null;

        var pt     = Events.getTargetPoint(e);
        var saRect = scrollArea.getBoundingClientRect();
        var tlRect = trackList.getBoundingClientRect();

        // Hit-test against the visible scroll area (excludes the label column
        // on the left and anything outside the timeline pane).
        if (pt.x < saRect.left || pt.x > saRect.right ||
            pt.y < saRect.top  || pt.y > saRect.bottom) {
            return null;
        }
        // Ignore drops on the ruler strip above the track list.
        if (pt.y < tlRect.top) return null;

        // getBoundingClientRect already accounts for the scroll offset of the
        // parent (scrollArea), so subtracting rect.left/top gives content coords.
        var localX = pt.x - tlRect.left;
        var localY = pt.y - tlRect.top;

        var startTime = Math.max(0, Math.round(localX / PX_PER_MS));

        // Walk the sprite rows to find which one localY falls in.
        var sprites = TimelinePane._getSprites();
        var y = 0;
        for (var i = 0; i < sprites.length; i++) {
            var h = rowHeight(sprites[i]);
            if (localY < y + h) {
                return {spr: sprites[i], startTime: startTime};
            }
            y += h;
        }
        return null;
    }

    // Show (or update) the dashed ghost preview inside the track list.
    static _showGhost (info) {
        var trackList = gn('timeline-track-list');
        if (!trackList) return;

        if (!_ghost) {
            _ghost = document.createElement('div');
            _ghost.id = 'timeline-ghost';
            _ghost.style.position      = 'absolute';
            _ghost.style.height        = (TRACK_H - 4) + 'px';
            _ghost.style.borderRadius  = '3px';
            _ghost.style.border        = '2px dashed rgba(0,0,0,0.4)';
            _ghost.style.background    = 'rgba(255,255,255,0.5)';
            _ghost.style.pointerEvents = 'none';
            _ghost.style.zIndex        = '8';
            trackList.appendChild(_ghost);
        }

        // Find the top edge of this sprite's row in content coordinates.
        var sprites = TimelinePane._getSprites();
        var rowTop = 0;
        for (var i = 0; i < sprites.length; i++) {
            if (sprites[i] === info.spr) break;
            rowTop += rowHeight(sprites[i]);
        }

        // Ghost width = expected clip duration × PX_PER_MS.
        var ghostW = 60;
        if (Events.dragcanvas && Events.dragcanvas.owner) {
            var block = Events.dragcanvas.owner;
            var speed = (info.spr && info.spr.speed) ? info.spr.speed : 2;
            var dur = durationMs(block.blocktype, block.getArgValue(), speed);
            if (dur !== null && dur !== Infinity) {
                ghostW = Math.max(dur * PX_PER_MS, 8);
            }
        }

        _ghost.style.left  = (info.startTime * PX_PER_MS) + 'px';
        _ghost.style.top   = (rowTop + 2) + 'px';
        _ghost.style.width = ghostW + 'px';
    }

    static _clearGhost () {
        if (_ghost) {
            if (_ghost.parentNode) _ghost.parentNode.removeChild(_ghost);
            _ghost = null;
        }
    }

}
