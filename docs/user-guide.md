# QRA Parts Count Tool — user guide

This guide walks through a parts count from an empty folder to the exported workbook and annotated
drawings. It follows the workflow in FDS section 4. For keys, see the
[keyboard shortcut sheet](keyboard-shortcuts.md).

Everything happens in your browser. Drawings, counts, notes and exports are read from and written to
a folder on your computer and are never uploaded anywhere.

## 1. Before you start

- Use a current **Microsoft Edge** or **Google Chrome** on a desktop or laptop (screen at least
  1366 × 768). These browsers can read and write a local folder. Firefox and Safari cannot yet.
- Open the app once while online. After that it works with no network: the header shows
  **Offline ready** when everything is cached.
- Make an empty folder for each study, for example on a project share. This is the **working
  directory**: the project file, the drawings, the exports and automatic backups all live in it, so
  you can zip it, archive it or hand it to a checker.

```text
<working directory>/
├── project.qrapc.json   the project: segments, markers, items, notes, links, settings
├── drawings/            copies of the imported PDF, DWG and DXF files
├── templates/           the client's Excel template
├── exports/             one timestamped folder per export
├── cache/               rendering cache (safe to delete)
└── .backup/             automatic snapshots of the project file
```

## 2. Create or open a project

On the start screen:

- **New project** asks for the empty folder, then the project details: name, client, facility,
  study reference, the **ESDV boundary rule** (which segment counts an ESDV that sits on the
  boundary between two segments) and the **flange convention** (count a flanged joint once, or
  each flange face). These two rules are deliberate choices for each study, so there is no default.
- **Open project** asks for a folder that already holds `project.qrapc.json`.
- **Recent projects** reopens a folder you used before (the browser may ask you to confirm access).
- **Try the sample project** creates a small, finished study (two PEFS sheets, two segments, a
  count, notes and one open query) in an empty folder you choose. It is the quickest way to see
  every feature before starting real work.

New projects start with a generic equipment library (valves, flanges, small-bore connections,
pumps, compressors, vessels and more, with typical size bins). Adjust it to the client's leak
frequency dataset in **Project › Equipment library** before counting (section 6).

The project saves itself about a second after every change. The status bar shows **Saved**, and
snapshots are kept in `.backup/` (restore one from **Project › Backups**). If the browser or
computer crashes, at most the last two seconds of work are lost.

If the same project is open in another tab, the app opens it **read-only** so two tabs cannot
overwrite each other.

## 3. Import drawings

Click **Import drawings** (or drop files on the drawing list):

- **PDF**: every page becomes a drawing. Scanned or plotted PEFS/P&IDs both work; nothing is
  rasterised.
- **DWG / DXF**: choose which layouts to import (model space and each paper-space layout). DWG files
  are read by a WebAssembly reader inside the browser.

The app reads the drawing number, title, sheet and revision from the title block where it can. Check
and correct them in **Project › Drawing register**: they appear in the count, the stamps and the
export file names.

## 4. Viewing drawings

Click a drawing in the list to open it in a tab.

- **Zoom** with the mouse wheel (at the pointer), `+` / `−`, or the controls at the bottom right.
  `0` fits the page. **Pan** with the middle mouse button, or hold `Space` and drag.
- The **minimap** shows where you are on the sheet; drag its rectangle to move.
- **Rotate** a sheet from the view controls if it was scanned sideways. Markers stay where you put
  them.
- **DWG/DXF colours**: Settings › General › DWG and DXF drawings switches between monochrome (like a
  plot) and CAD colours.

## 5. Segments and ESDVs

An isolatable segment is the inventory between ESD valves. It is the unit of the count.

1. Click **+ Segment** in the left pane and give it a label (for example `IS-01`), a colour, the
   fluid and the operating conditions. The new segment becomes the **active segment**: new markers
   go to it. The toolbar shows which segment is active.
2. Select the **ESDV** tool (`E`) and click each ESD valve on the drawing. In the inspector on the
   right, enter its tag and size, and choose the segment **upstream** and **downstream** of it. The
   boundary rule decides which of the two counts the valve itself; an ESDV can override the project
   rule if the study needs it.
3. Segments list the drawings they span. Markers link their drawing automatically; you can also link
   a drawing by hand, and open any linked drawing zoomed to the segment.

To change the segment of markers, select them and pick another segment in the inspector. Deleting a
segment asks whether to move its markers to another segment or delete them with their items.

## 6. The equipment library

**Project › Equipment library** holds:

- **Equipment types**: name, category, whether manual/automated applies (valves), the bin set, the
  Excel key and the dataset category used by the client's leak frequency sheet, and an optional
  keyboard key (`1`–`9`) for quick typing. One type is used for ESDVs counted under the boundary rule.
- **Size bins**: sets of size ranges in inches, for example `1" < x ≤ 2"`. The editor warns about
  overlaps, gaps and empty bins, so every size falls in exactly one bin. DN sizes are converted to
  NPS.
- **Dataset**: the name of the leak frequency dataset the types and bins follow (for example
  IOGP 434-01). No dataset is built in.

## 7. Counting

1. Choose the **Circle** tool (`C`) and click each leak source. The item editor opens with the size
   field ready: type the size (`2`, `1-1/2`, `DN50`) and press Enter.
2. Set the **equipment type** from the list or with its key (`1` valve, `2` flange, …). The type,
   actuation and unit you last used carry over to the next circle, so a run of manual 2" valves is
   one click each.
3. Add the **tag** where the drawing shows one. Tags are checked across the whole project: a tag that
   appears twice is flagged as a possible double count at a match line. Accept the duplicate with a
   note if both are genuinely separate items.
4. For a run of identical items, switch to **Stamp** (`S`): each click logs a copy of the last item
   (type, actuation and size) without opening the editor.
5. Use the **Dashed highlight** tool (`D`) to outline an area or trace a line run (click points,
   `Enter` to finish). With pipe length counting on, a traced run can carry a pipe length item.

Markers with a problem (not in a segment, missing type or size, duplicate tag) get an amber outline,
and the status bar counts them; hover a marker to see what is missing. **Marker filters** in the
toolbar hide segments or equipment types, or show only unassigned markers.

The **count table** on the right shows the active segment's totals by equipment type, actuation and
size bin, updating as you click. Click a count to highlight the markers behind it (every total can be
traced back to its items).

Editing:

- Select with a click, add with `Shift`+click, or drag a box. `Ctrl+A` selects all on the drawing.
- Drag to move, drag a handle to resize, arrow keys to nudge.
- `Ctrl+C` / `Ctrl+V` copy and paste markers with their items (to another drawing too).
- `Delete` removes the selection. `Ctrl+Z` / `Ctrl+Y` undo and redo any change, including edits in
  panels and dialogs.

## 8. Notes and drawing links

- **Segment notes** (right pane): assumptions, open points and checker comments. Bold and bullets are
  supported. Notes are signed with the initials set in **Settings** and timestamped. A note can
  refer to the selected marker; clicking the reference jumps to it. Notes go to the Excel output.
- **Drawing links** (`L`): draw a hotspot over an off-page connector and choose the target drawing
  (optionally with a saved view). With the Select tool, clicking the hotspot follows it; **Back**
  (`Alt+←`) returns to where you were. Links are for navigation only and are never exported. Hide
  them with the link button in the toolbar.

## 9. Map the client's Excel template

**Project › Template mapper** (once per template):

1. Upload the client's `.xlsx` (macro-enabled `.xlsm` files are not supported; save an `.xlsx`
   copy). It is copied into `templates/` and never modified.
2. Choose the layout: **sheet per segment** (a master sheet copied for each segment), **row per
   segment**, **block per segment**, or **flat item list**.
3. Map the header fields (segment label, fluid, pressure, drawings, counted by, …) by clicking the
   cell in the preview or typing its reference.
4. On **Counts**, map each equipment type × actuation × size bin to a cell. **Fill** maps a whole
   block from its top-left cell.
5. Map the notes cell. Long notes also go to a **Notes** sheet.

Save the mapping as a file to reuse it for other projects with the same client template.

## 10. Check and export

Click **Export**. The dialog starts with the **pre-export check**:

- markers not in a segment,
- items missing their type or size,
- segments with no counted items or no linked drawing,
- tags that appear more than once,
- counts with no cell in the mapped template.

**Show** takes you to the markers or the segment concerned. You can fix them, or **Export anyway**:
the export log records what you accepted.

Choose the outputs:

- **Excel workbook**: the client's template filled per the mapping, plus **Notes**, **Item List** and
  **Unmapped** sheets (counts with no cell are listed there, so nothing is lost). Formatting, formulas
  and other sheets are kept; formulas recalculate when the file is opened in Excel.
- **CSV item list**: one row per counted item, for audit or pivot tables.
- **Annotated drawings (PDF)**: one PDF per drawing with the markers, labels, a legend and a stamp
  (project, drawing and revision, count revision, date). PDF drawings keep their original vector
  content; DWG/DXF drawings are drawn at their layout's paper size. Set the **file name pattern**
  here, for example `{project}_{drawingNo}_{rev}`.
- **Combined PDF per segment**: all drawings of a segment in one file, showing only that segment.

Each export goes to a new folder, `exports/<date>_<time>/`, with an `export_log.json` listing what
was exported, from which revision of the project, and which warnings were accepted.

## 11. Checking and handing over

- The checker opens the same folder (or a copy), reviews the drawings, and signs their notes with
  their own initials. Segment status (**Not started**, **In progress**, **Counted**, **Checked**) and
  **Counted by** / **Checked by** show where each segment stands.
- To archive or send the study, zip the working directory. `cache/` can be left out.

## Troubleshooting

| Symptom                                                | What to do                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| "This browser cannot write to local folders"           | Use a current Edge or Chrome.                                                                 |
| The project opens read-only                            | It is open in another tab or window. Close it there, then reload.                             |
| "The drawing file is missing from the drawings folder" | The file in `drawings/` was moved or renamed. Put it back, or re-import it.                   |
| A DWG will not import                                  | Import a DXF saved from the same drawing, or a PDF plot of it.                                |
| A PDF is reported as encrypted on export               | Ask for an unprotected copy of the drawing; password-protected PDFs cannot be annotated.      |
| Save shows an error                                    | The folder may be read-only or full. The app keeps retrying; your edits stay in the open tab. |
| Something went wrong after an edit                     | **Undo** (`Ctrl+Z`), or restore a snapshot from **Project › Backups**.                        |
