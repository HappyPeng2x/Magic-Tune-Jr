var path = require('path');
// Require webpack 4 from scratchjr's node_modules — the system has webpack 5
// which is incompatible with the webpack 4 API used in this config.
var webpack = require(path.resolve(__dirname, 'scratchjr/node_modules/webpack'));

var scratchjrNm  = path.resolve(__dirname, 'scratchjr/node_modules');

module.exports = {
    devtool: 'source-map',
    entry: './src/entry/app.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'app.bundle.js'
    },
    performance: { hints: false },
    resolveLoader: {
        modules: [
            path.resolve(__dirname, 'scratchjr/node_modules'),
            'node_modules'
        ]
    },
    resolve: {
        // Do NOT follow symlinks. This keeps import resolution in the magictunejr
        // directory tree, so symlinked scratchjr files resolve their own relative
        // imports (e.g. '../ScratchJr') against magictunejr's directory — picking
        // up our overrides instead of scratchjr's originals.
        symlinks: false,
        modules: [
            path.resolve(__dirname, 'scratchjr/node_modules'),
            'node_modules'
        ]
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: /node_modules/,
                loaders: ['strip-sourcemap-loader']
            },
            {
                loader: 'babel-loader',
                exclude: /node_modules/,
                test: /\.jsx?$/,
                query: {
                    presets: [
                        path.resolve(scratchjrNm, 'babel-preset-es2015'),
                        path.resolve(scratchjrNm, 'babel-preset-stage-3')
                    ]
                }
            }
        ]
    },
    plugins: []
};
