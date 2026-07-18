// Browser implementation for ScratchJr's OS platform layer.

let path;
const DB_NAME = 'magictunejr-browser';
const DB_VERSION = 1;
const sounds = {};

let dbPromise;

function openDB () {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
            var db = req.result;
            if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
            if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
            if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', {keyPath: '_key'});
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
}

function withStore (name, mode, fcn) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(name, mode);
            var store = tx.objectStore(name);
            var result = fcn(store);
            tx.oncomplete = function () { resolve(result); };
            tx.onerror = function () { reject(tx.error); };
            tx.onabort = function () { reject(tx.error); };
        });
    });
}

function getValue (storeName, key) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(storeName, 'readonly');
            var req = tx.objectStore(storeName).get(key);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    });
}

function putValue (storeName, key, value) {
    return withStore(storeName, 'readwrite', function (store) {
        store.put(value, key);
    });
}

function deleteValue (storeName, key) {
    return withStore(storeName, 'readwrite', function (store) {
        store.delete(key);
    });
}

function getAllRecords () {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('records', 'readonly');
            var req = tx.objectStore('records').getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    });
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

function normalizeExt (ext) {
    return ext && ext.charAt(0) === '.' ? ext.slice(1) : ext;
}

function ensureExt (name, ext) {
    ext = normalizeExt(ext);
    if (!ext || name.slice(-(ext.length + 1)) === '.' + ext) return name;
    return name + '.' + ext;
}

function browserSoundUrl (dir, name) {
    if (name === 'pop.mp3') return 'sounds/tap.wav';
    var url = (dir || '') + name;
    if (url.indexOf('HTML5/') === 0) url = url.slice('HTML5/'.length);
    return url;
}

function fallbackHash (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function hashString (str) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
        return Promise.resolve(fallbackHash(str));
    }
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
        .then(function (buffer) {
            return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
                return ('00' + b.toString(16)).slice(-2);
            }).join('');
        })
        .catch(function () {
            return fallbackHash(str);
        });
}

function parseInsert (json) {
    var match = /insert\s+into\s+(\w+)\s*\(([^)]+)\)/i.exec(json.stmt || '');
    if (!match) return null;
    var fields = match[2].split(',').map(function (field) { return field.trim(); });
    var record = {_table: match[1], _created: Date.now(), _updated: Date.now()};
    fields.forEach(function (field, index) {
        record[field] = json.values ? json.values[index] : undefined;
    });
    var id = record.id || record.md5 || String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    record.id = id;
    record._key = record._table + ':' + id;
    return record;
}

function parseDelete (json) {
    var match = /delete\s+from\s+(\w+)\s+where\s+id\s*=\s*\?/i.exec(json.stmt || '');
    if (!match || !json.values || !json.values.length) return null;
    return match[1] + ':' + json.values[0];
}

function parseUpdate (json) {
    var match = /update\s+(\w+)\s+set\s+(.+)\s+where\s+id\s*=\s*([^\s]+)/i.exec(json.stmt || '');
    if (!match) return null;
    var fields = match[2].split(',').map(function (part) {
        return part.split('=')[0].trim();
    });
    return {
        key: match[1] + ':' + match[3],
        fields: fields,
        values: json.values || []
    };
}

function parseSelect (json) {
    var match = /select\s+(.+)\s+from\s+(\w+)(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+(.+))?$/i.exec(json.stmt || '');
    if (!match) return null;
    var fields = match[1].trim();
    return {
        fields: fields === '*' ? null : fields.split(',').map(function (field) { return field.trim(); }),
        table: match[2],
        cond: match[3],
        order: match[4],
        values: json.values || []
    };
}

function filterRecords (records, query) {
    var valueIndex = 0;
    var tests = [];
    if (query.cond) {
        query.cond.split(/\s+AND\s+/i).forEach(function (part) {
            var trimmed = part.trim();
            var nullMatch = /(\w+)\s+IS\s+NULL/i.exec(trimmed);
            if (nullMatch) {
                tests.push({field: nullMatch[1], op: 'null'});
                return;
            }
            var match = /(\w+)\s*(!=|=)\s*(\?|[^\s]+)/.exec(trimmed);
            if (!match) return;
            var expected = match[3] === '?' ? query.values[valueIndex++] : match[3].replace(/^['"]|['"]$/g, '');
            tests.push({field: match[1], op: match[2], expected: String(expected)});
        });
    }
    var result = records.filter(function (record) {
        if (record._table !== query.table) return false;
        return tests.every(function (test) {
            if (test.op === 'null') return record[test.field] == null || record[test.field] === '';
            if (test.op === '!=') return String(record[test.field]) !== test.expected;
            return String(record[test.field]) === test.expected;
        });
    });
    if (query.order) {
        var orderField = query.order.trim().split(/\s+/)[0];
        var descending = /\s+desc$/i.test(query.order.trim());
        result.sort(function (a, b) {
            var av = a[orderField] || '';
            var bv = b[orderField] || '';
            var comparison = String(av).localeCompare(String(bv));
            return descending ? -comparison : comparison;
        });
    }
    if (query.fields) {
        result = result.map(function (record) {
            var obj = {};
            query.fields.forEach(function (field) { obj[field] = record[field]; });
            return obj;
        });
    }
    return result;
}

function getRecord (table, id) {
    return getValue('records', table + ':' + id);
}

function putRecord (table, record) {
    record._table = table;
    record.id = record.id || String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    record._key = table + ':' + record.id;
    record._updated = Date.now();
    return withStore('records', 'readwrite', function (store) { store.put(record); })
        .then(function () { return record; });
}

function listProjectRecords () {
    return getAllRecords().then(function (records) {
        return records
            .filter(function (record) {
                return record._table === 'projects' && record.deleted !== 'YES' && !record.gallery;
            })
            .sort(function (a, b) {
                return Number(b.mtime || 0) - Number(a.mtime || 0);
            });
    });
}

export default class OS {
    static get path () { return path; }
    static set path (p) { path = p; }
    static get database () { return 'projects'; }

    // No tablet interface to wait for — call immediately.
    static waitForInterface (fcn) { if (fcn) fcn(); }

    static analyticsEvent () {}
    static hascamera () { return false; }
    static cleanassets (ft, fcn) { if (fcn) fcn(); }
    static deviceName (fcn) { if (fcn) fcn('MagicTune Jr'); }
    static getsettings (fcn) { if (fcn) fcn('.,0'); }

    static stmt (json, fcn) {
        var insert = parseInsert(json);
        if (insert) {
            withStore('records', 'readwrite', function (store) { store.put(insert); })
                .then(function () { callback(fcn, insert.id); })
                .catch(failSoft(fcn, null));
            return;
        }

        var deleteKey = parseDelete(json);
        if (deleteKey) {
            deleteValue('records', deleteKey)
                .then(function () { callback(fcn, null); })
                .catch(failSoft(fcn, null));
            return;
        }

        var update = parseUpdate(json);
        if (update) {
            getValue('records', update.key).then(function (record) {
                record = record || {_key: update.key, id: update.key.split(':')[1], _table: update.key.split(':')[0]};
                update.fields.forEach(function (field, index) {
                    record[field] = update.values[index];
                });
                record._updated = Date.now();
                return withStore('records', 'readwrite', function (store) { store.put(record); });
            }).then(function () { callback(fcn, null); })
                .catch(failSoft(fcn, null));
            return;
        }

        callback(fcn, null);
    }

    static query (json, fcn) {
        var query = parseSelect(json);
        if (!query) {
            callback(fcn, '[]');
            return;
        }
        getAllRecords()
            .then(function (records) { callback(fcn, JSON.stringify(filterRecords(records, query))); })
            .catch(failSoft(fcn, '[]'));
    }

    static setfield (db, id, fieldname, val, fcn) {
        var key = db + ':' + id;
        getValue('records', key).then(function (record) {
            record = record || {_key: key, _table: db, id: id};
            record[fieldname] = val;
            record.mtime = (new Date()).getTime().toString();
            record._updated = Date.now();
            return withStore('records', 'readwrite', function (store) { store.put(record); });
        }).then(function () { callback(fcn); })
            .catch(failSoft(fcn));
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

    static getmedia (file, fcn) {
        getValue('media', file)
            .then(function (value) { callback(fcn, value || null); })
            .catch(failSoft(fcn, null));
    }

    static setmedia (str, ext, fcn) {
        ext = normalizeExt(ext);
        hashString(str).then(function (hash) {
            var name = hash + (ext ? '.' + ext : '');
            return putValue('media', name, str).then(function () { callback(fcn, name); });
        }).catch(failSoft(fcn, null));
    }

    static setmedianame (str, name, ext, fcn) {
        var filename = ensureExt(name, ext);
        putValue('media', filename, str)
            .then(function () { callback(fcn, filename); })
            .catch(failSoft(fcn, null));
    }

    static getmd5 (str, fcn) {
        hashString(str)
            .then(function (hash) { callback(fcn, hash); })
            .catch(failSoft(fcn, fallbackHash(str)));
    }

    static remove (str, fcn) {
        Promise.all([
            deleteValue('media', str),
            deleteValue('files', str)
        ]).then(function () { callback(fcn); })
            .catch(failSoft(fcn));
    }

    static getfile (str, fcn) {
        getValue('files', str)
            .then(function (value) { callback(fcn, value == null ? null : value); })
            .catch(failSoft(fcn, null));
    }

    static setfile (name, str, fcn) {
        putValue('files', name, String(str))
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
                var audio = new Audio('data:audio/wav;base64,' + data);
                sounds[name] = audio;
                audio.onloadedmetadata = function () { callback(fcn, name + ',' + audio.duration); };
                audio.onerror = function () { callback(fcn, 'error'); };
            });
            return;
        }
        var audio = new Audio(url);
        sounds[name] = audio;
        audio.onloadedmetadata = function () { callback(fcn, name + ',' + audio.duration); };
        audio.onerror = function () { callback(fcn, 'error'); };
        audio.load();
    }

    static listProjects (fcn) {
        listProjectRecords()
            .then(function (records) { callback(fcn, records); })
            .catch(failSoft(fcn, []));
    }

    static getProjectRecord (id, fcn) {
        getRecord('projects', id)
            .then(function (record) { callback(fcn, record || null); })
            .catch(failSoft(fcn, null));
    }

    static putProjectRecord (record, fcn) {
        putRecord('projects', record)
            .then(function (saved) { callback(fcn, saved); })
            .catch(failSoft(fcn, null));
    }

    static exportProjectBundle (id, fcn) {
        Promise.all([getRecord('projects', id), getAllRecords()]).then(function (data) {
            var project = data[0];
            if (!project) {
                callback(fcn, null);
                return;
            }
            openDB().then(function (db) {
                var tx = db.transaction(['media', 'files'], 'readonly');
                var mediaReq = tx.objectStore('media').getAllKeys();
                var fileReq = tx.objectStore('files').getAllKeys();
                tx.oncomplete = function () {
                    Promise.all([
                        Promise.all((mediaReq.result || []).map(function (key) {
                            return getValue('media', key).then(function (value) { return [key, value]; });
                        })),
                        Promise.all((fileReq.result || []).map(function (key) {
                            return getValue('files', key).then(function (value) { return [key, value]; });
                        }))
                    ]).then(function (stores) {
                        var bundle = {
                            format: 'magictunejr-project-bundle',
                            version: 1,
                            exportedAt: new Date().toISOString(),
                            project: project,
                            libraryRecords: data[1].filter(function (record) {
                                return record._table === 'usershapes' || record._table === 'userbkgs';
                            }),
                            media: stores[0],
                            files: stores[1]
                        };
                        callback(fcn, bundle);
                    });
                };
            });
        }).catch(failSoft(fcn, null));
    }

    static importProjectBundle (bundle, fcn) {
        if (!bundle || bundle.format !== 'magictunejr-project-bundle' || !bundle.project) {
            callback(fcn, null);
            return;
        }
        var project = bundle.project;
        project = Object.assign({}, project);
        project.id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        project.name = project.name || 'Imported Project';
        project.deleted = 'NO';
        project.gallery = '';
        project.mtime = (new Date()).getTime().toString();
        var media = bundle.media || [];
        var files = bundle.files || [];
        var records = bundle.libraryRecords || [];
        Promise.all(media.map(function (entry) { return putValue('media', entry[0], entry[1]); }))
            .then(function () {
                return Promise.all(files.map(function (entry) { return putValue('files', entry[0], entry[1]); }));
            })
            .then(function () {
                return Promise.all(records.map(function (record) {
                    var copy = Object.assign({}, record);
                    return putRecord(copy._table, copy);
                }));
            })
            .then(function () { return putRecord('projects', project); })
            .then(function (saved) { callback(fcn, saved); })
            .catch(failSoft(fcn, null));
    }

    static createZipForProject (projectData, metadata, name, fcn) {
        var parsed = JSON.parse(projectData);
        var id = parsed.id;
        OS.exportProjectBundle(id, function (bundle) {
            if (!bundle) {
                bundle = {
                    format: 'magictunejr-project-bundle',
                    version: 1,
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
