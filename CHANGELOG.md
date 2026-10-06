# Release notes

Versions follow the [roadmap](docs/ROADMAP.md). Requirement IDs refer to the
[functional design specification](docs/FDS.md).

## Unreleased

- **PDFs import in browsers a few releases behind**: importing a PDF failed with "could not be
  read (Promise.withResolvers is not a function)" in Chrome or Edge before version 119, which
  managed corporate installs can still run. PDF.js calls three recent JavaScript APIs that its
  legacy build does not polyfill (`Promise.withResolvers`, reading a stream with `for await`, and
  `ArrayBuffer.transferToFixedLength`); the app now adds them on the page and in the PDF.js worker
  when the browser lacks them, so PDFs import, show their title-block text and render again.

- **Guided tour**: **Take the guided tour** on the start screen (or **Guided tour** in the app menu
  on the logo) walks through one complete parts count, step by step, on a practice project: two
  PEFS sheets of an inlet separator, already imported. In 25 steps the user opens and searches a
  drawing, creates the segment IS-01, marks its ESDVs and an end flange, adds the drawing links,
  highlights the segment with auto trace and a dashed zone, follows a link, starts the count,
  counts valves and flanges with the equipment bar, Circle and Stamp, lets **Find similar
  symbols** find the rest, reads the count table, adds a note, marks the segment as counted and
  exports. A card over the corner of the drawing says what to do; an outline shows which control
  to use and dashed rings show where on the sheet (**Show me** zooms there). Each step ticks
  itself off when it is done, and **Learn more** opens the matching documentation. The tour is
  optional: **Skip**, **Back**, fold or drag the card, or **End tour** at any time and resume it
  from the app menu. The practice project lives in the browser tab only (the header shows
  **Practice project**), so it needs no folder, works in any browser and leaves nothing behind;
  its exports are offered as a download.

- **Built-in documentation, searchable**: the user guide is now a set of short articles
  (`docs/help/`), from getting started to troubleshooting, a FAQ and a glossary, and the same
  articles are built into the app. Press `F1`, click **?** in the header, or choose
  **Documentation** in the app menu or on the start screen. The search box searches every
  article at once: each result is the section that answers, with the matching words marked;
  words are found by their start (`trac` finds "trace"), and a misspelt word still finds its
  match (`hilighter`). The arrow keys and `Enter` pick a result, `Esc` clears the search. Links
  between articles stay in the viewer, and the documentation works offline like the rest of the
  app. `docs/user-guide.md` lists the articles; the keyboard shortcut sheet moved to
  `docs/help/keyboard-shortcuts.md`.

- **Sample sheet: the drain goes to the closed drain**: the separator's drain line on the sample
  PEFS now runs on to a **TO CLOSED DRAIN** end, with the drain valve's tag beside it, so the
  sheet shows where an end flange goes.

- **Drawing tabs no longer cut off**: the tab bar is taller, and when the open drawings no longer
  fit, its scrollbar is no longer drawn over the tabs (which hid the top of their names). The tabs
  scroll sideways with the mouse wheel, the active tab is kept in view, long names show in full on
  hover, and the split-view button stays at the end of the bar.

- **App menu on the logo**: clicking the logo at the top left opens a menu to go **Back to start
  screen** (the screen the app starts on), or straight to a **New project…** or **Open project…**.
  Each closes the open project first.

- **Drawings are named after their files**: an imported drawing takes the name of its file
  (`PEFS-1001.pdf` becomes **PEFS-1001**), with the page number or layout name added when one file
  holds several drawings, instead of a drawing number and sheet guessed from the title block, which
  could differ from file to file. **Settings › General › Name drawings after their files** (on by
  default) switches back to reading them from the title block. The title and revision are still
  read from the title block, and drawings already imported keep their names.

- **Several DWG files import at once**: importing more than one DWG imported only the first; the
  others were copied into `drawings/` but never became drawings ("The CAD document is no longer
  open"). Closing the first file stopped the DWG reader that still held the rest. The reader now
  stays up until its last file is closed, and a file is only copied into `drawings/` once its
  layouts have been read.

- **Deleted drawings can be imported again**: deleting a drawing takes its file out of `drawings/`
  (with its render cache) when no other drawing uses it; `Ctrl+Z` puts both back. Importing a file
  again brings back the pages and layouts that are not drawings, instead of refusing the whole file
  as "already in the project" because one of its other pages was. In the layout picker, layouts
  that are already drawings are ticked, greyed out and marked **Already in the project**.

- **Warnings for the stage**: the status bar and the amber outlines show only the problems of the
  stage. Defining segments: highlights, zones, ESDVs and end flanges that are in no segment
  ("2 set-up markers not in a segment"). Counting: equipment not in a segment, items missing their
  type or size, and duplicate tags. Hovering the count shows the breakdown by kind, and a click goes
  to each marker with a warning in turn (it was not clickable before).

- **No more toasts from the offline cache over the panes**: when the app finishes caching for
  offline use, the **Offline ready** indicator in the header (and on the start screen) lights up
  for a moment and is announced to screen readers, instead of a toast over the right pane that
  stayed while the pointer was on it. A new version of the app shows as an **Update** button
  beside the indicator, instead of a toast that never went away. Offline readiness is also no
  longer forgotten when a project is opened or closed.

- **Equipment bar fits the window**: the equipment types that do not fit in the bar go in a
  **… more** menu at its end (with their keyboard keys) instead of running off the edge, and the
  chosen type always stays in the bar, shortened if the window is narrow.

- **Segment set-up drawn faint while counting**: in the Parts count stage, highlights, dashed
  zones, ESDVs and end flanges (and their labels) are drawn at 40 % of their usual strength,
  under the equipment, so the circles being counted stand out. Exported PDFs are unchanged.
- **Process data folds away**: in the segment panel, **Process data** is a section that opens and
  closes. It starts open for a segment with nothing entered and folded to one line (fluid, phase,
  pressure, temperature, equipment) once anything is, so the ESDVs, linked drawings and notes
  sit higher in the pane.

- **Two stages: Segments, then Parts count.** The header shows the study's stage, **1 Segments**
  then **2 Parts count**, and the workspace shows only what the stage needs. Defining segments:
  the Highlighter, Dashed highlight, ESDV, End flange and Drawing link tools, and the segment's
  set-up in the right pane, with the selected ESDV, end flange or link above it. Counting: the
  Select, Circle and Stamp tools (and Line run when pipe lengths are counted) with the equipment
  bar; the right pane shows the segment's status and who counted and checked it, the item editor
  and the count table, and no process data, ESDVs or linked drawings; the segment list shows each
  segment's item count and no **+ Segment**. While counting, ESDVs, end flanges, highlights and
  dashed zones are locked: clicks go through them. Starting the count lists what may be unfinished
  in the segments (set-up in no segment, segments with nothing marked or fewer than two ESDVs or
  end flanges), with **Show** buttons; going back to Segments is one click. The stage is saved in
  the project file as `stage` (`segments` or `count`); a project from an older build opens at
  Segments, and an older build ignores the field. The sample project opens at the parts count.

- **Stamp moved to the top left** on annotated PDFs: the project, drawing, segment, count revision
  and export date are now in one box with the legend, above it, in the top-left corner, instead of
  a separate stamp in the top-right corner where it covered off-page connectors, notes and title
  blocks.
- **All segments in one PDF**: a new Export option writes `<project>_all_segments.pdf`, every
  segment's drawings in one file, segment by segment, each page showing only its segment's markers
  (as in the per-segment PDFs). The file opens with a bookmark for each segment. `export_log.json`
  counts it under `pdf.allSegments`. PDFs are now written a page at a time in the export worker, so
  a long PDF never holds all of its drawings in memory, and the progress counts pages. This also
  fixes a segment PDF whose drawings come from more than six PDF files failing to export.

- **End flanges** (`F`): mark where an isolatable segment ends without an ESDV, such as a flanged
  tie-in to the closed drain or flare header. The bar under the toolbar chooses where the pipe
  goes (**Closed drain**, **Flare** or **Other end point**); drag a bar across the pipe (`Shift`
  for 45° steps) or click on the pipe to put one square across it. An end flange belongs to the
  active segment, is drawn as a solid bar in its colour, carries a tag, and is a segment boundary
  like an ESDV: it cuts the highlighter strokes it crosses and the highlighter's magnet snaps to
  it. It is not counted (circle the flange to count it). Annotated PDFs draw it with its own
  legend entry. Stored as `endFlange` markers with `doubleLine` geometry (the bar's centre line
  and thickness) and an `endFlange` object (`tag`, `destination`); older builds cannot open a
  project that has one.
- **Auto trace** (`T`, or **Auto trace** in the highlighter, ESDV and end flange bars): takes the
  highlighter and highlights the active segment's pipework out to its ESDVs and end flanges, and
  up to the drawing links of off-page connectors, as one undo step. It follows the drawn lines
  round bends and curves, takes every branch at a tee and runs straight over lines that cross
  without being joined, on PDF, DWG and DXF drawings. The side of each ESDV and end flange that
  is the segment's is worked out from the segments set on the ESDVs; pipe it cannot tell is shown
  dashed, to be clicked. While auto trace is on, a click on any pipe traces that pipe in the
  active segment. The message says which boundaries the trace ran into and on which drawings the
  pipe carries on, with a button to open the first of them. The trace runs in a web worker on the
  sheet rendered once, so tracing again on the same drawing is quick. It is available once the
  drawing has an ESDV, an end flange or a drawing link.
- **Double lines and end flanges placed with a click** sit square across the drawn line under the
  pointer, not only across a highlighter stroke.
- **Highlighter follows the lines**: dragged roughly along a pipe, a highlighter stroke is drawn to
  the drawing's own line and follows it round bends, curves and corners, on PDF, DWG and DXF
  drawings alike. While dragging, the traced path shows as a dashed line with a ring where it
  holds on to the line; away from lines the stroke follows the pointer. **Follow lines** in the
  highlighter bar turns it off; `Alt` paints freely and `Shift` still draws a straight stroke.
- **Rename and delete drawings** from the drawing list: hover a drawing and click **⋯** (or
  right-click it). **Rename** edits the drawing number in place (`F2` too); **Delete…** asks for
  confirmation, saying how many markers and count items go with it, and can be undone. The
  drawing register's remove button is now **Delete** and uses the same confirmation.
- **English only**: the Arabic interface, the **Language** setting and the right-to-left layout
  are removed. The interface is English, as exported files always were.
- **Equipment follows the highlighting**: a circle placed on a segment's highlighter stroke, on a
  dashed line run or inside a dashed zone goes to that segment instead of the active one, and a
  circle dragged or nudged onto another segment's highlighting moves to that segment with its
  item. Pasted and accepted Find similar circles follow the same rule. It is on by default and
  can be turned off under **Settings › General › Assign equipment to the highlighted segment**
  (a browser preference, not stored in the project).
- **ESDV as a double line**: while the ESDV tool (`E`) is in use, the bar under the toolbar
  chooses how the next ESDV is drawn: a red **Circle** round the valve (as before) or a red
  **Double line** across the pipe. Drag the double line across the pipe (`Shift` for 45° steps),
  or click a highlighter stroke to put one square across it; drag its ends to turn or lengthen
  it. Double lines are drawn on the annotated PDFs, with their own legend entry, and are stored
  as `doubleLine` ESDV markers with `doubleLine` geometry (two points and the gap between the
  lines). Older builds cannot open a project that has one.
- **ESDVs cut the highlighter**: an ESDV placed on a highlighter stroke cuts it into a piece on
  each side, clear of the ESDV, in the same undo step, so the far side can be moved to its own
  segment. A stroke painted across an ESDV is cut the same way.
- **Highlighter magnet**: near an ESDV, the Highlighter shows a red ring where the stroke will
  snap; a stroke begun or let go there starts or ends at the ESDV. Hold `Alt` to paint freely.
- **Highlighter** (`H`): drag over a segment's pipework and equipment to paint it in the active
  segment's colour, like a highlighter pen on a print; `Shift` draws a straight stroke. While the
  tool is in use, the bar under the toolbar shows the segment being highlighted and the pen
  (**Fine**, **Medium**, **Broad**, sized to the sheet). Strokes are not counted; they can be
  selected, moved, repainted with another pen, reassigned and deleted, and they are drawn on the
  annotated PDFs. They are stored as `highlighter` markers with `stroke` geometry.
- **Equipment bar** under the markup toolbar: choose what the next markers count as (**Valve
  (automated)**, **Valve (manual)**, **Flange**, any library type, or **Any type**) and the Circle
  tool is ready to place it. Pipe stays on dashed line runs.
- **Marker shapes**: equipment markers can be drawn as a **dot**, **circle**, **square** or a
  **free-form** outline dragged around the symbol, chosen in the equipment bar and changed later in
  the right pane. The shape is presentation only and is exported to the annotated PDFs; the
  project file keeps it in `marker.style.symbol` (older files read as circles). Find similar
  symbols gives accepted matches the example's shape.
- **Esc** cancels a shape being drawn and returns to the Select tool; pressed again it clears the
  selection (and the selected link).
- **Deleting drawing links**: with the Select tool, a link without a target is selected instead of
  followed, so it can be deleted with `Delete`. Deleting a link that leads to a drawing asks for
  confirmation first.
- The active tool is highlighted in the toolbar again (the tooltip wrapper had hidden it).

## 2.1.0 — A2.1 parts count sheet, free software

- **A2.1 parts count sheet** (section 7, roadmap #39): choose the A2.1 workbook in the template
  mapper and it is mapped in one step. The export has one copy of the sheet per segment, named by
  the segment ID, with only the yellow input cells filled: segment data (pressure in bara,
  temperature in °C, phase Liquid or Gas), small-bore connections, manual and actuated valves,
  flanges or flanged joints (by the project's flange convention), pipe lengths, equipment rows and
  six note lines.
- **Templates are left untouched**: exports are now written at the XML level. Formulas, leak
  frequency data, sheet protection and protected ranges, data validation, external links, named
  ranges and custom XML all stay as they were, and Excel recalculates on opening.
- **Starter library** matches the A2.1 sheet: its size bins (≤ 1", 1"–2", 2"–3", 3"–11", > 11";
  small bore ≤ ½", ½"–1", > 1") and its 14 equipment rows. Existing projects keep their library;
  applying the A2.1 mapping adds what is missing, and finer bins add up into the A2.1 row that
  contains them.
- **Segment data**: object/equipment, stream number, H2S mole fraction and molecular weight or
  density. A new pre-export check lists values the template cannot take (for example a
  two-phase segment for a Liquid/Gas cell).
- **Notes over several cells**: a mapping can split notes into lines, one per cell.
- **Licence**: the app is free software under **GPL-3.0-or-later**, as native DWG reading uses GNU
  LibreDWG. Builds include `LICENSE.txt` and `THIRD_PARTY_LICENSES.txt`, the start screen and
  Settings › About link to the source, and the zipped site adds `SOURCE.md` and a source archive.
- Arabic: the new strings are translated (draft, still to be reviewed).
- **Live site on Cloudflare Workers** (roadmap #47): `wrangler.jsonc` publishes the build as
  static assets with the same security headers. Once the repository is connected in the
  Cloudflare dashboard, every push to `main` is tested, built and deployed. `pnpm size` also
  checks the Workers asset limits, and `E2E_SERVER=cloudflare pnpm test:e2e` runs the
  end-to-end tests on the Workers runtime.

## 2.0.0 — assisted counting

- **Find similar symbols** (roadmap #59, #60): select a counted circle and the app searches the
  drawing for symbols that look like the one it rings (PDF and DWG/DXF, any quarter turn,
  entirely in the browser). Candidates are shown as dashed rings for review: accept one, reject
  one, or accept all shown at the chosen similarity. Nothing is counted until accepted; accepted
  suggestions become ordinary markers with the example's type, actuation and size.
- Research note on offline symbol detection: `docs/spikes/symbol-detection.md`.
- Arabic interface: size bins (`6" < x ≤ 11"`), marker coordinates and the names in the
  pre-export check now read left to right instead of being reordered and mirrored.

## 1.3.0 — navigation aids

- **Suggested drawing links** (LNK-06): **Project › Suggest drawing links…** reads the text of
  every drawing, finds the drawing numbers of other drawings in the register (such as off-page
  connectors) and lists them for review. The chosen links are added as one undo step.
- **Layer toggles** (DRW-09): a **Layers** menu on DWG and DXF drawings hides and shows layers for
  the session. Exports always show every layer. DWG/DXF caches are rebuilt once to record layers.
- **Arabic interface** (NFR-08): Settings › General › Language. The interface is mirrored right to
  left; drawings, the template preview and technical fields stay left to right. Exported files are
  always in English. The Arabic text is a draft that needs review by a native speaker.

## 1.2.0 — revisions, search and portability

- **Revision replacement** (DRW-07, LNK-05): replace a drawing's file with its next revision from
  the drawing register. Markers, items, segments and links stay; a changed sheet size flags the
  drawing for review (list icon, banner, pre-export check) until marked as reviewed.
- **Text search** (DRW-08): `Ctrl+F` finds tag and line numbers on the drawing (ignoring case,
  spaces and dashes, and across split text runs), highlights and steps through the matches, and
  searches all drawings. Works on PDF and DWG/DXF drawings.
- **Split view** (DRW-06): two drawings side by side; the pane in use is the active drawing.
- **Project .zip** (PRJ-08): export the project as one `.zip`, open one into an empty folder, and
  in Firefox and Safari open one read-only in the tab and download the exports as a `.zip`.
- A read-only tab no longer writes an opening snapshot to `.backup/`, and cannot run exports into
  a folder another tab is editing.

## 1.1.0 — productivity features

- **Bulk edit** (CNT-10): with several markers selected, set the type, actuation or size of all
  their items at once, as one undo step. Fields that differ show "Mixed".
- **Split, merge and reorder segments** (SEG-07): split selected markers into a new segment with
  the same process data; merge a segment into another (markers, items, notes and drawings move,
  the ESDV between them stops being a boundary); move segments up and down the list.
- **Equipment library files** (CNT-11): export the library as `.library.json` and import one from
  another project. Importing merges by Excel key or name and keeps the ids that items and template
  mappings use.

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
