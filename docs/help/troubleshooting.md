# Troubleshooting and FAQ

What to do when something does not work as expected, and answers to common questions.

## Troubleshooting

| Symptom                                                 | What to do                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "This browser cannot write to local folders"            | Use a current Edge or Chrome, or open a project .zip read-only.                                                               |
| The project opens read-only                             | It is open in another tab or window. Close it there, then choose **Reopen for editing**.                                      |
| The browser asks again for access to a recent project   | Browsers forget folder permissions after a while. Confirm access to the folder; nothing is lost.                              |
| "The drawing file is missing from the drawings folder"  | The file in `drawings/` was moved or renamed. Put it back, or re-import it.                                                   |
| A DWG will not import                                   | Import a DXF saved from the same drawing, or a PDF plot of it.                                                                |
| Find text finds nothing on a PDF                        | The PDF is a scan without a text layer. Ask for a plotted PDF, or search another drawing.                                     |
| The Highlighter cuts across instead of following a pipe | Zoom in where lines run close together, or hold `Alt` to paint freely.                                                        |
| Auto trace is greyed out                                | Place an ESDV, an end flange or a drawing link on the drawing first: the trace runs out to them.                              |
| Auto trace paints too much                              | It follows lines into text or symbols that touch the pipe. `Ctrl+Z` undoes the whole trace; or delete the stray strokes.      |
| Find similar finds nothing                              | Lower the similarity, or ring the symbol with a larger circle. It works best on clean drawings and one symbol type at a time. |
| A circle went to the wrong segment                      | It was placed on another segment's highlighting. Move it, or pick the segment in the panel.                                   |
| A PDF is reported as encrypted on export                | Ask for an unprotected copy of the drawing; password-protected PDFs cannot be annotated.                                      |
| Excel shows old results in the A2.1 sheet               | Open the file in Excel, which recalculates on opening. In LibreOffice, set recalculation on file load to **Always**.          |
| Save shows an error                                     | The folder may be read-only or full. The app keeps retrying; your edits stay in the open tab.                                 |
| Something went wrong after an edit                      | **Undo** (`Ctrl+Z`), or restore a snapshot from **Project › Backups**.                                                        |
| The app shows an old version                            | Click **Update** in the header when it appears, or reload the page while online.                                              |

## Frequently asked questions

### Does any of my data leave the computer?

No. The app runs in the browser and reads and writes only the working directory you choose.
It sends no telemetry, analytics or error reports, and after loading makes no network requests
other than fetching its own files.

### Can I work without a network connection?

Yes. Open the app once while online; when the header shows **Offline ready**, everything it needs
is cached, and it works with no network at all, including DWG reading and exports.

### Can two people work on the same study?

Not at the same time in the same folder: a second tab or window opens the project read-only. Split
the work by sending a copy (**Project › Export project as .zip**), or take turns. The checker can
open the folder after the counter has closed it, and sign their own notes.

### How do I count an ESDV?

You do not circle it. Mark it with the **ESDV** tool and set its upstream and downstream segments;
the project's **ESDV boundary rule** adds it as one automated valve to the segment that counts it.
See [Segments and ESDVs](segments.md#mark-esdvs).

### Should I count flanges per joint or per face?

Place one flange marker per flanged joint. The project's **flange convention** decides whether the
count reports joints or faces (two per joint); the A2.1 sheet has a column for each.

### What is the difference between an end flange and a flange?

An **end flange** is a segment boundary where the pipe leaves the segment without an ESDV, for
example to the closed drain or the flare. It is not counted. A **flange** is a leak source and is
counted with a marker from the equipment bar. Where an end flange is also a leak source, mark it as
well.

### Why is a marker outlined in amber?

It has a warning: it is in no segment, is missing its type, size or actuation, has a size outside
every bin, or has a duplicate tag. Hover it to see which. See
[Counting parts](counting.md#warnings).

### Can I change the equipment types after counting?

Yes. Edit the types and bins in **Project › Equipment library**; items keep their type, and the
count table re-bins them at once. Deleting a type in use warns you first.

### How do I undo a mistake?

`Ctrl+Z` undoes any change, including edits in panels and dialogs, and `Ctrl+Y` redoes it. The
arrow beside **Undo** lists the last steps; point at one to see what undoing back to it would change
(greyed out on the drawing), then click it. For larger mistakes, restore a snapshot from
**Project › Backups**.

### Where are my exports?

In `exports/<date>_<time>/` in the working directory, one folder per export. See
[Checking and exporting](export.md#where-exports-go).

### How do I start again with the guided tour?

Choose **Guided tour** in the app menu on the logo, or **Take the guided tour** on the start
screen. Each tour starts from a fresh practice project. See
[Guided tour and sample project](guided-tour.md).
