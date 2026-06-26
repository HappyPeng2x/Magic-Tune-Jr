# Magic Tune Jr

A timeline-based clip creator for children aged 5 and up, built on top of [Scratch Jr](https://github.com/LLK/scratchjr).

Children drag motion, looks, and sound blocks from the familiar Scratch Jr palette onto a multi-track timeline. Pressing Play animates sprites in sequence — like a simple animation or music video editor designed for young creators.

![Magic Tune Jr screenshot](docs/screenshot.png)

## What it does

- **Timeline editor** — one horizontal track row per sprite; clips sit at a time position and have a duration
- **Drag from palette** — grab any Scratch Jr block and drop it onto a sprite's track row to create a clip
- **Transport controls** — ⏮ rewind, ▶ play / ⏸ pause, ⏹ stop; live time counter in mm:ss.t format
- **Playhead** — red vertical line scrubs through the timeline; click or drag the ruler to seek
- **Sprite execution** — clips fire the corresponding Scratch Jr primitive at the right moment, moving / resizing / speaking the sprite on stage
- **Video export** — record the stage to a WebM file (via `VideoExporter`)

## How it works

Magic Tune Jr sits alongside a standard Scratch Jr checkout and re-uses its engine and asset pipeline. Only the files that differ are kept in this repo; everything else is referenced via symlinks.

```
scratchjr/          ← upstream Scratch Jr checkout (sibling directory)
magictunejr/
  src/
    entry/app.js           ← webpack entry point
    editor/
      ScratchJr.js         ← app bootstrap (overrides Scratch Jr's)
      engine/
        TimelineRuntime.js ← replaces Scratch Jr's event-driven runtime
        TimelineDuration.js← clip duration table per block type
        Sprite.js          ← adds .timeline[] and addClip() to sprites
        Page.js            ← null-guards for missing scripts pane
      ui/
        TimelinePane.js    ← ruler, track rows, clip rectangles, playhead
        TimelinePalette.js ← drag-from-palette → create clip
        TransportControls.js
        VideoExporter.js
        UI.js              ← swaps Scratch Jr's scripts area for the timeline
        Palette.js         ← routes block drag to TimelinePalette
        Thumbs.js          ← stubs out ScriptsPane references
```

Symlinks in `src/editor/ui/`, `src/editor/engine/`, and `src/tablet/` point to the corresponding unmodified Scratch Jr source files. `webpack.config.js` sets `resolve.symlinks: false` so the entire import graph resolves through this repo's directory tree — overrides are picked up automatically without any module aliasing.

## Prerequisites

- Node.js 16+
- A checkout of [Scratch Jr](https://github.com/LLK/scratchjr) at `../scratchjr` (sibling of this repo)
- Scratch Jr's dependencies installed: `cd ../scratchjr && npm install`

## Development

```bash
# one-time build
npm run build

# rebuild on every file change
npm run watch

# serve (any static server works)
python3 -m http.server 8765
# then open http://localhost:8765
```

The build uses webpack 4 from Scratch Jr's `node_modules` (the project is incompatible with webpack 5).

## Relationship to Scratch Jr

Magic Tune Jr is an experimental fork / overlay. It does not modify the upstream Scratch Jr source. All Scratch Jr intellectual property (block graphics, sounds, SVG sprites, CSS) remains subject to its original licence.
