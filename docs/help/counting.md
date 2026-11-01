# Counting parts

The parts count is the second stage of the study, **2 Parts count**. Each leak source on the
drawings is ringed with a marker that carries a **count item**: its equipment type, actuation, size,
tag and quantity.

## Start the count

When the segments are defined, click **2 Parts count** in the header. A check lists what may not be
finished:

- highlighting, zones, ESDVs or end flanges that are in no segment,
- segments with nothing marked and no drawing,
- segments with fewer than two ESDVs or end flanges.

**Show** takes you there; **Start counting** (or **Start counting anyway**) moves on. To change a
segment later, click **1 Segments** in the header; nothing is lost. The stage is saved with the
project.

While counting, the workspace shows only what counting needs:

- the toolbar holds **Select** (`V`) and **Stamp** (`S`), and **Line run** (`D`) when pipe lengths
  are counted; markers are placed with the **equipment bar** under it;
- the right pane shows the segment's **status**, **Counted by** and **Checked by**, then the **item
  editor**, the **count table** and the notes. Process data, ESDVs and linked drawings are not
  shown;
- the segment list shows how many items each segment has;
- ESDVs, end flanges, highlighting and dashed zones stay on the drawing, drawn faint so the
  equipment stands out, and are locked: clicks go through them, so they cannot be moved or deleted
  by accident.

## Count an item

1. Make the segment active (or rely on the highlighting: a marker placed on a segment's
   highlighting goes to that segment).
2. Pick a **shape** in the equipment bar (or press `C`) and click the leak source. The item editor
   opens with the size field ready: type the size (`2`, `2"`, `3/4`, `1-1/2` or `DN50`) and press
   `Enter`. The editor shows the size bin it falls in.
3. Set the **equipment type** from the list or with its key (`1` valve, `2` flange, …), and the
   **actuation** for valves.
4. Add the **tag** where the drawing shows one, the **quantity** if one marker stands for several
   identical items, and any **remarks**.

The type, actuation and unit you last used carry over to the next marker, so a run of manual 2"
valves is one click and one size each.

## The equipment bar

The **equipment bar** under the toolbar places the markers. Pick a **shape** to start: a **dot**
(smaller, filled), a **circle**, a **square**, or a **free-form** outline you drag around an
odd-shaped symbol. The shape is only how the marker looks; it counts the same. `C` picks the last
shape again and `Esc` goes back to **Select**. Change a placed marker's shape under **Shape** in the
right pane.

The same bar chooses, before you click:

- what the next markers count: pick **Valve (automated)**, **Flange** or any other type (valves come
  once per actuation) and the bar is ready to count that equipment. **Any type** places markers
  without a type. Types that do not fit in the bar are under **… more** at its end; the chosen type
  always stays in the bar;
- the **label** shown on new markers, for example `HV-1`: a trailing number counts up after each
  marker. Leave it empty to show `#1`, `#2`, ….

## Stamp

For a run of identical items, switch to **Stamp** (`S`) in the toolbar. Each click logs a copy of
the last item, the one you placed or edited last, without opening the item editor, so the drawing
keeps the focus:

- copied: the **equipment type**, the **actuation** and the **size** with its unit;
- not copied: the **tag** (stamped markers show `#1`, `#2`, … and the **Label** in the equipment bar
  does not count up), the **quantity** (1) and the **remarks**.

The markers are drawn with the shape chosen in the equipment bar. If there is nothing to repeat yet
(no item, or the last item has no type), a click places a marker the usual way and opens the
editor. Pick another type in the equipment bar, or **Select** (`Esc`), to leave Stamp.

## Find similar symbols

To find the rest of a symbol, select one counted marker (say a gate valve) and click **Find similar
symbols** in the right pane. The drawing is searched for symbols that look like the one the marker
rings, at any quarter turn; symbols that already have a marker are skipped.

Candidates appear as dashed violet rings, and a bar at the top of the drawing steps through them,
with how similar each one is and the **size** it will be counted at, read from the line number on
its pipe (see [Sizes from line numbers](#sizes-from-line-numbers)):

- **Accept** turns the candidate in focus into a marker with the example's type and actuation, at
  the size read from its line (in the segment of the highlighting under it, or the active segment);
- **Reject** drops it;
- **Accept all** takes every candidate shown, as one step, and says how many took a size from the
  line numbers and how many are pending a size.

The **similarity** setting (90 % down to 60 %) trades missed symbols against false ones. Nothing is
counted until you accept it, and suggestions are never saved or exported. It works best on clean
PDF and CAD drawings. If the marker is too small on the sheet to match, ring the symbol with a
larger circle and try again.

## Identify equipment

**Identify** in the toolbar does the same for every kind of equipment at once. It
searches the open drawing for symbols like the ones you have counted, of every type: each kind
(type and actuation) counted on the drawing, and kinds you have counted only on other drawings, from
up to three of them (drawings of the same file type first). So count one symbol of each kind on the
first sheet, and Identify finds them on the next. Symbols of one kind that look different (a gate
valve and a ball valve both counted as **Valve**) are each searched for.

Suggestions are reviewed in the same bar, which names the type each one would be counted as. Where
two kinds match the same symbol, the closer match is offered. Identify finds only symbols drawn at
the same scale as the examples, so examples on sheets of another size may find nothing.

## Sizes from line numbers

A P&ID names each line with a line number that starts with its size, such as `6"-P-1001-A1A`,
`1-1/2"-HC-2003-B1` or `DN150-P-1001`, and marks some small lines with a size alone (`3/4"`). Find
similar symbols, Identify and **Fill sizes** read these to size what they count:

1. Each line number is tied to the pipe it is written along: the nearest straight run of line beside
   it that runs the same way as the text.
2. From each symbol, the pipe is followed both ways along the one line: straight on over crossings
   and along the run of a tee, across the valves, flanges and ESDVs on it, and over small breaks in
   the line. It does not turn into a branch, climb out of a branch into the line it comes off, or
   go through a vessel, pump or other equipment.
3. The first line number met each way gives the size. A size written on its own close beside the
   symbol (a 2" valve on a 6" line) is taken instead.

The bar shows the size of the suggestion in focus; the line number it came from is outlined on the
drawing. When the size cannot be read, it is left **empty, pending for you to enter**, and the bar
says **Size pending**:

- no line number was found on the symbol's line (an unlabelled drain or vent, a scanned drawing with
  no text, a line number written on another drawing);
- the line numbers either side disagree, as beside a reducer (both are outlined, in amber).

An accepted item with no size has an amber outline and is counted in the status bar's warnings and
the pre-export check until you enter it, like any item without a size.

Only valves, flanges and pipe take the size of their line. Small-bore connections and instruments
take a size only from a size written beside them (their line is not theirs), and equipment that
needs no size (vessels, pumps) gets none.

**Fill sizes**, beside it in the toolbar, does this for items you counted by hand: every
counted item on the open drawing that has no size takes the size of its line, as one undo step.
Sizes you entered are never changed. The button shows how many items have no size; afterwards
**Show pending** selects those still without one.

## Tags and duplicates

Tags are checked across the whole project: a tag that appears on more than one marker is flagged as
a possible double count, often at a match line between two drawings. Review it in the duplicate
list: **Show** goes to the markers, and **Accept** records that both are genuinely separate items
(**Withdraw** takes the acceptance back). Otherwise delete one of them.

## Pipe lengths

When **Pipe length counting** is on in the project settings, the count stage adds the **Line run**
tool (`D`): click points along the pipe and double-click to finish, then enter the length in metres
in the item editor. Lengths are summed per segment and size bin.

## Warnings

Markers with a problem get an **amber outline**, and the status bar counts them:

- not in a segment,
- missing their type or size (or actuation),
- a size outside every bin of the type,
- a duplicate tag.

Hover a marker to see what is missing. Hover the count in the status bar for a breakdown, and click
it to go to each marker in turn. Only the problems of the stage are shown: while defining segments,
set-up markers that are in no segment; while counting, the equipment's.

## The count table

The **count table** on the right shows the active segment's totals by equipment type, actuation and
size bin, updating as you click. Switch between **This segment** and **All segments** for a project
summary. Click a count to highlight the markers behind it, so every total can be traced back to its
items; **Highlight incomplete items** does the same for items still missing something.

## Editing markers

- Select with a click, add with `Shift`+click, or drag a box. `Ctrl+A` selects all on the drawing.
- Drag to move, drag a handle to resize, and use the arrow keys to nudge (`Shift` for 10 px).
- `Ctrl+C` and `Ctrl+V` copy and paste markers with their items, to another drawing too.
- With several markers selected, the panel edits their items together (**bulk edit**): pick a
  type, actuation or size once for all of them. Fields that differ show **Mixed**; sizes apply to
  sized types only.
- `Delete` removes the selection. `Ctrl+Z` and `Ctrl+Y` undo and redo any change.
- `Esc` cancels a shape you are drawing and returns to the **Select** tool; press it again to clear
  the selection.

**Marker filters** in the toolbar hide segments or equipment types, or show only the markers that
are in no segment.
