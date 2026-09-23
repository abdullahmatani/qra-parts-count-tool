# QRA Parts Count Tool — Development Roadmap

Each task traces to requirement IDs in the Functional Design Specification.

Status values: **Done** (implemented and tested), **Partial** (implemented with a documented gap), **Planned**, **Blocked** (needs an external input, see note).

| No # | Version | Description | Task to be done for execution | Status |
| --- | --- | --- | --- | --- |
| 1 | 0.1.0 | Foundation: project scaffold and offline shell | Set up React + TypeScript + Vite repo, linting, unit test runner and CI build | Done — the "CI build" is the local `pnpm verify` gate; no hosted CI/CD by project decision |
| 2 | 0.1.0 | Foundation: project scaffold and offline shell | Add service worker (vite-plugin-pwa) precaching all assets; verify app reloads with network off (NFR-01) | Done — `e2e/offline.spec.ts` |
| 3 | 0.1.0 | Foundation: project scaffold and offline shell | Define project file Zod schemas v1 (with generated JSON Schema) and TypeScript types for all entities (section 5) | Done — `src/domain/schema`, `docs/schema/project.schema.v1.json` |
| 4 | 0.1.0 | Foundation: project scaffold and offline shell | Build app shell: header, three-pane layout, status bar, settings dialog | Done — `src/app` (built after #5, which it depends on) |
| 5 | 0.1.0 | Foundation: project scaffold and offline shell | Set up Tailwind CSS 4 and shadcn/ui, design tokens (segment palette, light/dark), bundled fonts and icons (section 9) | Done — `src/styles/index.css`, `src/components/ui`, `src/domain/palette.ts` |
| 6 | 0.1.0 | Foundation: project scaffold and offline shell | Set up Vitest, Playwright E2E harness with an offline test run, and CI bundle-size budget (section 9.1) | Planned |
| 7 | 0.1.0 | Foundation: project scaffold and offline shell | Configure strict Content Security Policy (connect-src 'self', no third-party origins) and verify with network inspection that no project data leaves the browser | Planned |
| 8 | 0.2.0 | Working directory, project file and PDF viewing | Implement create/open project via File System Access API and folder structure creation (PRJ-01..03) | Planned |
| 9 | 0.2.0 | Working directory, project file and PDF viewing | Implement autosave with temp-file-then-rename and 20 snapshot backups (PRJ-04, PRJ-05) | Planned |
| 10 | 0.2.0 | Working directory, project file and PDF viewing | Integrate PDF.js viewer with pan, zoom, fit, rotate and minimap (DRW-05) | Planned |
| 11 | 0.2.0 | Working directory, project file and PDF viewing | Import PDFs into drawings/, split multi-page PDFs, build drawing register with editable metadata (DRW-01, DRW-03, DRW-04) | Planned |
| 12 | 0.3.0 | DWG support | Technical spike: compare LibreDWG-WASM, ODA SDK and DXF parser on 10 sample PEFS/P&IDs for fidelity, speed and licence (risk R1) | Planned |
| 13 | 0.3.0 | DWG support | Implement chosen DWG-to-vector renderer with layout selection and render cache (DRW-02) | Planned |
| 14 | 0.3.0 | DWG support | Implement DXF import and PDF-plot import alongside native .dwg; native .dwg stays mandatory (DRW-02, DRW-10) | Planned |
| 15 | 0.3.0 | DWG support | Performance test with A1 drawings against NFR-02 | Planned |
| 16 | 0.4.0 | Markup engine | Build SVG overlay in drawing coordinates with circle and dashed-highlight tools (ANN-01, ANN-02) | Planned |
| 17 | 0.4.0 | Markup engine | Select, move, resize, copy/paste, delete, box multi-select (ANN-04) | Planned |
| 18 | 0.4.0 | Markup engine | Command-pattern undo/redo, 100+ steps (PRJ-09) | Planned |
| 19 | 0.4.0 | Markup engine | Marker labels, hover tooltips, visibility filters (ANN-05..07); load test with 2,000 markers (NFR-03) | Planned |
| 20 | 0.5.0 | Isolatable segments | ESDV marker type with tag and size (SEG-01) | Planned |
| 21 | 0.5.0 | Isolatable segments | Segment create/edit panel with label, description, colour, process data (SEG-02, SEG-03) | Planned |
| 22 | 0.5.0 | Isolatable segments | Many-to-many segment-drawing linking and linked-drawing navigation (SEG-04, SEG-05) | Planned |
| 23 | 0.5.0 | Isolatable segments | Active segment selection and colour-coded markers (SEG-06, ANN-03) | Planned |
| 24 | 0.5.0 | Isolatable segments | User-configurable ESDV boundary rule at project setup (upstream / downstream / both / neither) with per-ESDV override; no hard-coded default (SEG-08) | Planned |
| 25 | 0.6.0 | Parts count | User-defined equipment types and leak frequency dataset format per project, with a starter library only (CNT-02) | Planned |
| 26 | 0.6.0 | Parts count | Bin set editor: user creates bins for automated valves, manual valves, flanges, small-bore connections and any added type, with explicit edge rules (CNT-04) | Planned |
| 27 | 0.6.0 | Parts count | Item editor on marker placement: type, size parser (in, DN, fractions), actuation, tag, quantity (CNT-01, CNT-03) | Planned |
| 28 | 0.6.0 | Parts count | Automatic binning, incomplete-item flags, flange counting convention (CNT-05, CNT-09) | Planned |
| 29 | 0.6.0 | Parts count | Live segment count table and project summary with click-to-highlight (CNT-06, CNT-07) | Planned |
| 30 | 0.6.0 | Parts count | Cross-drawing duplicate tag check (CNT-08) | Planned |
| 31 | 0.6.0 | Parts count | Pipe length counting as a per-project user setting: manual length entry on dashed-highlight line runs, summed per segment and size bin (CNT-12) | Planned |
| 32 | 0.7.0 | Segment notes and drawing links | Segment notes editor with basic formatting (NTE-01) | Planned |
| 33 | 0.7.0 | Segment notes and drawing links | Drawing link hotspot tool with target drawing and saved view (LNK-01) | Planned |
| 34 | 0.7.0 | Segment notes and drawing links | Link navigation with Back history; link overlay show/hide (LNK-02, LNK-03) | Planned |
| 35 | 0.7.0 | Segment notes and drawing links | Ensure links are excluded from all export paths (LNK-04) | Planned |
| 36 | 0.8.0 | Excel template mapping and export | Template upload into templates/ and Template mapper UI (section 7) | Planned |
| 37 | 0.8.0 | Excel template mapping and export | Implement four layout modes: sheet per segment, row per segment, block per segment, flat item list | Planned |
| 38 | 0.8.0 | Excel template mapping and export | Write values with ExcelJS preserving formatting, formulas and other sheets; add Notes, Item List, Unmapped sheets (EXP-02, NTE-03) | Planned |
| 39 | 0.8.0 | Excel template mapping and export | Save and reuse mapping files; validate against the client's sample template once provided | Planned |
| 40 | 0.9.0 | Annotated PDF export and pre-export checks | Pre-export check dialog: unassigned markers, missing sizes, empty segments, duplicates (EXP-01) | Planned |
| 41 | 0.9.0 | Annotated PDF export and pre-export checks | Burn markers, labels, legend and stamp into vector PDF copies with pdf-lib (EXP-03, NFR-07) | Planned |
| 42 | 0.9.0 | Annotated PDF export and pre-export checks | Export DWG drawings as annotated PDFs at layout paper size (EXP-04) | Planned |
| 43 | 0.9.0 | Annotated PDF export and pre-export checks | Per-segment combined PDF, filename patterns, export_log.json (EXP-05) | Planned |
| 44 | 1.0.0 | First production release | End-to-end user acceptance test on a real QRA study (300 drawings / 150 segments target, NFR-04) | Planned |
| 45 | 1.0.0 | First production release | Crash-recovery and data-loss testing (NFR-05); Excel export timing (NFR-06) | Planned |
| 46 | 1.0.0 | First production release | User guide, keyboard shortcut sheet and sample project | Planned |
| 47 | 1.0.0 | First production release | Publish to public URL and package the same build as a zipped static site; release notes | Planned |
| 48 | 1.1.0 | Productivity features | Stamp mode and keyboard shortcuts for equipment types (ANN-08, ANN-09) | Planned |
| 49 | 1.1.0 | Productivity features | Bulk edit of items; split/merge/reorder segments; segment status (CNT-10, SEG-07, SEG-09) | Planned |
| 50 | 1.1.0 | Productivity features | Timestamped notes with author initials for checker review (NTE-02) | Planned |
| 51 | 1.1.0 | Productivity features | Import/export equipment library and bin sets as JSON (CNT-11) | Planned |
| 52 | 1.2.0 | Revisions, search and portability | Drawing revision replacement keeping markers, with review flags (DRW-07, LNK-05) | Planned |
| 53 | 1.2.0 | Revisions, search and portability | PDF text search for tags and line numbers (DRW-08); split view (DRW-06) | Planned |
| 54 | 1.2.0 | Revisions, search and portability | Project .zip export/import and read-only mode for Firefox/Safari (PRJ-08, risk R2) | Planned |
| 55 | 1.2.0 | Revisions, search and portability | Read-only lock when project is open in another tab (PRJ-07); CSV item export (EXP-06) | Planned |
| 56 | 1.3.0 | Navigation aids | Auto-suggest drawing links from off-page connector text (LNK-06) | Planned |
| 57 | 1.3.0 | Navigation aids | Note references to markers (NTE-04); DWG layer toggles (DRW-09) | Planned |
| 58 | 1.3.0 | Navigation aids | Arabic UI and RTL layout (NFR-08) | Planned |
| 59 | 2.0.0 | Assisted counting | Research and prototype offline symbol detection (valves, flanges, instruments) running in-browser | Planned |
| 60 | 2.0.0 | Assisted counting | Suggest candidate markers for user confirmation; never auto-count without review | Planned |
| 61 | 2.0.0 | Assisted counting | _(task not yet defined in the source roadmap)_ | Planned |
