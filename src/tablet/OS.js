// Browser implementation for ScratchJr's OS platform layer.
import {AudioCapture, CameraCapture} from './BrowserMedia';
import * as Projects from '../platform/browser/ProjectRepository';
import * as Media from '../platform/browser/MediaStore';
import * as Bundles from '../platform/browser/ProjectBundle';

let path;
const sounds = {};
let audioCapture;
let cameraCapture;
let cameraAvailable = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

if (cameraAvailable && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices().then(function (devices) {
        cameraAvailable = devices.some(function (device) { return device.kind === 'videoinput'; });
    }).catch(function () {});
}

function callback (fcn, value) {
    if (fcn) fcn(value);
}

function failSoft (fcn, fallback) {
    return function (err) {
        console.warn('Browser OS storage failed:', err);
        callback(fcn, fallback);
    };
}

function browserSoundUrl (dir, name) {
    if (name === 'pop.mp3') return 'sounds/tap.wav';
    var url = (dir || '') + name;
    if (url.indexOf('HTML5/') === 0) url = url.slice('HTML5/'.length);
    return url;
}

export default class OS {
    static get path () { return path; }
    static set path (p) { path = p; }
    static get database () { return 'projects'; }
    // No tablet interface to wait for — call immediately.
    static waitForInterface (fcn) { if (fcn) fcn(); }

    static analyticsEvent () {}
    static hascamera () { return cameraAvailable; }
    static cleanassets (ft, fcn) {
        Media.clean(ft).then(function () { callback(fcn); })
            .catch(failSoft(fcn));
    }
    static deviceName (fcn) { if (fcn) fcn('MagicTune Jr'); }
    static getsettings (fcn) { if (fcn) fcn('.,0'); }

    // Narrow compatibility bridge for the two inherited Paint.js save paths.
    // Project persistence no longer accepts or parses SQL.
    static stmt (json, fcn) {
        var sql = json && json.stmt || '';
        var match = /^insert into (usershapes|userbkgs) \(([^)]+)\) values/i.exec(sql);
        if (match) {
            var record = {};
            match[2].split(',').forEach(function (field, index) { record[field.trim()] = json.values[index]; });
            Projects.createLibrary(match[1], record).then(function (saved) { callback(fcn, saved.id); })
                .catch(failSoft(fcn, null));
            return;
        }
        match = /^delete from (usershapes|userbkgs) where id = \?/i.exec(sql);
        if (match) return Projects.deleteLibrary(match[1], json.values[0]).then(function () { callback(fcn); });
        console.warn('Rejected legacy storage statement:', sql);
        callback(fcn, null);
    }

    static query (json, fcn) {
        var match = /^select (.+) from (projects|usershapes|userbkgs) where (.+?)(?: order by .+)?$/i.exec(json && json.stmt || '');
        if (!match) return callback(fcn, '[]');
        var fields = match[3].split(/\s+AND\s+/i).map(function (condition) { return condition.split(/=|IS/i)[0].trim(); });
        var options = {};
        var valueIndex = 0;
        match[3].split(/\s+AND\s+/i).forEach(function (condition, index) {
            if (/IS NULL/i.test(condition)) options.galleryIsNull = true;
            else if (/!=/.test(condition)) options.excludeId = json.values[valueIndex++];
            else options[fields[index]] = json.values[valueIndex++];
        });
        var promise = match[2].toLowerCase() === 'projects' ? Projects.find(options) :
            Projects.findLibrary(match[2].toLowerCase(), options);
        promise.then(function (records) { callback(fcn, JSON.stringify(records)); })
            .catch(failSoft(fcn, '[]'));
    }

    static setfield (table, id, field, value, fcn) {
        if (table !== 'projects') return callback(fcn);
        var changes = {}; changes[field] = value;
        Projects.update(id, changes).then(function () { callback(fcn); }).catch(failSoft(fcn));
    }

    static playSound (name, fcn) {
        var sound = sounds[name];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(function () {});
        }
        callback(fcn);
    }

    static stopSound (name, fcn) {
        var sound = sounds[name];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
        callback(fcn);
    }

    static setSoundVolume () {}

    static sndrecord (fcn) {
        audioCapture = audioCapture || new AudioCapture();
        callback(fcn, audioCapture.start());
    }

    static recordstop (fcn) {
        if (audioCapture) audioCapture.stop(fcn);
        else callback(fcn);
    }

    static volume (fcn) { callback(fcn, audioCapture ? audioCapture.getVolume() : 0); }

    static startplay (fcn) {
        if (audioCapture) audioCapture.play();
        callback(fcn);
    }

    static stopplay (fcn) {
        if (audioCapture) audioCapture.stopPlay();
        callback(fcn);
    }

    static recorddisappear (keep, fcn) {
        if (!audioCapture || keep !== 'YES') {
            if (audioCapture) audioCapture.releaseStream();
            callback(fcn);
            return;
        }
        var blob = audioCapture.blob();
        if (!blob) {
            audioCapture.releaseStream();
            callback(fcn);
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            // Store only the base64 payload; registerSound adds the data-URL header.
            var base64 = String(reader.result).split(',')[1];
            OS.setmedianame(base64, audioCapture.id, 'webm', function (name) {
                audioCapture.releaseStream();
                callback(fcn, name);
            });
        };
        reader.readAsDataURL(blob);
    }

    static askpermission () {}

    static startfeed (data, fcn) {
        if (cameraCapture) cameraCapture.hide();
        cameraCapture = new CameraCapture(data);
        cameraCapture.show();
        callback(fcn);
    }

    static stopfeed (fcn) {
        if (cameraCapture) cameraCapture.hide();
        cameraCapture = null;
        callback(fcn);
    }

    static choosecamera (mode, fcn) {
        if (cameraCapture) cameraCapture.switchCamera(mode);
        callback(fcn);
    }

    static captureimage (fcn) {
        var image = cameraCapture && cameraCapture.snapshot();
        if (!image) return;
        var base64 = image.split(',')[1];
        if (typeof fcn === 'function') return fcn(base64);
        var target = window;
        String(fcn).split('.').forEach(function (part) { target = target && target[part]; });
        if (typeof target === 'function') target(base64);
    }

    static getmedia (file, fcn) {
        Media.getBase64(file)
            .then(function (value) { callback(fcn, value || null); })
            .catch(failSoft(fcn, null));
    }

    static setmedia (str, ext, fcn) {
        Media.putHashed(str, ext).then(function (name) { callback(fcn, name); })
            .catch(failSoft(fcn, null));
    }

    static setmedianame (str, name, ext, fcn) {
        var filename = Media.ensureExtension(name, ext);
        Media.put(filename, str)
            .then(function () { callback(fcn, filename); })
            .catch(failSoft(fcn, null));
    }

    static getmd5 (str, fcn) {
        Media.hash(str)
            .then(function (hash) { callback(fcn, hash); })
            .catch(failSoft(fcn, null));
    }

    static remove (str, fcn) {
        Media.remove(str).then(function () { callback(fcn); })
            .catch(failSoft(fcn));
    }

    static getfile (str, fcn) {
        Media.getFile(str)
            .then(function (value) { callback(fcn, value == null ? null : value); })
            .catch(failSoft(fcn, null));
    }

    static setfile (name, str, fcn) {
        Media.putFile(name, str)
            .then(function () { callback(fcn); })
            .catch(failSoft(fcn));
    }

    static registerSound (dir, name, fcn) {
        var url = browserSoundUrl(dir, name);
        if (dir === 'Documents') {
            OS.getmedia(name, function (data) {
                if (!data) {
                    callback(fcn, 'error');
                    return;
                }
                var extension = name.split('.').pop().toLowerCase();
                var mime = extension === 'webm' ? 'audio/webm' :
                    (extension === 'wav' ? 'audio/wav' : 'audio/mpeg');
                var audio = new Audio('data:' + mime + ';base64,' + data);
                sounds[name] = audio;
                audio.onended = function () {
                    if (window.ScratchAudio) window.ScratchAudio.soundDone(name);
                };
                audio.onloadedmetadata = function () { callback(fcn, name + ',' + audio.duration); };
                audio.onerror = function () { callback(fcn, 'error'); };
            });
            return;
        }
        var audio = new Audio(url);
        sounds[name] = audio;
        audio.onended = function () {
            if (window.ScratchAudio) window.ScratchAudio.soundDone(name);
        };
        audio.onloadedmetadata = function () { callback(fcn, name + ',' + audio.duration); };
        audio.onerror = function () { callback(fcn, 'error'); };
        audio.load();
    }

    static listProjects (fcn) {
        Projects.list()
            .then(function (records) { callback(fcn, records); })
            .catch(failSoft(fcn, []));
    }

    static getProjectRecord (id, fcn) {
        Projects.get(id)
            .then(function (record) { callback(fcn, record || null); })
            .catch(failSoft(fcn, null));
    }

    static putProjectRecord (record, fcn) {
        Projects.create(record)
            .then(function (saved) { callback(fcn, saved); })
            .catch(failSoft(fcn, null));
    }

    static updateProjectRecord (id, changes, fcn) {
        Projects.update(id, changes).then(function (saved) { callback(fcn, saved); })
            .catch(failSoft(fcn, null));
    }

    static findProjectRecords (options, fcn) {
        Projects.find(options).then(function (records) { callback(fcn, records); })
            .catch(failSoft(fcn, []));
    }

    static findLibraryRecords (table, options, fcn) {
        Projects.findLibrary(table, options).then(function (records) { callback(fcn, records); })
            .catch(failSoft(fcn, []));
    }

    static deleteLibraryRecord (table, id, fcn) {
        Projects.deleteLibrary(table, id).then(function () { callback(fcn); })
            .catch(failSoft(fcn));
    }

    static exportProjectBundle (id, fcn) {
        Bundles.exportProject(id).then(function (bundle) { callback(fcn, bundle); })
            .catch(failSoft(fcn, null));
    }

    static importProjectBundle (bundle, fcn) {
        OS.lastImportError = '';
        Bundles.importProject(bundle)
            .then(function (saved) { callback(fcn, saved); })
            .catch(function (err) {
                OS.lastImportError = err.message;
                failSoft(fcn, null)(err);
            });
    }

    static createZipForProject (projectData, metadata, name, fcn) {
        var parsed = JSON.parse(projectData);
        var id = parsed.id;
        OS.exportProjectBundle(id, function (bundle) {
            if (!bundle) {
                bundle = {
                    format: 'magictunejr-project-bundle',
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    project: parsed,
                    metadata: metadata,
                    media: [],
                    files: []
                };
            }
            window._magicTuneShareBlob = new Blob([JSON.stringify(bundle)], {type: 'application/json'});
            window._magicTuneShareName = (name || 'magictunejr') + '.mtjr';
            callback(fcn, window._magicTuneShareName);
        });
    }

    static sendSjrToShareDialog (fileName) {
        var blob = window._magicTuneShareBlob;
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName || window._magicTuneShareName || 'magictunejr.mtjr';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    static loadProjectFromSjr (str) {
        try {
            OS.importProjectBundle(JSON.parse(str), function () {});
            return 1;
        } catch (err) {
            return 0;
        }
    }
}
