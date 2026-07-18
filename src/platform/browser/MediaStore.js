import * as Database from './Database';

export function normalizeExtension (ext) { return ext && ext.charAt(0) === '.' ? ext.slice(1) : ext; }
export function ensureExtension (name, ext) {
    ext = normalizeExtension(ext);
    return !ext || name.slice(-(ext.length + 1)) === '.' + ext ? name : name + '.' + ext;
}

function fallbackHash (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

export function hash (str) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.resolve(fallbackHash(str));
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return ('00' + b.toString(16)).slice(-2); }).join('');
    }).catch(function () { return fallbackHash(str); });
}

export function get (name) { return Database.get('media', name); }
function mimeForName (name) {
    var ext = String(name).split('.').pop().toLowerCase();
    return {svg: 'image/svg+xml', png: 'image/png', wav: 'audio/wav', webm: 'audio/webm', mp3: 'audio/mpeg'}[ext] ||
        'application/octet-stream';
}

function base64ToBlob (value, name) {
    if (typeof value !== 'string') return value;
    var binary = window.atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], {type: mimeForName(name)});
}

function blobToBase64 (blob) {
    if (blob == null) return Promise.resolve(blob);
    if (typeof blob === 'string') return Promise.resolve(blob);
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(blob);
    });
}

export function getBase64 (name) {
    return get(name).then(function (value) {
        // Lazily migrate legacy base64 records after a successful read.
        if (typeof value === 'string') put(name, value).catch(function () {});
        return blobToBase64(value);
    });
}
export function put (name, value) {
    return Database.put('media', name, base64ToBlob(value, name)).then(function () { return name; });
}
export function putHashed (value, ext) {
    ext = normalizeExtension(ext);
    return hash(value).then(function (digest) { return put(digest + (ext ? '.' + ext : ''), value); });
}
export function remove (name) { return Promise.all([Database.remove('media', name), Database.remove('files', name)]); }
export function getFile (name) { return Database.get('files', name); }
export function putFile (name, value) { return Database.put('files', name, String(value)).then(function () { return name; }); }
export function keys () { return Database.keys('media'); }
export {base64ToBlob, blobToBase64};

export function findUnusedKeys (records, mediaKeys, ft) {
    var suffix = '.' + normalizeExtension(ft || '').toLowerCase();
    var referenced = {};
    records.forEach(function (record) {
        if (record._table === 'projects' && record.deleted === 'YES') return;
        if (record.md5) referenced[record.md5] = true;
        [record.json, record.thumbnail].forEach(function (value) {
            if (!value) return;
            var serialized = typeof value === 'string' ? value : JSON.stringify(value);
            mediaKeys.forEach(function (key) { if (serialized.indexOf(key) > -1) referenced[key] = true; });
        });
    });
    return mediaKeys.filter(function (key) {
        return String(key).toLowerCase().slice(-suffix.length) === suffix && !referenced[key];
    });
}

export function clean (ft) {
    return Promise.all([Database.records(), keys()]).then(function (data) {
        return Promise.all(findUnusedKeys(data[0], data[1], ft).map(function (key) { return Database.remove('media', key); }));
    });
}
