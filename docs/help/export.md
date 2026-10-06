# Checking and exporting

Click **Export** in the header. The dialog starts with the **pre-export check**, then lets you choose
the outputs. Every export goes to a new folder, so nothing is ever overwritten.

## The pre-export check

The check lists what may be wrong or unfinished:

- markers not in a segment,
- items missing their type or size,
- segments with no counted items, or no linked drawing,
- tags that appear more than once and have not been accepted,
- drawings flagged for review after a new revision,
- counts with no cell in the mapped template,
- segment values the template needs in units they cannot be given in (for example a phase of
  "Two-phase" where the A2.1 sheet takes Liquid or Gas, or a pressure unit the app does not know).

**Show** takes you to the markers or the segment concerned. Fix them, or **Export anyway**: the
export log records the warnings you accepted.

## Outputs

| Output                   | What it writes                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Excel workbook           | The client's template filled per the mapping, plus **Notes**, **Item List** and **Unmapped** sheets (counts with no cell are listed there). Without a template, a new workbook with those sheets |
| CSV item list            | One row per counted item, for audit or pivot tables                                                                                                                                              |
| Annotated drawings (PDF) | One PDF per drawing with the markers and labels, and a box at the top left holding the stamp (project, drawing and revision, count revision, export date) above the legend                       |
| Combined PDF per segment | All drawings of a segment in one file, showing only that segment's markers                                                                                                                       |
| All segments in one PDF  | Every segment's drawings in a single file, `<project>_all_segments.pdf`, segment by segment in the order of the segment list, with a bookmark for each segment                                   |

PDF drawings keep their original vector content; DWG and DXF drawings are drawn at their layout's
paper size. Drawing links are never drawn. In the single PDF of all segments, each page shows only
its segment's markers, so a drawing shared by two segments appears once for each.

## PDF file names

Set the **file name pattern** of the annotated PDFs in the dialog, for example
`{project}_{drawingNo}_{rev}`. The tokens are `{project}`, `{segment}`, `{drawingNo}`, `{rev}`,
`{sheet}`, `{title}` and `{page}`. The dialog shows an example name as you type. Names that would
clash get ` (2)` added.

## Where exports go

Each export goes to a new folder, `exports/<date>_<time>/`, with an `export_log.json` listing what
was exported, from which revision of the project, which files could not be written (for example a
password-protected PDF), and which warnings were accepted.

A project opened from a `.zip` in a browser that cannot write to folders, and the practice project
of the guided tour, keep their exports in the browser tab: click **Download exports (.zip)** in the
dialog to keep them.
