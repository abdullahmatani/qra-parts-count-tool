# Release notes

Versions follow the [roadmap](docs/ROADMAP.md). Requirement IDs refer to the
[functional design specification](docs/FDS.md).

## 1.0.0 — first production release

The complete workflow from an empty folder to the client's Excel workbook and annotated drawings,
ready for acceptance testing on a real study.

- **Try the sample project** on the start screen creates a small marked-up study (two PEFS sheets,
  two segments, a finished count and one open query) in a folder you choose.
- **Stamp mode** (`S`, ANN-09): each click logs a copy of the last item (type, actuation, size).
- **One writable tab per project** (PRJ-07): a second tab opens the project read-only, and can
  take over for editing when the first tab closes it. A read-only tab never writes to the folder.
- **Crash safety verified** (NFR-05): a renderer crash two seconds after the last edit loses
  nothing; a torn temporary file from a crash mid-save is ignored.
- **Scale verified** (NFR-04, NFR-06): 300 drawings, 150 segments and 50,000 items open in about
  2 s, an edit reaches the disk in 1.6 s, and the Excel export of 150 segments takes 8.5 s
  (see [docs/performance.md](docs/performance.md)).
- **Documentation**: [user guide](docs/user-guide.md) and
  [keyboard shortcut sheet](docs/keyboard-shortcuts.md).
- **Zipped static site**: `pnpm package:site` writes `release/qra-parts-count-tool-<version>.zip`
  with the app, a README and `serve.mjs`, a dependency-free local server that sends the same
  security headers as the hosted build.

Known limits: the DWG reader choice waits on the client's sample drawings and the GPL decision
(roadmap #12); the Excel mapping is checked against a client-style template until the client's own
template is available (#39); the acceptance test on a real QRA study (#44) is for the project team.

## 0.9.0 — annotated PDF export and pre-export checks

- Pre-export check (EXP-01) with **Show** and **Export anyway**; accepted warnings go to
  `export_log.json`.
- Annotated PDFs (EXP-03, NFR-07): original pages kept as vectors, with markers, labels, legend and
  stamp; DWG/DXF layouts drawn at paper size (EXP-04); combined PDF per segment and file name
  patterns (EXP-05). Built in a web worker.

## 0.8.0 — Excel template mapping and export

- Template mapper for the client's `.xlsx` with four layout modes; values written with ExcelJS,
  keeping formatting, formulas and other sheets; Notes, Item List and Unmapped sheets; reusable
  mapping files; CSV item list (EXP-02, EXP-06, NTE-03).

## 0.7.0 — segment notes and drawing links

- Signed, timestamped, formatted segment notes with marker references (NTE-01, NTE-02, NTE-04).
- Drawing links with Back navigation and saved views, never exported (LNK-01..04).

## 0.6.0 — parts count

- Item editor on placement, size parsing (inches and DN), bins, live count table with highlight,
  project summary, duplicate tags, equipment library editor and pipe lengths (CNT-01..09, CNT-12).

## 0.5.0 — isolatable segments

- Segments with colours, process data and status; ESDV markers bounding segments; the ESDV
  boundary rule; linked drawings (SEG-01..08).

## 0.4.0 — markup engine

- Circle and dashed-highlight markers on a canvas layer, selection, move and resize, undo and redo,
  copy and paste, labels and filters; 2,000 markers pan and zoom smoothly (ANN-01..08, NFR-03).

## 0.3.0 — DWG support

- DXF reader and a LibreDWG WebAssembly reader in workers, layouts as drawings, display lists and
  render caches (DRW-02, DRW-10).

## 0.2.0 — working directory, project file and PDF viewing

- Projects in a local folder with atomic autosave and snapshot backups; PDF import, page split and
  drawing register; PDF.js viewer with pan, zoom, fit, rotate and minimap (PRJ-01..06, DRW-01,
  DRW-03..05, NFR-02).

## 0.1.0 — foundation

- React, TypeScript and Vite app shell; offline service worker; project file schema; strict
  Content Security Policy with egress checks; Playwright and Vitest harnesses (NFR-01).
