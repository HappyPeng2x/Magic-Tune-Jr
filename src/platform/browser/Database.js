const DB_NAME = 'magictunejr-browser';
const DB_VERSION = 2;
let connection;

export function open () {
    if (connection) return connection;
    connection = new Promise(function (resolve, reject) {
        var request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function () {
            var db = request.result;
            if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
            if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
            var records = db.objectStoreNames.contains('records') ?
                request.transaction.objectStore('records') : db.createObjectStore('records', {keyPath: '_key'});
            if (!records.indexNames.contains('by_table')) records.createIndex('by_table', '_table', {unique: false});
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
    });
    return connection;
}

export function transact (storeName, mode, operation) {
    return open().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(storeName, mode);
            var result = operation(tx.objectStore(storeName));
            tx.oncomplete = function () { resolve(result); };
            tx.onerror = function () { reject(tx.error); };
            tx.onabort = function () { reject(tx.error); };
        });
    });
}

export function get (storeName, key) {
    return open().then(function (db) {
        return new Promise(function (resolve, reject) {
            var request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

export function put (storeName, key, value) {
    return transact(storeName, 'readwrite', function (store) { store.put(value, key); });
}

export function remove (storeName, key) {
    return transact(storeName, 'readwrite', function (store) { store.delete(key); });
}

export function keys (storeName) {
    return open().then(function (db) {
        return new Promise(function (resolve, reject) {
            var request = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys();
            request.onsuccess = function () { resolve(request.result || []); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

export function records (table) {
    return open().then(function (db) {
        return new Promise(function (resolve, reject) {
            var store = db.transaction('records', 'readonly').objectStore('records');
            var request = table ? store.index('by_table').getAll(table) : store.getAll();
            request.onsuccess = function () { resolve(request.result || []); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

export function getRecord (table, id) { return get('records', table + ':' + id); }

export function putRecord (table, source) {
    var record = Object.assign({}, source);
    record._table = table;
    record.id = record.id || String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    record._key = table + ':' + record.id;
    record._created = record._created || Date.now();
    record._updated = Date.now();
    return transact('records', 'readwrite', function (store) { store.put(record); })
        .then(function () { return record; });
}
