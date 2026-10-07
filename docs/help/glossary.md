# Glossary

The terms used in the app and in this documentation.

## A2.1 parts count sheet

The client's Excel workbook for the parts count, with one sheet per segment. The app recognises it
and maps its yellow input cells in one step. See [Mapping the Excel template](excel-template.md).

## Active segment

The segment new markers go to, shown in the toolbar and chosen in the segment list.

## Actuation

Whether a valve is **manual** or **automated** (actuated). Valves are counted separately by
actuation.

## Auto trace

Highlights the active segment's pipework out to its ESDVs, end flanges and off-page connectors.
See [Highlighting and auto trace](highlighting.md#auto-trace).

## Bin, bin set

A size range in inches, such as `1" < x ≤ 2"`, and the set of ranges an equipment type is counted
in. See [The equipment library](equipment-library.md#size-bins).

## Boundary rule (ESDV)

Which segment counts an ESDV that sits between two segments: upstream, downstream, both or
neither.

## Count item

What a marker counts: equipment type, actuation, size, tag, quantity and remarks.

## Count revision

The revision of the count, printed on the PDF stamps and recorded in the export log.

## Count table

The live totals of the active segment by type, actuation and size bin.

## Dashed highlight

A dashed zone round equipment, or a line run along a pipe.

## DN

Diamètre nominal, the metric nominal pipe size. DN sizes are converted to NPS inches for binning
(DN50 is 2").

## Drawing link

A hotspot over an off-page connector that opens the drawing the pipe continues on. Never
exported.

## Drawing register

The table of all drawings with their number, sheet, title and revision.

## End flange

A segment boundary where the pipe ends without an ESDV, for example at the closed drain or the
flare. Not counted.

## Equipment library

The equipment types, size bins and dataset a project counts with.

## Eraser

The tool that rubs out highlighter paint, cutting a stroke where it goes over it, to trim a
segment's highlighting.

## ESDV

Emergency shutdown valve. ESDVs close to isolate the plant into segments, so they are the usual
boundaries of an isolatable segment.

## Flange convention

Whether flanges are reported per flanged joint or per flange face (two per joint).

## Highlighter

The tool that paints a segment's pipework in its colour, following the drawn lines.

## Isolatable segment

The inventory of pipework and equipment between ESDVs that is shut in when they close. The unit of
the parts count.

## Leak source

A part that can leak and is counted: a valve, flange, small-bore connection, pump seal, vessel and
so on.

## Marker

Anything placed on a drawing: a circle round a leak source, an ESDV, an end flange, a highlighter
stroke or a dashed zone.

## NPS

Nominal pipe size in inches.

## Off-page connector

The flag on a drawing where a pipe continues on another drawing, such as `TO PEFS-1002`.

## P&ID, PEFS

Piping and instrumentation diagram; process engineering flow scheme. The drawings a parts count is
made on.

## Practice project

The project the guided tour opens in the browser tab. Nothing in it is saved.

## Pre-export check

The list of unfinished or doubtful items shown before an export.

## QRA

Quantitative risk assessment. The parts count gives the leak frequencies of each segment.

## Small-bore connection

An instrument tap, drain or vent connection, counted by size (≤ ½", ½"–1", > 1" on the A2.1
sheet).

## Stage

The step of the study: **1 Segments**, then **2 Parts count**. Each stage has its own tools.

## Stamp

The tool that repeats the last item with each click.

## Working directory

The folder that holds a project: the project file, drawings, templates, exports and backups.
