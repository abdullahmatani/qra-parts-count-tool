# Importing and managing drawings

Drawings are copied into the project's `drawings/` folder and listed in the drawing list and the
drawing register. PDF, DWG and DXF files are supported.

## Import drawings

Click **+** (Import drawings) at the top of the drawing list, or drop files anywhere on the
workspace:

- **PDF**: every page becomes a drawing. Scanned and plotted PEFS/P&IDs both work, and nothing is
  rasterised: the original vector linework is kept.
- **DWG / DXF**: a file can hold model space and several paper-space layouts. A dialog lists them;
  each one you tick becomes a drawing, shown at its layout's paper size. DWG files are read by a
  WebAssembly reader inside the browser.

A page or layout that is already a drawing is not imported twice. Importing a file again brings back
only the pages and layouts that are not in the project, for example one you deleted. In the layout
picker, layouts that are already drawings are ticked, greyed out and marked **Already in the
project**.

If a DWG will not import, import a DXF saved from the same drawing, or a PDF plot of it.

## Drawing names

Each drawing is named after the file it came from: `PEFS-1001.pdf` becomes **PEFS-1001**. When one
file holds several drawings, the page number or layout name is added (**PEFS-2000 / 2**,
**PEFS-4001 / Layout1**).

To read the drawing number and sheet from the title block instead, turn off **Settings › General ›
Name drawings after their files**; drawings already imported keep their names. The title and
revision are read from the title block where the app can find them.

The names appear in the count, the PDF stamps and the export file names, so check them in the
drawing register.

## The drawing list

The drawing list in the left pane shows every drawing with its number of markers. Type in the
filter box to find a drawing by number, title, file name, sheet or revision. Click a drawing to open
it in a tab.

**Rename or delete a drawing.** Hover a drawing in the list and click **⋯** (or right-click it):

- **Rename** edits its drawing number in place: `Enter` keeps the new name, `Esc` keeps the old one.
  `F2` renames the drawing selected in the list. The name changes wherever the drawing is shown, and
  in the stamps and export file names. The file in `drawings/` keeps its name.
- **Delete…** asks first and says what goes with the drawing: its markers and their count items,
  and the drawing links on it (links to it from other drawings lose their target). The drawing is
  taken off its segments, and its file is removed from `drawings/` unless another page or layout of
  the same file is still a drawing. `Ctrl+Z` brings the drawing, and its file, back.

## Organise drawings by plant unit

A large study has drawings from several units of the plant. The two buttons at the top of the
drawing list switch between **All files**, every drawing in one list, and **Organised by plant
unit**, the plant breakdown:

- the **plant** at the top: the project's facility (or the project name when no facility is set);
- its **units**, in name order (_Unit 20_ before _Unit 100_), each with its number of drawings;
- under each unit, its **drawings** by drawing number;
- **Unassigned**, the drawings not filed under a unit yet.

The list remembers the view you chose.

**Add a unit.** Click the folder **+** on the plant row (or **⋯ › Add unit**), type the unit's
name, for example _Unit 100 Inlet separation_, and press `Enter`. Two units cannot have the same
name.

**File drawings under a unit.** Drag a drawing onto the unit, or use **⋯ › Move to unit** on the
drawing and pick the unit; this menu works in both views. **New unit…** in the same menu adds a
unit and files the drawing under it. To take a drawing out of its unit, choose **Unassigned**, or
drag it onto the plant or onto **Unassigned**. The drawing register has a **Unit** column too.

**Import straight into a unit.** **⋯ › Import drawings here** on a unit imports drawings as usual
and files them under that unit.

**Rename or delete a unit.** Use the unit's **⋯** menu (or right-click it; `F2` renames). Deleting
a unit keeps its drawings: they move to **Unassigned**. **⋯ › Rename plant** on the plant row
changes the project's facility name.

Click the plant, a unit or **Unassigned** to fold or unfold it. While you type in the filter box,
everything is unfolded and only the matching drawings are shown; typing a unit's name shows all its
drawings. Every change can be undone, and the units are saved in the project file.

## The drawing register

**Project › Drawing register** lists every drawing as a table: drawing number, sheet, title, plant
unit, revision, file, sheet size, segments and markers. Metadata is pre-filled from each title
block where possible; click a cell to correct it, and pick a drawing's unit from its **Unit** cell.
Changes save automatically and can be undone. Each row has **Open**, **Delete** and **Replace with
a new revision**.

## New revisions

When a drawing is reissued, use **Replace with a new revision** on its row in the drawing register
and choose the new file (and page or layout). The drawing keeps its markers, items, segments and
drawing links; the old file stays in `drawings/`.

If the new sheet has another size, markers may no longer sit on their symbols, so the drawing is
**flagged for review**: it shows a warning in the drawing list and a banner on the sheet until you
have checked the markers and chosen **Mark as reviewed**. The pre-export check also lists it.
