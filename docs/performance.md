# Performance

How the app is measured against the performance requirements, and the latest results.

| Requirement | Target                                                                                      | Test                             |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| NFR-02      | Opens an A1 PDF drawing in under 3 s on a mid-range laptop (16 GB RAM, integrated graphics) | `e2e/perf.spec.ts` (roadmap #15) |
| NFR-03      | Pans and zooms smoothly with 2,000 markers on one drawing                                   | `e2e/perf.spec.ts` (roadmap #19) |

## Test drawings

`scripts/perf-fixtures.mjs` generates two dense A1 sheets into `.cache/perf/` (not committed):

- `PEFS-A1-heavy.pdf`: 2384 × 1684 pt, 240 process lines with 9,600 symbols (valves, flanges,
  instrument bubbles), a tag on every symbol and a line number on every line; 0.6 MB.
- `PEFS-A1-heavy.dxf`: the same content as DXF, with the symbols as block references; 1.4 MB.

A real PEFS is usually lighter than this; the test deliberately over-shoots.

## Running

```bash
pnpm build
pnpm test:e2e --project perf --no-deps   # the perf tests alone
pnpm test:e2e                            # everything; perf runs last, on its own
```

The `perf` Playwright project depends on the functional projects, so it starts only after them
and runs its tests one at a time. Timings are printed and attached to the HTML report
(`perf-pdf.json`, `perf-dxf.json`).

## What is measured

- **PDF, first open:** from the click on the drawing in the drawing list to the whole sheet on
  screen. Includes reading the file from the working directory, PDF.js start-up, parsing the
  page and rasterising the 2048 px preview.
- **PDF, sharp at 400 %:** from zooming to 400 % to the full-resolution render of the visible
  area.
- **PDF, reopen:** close the tab, open the drawing again. The preview now comes from
  `cache/previews/`.
- **DXF, import and first open:** from the import confirmation to the sheet on screen. Includes
  copying the file, parsing the DXF in a worker, building and caching the display list, and the
  first render.
- **DXF, reopen from cache:** display list from `cache/cad/`, preview from `cache/previews/`.
- **2,000 markers (NFR-03):** an A1 sheet with 2,000 markers (circles and dashed areas, a third
  unassigned so they carry the amber warning outline, each with a tagged item and a label).
  Twelve wheel steps in, twelve out, then a middle-button pan, while every animation frame's
  duration is recorded. The test asserts a 95th-percentile frame time under 50 ms (20 fps).

## Results

2026-09-23, production build (`vite preview`), headless Chromium 141, 4-core Xeon 2.8 GHz VM,
16 GB RAM, software rendering (no GPU):

| Measurement               | Time     | Target |
| ------------------------- | -------- | ------ |
| PDF first open            | 2,050 ms | 3 s    |
| PDF sharp at 400 %        | 910 ms   |        |
| PDF reopen (cached)       | 195 ms   | 3 s    |
| DXF import and first open | 1,260 ms |        |
| DXF reopen (cached)       | 210 ms   | 3 s    |

2,000 markers, frame times while zooming and panning (same machine):

| Marker rendering                                      | Mean frame | 95th percentile |
| ----------------------------------------------------- | ---------- | --------------- |
| No markers (baseline)                                 | 20 ms      | 33 ms           |
| SVG, one element per marker (first attempt, rejected) | 71 ms      | 367 ms          |
| Canvas, all markers redrawn every frame               | 38 ms      | 83 ms           |
| Canvas with a cached marker bitmap (shipped)          | 22 ms      | 33 ms           |

Frames are quantised to the 60 Hz display (16.7 ms, 33.4 ms, …), and software rendering makes
every number here pessimistic. The one slow frame (about 150–220 ms) is the cache being redrawn
once the zoom settles.

Where the PDF first-open time goes: about 0.5 s to read the file and open it with PDF.js, and
about 1.3 s for the first render of the page, most of which is PDF.js parsing the 9,600-symbol
content stream. Rasterising at 2048 px is only about 0.6 s of that, so a smaller first preview
would not help much.

## Design choices that keep drawings fast

- **Two raster layers.** A preview of the whole sheet (2048 px on the long side) is drawn with a
  CSS transform, so pan and zoom never wait for a render. The visible area is rendered sharp at
  the current zoom, 120 ms after the view settles.
- **Render caches in `cache/`** (risk R5): previews as PNG in `cache/previews/`, CAD display
  lists gzipped in `cache/cad/`. Both are keyed by the file hash and can be deleted at any time.
- **Background parsing.** When a preview comes from the cache, the page is parsed in the
  background so the first zoom-in is still quick.
- **Workers.** PDF.js, DXF and DWG parsing run in web workers; the main thread only draws.
- **Markers on a canvas, cached.** Markers are drawn on a canvas grouped by style (a few stroke
  calls for thousands of markers), not as SVG elements. While the whole sheet fits in a
  3072 px bitmap, markers are drawn into it once, and a pan or zoom only copies it into place;
  it is redrawn at the new scale once the view settles. Further in, only markers in view are
  drawn. Labels are drawn in screen space and skipped where they would overlap. A visually
  hidden list mirrors the markers for screen readers and tests.
- **Lazy loading.** PDF.js and the CAD pipeline are loaded only when a drawing of that type is
  opened; the 9.5 MB DWG reader only when a `.dwg` is imported.
