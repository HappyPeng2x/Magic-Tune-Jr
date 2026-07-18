const assert = require('assert');
const storage = require('../src/platform/browser/MediaStore');
const bundles = require('../src/platform/browser/ProjectBundle');

assert.deepStrictEqual(storage.findUnusedKeys([
    {_table: 'projects', deleted: 'NO', json: '{"md5":"used.svg","sounds":["voice.webm"]}'},
    {_table: 'projects', deleted: 'YES', json: '{"md5":"deleted.svg"}'},
    {_table: 'usershapes', md5: 'library.svg'}
], ['used.svg', 'deleted.svg', 'library.svg', 'unused.svg', 'voice.webm'], 'svg'), [
    'deleted.svg', 'unused.svg'
]);

assert.deepStrictEqual(bundles.referencedMediaKeys({
    json: '{"md5":"sprite.svg","sounds":["voice.webm"]}',
    thumbnail: '{"md5":"thumb.png"}'
}, ['sprite.svg', 'voice.webm', 'thumb.png', 'other.wav']), [
    'sprite.svg', 'voice.webm', 'thumb.png'
]);

assert.strictEqual(bundles.validate({
    format: 'magictunejr-project-bundle', version: 2, project: {name: 'Tune'}, media: []
}).version, 2);
assert.throws(function () {
    bundles.validate({format: 'magictunejr-project-bundle', version: 99, project: {}});
}, /Unsupported/);
assert.throws(function () {
    bundles.validate({format: 'magictunejr-project-bundle', version: 2, project: {}, media: [['bad']]});
}, /Invalid media/);
console.log('Storage behavior tests passed.');
