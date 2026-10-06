# Segments and ESDVs

An **isolatable segment** is the inventory between ESD valves: the pipework and equipment that is
shut in when the ESDVs close. It is the unit of the count. Segments are defined in the first stage
of the study, **1 Segments**.

## The Segments stage

A new project starts at **Segments**. In this stage:

- the toolbar holds the tools that set out segments: **Select** (`V`), **Dashed highlight** (`D`),
  **Highlighter** (`H`), **Drawing link** (`L`), **ESDV** (`E`) and **End flange** (`F`), and
  **Auto trace** (`T`);
- the right pane shows the selected marker and the segment's set-up: process data, bounding ESDVs
  and linked drawings;
- the status bar counts the highlights, zones, ESDVs and end flanges that are in no segment.

Pressing the key of a tool from the other stage says where it is, with a button to go there. When
the segments are done, click **2 Parts count** in the header; see [Counting parts](counting.md).

## Create a segment

Click **+ Segment** at the top of the segment list and fill in:

- **Label**, for example `IS-01`. Labels must be unique.
- **Description**, **Colour**, **Fluid**, **Phase**, operating **pressure** and **temperature**.

Click **Create segment**. The new segment becomes the **active segment**: new markers go to it. The
toolbar shows which segment is active (**New markers go to IS-01**), and is tinted in its colour.
Click a segment in the list, or choose it at the top of the right pane, to make it active; click it
again to make no segment active.

## Process data

The segment panel on the right also holds what the A2.1 parts count sheet asks for:

| Field                        | Example                    |
| ---------------------------- | -------------------------- |
| Object / equipment           | V-100 inlet separator      |
| Stream number                | 101 (the H&MB stream)      |
| Fluid                        | Gas / condensate           |
| Phase                        | `Liquid` or `Gas`          |
| Operating pressure           | 45 (in the project's unit) |
| Operating temperature        | 60 (in the project's unit) |
| H2S (mole fraction)          | 0.002                      |
| Mol. weight (gas) or density | 19.2 g/mol, or 720 kg/m³   |

Once anything is entered, **Process data** folds to one line (fluid, phase, pressure, temperature,
equipment); click it to open the fields again. Changes save as you type and can be undone.

## Mark ESDVs

Select the **ESDV** tool (`E`) and click each ESD valve on the drawing. In the **Selected marker**
panel on the right:

1. Enter its **tag** (for example `ESDV-101`) and **size**.
2. Choose the segment **upstream** of it (the segment that flows out through it) and the segment
   **downstream** of it (the segment that flows in through it). Leave a side as **None** where it
   leads out of the study.
3. The **boundary rule** decides which of the two segments counts the valve itself as an automated
   valve. An ESDV can override the project rule if the study needs it. The panel says where the
   ESDV is counted.

The bar under the toolbar sets how the ESDV is drawn: a red **Circle** round the valve, or a red
**Double line** across the pipe. Drag the double line across the pipe (hold `Shift` for steps of
45°), or click on the pipe (or a highlighter stroke) to put one square across it. Its ends can be
dragged later to turn or lengthen it.

The segment panel lists the segment's **bounding ESDVs** and warns when a segment has fewer than
two ESDVs or end flanges.

## Mark end flanges

Where a segment ends without an ESDV, for example at a flanged tie-in to the **closed drain** or the
**flare** header, mark an **end flange** (`F`). The bar under the toolbar sets where the pipe goes:
**Closed drain**, **Flare** or **Other end point**. Drag a bar across the pipe, or click on the pipe
to put one square across it.

The end flange goes to the active segment and is drawn as a solid bar in the segment's colour,
labelled with its tag or where it goes. Enter its tag in the panel. An end flange is a boundary of
the segment like an ESDV, but it is **not counted**: circle the flange as well if it is a leak
source to count.

## Show the extent of a segment

Highlight the pipework and equipment of the segment so the count can follow it, and so the exported
PDFs show where each segment runs. Paint it with the **Highlighter**, let **Auto trace** paint it
for you, or outline areas with **Dashed highlight**. See
[Highlighting and auto trace](highlighting.md).

## Linked drawings

Each segment lists the drawings it spans, with the number of its markers on each. Markers link
their drawing automatically; you can also **Link a drawing** by hand. Click a linked drawing to open
it zoomed to the segment, and **Unlink** to take it off the list.

## Split, merge, reorder

To change the segment of markers, select them and pick another segment in the panel. To reshape
segments as the study firms up:

- **Split**: select the markers that belong to a new segment and choose **Split into a new
  segment** in the panel. The new segment takes the next label, sits after the original in the list
  and copies its process data.
- **Merge**: in the segment panel, **Merge into…** moves the segment's markers, items, notes and
  linked drawings into another segment. An ESDV between the two is no longer a boundary.
- **Reorder**: the arrow buttons in the segment panel move the segment up or down the list. The
  Excel output follows this order.
- **Rename**: edit the label at the top of the segment panel.

## Status

Each segment has a **status**: **Not started**, **In progress**, **Counted** or **Checked**, with
**Counted by** and **Checked by** initials. Set them in the segment panel in the **2 Parts count**
stage; the segment list shows the status next to each segment.

## Delete a segment

**Delete segment** at the bottom of the segment panel asks whether to move its markers to another
segment or delete them with their items. It can be undone.
