# Highlighting and auto trace

Highlighting shows the extent of each segment on the drawings, like a highlighter pen on a paper
print. It is not counted, but it decides which segment new equipment goes to, and it is drawn on
the exported PDFs.

## The Highlighter

Pick the **Highlighter** (`H`) and drag over the segment's pipework and equipment. Strokes are
painted in the active segment's colour (click a segment in the list to make it active).

- The bar under the toolbar shows which segment you are highlighting and sets the pen: **Fine**,
  **Medium** or **Broad**.
- Hold `Shift` for a straight stroke along a line.
- Select a stroke to move it, change its pen, move it to another segment or delete it. `Ctrl+Z`
  takes back the last stroke.

### Follow lines

The Highlighter follows the drawn lines. Drag roughly along a pipe: the stroke is drawn to the
nearest line on the drawing and follows it round bends, curves and corners, even where your hand
cuts across. While you drag, the path it has found shows as a **dashed line**, with a ring where it
holds on to the line; let go and it becomes the stroke. Away from any line, the stroke follows the
pointer.

It works on PDF, DWG and DXF drawings alike, on the lines you see, so zoom in where lines run close
together. Turn it off with **Follow lines** in the bar, or hold `Alt` to paint freely. A `Shift`
stroke is always straight.

### ESDVs and end flanges stop the paint

ESDVs and end flanges are the boundaries of the highlighting. One placed on a highlighter stroke
cuts it in two, so the paint stops at it on each side; select the piece on the far side and move it
to its own segment. A stroke painted across one is cut the same way.

The Highlighter is drawn to them like a magnet: near one, a red ring shows where the stroke will
snap, and a stroke begun (or let go) there starts (or ends) at it. Hold `Alt` to paint without the
magnet.

## Auto trace

**Auto trace** highlights a segment for you:

1. Make the segment active.
2. Place its ESDVs, with their upstream and downstream segments, and its end flanges. Drawing links
   on off-page connectors also stop the trace.
3. Press `T`, or click **Auto trace** in the Highlighter, ESDV or End flange bar.

The Highlighter paints the segment's pipework out to its ESDVs and end flanges, round bends and
curves and into every branch, and up to the drawing links of off-page connectors, where the pipe
carries on on another drawing. Lines that cross the pipe without joining it (four arms in two
straight lines) are not followed.

It tells which side of each ESDV is the segment's from the segments set on the ESDVs around it.
Pipe it cannot tell apart (an ESDV whose other side is unknown, say) is shown **dashed**: click it
to add it.

While auto trace is on (the **Auto trace** button stays pressed), a click on any pipe traces that
pipe in the active segment; `Esc`, `T` or another tool ends it. The message says what the trace ran
into; when the pipe carries on on another drawing, **Open** takes you there.

The whole trace is one undo step, and pipe already highlighted is not painted again. It works on
the lines as drawn: a pipe that touches text or another symbol is followed into it, so check the
result and undo or delete stray strokes.

Auto trace needs something to run out to: the button is available once the drawing has an ESDV, an
end flange or a drawing link.

## Dashed highlight

The **Dashed highlight** tool (`D`) marks areas and line runs:

- **Drag** a rectangle round equipment, for example a vessel and its nozzles, to make a dashed
  **zone**.
- **Click points** round an area and back to the first point for an odd-shaped zone, or click
  points along a pipe and double-click (or press `Enter`) to finish a **line run**.

Zones and line runs belong to the active segment, like strokes. When pipe length counting is on,
the count stage offers the same tool as **Line run**, and a traced run can carry a pipe length item;
see [Counting parts](counting.md).

## Equipment follows the highlighting

A circle placed on a segment's highlighting goes to that segment, whichever segment is active:

- on a highlighter stroke (its centre on the paint),
- on a dashed line run (its ring touching the line), or
- inside a dashed zone.

Placed anywhere else, it goes to the active segment. Drag or nudge a circle onto another segment's
highlighting and it moves to that segment with its item; moved off the highlighting, or along the
same segment's highlighting, it keeps its segment. Where highlights overlap, strokes and line runs
win over zones, then the nearest stroke or the smallest zone. Pasted circles and accepted **Find
similar** circles follow the same rule.

Turn this off under **Settings › General › Assign equipment to the highlighted segment**.
