//////////////////////////////////////////////////
// Full-screen "My Creations" project picker, modeled on
// ScratchJr's My Projects lobby screen: a big tappable
// grid of project tiles instead of a small list dialog.
//////////////////////////////////////////////////

import ScratchJr from '../ScratchJr';
import OS from '../../tablet/OS';
import IO from '../../tablet/BrowserIO';
import * as Projects from '../../platform/browser/ProjectRepository';
import {newHTML} from '../../utils/lib';

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD = 12;

let overlay;
let grid;
let revealedTile;

export default class ProjectsScreen {
    static show () {
        if (overlay) return;
        overlay = newHTML('div', undefined, document.body);
        overlay.id = 'mtj-projects-screen';

        var header = newHTML('div', 'mtj-projects-header', overlay);
        var title = newHTML('div', 'mtj-projects-title', header);
        title.textContent = 'My Creations';
        var close = newHTML('div', 'mtj-projects-close', header);
        close.textContent = '✕ Close';
        close.onclick = ProjectsScreen.close;

        grid = newHTML('div', 'mtj-projects-grid', overlay);
        grid.addEventListener('pointerdown', function (e) {
            if (e.target === grid) hideRevealed();
        });

        ProjectsScreen.refresh();
    }

    static close () {
        if (!overlay) return;
        overlay.parentNode.removeChild(overlay);
        overlay = undefined;
        grid = undefined;
        revealedTile = undefined;
    }

    static refresh () {
        if (!grid) return;
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        revealedTile = undefined;

        Projects.list().then(function (projects) {
            if (!grid) return; // screen was closed before the list resolved
            grid.appendChild(newProjectTile(projects));
            if (!projects.length) {
                var empty = newHTML('div', 'mtj-projects-empty', grid);
                empty.textContent = 'No creations yet — tap + to start one!';
            }
            projects.forEach(function (project) {
                grid.appendChild(projectTile(project));
            });
        });
    }
}

function newProjectTile (existingProjects) {
    var tile = newHTML('div', 'mtj-project-tile mtj-new-tile', undefined);
    var plus = newHTML('div', 'mtj-new-plus', tile);
    plus.textContent = '+';
    var label = newHTML('h4', 'mtj-project-title', tile);
    label.textContent = 'New Creation';
    attachTapHandler(tile, function () {
        IO.createProject({name: nextCreationName(existingProjects), version: ScratchJr.version, isgift: '0'},
            function (id) {
                ScratchJr.switchProject(id);
                ProjectsScreen.close();
            });
    });
    return tile;
}

function projectTile (project) {
    var tile = newHTML('div', 'mtj-project-tile', undefined);
    if (project.id === ScratchJr.currentProject) {
        tile.className += ' mtj-current';
    }
    var thumb = newHTML('div', 'mtj-project-thumb', tile);
    setThumbnail(thumb, project.thumbnail);
    var label = newHTML('h4', 'mtj-project-title', tile);
    label.textContent = project.name || 'Untitled Tune';

    var badge = newHTML('div', 'mtj-delete-badge', tile);
    badge.textContent = '✕';
    badge.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    badge.addEventListener('pointerup', function (e) {
        e.stopPropagation();
        e.preventDefault();
        deleteProject(project);
    });
    tile._badge = badge;

    attachTapHandler(tile, function () {
        ScratchJr.switchProject(project.id);
        ProjectsScreen.close();
    }, tile);
    return tile;
}

function setThumbnail (el, thumbnail) {
    if (typeof thumbnail === 'string') {
        try { thumbnail = JSON.parse(thumbnail); } catch (err) { thumbnail = null; }
    }
    if (thumbnail && thumbnail.md5) {
        OS.getmedia(thumbnail.md5, function (base64) {
            if (base64) el.style.backgroundImage = 'url(data:image/png;base64,' + base64 + ')';
        });
    }
}

// Attaches a tap-to-open handler that ignores drags and, for tiles with a
// delete badge, ignores the tap that revealed the badge on a long press --
// this mirrors ScratchJr's hold-to-delete pattern, which exists to keep young
// kids from deleting a project with a plain accidental tap.
function attachTapHandler (tile, onTap) {
    var pressTimer = null;
    var longPressed = false;
    var dragging = false;
    var startPt = null;

    tile.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        longPressed = false;
        dragging = false;
        startPt = {x: e.clientX, y: e.clientY};
        if (revealedTile && revealedTile !== tile) hideRevealed();
        if (tile._badge) {
            pressTimer = setTimeout(function () {
                longPressed = true;
                showDeleteBadge(tile);
            }, LONG_PRESS_MS);
        }
    });
    tile.addEventListener('pointermove', function (e) {
        if (!startPt) return;
        var dx = e.clientX - startPt.x;
        var dy = e.clientY - startPt.y;
        if (Math.sqrt((dx * dx) + (dy * dy)) > DRAG_THRESHOLD) {
            dragging = true;
            clearTimeout(pressTimer);
        }
    });
    tile.addEventListener('pointerup', function () {
        clearTimeout(pressTimer);
        startPt = null;
        if (dragging || longPressed) return;
        onTap();
    });
    tile.addEventListener('pointercancel', function () {
        clearTimeout(pressTimer);
        startPt = null;
    });
}

function showDeleteBadge (tile) {
    tile._badge.style.visibility = 'visible';
    revealedTile = tile;
}

function hideRevealed () {
    if (revealedTile && revealedTile._badge) revealedTile._badge.style.visibility = 'hidden';
    revealedTile = undefined;
}

function deleteProject (project) {
    if (!window.confirm('Delete "' + (project.name || 'Untitled Tune') + '"?')) return;
    Projects.update(project.id, {deleted: 'YES'}).then(function () {
        if (project.id !== ScratchJr.currentProject) {
            ProjectsScreen.refresh();
            return;
        }
        Projects.list().then(function (remaining) {
            if (remaining.length) {
                ScratchJr.switchProject(remaining[0].id);
                ProjectsScreen.refresh();
            } else {
                IO.createProject({name: 'Untitled Tune', version: ScratchJr.version, isgift: '0'}, function (id) {
                    ScratchJr.switchProject(id);
                    ProjectsScreen.refresh();
                });
            }
        });
    });
}

function nextCreationName (existingProjects) {
    var used = {};
    existingProjects.forEach(function (p) { used[p.name] = true; });
    var n = 1;
    while (used['My Creation ' + n]) n++;
    return 'My Creation ' + n;
}
