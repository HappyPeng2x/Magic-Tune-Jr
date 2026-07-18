import * as Database from './Database';
import * as Projects from './ProjectRepository';
import * as Media from './MediaStore';

export function referencedMediaKeys (project, keys) {
    var serialized = JSON.stringify({json: project && project.json, thumbnail: project && project.thumbnail});
    return keys.filter(function (key) { return serialized.indexOf(String(key)) > -1; });
}

export function validate (bundle) {
    if (!bundle || bundle.format !== 'magictunejr-project-bundle') throw new Error('Not a Magic Tune Jr project');
    if (bundle.version !== 1 && bundle.version !== 2) throw new Error('Unsupported project bundle version');
    if (!bundle.project || typeof bundle.project !== 'object' || Array.isArray(bundle.project)) {
        throw new Error('Project metadata is missing');
    }
    if (bundle.project.json && typeof bundle.project.json === 'string') {
        try { JSON.parse(bundle.project.json); } catch (err) { throw new Error('Project data is invalid JSON'); }
    }
    ['media', 'files'].forEach(function (field) {
        if (bundle[field] !== undefined && !Array.isArray(bundle[field])) throw new Error(field + ' must be an array');
        var valuesByKey = {};
        (bundle[field] || []).forEach(function (entry) {
            if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
                throw new Error('Invalid ' + field + ' entry');
            }
            if (valuesByKey[entry[0]] !== undefined && valuesByKey[entry[0]] !== entry[1]) {
                throw new Error('Conflicting duplicate ' + field + ' entry: ' + entry[0]);
            }
            valuesByKey[entry[0]] = entry[1];
        });
    });
    if (bundle.libraryRecords !== undefined && !Array.isArray(bundle.libraryRecords)) {
        throw new Error('libraryRecords must be an array');
    }
    (bundle.libraryRecords || []).forEach(function (record) {
        if (!record || (record._table !== 'usershapes' && record._table !== 'userbkgs')) {
            throw new Error('Invalid library record');
        }
    });
    return bundle;
}

export function exportProject (id) {
    return Promise.all([Projects.get(id), Database.records(), Media.keys()]).then(function (data) {
        var project = data[0];
        if (!project) throw new Error('Project not found: ' + id);
        var mediaKeys = referencedMediaKeys(project, data[2]);
        var referenced = {};
        mediaKeys.forEach(function (key) { referenced[key] = true; });
        return Promise.all(mediaKeys.map(function (key) {
            return Media.getBase64(key).then(function (value) { return [key, value]; });
        })).then(function (media) {
            return {
                format: 'magictunejr-project-bundle',
                version: 2,
                exportedAt: new Date().toISOString(),
                project: project,
                libraryRecords: data[1].filter(function (record) {
                    return (record._table === 'usershapes' || record._table === 'userbkgs') && referenced[record.md5];
                }),
                media: media
            };
        });
    });
}

export function importProject (bundle) {
    validate(bundle);
    var media = bundle.media || [];
    var files = bundle.files || [];
    var incoming = media.map(function (entry) { return {store: 'media', entry: entry}; })
        .concat(files.map(function (entry) { return {store: 'files', entry: entry}; }));
    return Promise.all(incoming.map(function (item) {
        var read = item.store === 'media' ? Media.getBase64(item.entry[0]) : Database.get(item.store, item.entry[0]);
        return read.then(function (existing) {
            if (existing !== undefined && existing !== item.entry[1]) throw new Error('Stored asset collision: ' + item.entry[0]);
        });
    })).then(function () {
        return Promise.all(media.map(function (entry) { return Media.put(entry[0], entry[1]); }));
    }).then(function () {
        return Promise.all(files.map(function (entry) { return Media.putFile(entry[0], entry[1]); }));
    }).then(function () {
        return Promise.all((bundle.libraryRecords || []).map(function (record) {
            var copy = Object.assign({}, record, {id: String(Date.now()) + '-' + Math.random().toString(36).slice(2)});
            return Projects.createLibrary(copy._table, copy);
        }));
    }).then(function () {
        var project = Object.assign({}, bundle.project, {
            id: String(Date.now()) + '-' + Math.random().toString(36).slice(2),
            name: bundle.project.name || 'Imported Project',
            deleted: 'NO',
            gallery: '',
            mtime: Date.now().toString()
        });
        return Projects.create(project);
    });
}
