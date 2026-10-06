# Viewing drawings

Open a drawing by clicking it in the drawing list. Each open drawing has a tab above the sheet.

## Tabs

Click a tab to bring its drawing to the front, and its **×** to close it. When the tabs no longer
fit, scroll them sideways with the mouse wheel over the tab bar; the tab you are on is always kept
in view.

## Zoom and pan

- **Zoom** with the mouse wheel (it zooms at the pointer), with `+` and `−`, or with the controls at
  the bottom right of the sheet. `0` fits the whole page.
- **Pan** by dragging with the middle mouse button, or hold `Space` and drag. With nothing selected,
  the arrow keys pan too.
- The **minimap** shows where you are on the sheet; drag its rectangle to move round.
- The status bar shows the zoom and the pointer position in drawing coordinates.

## Rotate

**Rotate** a sheet from the view controls if it was scanned sideways. Markers stay where you put
them on the drawing.

## Find text

Press `Ctrl+F`, or click the search button in the toolbar, and type a tag or line number. Case,
spaces and dashes are ignored, so `hv 1001` finds `HV-1001`.

- Matches are highlighted in yellow, the current one in orange. `Enter` and `Shift+Enter` (or the
  arrows) step through them.
- **Search all drawings** lists every drawing with a match; click one to open it at its first
  match.
- `Esc` closes the find bar.

Find text works on the text of PDF drawings and on the text of DWG and DXF drawings. A scanned PDF
with no text layer has nothing to find.

## Split view

With two or more drawings open, the split button at the end of the tab bar shows two drawings side
by side, for example at a match line. The pane you work in is the **active drawing**: panels and
shortcuts follow it, and a tab you click opens in that pane. Click the button again to go back to
one drawing.

## DWG and DXF drawings

- **Colours**: **Settings › General › DWG and DXF drawings** switches between **Monochrome, like a
  plot** and **CAD colours**.
- **Layers**: the **Layers** button at the top of the drawing lists the layers that hold linework or
  text. Untick one to hide it, for example a title-block or grid layer that hides symbols; **Show
  all** brings every layer back. Hidden layers apply to this browser session only; exported PDFs
  always show every layer.

## Marker labels and links

The toolbar has two switches for what is drawn over the sheet: **Show marker labels** (the tag or
number beside each marker) and **Show drawing links** (the hotspots of off-page connectors).
**Marker filters** hides segments or equipment types, or shows only the markers that are in no
segment.
