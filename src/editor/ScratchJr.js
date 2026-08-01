import TimelineRuntime from './engine/TimelineRuntime';
import TimelinePane from './ui/TimelinePane';
import Project from './ui/Project';
import UI from './ui/UI';
import Page from './engine/Page';
import Palette from './ui/Palette';
import BlockSpecs from './blocks/BlockSpecs';
import Prims from './engine/Prims';
import Library from './ui/Library';
import ProjectsScreen from './ui/ProjectsScreen';
import ScratchAudio from '../utils/ScratchAudio';
import * as Projects from '../platform/browser/ProjectRepository';
import * as Bundles from '../platform/browser/ProjectBundle';
import IO from '../tablet/BrowserIO';
import Paint from '../painteditor/Paint';
import Events from '../utils/Events';
import Grid from './ui/Grid';
import {libInit, gn, newHTML, frame, getIdFor, scaleMultiplier} from '../utils/lib';

let runtime = undefined;
let stage = undefined;
let currentProject = undefined;
let currentProjectData = undefined;
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
let changeVersion = 0;
let editfirst = false;

export default class ScratchJr {
    static get runtime ()         { return runtime; }
    static set runtime (r)        { runtime = r; }
    static get stage ()           { return stage; }
    static set stage (s)          { stage = s; }
    static get currentProject ()  { return currentProject; }
    static set currentProject (id) { currentProject = id; }
    static get version ()         { return window.Settings ? window.Settings.scratchJrVersion : 'magictunejrv01'; }
    static get editmode ()        { return 'edit'; }
    static set editmode (v)       {}
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
    static set changed (v) {
        changed = v;
        if (v) {
            changeVersion++;
            ScratchJr.scheduleAutosave();
        } else if (ScratchJr._autosaveTimeout) {
            window.clearTimeout(ScratchJr._autosaveTimeout);
            ScratchJr._autosaveTimeout = null;
        }
    }
    static get storyStarted ()    { return false; }
    static set storyStarted (v)   {}

    static appinit () {
        stagecolor = window.Settings ? window.Settings.stageColor : '#F5F2F7';
        defaultSprite = window.Settings ? window.Settings.defaultSprite : 'Star.svg';

        ScratchJr.openInitialProject(function () {
            libInit();
            Project.loadIcon = document.createElement('img');
            Project.loadIcon.src = 'assets/loading.png';
            BlockSpecs.initBlocks();
            ScratchAudio.init();
            Library.init();
            Paint.init();
            Prims.init();
            runtime = new TimelineRuntime();
            Events.init();

            Project.init();

            function tryStart () {
                if (BlockSpecs.loadCount > 0) {
                    setTimeout(tryStart, 32);
                    return;
                }
                UI.layout();
                ScratchJr.loadCurrentProject(function () {
                    Palette.selectCategory(1);
                    setTimeout(function () { Palette.selectCategory(1); }, 100);
                    Paint.layout();
                    Project.setProgress(100);
                    Project.liftCurtain();
                    if (stage && stage.currentPage) {
                        stage.currentPage.update();
                    }
                    TimelinePane.refresh();
                    changed = false;
                    ScratchJr.startAutosave();
                });
            }
            tryStart();
        });
    }

    static openInitialProject (whenDone) {
        Projects.list().then(function (projects) {
            var preferredId = window.localStorage.magicTuneCurrentProject;
            var project = null;
            if (projects && projects.length) {
                for (var i = 0; i < projects.length; i++) {
                    if (projects[i].id === preferredId) {
                        project = projects[i];
                        break;
                    }
                }
                if (!project) project = projects[0];
            }
            if (project) {
                currentProject = project.id;
                window.localStorage.magicTuneCurrentProject = project.id;
                currentProjectData = project;
                whenDone();
                return;
            }
            IO.createProject({
                name: 'Untitled Tune',
                version: ScratchJr.version,
                isgift: '0'
            }, function (id) {
                currentProject = id;
                window.localStorage.magicTuneCurrentProject = id;
                Projects.get(id).then(function (record) {
                    currentProjectData = record;
                    whenDone();
                });
            });
        });
    }

    static loadCurrentProject (whenDone) {
        if (!currentProjectData) {
            Project.metadata = {
                id: currentProject,
                name: 'Untitled Tune',
                version: ScratchJr.version,
                deleted: 'NO',
                isgift: '0'
            };
            new Page(getIdFor('page'));
            whenDone();
            return;
        }

        var data = IO.parseProjectData(currentProjectData);
        Project.metadata = data;
        if (typeof data.json === 'string') {
            try {
                data.json = JSON.parse(data.json);
            } catch (err) {
                data.json = null;
            }
        }
        if (typeof data.thumbnail === 'string') {
            try {
                data.thumbnail = JSON.parse(data.thumbnail);
            } catch (err2) {
                data.thumbnail = null;
            }
        }

        if (data.json) {
            Project.loadData(data.json, whenDone);
        } else {
            new Page(getIdFor('page'));
            whenDone();
        }
    }

    static startAutosave () {
        if (ScratchJr._autosaveTimer) window.clearInterval(ScratchJr._autosaveTimer);
        // Debounced saves handle normal editing; this slower interval is only a safety net.
        ScratchJr._autosaveTimer = window.setInterval(function () {
            ScratchJr.saveProject();
        }, 60000);
        if (!ScratchJr._pagehideInstalled) {
            ScratchJr._pagehideInstalled = true;
            window.addEventListener('pagehide', function () { ScratchJr.saveProject(); });
        }
    }

    static scheduleAutosave () {
        if (ScratchJr._autosaveTimeout) window.clearTimeout(ScratchJr._autosaveTimeout);
        ScratchJr._autosaveTimeout = window.setTimeout(function () {
            ScratchJr._autosaveTimeout = null;
            ScratchJr.saveProject();
        }, 1500);
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
    static storyStart ()      { ScratchJr.changed = true; }
    static log ()             {}
    static getTime ()         { return 0; }
    static saveProject (e, onDone) {
        if (!currentProject || !Project.metadata || Project.error || !stage || !stage.currentPage) {
            if (onDone) onDone();
            return;
        }
        if (!changed && !onDone) return;
        var savingVersion = changeVersion;
        Project.prepareToSave(currentProject, function () {
            if (savingVersion === changeVersion) changed = false;
            Projects.get(currentProject).then(function (record) {
                currentProjectData = record;
                if (onDone) onDone();
            });
        });
    }

    static refreshProjectLabel () {
        var info = document.getElementById('projectinfo');
        if (info && Project.metadata && Project.metadata.name) {
            info.title = Project.metadata.name;
        }
    }

    static showProjectsScreen () {
        ProjectsScreen.show();
    }

    static switchProject (id) {
        if (!id || id === currentProject) return;
        ScratchJr.saveProject(null, function () {
            Projects.get(id).then(function (record) {
                if (!record) throw new Error('Project not found: ' + id);
                if (runtime) runtime.stopThreads();
                if (ScratchJr._autosaveTimeout) window.clearTimeout(ScratchJr._autosaveTimeout);
                Project.clear();
                currentProject = id;
                currentProjectData = record;
                window.localStorage.magicTuneCurrentProject = id;
                ScratchJr.loadCurrentProject(function () {
                    Palette.selectCategory(1);
                    Paint.layout();
                    if (stage && stage.currentPage) stage.currentPage.update();
                    TimelinePane.refresh();
                    changed = false;
                });
            }).catch(function (err) {
                window.alert('Could not open project: ' + err.message);
            });
        });
    }

    static exportCurrentProject () {
        ScratchJr.saveProject(null, function () { ScratchJr.exportProject(currentProject); });
    }

    static exportProject (id) {
        Bundles.exportProject(id).then(function (bundle) {
            if (!bundle) return;
            var name = ((bundle.project && bundle.project.name) || 'magictunejr').replace(/[^a-z0-9-_]+/gi, '_');
            var blob = new Blob([JSON.stringify(bundle)], {type: 'application/json'});
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = name + '.mtjr';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        });
    }

    static importProjectFromFile () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mtjr,application/json';
        input.onchange = function () {
            var file = input.files && input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var bundle = JSON.parse(reader.result);
                    Bundles.importProject(bundle).then(function (project) {
                        ScratchJr.switchProject(project.id);
                    }).catch(function (err) {
                        window.alert('Could not import project: ' + err.message);
                    });
                } catch (err) {
                    window.alert('Could not import project: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

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
