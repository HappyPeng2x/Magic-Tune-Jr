# Magic Tune Jr Architecture Simplification Roadmap

Magic Tune Jr works as a browser-first ScratchJr derivative, but some inherited platform abstractions and recent browser adaptations can be simplified further. This document records the recommended improvements in priority order.

## 1. Export only assets belonging to the selected project

The current project exporter includes every media object, miscellaneous file, user shape, and background stored by the application. Exporting one project can therefore include assets used only by other projects.

The exporter should:

1. Traverse the selected project's JSON and thumbnail.
2. Collect referenced sprites, backgrounds, thumbnails, and sounds.
3. Fetch only those IndexedDB media entries.
4. Exclude global miscellaneous files unless specifically required.
5. Include user-library records only when referenced by the project.

This reduces bundle size, memory usage, export time, and the possibility of carrying unrelated recordings or artwork in an exported file.

## 2. Replace the `BrowserIO` monkey patch with a clean boundary

`BrowserIO.js` currently assigns its `getObjectinDB` implementation to the inherited `BaseIO` class. This compensates for inherited methods that refer directly to `IO`, but it is global mutation whose behavior depends on import order and upstream implementation details.

Separate the responsibilities into focused services:

```text
ProjectRepository
├── create
├── load
├── update
├── list
└── delete

ProjectBundle
├── export
└── import

MediaStore
├── get
├── put
├── remove
└── clean

ScratchAssetIO
├── SVG helpers
├── thumbnails
└── static asset requests
```

Magic Tune Jr should use upstream IO code only for reusable asset processing. Project persistence and `.mtjr` packaging should not inherit from or mutate the ScratchJr IO class.

## 3. Split the large `OS` class

`src/tablet/OS.js` currently combines:

- IndexedDB initialization
- Project repository operations
- Media storage
- Asset cleanup
- Audio playback
- Microphone recording
- Camera capture
- Project import and export
- Browser downloads
- Legacy OS compatibility methods

A clearer browser platform structure would be:

```text
src/platform/browser/
├── Database.js
├── ProjectRepository.js
├── MediaStore.js
├── ProjectBundle.js
├── AudioPlayback.js
├── AudioCapture.js
├── CameraCapture.js
└── OS.js
```

`OS.js` can remain as a thin compatibility facade for inherited ScratchJr code. New Magic Tune Jr code should use the focused services directly.

## 4. Use Promises internally and callbacks only at the legacy boundary

The IndexedDB implementation already uses Promises internally, but frequently converts results back to callbacks. This produces nested flows and makes error propagation difficult.

The repository-facing API should use Promises:

```js
const project = await projects.get(id);
await projects.update(id, changes);
const projects = await projects.list({deleted: false});
```

Only adapters consumed by inherited ScratchJr modules should translate Promises into callbacks.

Errors should propagate to Magic Tune Jr code instead of always becoming `null` or `[]`. Returning an empty list for a database failure can make the application appear to have lost every project.

## 5. Store binary media as `Blob` objects

Media is currently stored and exported as base64 strings. Base64 increases binary size by roughly one-third and creates large temporary strings during recording, image handling, import, and export.

IndexedDB can store `Blob` values directly. A future schema could store:

```js
{
    blob,
    mimeType,
    createdAt
}
```

Benefits include:

- Smaller IndexedDB usage
- Less encoding and decoding
- Lower peak memory usage
- Correct MIME information
- Easier object-URL playback and display

A migration period can support both representations:

```js
if (typeof value === 'string') {
    // Legacy base64 value
} else {
    // Blob record
}
```

For project exchange, a ZIP container would be more efficient than a large JSON document containing base64 data.

## 6. Give service-worker assets build-aware versions

The service worker currently uses a manually fixed cache version, while the generated JavaScript bundle always uses `dist/app.bundle.js`. If a deployment changes the bundle without changing the service worker, an installed application can continue serving the old cached bundle.

The build should produce a hashed filename such as:

```text
app.7c282270.js
```

It should also generate or update the service-worker asset manifest automatically. This removes manual cache-version management and makes application updates deterministic.

Until the build is modernized, a generated cache version should change on every production build.

## 7. Modernize the build independently of the submodule

Implemented in Stage 3. The following list describes the former build:

The current build:

- Loads Webpack 4 from `scratchjr/node_modules`
- Loads Babel presets from the ScratchJr submodule
- Requires `NODE_OPTIONS=--openssl-legacy-provider`
- Relies on `resolve.symlinks = false`
- Declares few first-class build dependencies in Magic Tune Jr's package

This makes Magic Tune Jr dependent on the internal dependency state of another repository.

Move to an owned build setup using esbuild, Vite, or a current Webpack version. Magic Tune Jr's `package.json` should declare everything needed to build the application.

ScratchJr source can then be exposed through explicit aliases:

```js
'@scratchjr': path.resolve('scratchjr/src')
'@app': path.resolve('src')
```

Explicit aliases are clearer and safer than the filesystem symlink overlay. Symlinks make source ownership unclear and make it easy to edit the submodule accidentally.

## 8. Replace periodic autosave with debounced change-driven saving

Autosave currently checks every 15 seconds and also attempts to save during `pagehide`.

A better strategy is:

- Mark the project dirty when an edit occurs.
- Debounce a save for approximately one or two seconds.
- Flush immediately after important operations.
- Keep a slower safety interval if desired.
- Register lifecycle listeners only once.

This saves shortly after an edit without repeatedly checking when nothing changed. A `pagehide` save should not be the primary guarantee because browsers do not promise that asynchronous IndexedDB work will finish during shutdown.

## 9. Switch projects without reloading the application

Project switching currently updates `localStorage` and reloads the page. This resets the runtime, audio contexts, cached media, UI state, service initialization, and camera or microphone objects.

A `ProjectSession` abstraction could own:

- Current project ID
- Project metadata
- Stage data
- Dirty state
- Save queue

Switching projects would stop playback, save the old session, clear the stage, and load the new project without reloading the PWA.

This is a medium-sized refactor and should follow the repository and project-bundle separation.

## 10. Remove browser-dead platform branches gradually

Several owned and inherited modules still contain Android, iOS, and native-interface paths. They are harmless when their flags are false, but they increase bundle size and make browser behavior harder to follow.

Avoid copying every inherited file merely to delete branches. Instead:

- Remove platform checks from Magic Tune Jr-owned files.
- Configure the future build with a constant browser target.
- Let dead-code elimination remove unreachable native branches.
- Copy an upstream module locally only when Magic Tune Jr meaningfully diverges from it.

## 11. Expand storage integration testing

The current test covers pure asset-reference behavior but not complete IndexedDB transactions. Adding `fake-indexeddb` would allow automated coverage for:

- Version 1 to version 2 upgrades
- Preservation of existing projects
- Project creation, update, listing, and deletion
- Updating a missing project
- Media cleanup
- Export and import round trips
- Concurrent saves
- Import collisions

## Recommended implementation order

### Stage 1: correctness and bundle size

Status: implemented.

1. Export only project-referenced assets. ✓
2. Validate imports and handle collisions explicitly. ✓
3. Generate build-aware service-worker asset versions. ✓

### Stage 2: architecture

Status: implemented.

1. Introduce `Database`, `ProjectRepository`, `MediaStore`, and `ProjectBundle`. ✓
2. Remove the `BrowserIO` monkey patch. ✓
3. Split browser persistence and bundle capabilities out of `OS.js`; media capture remains isolated in `BrowserMedia.js`. ✓
4. Retain a thin legacy facade for inherited ScratchJr modules. ✓

### Stage 3: modernization

Status: implemented.

1. Adopt Promise-based service APIs. ✓
2. Migrate new binary media writes to Blob storage while reading legacy base64 values. ✓
3. Replace the inherited Webpack 4 build with an owned esbuild pipeline. The source overlay still uses the existing symlinks until the upstream-code ownership strategy is addressed separately. ✓
4. Add change-driven debounced autosave with a safety interval. ✓
5. Support project switching without a page reload. ✓

The project-scoped exporter should be implemented first. It addresses a concrete data-isolation issue while reducing exported file size and memory consumption.
