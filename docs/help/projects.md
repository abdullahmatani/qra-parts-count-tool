# Projects and the working directory

A project is one study. It lives in a folder on your computer, the **working directory**, which
holds the project file, the drawings, the exports and automatic backups.

## The working directory

Make an empty folder for each study, for example on a project share. Everything about the study is
kept inside it, so you can zip it, archive it or hand it to a checker.

```text
<working directory>/
├── project.qrapc.json   the project: segments, markers, items, notes, links, settings
├── drawings/            copies of the imported PDF, DWG and DXF files
├── templates/           the client's Excel template
├── exports/             one timestamped folder per export
├── cache/               rendering cache (safe to delete)
└── .backup/             automatic snapshots of the project file
```

Do not rename or move files inside `drawings/`: the project refers to them by name.

## Create a project

On the start screen, click **New project**:

1. **Choose folder…** and pick an empty folder. If it already holds a project, you are offered to
   open it instead.
2. Enter the project name, and optionally the client, facility, study reference and description.
3. Choose the **ESDV boundary rule**: which segment counts an ESDV that sits on the boundary between
   two segments (**Upstream segment**, **Downstream segment**, **Both segments** or **Neither
   segment**). Each ESDV can override it.
4. Choose the **flange counting convention**: report flanged joints (**Per flanged joint**) or
   flange faces (**Per flange face**, two per joint). Flange markers are always placed per joint.

These two rules are deliberate choices for each study, so there is no default. Click **Create
project**.

New projects start with a generic **equipment library** (valves, flanges, small-bore connections,
pumps, compressors, vessels and more, with typical size bins) that matches the A2.1 parts count
sheet. Adjust it to the client's leak frequency dataset before counting; see
[The equipment library](equipment-library.md).

## Open a project

- **Open project** asks for a folder that already holds `project.qrapc.json`.
- **Recent projects** on the start screen reopens a folder you used before. The browser may ask you
  to confirm access to the folder again. The **×** beside a recent project removes it from the list
  (the folder is not touched).
- **Open a project .zip** unpacks a study sent as a single `.zip` into an empty folder and opens it
  there.

While a project is open, click the **app logo** at the top left for the app menu:

- **Back to start screen** closes the project (it is already saved) and shows the start screen.
- **New project…** and **Open project…** close it and go straight on to another project.
- **Guided tour** and **Documentation** are also here.

## Saving, undo and backups

The project **saves itself** about a second after every change. The header shows **Saved** with the
time. If the browser or the computer crashes, at most the last two seconds of work are lost.

- `Ctrl+Z` undoes any change, including edits in panels and dialogs; `Ctrl+Y` redoes it. The undo
  and redo buttons in the toolbar name the step they will undo.
- To go back several steps at once, click the small arrow beside **Undo** (or beside **Redo** to go
  forward again). The list shows the steps, the most recent first, each with the time and a short
  summary of what it changed, such as _Removes 3 markers, 3 count items · PEFS-1001_. Point at a
  step: it and the steps above it are highlighted, because they are undone together. On the drawing,
  the markers they would change or take away are greyed out, and dashed outlines show where markers
  would come back or move to; segments and drawings they would change are greyed out in the left
  pane. Click the step to undo (or redo) them all, or press `Esc` to leave everything as it is.
- Snapshots of the project file are kept in `.backup/` (the last 20). To go back to one, open
  **Project › Backups** and choose **Restore**. The current state is kept as a new snapshot first,
  so you can go back to it the same way. A snapshot is taken when the project opens and at most
  once a minute while you work.

If saving fails (the folder is read-only or full), the header shows an error. The app keeps
retrying, and your edits stay in the open tab.

## One tab at a time

If the same project is already open in another tab or window, it opens **read-only**, so two tabs
cannot overwrite each other. The header shows **Read-only**. When the other tab closes the project,
a message offers **Reopen for editing**.

## Project settings

**Settings › Project** (the cog at the top right) changes what was set when the project was
created, and more:

| Setting                        | What it does                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Project name, client, facility | Shown in the header, the PDF stamps and the export file names                         |
| Study reference, description   | Shown in the header and written to the Excel header fields mapped to them             |
| Count revision                 | Printed on the PDF stamps and recorded in the export log                              |
| ESDV boundary rule             | Which segment counts an ESDV on a boundary                                            |
| Flange counting convention     | Report flanged joints or flange faces                                                 |
| Pipe length counting           | Adds the **Line run** tool in the count, with lengths summed per segment and size bin |
| Default size unit              | Inches or DN for new items                                                            |
| Pressure and temperature units | The units process data is entered in (for example barg and °C)                        |
| PDF file name pattern          | How annotated PDFs are named; see [Checking and exporting](export.md)                 |

Click **Apply changes**. The change is one undo step.

For preferences that belong to you rather than the project (theme, initials, drawing names), see
[Settings](settings.md).
