#!/usr/bin/env node
const esbuild = require('esbuild');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const output = path.resolve(__dirname, 'dist/app.bundle.js');
const options = {
    entryPoints: [path.resolve(__dirname, 'src/entry/app.js')],
    outfile: output,
    bundle: true,
    sourcemap: true,
    target: ['es2017'],
    format: 'iife',
    platform: 'browser',
    preserveSymlinks: true,
    logLevel: 'info',
    define: { global: 'globalThis' }
};

function writeBuildId () {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex').slice(0, 20);
    fs.writeFileSync(path.resolve(__dirname, 'dist/build-id.js'),
        'window.MAGIC_TUNE_BUILD_ID = ' + JSON.stringify(hash) + ';\n');
}

async function main () {
    if (watch) {
        const context = await esbuild.context(Object.assign({}, options, {
            plugins: [{
                name: 'build-id',
                setup (build) { build.onEnd(result => { if (!result.errors.length) writeBuildId(); }); }
            }]
        }));
        await context.watch();
        console.log('Watching for changes...');
    } else {
        await esbuild.build(options);
        writeBuildId();
    }
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
