# QRA Parts Count Tool — user guide

This guide walks through a parts count from an empty folder to the exported workbook and annotated
drawings. It follows the workflow in FDS section 4. For keys, see the
[keyboard shortcut sheet](keyboard-shortcuts.md).

Everything happens in your browser. Drawings, counts, notes and exports are read from and written to
a folder on your computer and are never uploaded anywhere.

## 1. Before you start

- Use a current **Microsoft Edge** or **Google Chrome** on a desktop or laptop (screen at least
  1366 × 768). These browsers can read and write a local folder. In Firefox and Safari, which
  cannot, a project sent as a `.zip` opens read-only (section 11).
- Open the app once while online. After that it works with no network: the header shows
  **Offline ready** when everything is cached.
- **Language**: Settings › General › Language switches the interface between English and Arabic.
  Arabic lays the interface out right to left; drawings, the template preview and fields such as
  tags and file names stay left to right. Exported workbooks, CSV files and PDFs are always in
  English, the language of client templates. The Arabic text is a draft awaiting review.
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
- **Open a project .zip** unpacks a study sent as a single `.zip` into an empty folder and opens
  it there.
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
overwrite each other. When the other tab closes the project, **Reopen for editing** takes over.

## 3. Import drawings

Click **Import drawings** (or drop files on the drawing list):

- **PDF**: every page becomes a drawing. Scanned or plotted PEFS/P&IDs both work; nothing is
  rasterised.
- **DWG / DXF**: choose which layouts to import (model space and each paper-space layout). DWG files
  are read by a WebAssembly reader inside the browser.

The app reads the drawing number, title, sheet and revision from the title block where it can. Check
and correct them in **Project › Drawing register**: they appear in the count, the stamps and the
export file names.

**New revisions.** When a drawing is reissued, use **Replace with a new revision** on its row in the
drawing register and choose the new file (and page or layout). The drawing keeps its markers, items,
segments and drawing links; the old file stays in `drawings/`. If the new sheet has another size,
markers may no longer sit on their symbols, so the drawing is flagged: it shows a warning in the
drawing list and a banner on the sheet until you check the markers and choose **Mark as reviewed**.
The pre-export check also lists it.

## 4. Viewing drawings

Click a drawing in the list to open it in a tab.

- **Zoom** with the mouse wheel (at the pointer), `+` / `−`, or the controls at the bottom right.
  `0` fits the page. **Pan** with the middle mouse button, or hold `Space` and drag.
- The **minimap** shows where you are on the sheet; drag its rectangle to move.
- **Rotate** a sheet from the view controls if it was scanned sideways. Markers stay where you put
  them.
- **DWG/DXF colours**: Settings › General › DWG and DXF drawings switches between monochrome (like a
  plot) and CAD colours.
- **Find text** (`Ctrl+F`, or the search button in the toolbar): type a tag or line number. Case,
  spaces and dashes are ignored, so `hv 1001` finds `HV-1001`. Matches are highlighted; `Enter` and
  `Shift+Enter` step through them. **Search all drawings** lists every drawing with a match; click
  one to open it at its first match.
- **Split view**: with two or more drawings open, the split button at the end of the tab bar shows
  two drawings side by side, for example at a match line. The pane you work in is the active
  drawing; a tab opens in that pane.
- **Layers** (DWG and DXF only): the **Layers** button at the top of the drawing lists the layers
  that hold linework or text. Untick one to hide it, for example a title-block or grid layer that
  hides symbols; **Show all** brings every layer back. Hidden layers apply to this browser session
  only; exported PDFs always show every layer.

## 5. Segments and ESDVs

An isolatable segment is the inventory between ESD valves. It is the unit of the count.

1. Click **+ Segment** in the left pane and give it a label (for example `IS-01`), a colour, the
   fluid and the operating conditions. The new segment becomes the **active segment**: new markers
   go to it. The toolbar shows which segment is active. The segment panel on the right also holds
   what the A2.1 parts count sheet asks for: the object or equipment, the H&MB stream number, the
   phase (**Liquid** or **Gas**), the H2S mole fraction, and the molecular weight (gas) or density
   in kg/m³ (liquid).
2. Select the **ESDV** tool (`E`) and click each ESD valve on the drawing. In the inspector on the
   right, enter its tag and size, and choose the segment **upstream** and **downstream** of it. The
   boundary rule decides which of the two counts the valve itself; an ESDV can override the project
   rule if the study needs it. The bar under the toolbar sets how the ESDV is drawn: a red
   **Circle** round the valve, or a red **Double line** across the pipe. Drag the double line
   across the pipe (hold `Shift` for steps of 45°), or click a highlighter stroke to put one square
   across it. Its ends can be dragged later to turn or lengthen it.
3. Segments list the drawings they span. Markers link their drawing automatically; you can also link
   a drawing by hand, and open any linked drawing zoomed to the segment.
4. To show the extent of a segment, pick the **Highlighter** (`H`) and drag over its pipework and
   equipment, like a highlighter pen on a paper print. Strokes are painted in the active segment's
   colour (click a segment in the list to make it active); hold `Shift` for a straight stroke
   along a line. The bar under the toolbar shows which segment you are highlighting and sets the
   pen: **Fine**, **Medium** or **Broad**. Highlights are not counted. Select a stroke to move it,
   change its pen, move it to another segment or delete it; `Ctrl+Z` takes back the last stroke.
   Strokes appear on the annotated PDFs.
5. ESDVs are the boundaries of the highlighting. An ESDV placed on a highlighter stroke cuts it in
   two, so the paint stops at the ESDV on each side; select the piece on the far side and move it
   to its own segment. A stroke painted across an ESDV is cut the same way. The Highlighter is
   drawn to ESDVs like a magnet: near one, a red ring shows where the stroke will snap, and a
   stroke begun (or let go) there starts (or ends) at the ESDV. Hold `Alt` to paint without the
   magnet.
6. Equipment follows the highlighting. A circle placed on a segment's highlighting goes to that
   segment, whichever segment is active: on a highlighter stroke (its centre on the paint), on a
   dashed line run (its ring touching the line), or inside a dashed zone (a rectangle, or dashed
   points clicked round an area back to the first). Placed anywhere else, it goes to the active
   segment. Drag or nudge a circle onto another segment's highlighting and it moves to that
   segment with its item; moved off the highlighting, or along the same segment's highlighting, it
   keeps its segment. Where highlights overlap, strokes and line runs win over zones, then the
   nearest stroke or the smallest zone. Pasted and accepted **Find similar** circles follow the
   same rule. Turn it off under **Settings › General › Assign equipment to the highlighted
   segment**.

To change the segment of markers, select them and pick another segment in the inspector. To reshape
segments as the study firms up:

- **Split**: select the markers that belong to a new segment and choose **Split into a new
  segment** in the inspector. The new segment takes the next label, sits after the original in
  the list and copies its process data.
- **Merge**: in the segment panel, **Merge into…** moves the segment's markers, items, notes and
  linked drawings into another segment. An ESDV between the two is no longer a boundary.
- **Reorder**: the arrow buttons in the segment panel move the segment up or down the list (the
  Excel output follows this order). Rename a segment by editing its label.
- **Status**: set **Not started**, **In progress**, **Counted** or **Checked** in the segment panel;
  the list shows it next to each segment.

Deleting a segment asks whether to move its markers to another segment or delete them with their
items.

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

**Export library** saves the types, bins and dataset as a `.library.json` file; **Import library…**
reads one from another project. Importing adds new types and bin sets and updates the ones with the
same Excel key (or name); nothing in the project is removed, and existing items and template
mappings keep working.

## 7. Counting

1. Choose the **Circle** tool (`C`) and click each leak source. The item editor opens with the size
   field ready: type the size (`2`, `1-1/2`, `DN50`) and press Enter.
2. Set the **equipment type** from the list or with its key (`1` valve, `2` flange, …). The type,
   actuation and unit you last used carry over to the next circle, so a run of manual 2" valves is
   one click each. The **equipment bar** under the toolbar chooses them before you click: pick
   **Valve (automated)**, **Flange** or any other type (valves come once per actuation) and the
   Circle tool is ready to count that equipment. **Any type** places markers without a type.
   The same bar sets the **shape** new markers are drawn with: a **dot** (smaller, filled), a
   **circle**, a **square**, or a **free-form** outline you drag around an odd-shaped symbol. The
   shape is only how the marker looks; it counts the same. Change a placed marker's shape under
   **Shape** in the right pane (dot, circle or square; a free-form outline is always drawn).
3. Add the **tag** where the drawing shows one. Tags are checked across the whole project: a tag that
   appears twice is flagged as a possible double count at a match line. Accept the duplicate with a
   note if both are genuinely separate items.
4. For a run of identical items, switch to **Stamp** (`S`): each click logs a copy of the last item
   (type, actuation and size) without opening the editor.
5. Use the **Dashed highlight** tool (`D`) to outline an area or trace a line run (click points,
   `Enter` to finish). With pipe length counting on, a traced run can carry a pipe length item.
6. To find the rest of a symbol, select one counted circle (say a gate valve) and click **Find
   similar symbols** in the right pane. The drawing is searched for symbols that look like the
   one the circle rings, at any quarter turn; symbols that already have a marker are skipped.
   Candidates appear as dashed violet rings, and a bar at the top of the drawing steps through
   them: **Accept** turns the one in focus into a marker with the example's type, actuation and
   size (in the active segment), **Reject** drops it, and **Accept all** takes every one shown.
   The similarity setting (90 % down to 60 %) trades missed symbols against false ones. Nothing is
   counted until you accept it; check the sizes of accepted items, as line sizes vary. It works
   best on clean PDF and CAD drawings and on one symbol type at a time.

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
- With several markers selected, the inspector edits their items together (**bulk edit**): pick a
  type, actuation or size once for all of them. Fields that differ show **Mixed**; sizes apply to
  sized types only.
- `Delete` removes the selection. `Ctrl+Z` / `Ctrl+Y` undo and redo any change, including edits in
  panels and dialogs.
- `Esc` cancels a shape you are drawing and returns to the **Select** tool; press it again to clear
  the selection.

## 8. Notes and drawing links

- **Segment notes** (right pane): assumptions, open points and checker comments. Bold and bullets are
  supported. Notes are signed with the initials set in **Settings** and timestamped. A note can
  refer to the selected marker; clicking the reference jumps to it. Notes go to the Excel output.
- **Drawing links** (`L`): draw a hotspot over an off-page connector and choose the target drawing
  (optionally with a saved view). With the Select tool, clicking the hotspot follows it; **Back**
  (`Alt+←`) returns to where you were. Links are for navigation only and are never exported. Hide
  them with the link button in the toolbar.
- To delete a link, select it (a click with the Link tool; with the Select tool, a link that has no
  target yet is selected instead of followed) and press `Delete` or **Delete link**. A link without
  a target goes at once; one that leads to a drawing asks first. Either can be undone.
- **Suggest drawing links** (Project menu): the app reads the text of every drawing and offers a
  link wherever a drawing names another drawing in the register, such as an off-page connector
  `TO PEFS-1002`. Text that already has a link is skipped. Untick any you do not want, then
  **Add** them; they are one undo step. Check the hotspot size on dense drawings.

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

### The A2.1 parts count sheet

Choose the A2.1 workbook (`A2.1 - PartsCountSheet`) as the template and the app recognises it: the
whole mapping is made in one step. If the project already had a mapping, click **Use the A2.1
mapping** in the banner instead. Each segment gets its own copy of the sheet, named by the segment
ID (`IS-01`, `IS-02`, …), and only the yellow input cells are filled:

| Cells   | What goes in                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B4:B13  | Segment ID, description, object/equipment, PEFS numbers, stream, pressure, temperature, phase, H2S, MW/density                                          |
| B19:B21 | Small-bore instrument connections, ≤ ½", ½"–1", > 1"                                                                                                    |
| C22:D26 | Manual and actuated valves (ESDVs count as actuated), by size                                                                                           |
| E or F  | Flanges per flange face (E) or flanged joints (F), following the project's flange convention                                                            |
| G22:G26 | Pipe length (m), when pipe length counting is on                                                                                                        |
| E28:E41 | Equipment: compressors, fin fan coolers, heat exchangers, pressure vessels, pumps, pipeline (m), pig traps, Xmas trees, plate and frame heat exchangers |
| B72:B77 | Segment notes, one line per row (the rest is on the Notes sheet)                                                                                        |

Pressure is written in **bara** and temperature in **°C**, converted from the project's units
(barg is converted to bara). Everything else in the workbook, including the formulas, the leak
frequency data, the sheet protection and the links, stays exactly as it is, and Excel recalculates
the results when the file is opened. The starter library of a new project matches the sheet's
equipment rows and size bins. Older projects get the missing A2.1 types added when the mapping is
applied; finer bins (for example 3"–6" and 6"–11") are added together into the A2.1 row that
contains them.

In LibreOffice, set **Tools › Options › LibreOffice Calc › Formula › Recalculation on file load**
to **Always** so the results rows are recalculated.

## 10. Check and export

Click **Export**. The dialog starts with the **pre-export check**:

- markers not in a segment,
- items missing their type or size,
- segments with no counted items or no linked drawing,
- tags that appear more than once,
- counts with no cell in the mapped template,
- segment values the template needs in units they cannot be given in (for example a phase of
  "Two-phase" where the A2.1 sheet takes Liquid or Gas, or a pressure unit the app does not know).

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
- To archive or send the study, use **Project › Export project as .zip**: one file with the project,
  drawings, template and exports (caches and backups are left out). The recipient opens it with
  **Open a project .zip** on the start screen.
- In **Firefox or Safari**, which cannot write to folders, **Open a project .zip (read-only)** opens
  the study in the browser tab: drawings, markers, counts and notes can be checked and exports run.
  Nothing is saved, so download the exports with **Download exports (.zip)** in the Export dialog.

## Troubleshooting

| Symptom                                                | What to do                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| "This browser cannot write to local folders"           | Use a current Edge or Chrome, or open a project .zip read-only.                               |
| The project opens read-only                            | It is open in another tab or window. Close it there, then choose **Reopen for editing**.      |
| "The drawing file is missing from the drawings folder" | The file in `drawings/` was moved or renamed. Put it back, or re-import it.                   |
| A DWG will not import                                  | Import a DXF saved from the same drawing, or a PDF plot of it.                                |
| A PDF is reported as encrypted on export               | Ask for an unprotected copy of the drawing; password-protected PDFs cannot be annotated.      |
| Save shows an error                                    | The folder may be read-only or full. The app keeps retrying; your edits stay in the open tab. |
| Something went wrong after an edit                     | **Undo** (`Ctrl+Z`), or restore a snapshot from **Project › Backups**.                        |

## Licence

The QRA Parts Count Tool is free software under the GNU General Public License, version 3 or later.
**Settings › About** links to the source code, the licence and the licences of the components it
includes. The licence covers the program, not your work: drawings, counts and exported workbooks
and PDFs are yours.
