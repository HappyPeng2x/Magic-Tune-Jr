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
import OS from '../tablet/OS';
import IO from '../tablet/IO';
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
    static set changed (v)        { changed = v; }
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
                ScratchJr.installProjectToolbar();
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
        OS.listProjects(function (projects) {
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
                OS.getProjectRecord(id, function (record) {
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
        ScratchJr._autosaveTimer = window.setInterval(function () {
            ScratchJr.saveProject();
        }, 15000);
        window.addEventListener('pagehide', function () {
            ScratchJr.saveProject();
        });
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
    static storyStart ()      { changed = true; }
    static log ()             {}
    static getTime ()         { return 0; }
    static saveProject (e, onDone) {
        if (!currentProject || !Project.metadata || Project.error || !stage || !stage.currentPage) {
            if (onDone) onDone();
            return;
        }
        if (!changed && !onDone) return;
        Project.prepareToSave(currentProject, function () {
            changed = false;
            OS.getProjectRecord(currentProject, function (record) {
                currentProjectData = record;
                if (onDone) onDone();
            });
        });
    }

    static installProjectToolbar () {
        if (document.getElementById('browser-project-toolbar')) return;
        var bar = document.createElement('div');
        bar.id = 'browser-project-toolbar';
        bar.style.cssText = [
            'position:absolute',
            'right:8px',
            'top:8px',
            'z-index:25000',
            'display:flex',
            'gap:6px',
            'font:600 12px Arial,sans-serif'
        ].join(';');
        addButton('Save', function () { ScratchJr.saveProject(null, ScratchJr.refreshProjectLabel); });
        addButton('Projects', function () { ScratchJr.saveProject(null, ScratchJr.showProjectPicker); });
        addButton('Export', ScratchJr.exportCurrentProject);
        addButton('Import', ScratchJr.importProjectFromFile);
        document.body.appendChild(bar);
        ScratchJr.refreshProjectLabel();

        function addButton (label, action) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = [
                'border:2px solid rgba(255,255,255,.8)',
                'border-radius:6px',
                'background:#1976d2',
                'color:white',
                'padding:5px 8px',
                'cursor:pointer',
                'box-shadow:0 1px 4px rgba(0,0,0,.25)'
            ].join(';');
            btn.onclick = function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                action();
            };
            bar.appendChild(btn);
        }
    }

    static refreshProjectLabel () {
        var info = document.getElementById('projectinfo');
        if (info && Project.metadata && Project.metadata.name) {
            info.title = Project.metadata.name;
        }
    }

    static showProjectPicker () {
        var existing = document.getElementById('browser-project-picker');
        if (existing) existing.parentNode.removeChild(existing);
        var overlay = document.createElement('div');
        overlay.id = 'browser-project-picker';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:40000',
            'background:rgba(0,0,0,.45)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font:14px Arial,sans-serif'
        ].join(';');
        var panel = document.createElement('div');
        panel.style.cssText = [
            'width:min(720px,92vw)',
            'max-height:82vh',
            'overflow:auto',
            'background:#fffdf6',
            'border:3px solid #ffb300',
            'border-radius:8px',
            'box-shadow:0 8px 30px rgba(0,0,0,.35)',
            'padding:14px'
        ].join(';');
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px';
        var title = document.createElement('strong');
        title.textContent = 'Projects';
        title.style.cssText = 'font-size:18px;flex:1';
        header.appendChild(title);
        addPanelButton(header, 'New', function () {
            IO.createProject({name: 'Untitled Tune', version: ScratchJr.version, isgift: '0'}, function (id) {
                ScratchJr.switchProject(id);
            });
        });
        addPanelButton(header, 'Close', close);
        panel.appendChild(header);

        var list = document.createElement('div');
        panel.appendChild(list);
        OS.listProjects(function (projects) {
            if (!projects.length) {
                var empty = document.createElement('p');
                empty.textContent = 'No saved projects yet.';
                list.appendChild(empty);
                return;
            }
            projects.forEach(function (project) {
                list.appendChild(ScratchJr.projectRow(project, close));
            });
        });

        function close () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        function addPanelButton (parent, label, action) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = 'padding:7px 10px;border-radius:6px;border:1px solid #b0bec5;background:#eceff1;cursor:pointer';
            btn.onclick = function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                action();
            };
            parent.appendChild(btn);
            return btn;
        }
    }

    static projectRow (project, closePicker) {
        var row = document.createElement('div');
        row.style.cssText = [
            'display:grid',
            'grid-template-columns:72px 1fr auto auto auto',
            'gap:8px',
            'align-items:center',
            'padding:8px',
            'border-top:1px solid #e0e0e0'
        ].join(';');
        var thumb = document.createElement('div');
        thumb.style.cssText = 'width:64px;height:48px;background:#f5f2f7;border:1px solid #ddd;background-size:cover;background-position:center';
        var thumbnail = project.thumbnail;
        if (typeof thumbnail === 'string') {
            try { thumbnail = JSON.parse(thumbnail); } catch (err) { thumbnail = null; }
        }
        if (thumbnail && thumbnail.md5) {
            OS.getmedia(thumbnail.md5, function (base64) {
                if (base64) thumb.style.backgroundImage = 'url(data:image/png;base64,' + base64 + ')';
            });
        }
        row.appendChild(thumb);
        var name = document.createElement('div');
        name.innerHTML = '<strong>' + escapeHTML(project.name || 'Untitled Tune') + '</strong><br><span style="color:#607d8b">' +
            new Date(Number(project.mtime || Date.now())).toLocaleString() + '</span>';
        row.appendChild(name);
        addRowButton('Open', function () {
            closePicker();
            ScratchJr.switchProject(project.id);
        });
        addRowButton('Export', function () {
            ScratchJr.exportProject(project.id);
        });
        addRowButton('Delete', function () {
            if (!window.confirm('Delete "' + (project.name || 'Untitled Tune') + '"?')) return;
            OS.setfield(OS.database, project.id, 'deleted', 'YES', function () {
                if (currentProject === project.id) window.location.reload();
                row.parentNode.removeChild(row);
            });
        });
        return row;

        function addRowButton (label, action) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = 'padding:6px 9px;border-radius:6px;border:1px solid #90a4ae;background:white;cursor:pointer';
            btn.onclick = function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                action();
            };
            row.appendChild(btn);
        }
        function escapeHTML (str) {
            return String(str).replace(/[&<>"']/g, function (ch) {
                return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[ch];
            });
        }
    }

    static switchProject (id) {
        currentProject = id;
        window.localStorage.magicTuneCurrentProject = id;
        window.location.reload();
    }

    static exportCurrentProject () {
        ScratchJr.saveProject(null, function () { ScratchJr.exportProject(currentProject); });
    }

    static exportProject (id) {
        OS.exportProjectBundle(id, function (bundle) {
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
                    OS.importProjectBundle(bundle, function (project) {
                        if (project && project.id) ScratchJr.switchProject(project.id);
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
