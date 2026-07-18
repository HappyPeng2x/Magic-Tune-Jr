// Browser-first project persistence facade. The inherited IO class still
// handles assets, thumbnails and project packaging; database operations use
// explicit IndexedDB-backed OS methods instead of its legacy SQL bridge.
import BaseIO from './IO';
import * as Projects from '../platform/browser/ProjectRepository';

export default class BrowserIO extends BaseIO {
    static getObject (id, fcn) {
        if (id.indexOf('/') > -1) return BrowserIO.requestFromServer(id, fcn);
        BrowserIO.getObjectinDB('projects', id, fcn);
    }
    static getObjectinDB (db, id, fcn) { // eslint-disable-line no-unused-vars
        Projects.get(id).then(function (record) {
            fcn(JSON.stringify(record ? [record] : []));
        });
    }

    static createProject (obj, fcn) {
        var record = {
            name: obj.name,
            version: obj.version,
            deleted: 'NO',
            mtime: (new Date()).getTime().toString(),
            isgift: obj.isgift || '0'
        };
        if (obj.json) record.json = JSON.stringify(obj.json);
        if (obj.thumbnail) record.thumbnail = JSON.stringify(obj.thumbnail);
        Projects.create(record).then(function (saved) {
            if (fcn) fcn(saved && saved.id);
        });
    }

    static saveProject (obj, fcn) {
        Projects.update(obj.id, {
            version: obj.version,
            deleted: obj.deleted,
            name: obj.name,
            json: JSON.stringify(obj.json),
            thumbnail: JSON.stringify(obj.thumbnail),
            mtime: (new Date()).getTime().toString()
        }).then(function (saved) { if (fcn) fcn(saved); });
    }

    static setProjectIsGift (obj, fcn) {
        Projects.update(obj.id, {isgift: obj.isgift}).then(function (saved) { if (fcn) fcn(saved); });
    }

    static query (table, query, fcn) {
        var fields = String(query.cond || '').split(/\s+AND\s+/).map(function (condition) {
            return condition.split('=')[0].trim();
        });
        var options = {};
        fields.forEach(function (field, index) { options[field] = query.values[index]; });
        Projects.findLibrary(table, options).then(function (records) { fcn(JSON.stringify(records)); });
    }

    static deleteobject (table, id, fcn) {
        Projects.deleteLibrary(table, id).then(function () { if (fcn) fcn(); });
    }

    static uniqueProjectName (project, fcn, useOne) {
        function splitName (name) {
            var parts = name.split(' ');
            var tail = parts.pop();
            return isNaN(tail) ? {name: name, number: null} :
                {name: parts.join(' '), number: parseInt(tail)};
        }
        var requested = splitName(project.name);
        Projects.find({deleted: 'NO', galleryIsNull: true}).then(function (records) {
            var next = null;
            records.forEach(function (record) {
                var existing = splitName(record.name);
                if (requested.name === existing.name) {
                    next = existing.number == null ? 2 : Math.max(next || 0, existing.number + 1);
                }
            });
            if (next != null && (!requested.number || next > requested.number)) {
                project.name = requested.name + ' ' + next;
            } else if (useOne) {
                project.name = requested.name + ' 1';
            }
            fcn(project);
        });
    }
}
