# Spike: native DWG rendering in the browser (roadmap #12, risk R1)

**Status:** provisional decision, pending the client's 10 sample PEFS/P&IDs.
**Date:** 2026-09-23
**Requirements:** DRW-02 (native .dwg, Must), DRW-10 (DXF and PDF plots as alternatives, Must),
DRW-09 (layer toggles, Could), NFR-01 (offline), NFR-02 (open an A1 drawing in < 3 s), FDS §2
(no data leaves the browser, strict CSP).

## Question

Which reader should the app use to show native AutoCAD `.dwg` drawings, offline, in the browser,
at a fidelity good enough to count parts on PEFS/P&IDs? The roadmap asks to compare:

1. **LibreDWG compiled to WebAssembly**
2. **ODA Drawings SDK** (Open Design Alliance)
3. **A DXF parser**, with DWG converted to DXF outside the app

## Candidates

|          | LibreDWG-WASM                                                                                                                                                                                 | ODA Drawings SDK (Web)                                        | DXF parser (in the app)                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Package  | [`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web) 0.7.14 (LibreDWG 0.13)                                                                                                 | Commercial SDK, WASM build for members                        | Written for this app (`src/features/cad/dxf`)                |
| Formats  | DWG R13–2018 (read). This build **cannot read DXF**.                                                                                                                                          | DWG/DXF all versions, read and write                          | ASCII DXF (R12–2018)                                         |
| Licence  | **GPL-3.0**                                                                                                                                                                                   | Commercial, annual membership; per-product terms              | Project licence (no third-party code)                        |
| Size     | 9.5 MB WASM + 0.3 MB JS                                                                                                                                                                       | Not measured (typically 10–30 MB)                             | ~30 kB JS                                                    |
| Offline  | Yes (precached)                                                                                                                                                                               | Yes (precached)                                               | Yes                                                          |
| CSP      | Needs `'unsafe-eval'` in its worker (Emscripten embind builds functions at run time)                                                                                                          | Unknown                                                       | No change                                                    |
| Fidelity | Lines, arcs, polylines, text, MTEXT, blocks with attributes, hatches, dimensions (via their blocks), layouts, viewports. **Not**: MULTILEADER, ACAD_TABLE, MLINE, IMAGE, TOLERANCE, 3D solids | Reference implementation; everything including proxy graphics | Same entity set as LibreDWG above (both feed the same model) |
| Hands-on | Yes                                                                                                                                                                                           | **No** — needs an ODA membership and licence agreement        | Yes                                                          |

All readers produce the app's **neutral CAD model** (`src/features/cad/model.ts`), and one display-list
builder and one canvas renderer draw every source. Swapping the DWG reader later therefore
touches only the reader worker.

## Method

- **Harness:** `pnpm spike:dwg <folder> [report.md]` (`scripts/dwg-spike/`) runs every reader
  on every `.dwg`/`.dxf` file in a folder, each in its own process, so a crash in a WASM reader is
  isolated and reported. It records whether the file opened, read time, display-list build time,
  primitives per space, and entity types the reader could not represent.
- **Samples used so far:** the public LibreDWG test drawings (R13 to 2018, a few hundred kB each)
  in `.cache/dwg-samples/` (not committed, as they are third-party files), plus the synthetic
  P&ID fixture `e2e/fixtures/PEFS-4001.dxf` and its DWG conversion.
- **Pending:** the client's 10 sample PEFS/P&IDs. Put them in a folder and run
  `pnpm spike:dwg path/to/samples docs/spikes/dwg-results-client.md`, then compare the rendered
  drawings side by side with PDF plots of the same sheets.

## Results (public samples)

`pnpm spike:dwg .cache/dwg-samples` on 2026-09-23 (Node.js 22, 4-core Xeon 2.8 GHz). _Read ms_
includes WebAssembly start-up for LibreDWG (a fresh instance per file). _Build ms_ is the
display-list build for all spaces. _Primitives_ counts paths, texts, fills and block references
over all spaces. The two `.dxf` rows for `libredwg` are expected failures: this build reads DWG
only.

Opened: libredwg 14/16, app-dxf 2/2.

| File             | Size    | Reader   | Opened                           | Read ms | Build ms | Spaces | Primitives | Unsupported entities                                                                                                                    |
| ---------------- | ------- | -------- | -------------------------------- | ------- | -------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2000_Line.dwg    | 170 kB  | libredwg | yes                              | 293     | 1        | 3      | 1          | —                                                                                                                                       |
| 2000_Text.dwg    | 175 kB  | libredwg | yes                              | 251     | 2        | 3      | 1          | —                                                                                                                                       |
| 2004_Spline.dwg  | 60 kB   | libredwg | yes                              | 275     | 2        | 3      | 1          | —                                                                                                                                       |
| 2007_Leader.dwg  | 321 kB  | libredwg | yes                              | 287     | 3        | 3      | 5          | MULTILEADER ×1, IMAGE ×5                                                                                                                |
| 2018_Line.dwg    | 27 kB   | libredwg | yes                              | 259     | 1        | 3      | 1          | —                                                                                                                                       |
| example_2000.dwg | 569 kB  | libredwg | yes                              | 368     | 32       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| example_2000.dxf | 1355 kB | libredwg | **no** — reader returned no data | —       | —        | —      | —          | —                                                                                                                                       |
| example_2000.dxf | 1355 kB | app-dxf  | yes                              | 41      | 41       | 3      | 103        | XLINE ×1, REGION ×2, RAY ×1, 3DFACE ×2, 3DSOLID ×1, POLYLINE (mesh) ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1, LIGHT ×1 |
| example_2004.dwg | 183 kB  | libredwg | yes                              | 366     | 32       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| example_2007.dwg | 445 kB  | libredwg | yes                              | 344     | 33       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| example_2010.dwg | 440 kB  | libredwg | yes                              | 336     | 27       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| example_2013.dwg | 143 kB  | libredwg | yes                              | 366     | 29       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| example_2018.dwg | 146 kB  | libredwg | yes                              | 326     | 28       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| example_2018.dxf | 826 kB  | libredwg | **no** — reader returned no data | —       | —        | —      | —          | —                                                                                                                                       |
| example_2018.dxf | 826 kB  | app-dxf  | yes                              | 31      | 34       | 3      | 103        | XLINE ×1, REGION ×2, RAY ×1, 3DFACE ×2, 3DSOLID ×1, POLYLINE (mesh) ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1, LIGHT ×1 |
| example_r13.dwg  | 508 kB  | libredwg | yes                              | 594     | 32       | 3      | 1397       | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MLINE ×1                                                          |
| example_r14.dwg  | 430 kB  | libredwg | yes                              | 417     | 45       | 3      | 96         | XLINE ×1, RAY ×1, 3DFACE ×2, 3DSOLID ×1, TOLERANCE ×1, ACAD_TABLE ×1, MULTILEADER ×1, MLINE ×1                                          |
| sample_2000.dwg  | 22 kB   | libredwg | yes                              | 236     | 2        | 3      | 6          | —                                                                                                                                       |

The same drawing read both ways agrees closely: `example_2018.dwg` through LibreDWG gives 64
paths and 16 texts in model space, and `example_2018.dxf` through the app's parser gives 68 and 17. The difference is one arc dimension, which the DXF parser reads and the LibreDWG
conversion does not.

## Findings

1. **LibreDWG opens every DWG version tested** (R13, R14, 2000, 2004, 2007, 2010, 2013, 2018)
   in 0.2–0.5 s each, including WASM start-up, in Node.js. The parsed model is rich enough for
   P&IDs: layers, blocks with attributes, text and MTEXT, dimensions, hatches, paper-space
   layouts and viewports.
2. **Paper-space viewports:** LibreDWG numbers viewports across the whole file, so the ID that
   marks a layout's own sheet viewport (ID 1 in AutoCAD) is not reliable. The converter treats
   the first viewport of each layout as the sheet. Without this, a layout with no model-space
   viewport showed the whole model, unlike AutoCAD.
3. **Robustness:** reusing one LibreDWG WASM instance for several files trapped once
   (`RuntimeError: null function or function signature mismatch`), taking the whole process down.
   Opening each file with a fresh instance in a dedicated worker avoids it. The app does exactly
   that, and restarts the worker after any crash or time-out.
4. **Unsupported entities that matter for P&IDs:** MULTILEADER (callouts) and ACAD_TABLE
   (tables in notes and title blocks) are not converted. Where a drawing relies on them, the
   user can import the PDF plot instead (DRW-10), or the DXF saved from AutoCAD with
   `EXPLODE`d tables.
5. **This LibreDWG-WASM build cannot read DXF**, so the app needs its own DXF reader anyway.
   The app's parser reads the same entity set and produces the same model.
6. **Content Security Policy:** the Emscripten/embind glue calls `new Function`, so the DWG
   worker needs `'unsafe-eval'`. It is granted only to worker scripts, through their own
   response header (see `scripts/csp.mjs`). The page policy is unchanged, and workers still
   have `connect-src 'self'`, so the no-data-egress rule holds.
7. **Size:** the 9.5 MB WASM is precached for offline use. It loads only when a DWG is opened,
   so it does not count towards the 1.5 MB initial-JavaScript budget.
8. **Performance:** converting a space to a display list takes 1–60 ms for the samples, and
   the result is cached gzipped in `cache/cad/<file hash>/`, so a DWG is parsed only once.
   The A1 performance test is in [`docs/performance.md`](../performance.md) (roadmap #15): a
   dense A1 DXF imports and opens in 1.3 s, and reopens from the cache in 0.2 s.
9. **ODA** would give the best fidelity (it is the reference DWG implementation) and avoids the
   GPL, but it requires a paid membership and a licence agreement. It could not be evaluated
   hands-on for this spike.

## Licence analysis (GPL-3.0)

LibreDWG and `@mlightcad/libredwg-web` are GPL-3.0. Distributing an app that includes them
(serving it from a public URL or shipping the zipped site counts as distribution) creates
obligations:

- Provide the licence text and the corresponding source of the GPL components. They are used
  unmodified, and their exact sources are public (LibreDWG 0.13.x, libredwg-web 0.7.14).
- If the GPL component and the app form a single combined work, the whole app must be offered
  under GPL-3.0. To keep the boundary clear, the app loads LibreDWG only in a separate web
  worker that exchanges plain data with the app, in the same way as the MIT-licensed viewer
  `@mlightcad/cad-simple-viewer` uses the same library. Whether this boundary is sufficient is
  a **legal decision for the product owner**, not a technical one.
- The build can exclude LibreDWG completely: `VITE_DWG_READER=none pnpm build` produces a build
  with no GPL code. Native `.dwg` import then reports that the reader is not included, and DXF
  and PDF plots still work.

## Decision (provisional)

1. **Native DWG: LibreDWG-WASM in an isolated worker**, behind the reader interface in
   `src/features/cad/workers/`. It meets DRW-02 today, offline, with no network access.
2. **DXF: the app's own parser**, always available whatever the DWG decision (DRW-10).
3. **PDF plots:** imported like any PDF and flagged as CAD plots (DRW-10). This is the fallback
   for drawings that use entities the readers cannot show.
4. **Revisit before v1.0**, once the client's 10 samples are available and the product owner
   has decided on the GPL question. If GPL distribution is not acceptable, either license the
   ODA SDK and implement it behind the same worker interface, or ship with
   `VITE_DWG_READER=none`.

## Follow-ups

- Run the harness on the client's 10 PEFS/P&IDs, and compare each rendered sheet with its PDF
  plot.
- Decide the GPL question (product owner / legal).
- Consider converting MULTILEADER and ACAD_TABLE from their proxy graphics or generated blocks.
- SHX fonts are drawn with a sans-serif font. This is fine for reading tags, but the text
  widths differ from AutoCAD's.
