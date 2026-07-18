const esbuild = require('esbuild');
const Module = require('module');
const path = require('path');

const filename = path.resolve(__dirname, 'storage-test.bundle.cjs');
const result = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, 'storage-test.js')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent'
});
const testModule = new Module(filename, module);
testModule.filename = filename;
testModule.paths = module.paths;
testModule._compile(result.outputFiles[0].text, filename);
