import TimelineRuntime from './engine/TimelineRuntime';
import TimelinePane from './ui/TimelinePane';
import Project from './ui/Project';
import UI from './ui/UI';
import Page from './engine/Page';
import Palette from './ui/Palette';
import BlockSpecs from './blocks/BlockSpecs';
import Prims from './engine/Prims';
import Library from './ui/Library';
import ScratchAudio from '../utils/ScratchAudio';
import Paint from '../painteditor/Paint';
import Events from '../utils/Events';
import Grid from './ui/Grid';
import {libInit, gn, newHTML, frame, getIdFor, scaleMultiplier} from '../utils/lib';

let runtime = undefined;
let stage = undefined;
let defaultSprite = undefined;
let stagecolor = undefined;
const dragginLayer = 7000;
const _backButtonCallbacks = [];
let _onHold = false;
let shaking = undefined;
let stopShaking = undefined;
let activeFocus = undefined;
let keypad = undefined;
let textForm = undefined;
let changed = false;
let editfirst = false;

export default class ScratchJr {
    static get runtime ()         { return runtime; }
    static set runtime (r)        { runtime = r; }
    static get stage ()           { return stage; }
    static set stage (s)          { stage = s; }
    static get dragginLayer ()    { return dragginLayer; }
    static get defaultSprite ()   { return defaultSprite; }
    static get stagecolor ()      { return stagecolor; }
    static get shaking ()         { return shaking; }
    static set shaking (s)        { shaking = s; }
    static get stopShaking ()     { return stopShaking; }
    static set stopShaking (s)    { stopShaking = s; }
    static get onHold ()          { return _onHold; }
    static set onHold (v)         { _onHold = v; }
    static get userStart ()       { return false; }
    static get activeFocus ()     { return activeFocus; }
    static set activeFocus (v)    { activeFocus = v; }
    static get changed ()         { return changed; }
    static set changed (v)        { changed = v; }
    static get storyStarted ()    { return false; }
    static set storyStarted (v)   {}

    static appinit () {
        stagecolor = window.Settings ? window.Settings.stageColor : '#F5F2F7';
        defaultSprite = window.Settings ? window.Settings.defaultSprite : 'Star.svg';

        libInit();
        Project.loadIcon = document.createElement('img');
        BlockSpecs.initBlocks();
        ScratchAudio.init();
        Library.init();
        Paint.init();
        Prims.init();
        runtime = new TimelineRuntime();
        Events.init();

        // Show loading screen while block images finish loading.
        Project.init();

        function tryStart () {
            if (BlockSpecs.loadCount > 0) {
                setTimeout(tryStart, 32);
                return;
            }
            UI.layout();
            // ScratchJr.stage is now set by UI.stageArea() → new Stage(div).
            new Page(getIdFor('page'));
            Palette.selectCategory(1);
            setTimeout(function () { Palette.selectCategory(1); }, 100);
            Paint.layout();
            Project.setProgress(100);
            Project.liftCurtain();
            if (stage && stage.currentPage) {
                stage.currentPage.update();
            }
            TimelinePane.refresh();
        }
        tryStart();
    }

    static getSprite () {
        if (!stage || !stage.currentPage) return null;
        var name = stage.currentPage.currentSpriteName;
        if (!name) return null;
        var el = gn(name);
        return el ? el.owner : null;
    }

    // Stubs for script-related calls that don't apply to timeline mode.
    static getActiveScript () { return null; }
    static getBlocks ()       { return []; }

    static isEditable ()      { return true; }
    static storyStart ()      {}
    static log ()             {}
    static getTime ()         { return 0; }
    static saveProject ()     {}

    // Restores global mouse/touch handlers after the library overlay closes.
    static editorEvents () {
        window.ontouchstart = ScratchJr.unfocus;
        window.onmousedown  = ScratchJr.unfocus;
        window.ontouchend   = undefined;
        window.onmouseup    = undefined;
    }

    static get onBackButtonCallback () { return _backButtonCallbacks; }

    // Runtime control — invoked by UI stage buttons and keyboard shortcuts.
    static stopStrips () {
        if (runtime) runtime.stopThreads();
    }

    static stopStripsFromTop (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        ScratchJr.unfocus(e);
        if (runtime) runtime.stopThreads();
    }

    static resetSprites () {
        if (runtime) runtime.rewind();
    }

    static runStrips (e) {
        ScratchJr.stopStripsFromTop(e);
        ScratchJr.unfocus(e);
        if (runtime) runtime.play();
    }

    static clearSelection () {}
    static blur ()           {}
    static unfocus (e)       {}

    // Fullscreen — delegate to scratchjr's UI helpers if they exist.
    static fullScreen (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        UI.enterFullScreen(e);
    }

    // Numeric keypad used by block arg editing.
    static setupKeypad () {
        keypad = newHTML('div', 'picokeyboard', frame);
        keypad.ontouchstart = ScratchJr.eatEvent;
        keypad.onmousedown  = ScratchJr.eatEvent;
        var pad = newHTML('div', 'insidekeyboard', keypad);
        for (var i = 1; i < 10; i++) {
            ScratchJr.keyboardAddKey(pad, i, 'onekey');
        }
        ScratchJr.keyboardAddKey(pad, '-', 'onekey minus');
        ScratchJr.keyboardAddKey(pad, '0', 'onekey');
        ScratchJr.keyboardAddKey(pad, undefined, 'onekey delete');
    }

    static eatEvent (e) { e.preventDefault(); e.stopPropagation(); }

    static keyboardAddKey (p, str, c) {
        var keym = newHTML('div', c, p);
        var mk = newHTML('span', undefined, keym);
        mk.textContent = str ? str : '';
        keym.ontouchstart = ScratchJr.numEditKey;
        keym.onmousedown  = ScratchJr.numEditKey;
    }

    static numEditKey () {}

    // Text-editing field overlay.
    static setupEditableField () {
        textForm = newHTML('form', 'textform', frame);
        textForm.name = 'editable';
        var ti = newHTML('input', 'textinput', textForm);
        ti.name = 'field';
        ti.maxLength = 50;
        ti.onkeypress = function (evt) {
            var key = evt.keyCode || evt.which;
            if (key === 13) {
                evt.preventDefault();
                ti.blur();
            }
        };
        textForm.onsubmit = function (evt) { evt.preventDefault(); };
    }

    // Update the green-flag / stop button appearance (no-op in timeline mode —
    // the TransportControls handle playback UI).
    static updateRunStopButtons () {}

    // Keep ScratchAudio snd calls safe.
    static sndFX (s) { ScratchAudio.sndFX(s); }
}
