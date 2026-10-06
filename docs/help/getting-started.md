# Getting started

The QRA Parts Count Tool marks up PEFS and P&ID drawings, defines the isolatable segments of a
plant between its ESD valves, and counts the leak-source equipment in each segment by type and
size. The counts go into the client's Excel template, and the marked-up drawings are exported as
PDFs for the record.

## What you need

- A current **Microsoft Edge** or **Google Chrome** on a desktop or laptop, with a screen of at
  least 1366 × 768. These browsers can read and write a folder on your computer. Firefox and
  Safari cannot: there, a project sent as a `.zip` opens read-only (see
  [Checking and handing over](checking-and-handover.md)).
- The drawings of the study as **PDF**, **DWG** or **DXF** files.
- The client's **Excel template** for the parts count, if the results go into one (the A2.1 parts
  count sheet is recognised and mapped in one step).

## Everything stays on your computer

The app runs entirely in the browser. Drawings, counts, notes and exports are read from and written
to a folder on your computer (the **working directory**) and are never uploaded anywhere. The app
sends no telemetry, analytics or error reports.

Open the app once while online. After that it works with no network at all: the header shows
**Offline ready** when everything is cached. When a new version of the app is published, an
**Update** button appears beside it; click it to reload into the new version when it suits you.

## The workflow at a glance

A parts count runs in two **stages**, shown in the header as **1 Segments** and **2 Parts count**.
You can move between them at any time, and every change saves itself.

1. **Set up the project.** Choose an empty folder, then enter the project details and the counting
   rules: the ESDV boundary rule and the flange convention. See
   [Projects and the working directory](projects.md).
2. **Import drawings.** PDF, DWG and DXF files are copied into the project and listed in the
   drawing register. See [Importing and managing drawings](drawings.md).
3. **Define the segments** (stage 1). Create segments such as `IS-01`, mark the ESDVs and end
   flanges that bound them, and highlight their pipework. See [Segments and ESDVs](segments.md) and
   [Highlighting and auto trace](highlighting.md).
4. **Count the parts** (stage 2). Ring each leak source and enter its type and size; the count
   table updates as you click. See [Counting parts](counting.md).
5. **Add notes and drawing links.** Record assumptions for the checker, and link off-page
   connectors to the drawing they continue on. See [Notes and drawing links](notes-and-links.md).
6. **Export.** Run the pre-export check, then write the Excel workbook and the annotated PDFs. See
   [Mapping the Excel template](excel-template.md) and [Checking and exporting](export.md).

## The workspace

Once a project is open, the window has five areas:

| Area                | What it holds                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Header (top)        | App menu on the logo, project name, the two stages, save and offline status, the **Project** menu, **Export**, help and **Settings** |
| Left pane           | The **drawing list** (with **+** to import) and the **segment list** (with **+ Segment**)                                            |
| Centre              | The **toolbar** with the tools of the stage, the options bar for the chosen tool, the drawing tabs and the drawing itself            |
| Right pane          | The active segment: the selected marker or item, the segment's set-up or count table, and its notes                                  |
| Status bar (bottom) | Zoom, pointer position, marker filters and the warnings of the stage                                                                 |

Drag the borders between the panes to resize them; the sizes are remembered.

## Learn by doing

- **Take the guided tour** from the start screen (or the app menu on the logo) to walk through one
  complete parts count on a practice project, step by step. See
  [Guided tour and sample project](guided-tour.md).
- **Try the sample project** to look round a finished study: two PEFS sheets, two segments, a
  count, notes and one open query.

## Getting help

- Press `F1`, or click the **?** button in the header, to open this documentation. Type in the
  search box to search every article at once.
- **Project › Keyboard shortcuts** lists the keys; they are also in
  [Keyboard shortcuts](keyboard-shortcuts.md).
- Hover any button for a tooltip with its name and key.
