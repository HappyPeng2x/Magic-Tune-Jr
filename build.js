#!/usr/bin/env node
// Uses scratchjr's webpack 4 installation directly.
process.chdir(__dirname);

const webpack = require('../scratchjr/node_modules/webpack');
const config  = require('./webpack.config.js');
const watch   = process.argv.includes('--watch');

config.mode = 'development';

if (watch) {
    const compiler = webpack(config);
    compiler.watch({}, (err, stats) => {
        if (err) { console.error(err); return; }
        console.log(stats.toString({colors: true, modules: false}));
    });
    console.log('Watching for changes...');
} else {
    webpack(config, (err, stats) => {
        if (err) { console.error(err); process.exit(1); }
        console.log(stats.toString({colors: true, modules: false}));
        if (stats.hasErrors()) process.exit(1);
    });
}
