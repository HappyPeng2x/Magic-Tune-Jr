import * as Database from './Database';

export function list () {
    return Database.records('projects').then(function (records) {
        return records.filter(function (record) { return record.deleted !== 'YES' && !record.gallery; })
            .sort(function (a, b) { return Number(b.mtime || 0) - Number(a.mtime || 0); });
    });
}

export function get (id) { return Database.getRecord('projects', id); }
export function create (record) { return Database.putRecord('projects', record); }

export function update (id, changes) {
    return get(id).then(function (record) {
        if (!record) throw new Error('Project not found: ' + id);
        Object.keys(changes || {}).forEach(function (field) { record[field] = changes[field]; });
        if (!Object.prototype.hasOwnProperty.call(changes || {}, 'mtime')) record.mtime = Date.now().toString();
        return Database.putRecord('projects', record);
    });
}

export function find (options) {
    options = options || {};
    return Database.records('projects').then(function (records) {
        return records.filter(function (record) {
            if (options.deleted !== undefined && record.deleted !== options.deleted) return false;
            if (options.excludeId !== undefined && String(record.id) === String(options.excludeId)) return false;
            if (options.galleryIsNull && record.gallery != null && record.gallery !== '') return false;
            var reserved = {deleted: true, excludeId: true, galleryIsNull: true};
            var fields = Object.keys(options).filter(function (field) { return !reserved[field]; });
            if (!fields.every(function (field) { return String(record[field]) === String(options[field]); })) return false;
            return true;
        });
    });
}

export function findLibrary (table, options) {
    if (table !== 'usershapes' && table !== 'userbkgs') return Promise.resolve([]);
    options = options || {};
    return Database.records(table).then(function (records) {
        return records.filter(function (record) {
            return Object.keys(options).every(function (field) { return String(record[field]) === String(options[field]); });
        }).sort(function (a, b) { return Number(b._created || 0) - Number(a._created || 0); });
    });
}

export function createLibrary (table, record) {
    if (table !== 'usershapes' && table !== 'userbkgs') return Promise.reject(new Error('Invalid library table'));
    return Database.putRecord(table, record);
}

export function deleteLibrary (table, id) {
    if (table !== 'usershapes' && table !== 'userbkgs') return Promise.resolve();
    return Database.remove('records', table + ':' + id);
}
