# Mapping the Excel template

The counts are exported into the client's own Excel template. The **template mapper** tells the app
where each value goes. You map a template once per project, and can save the mapping as a file to
reuse it with the same client template.

The template is copied into `templates/` and never changed: every export writes a filled copy.
Only the mapped cells are written, so formatting, formulas, sheet protection, links and named
ranges stay as they are, and Excel recalculates the results when the file is opened.

## Map a template

Open **Project › Template mapper**:

1. **Choose template…** and pick the client's `.xlsx`. Macro-enabled `.xlsm` files are not
   supported: save an `.xlsx` copy first.
2. Choose the **Layout**:

   | Layout            | How segments are written                                                             |
   | ----------------- | ------------------------------------------------------------------------------------ |
   | Sheet per segment | The master sheet is copied once per segment and named by the sheet name pattern      |
   | Row per segment   | One sheet; each segment fills a row from the start row down                          |
   | Block per segment | A block of rows is repeated down the sheet, one per segment, every block offset rows |
   | Flat item list    | One row per counted item, from the start row down                                    |

3. On **Header fields**, map the segment label, description, fluid, pressure, drawings, counted by
   and the other fields: click a field, then click its cell in the preview, or type the reference
   (for example `D14`).
4. On **Counts**, map each equipment type × actuation × size bin to a cell. **Fill** maps a whole
   block from its top-left cell: rows go down (one per type, automated then manual for valves) and
   bins go across.
5. On **Pipe lengths**, map the length cells if pipe lengths are counted.
6. On **Notes**, map the notes cell, or a range with one line per cell (for example `B72:B77`).
   Long notes are cut there and kept whole on the **Notes** sheet.
7. For the flat item list, map the **Item columns**.

The mapper warns about cells used more than once. Changes save with the project and can be undone.

## Reuse a mapping

**Save mapping file** writes the mapping as a `.mapping.json` file; **Load mapping file…** reads it
into another project with the same client template. Types are matched by Excel key or name, and
bins by label; the message says how many cells could not be matched. **Remove mapping** clears it.

## The A2.1 parts count sheet

Choose the A2.1 workbook (`A2.1 - PartsCountSheet`) as the template and the app recognises it: the
whole mapping is made in one step. If the project already had a mapping, click **Use the A2.1
mapping** in the banner instead. Each segment gets its own copy of the sheet, named by the segment
ID (`IS-01`, `IS-02`, …), and only the yellow input cells are filled:

| Cells   | What goes in                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B4:B13  | Segment ID, description, object/equipment, PEFS numbers, stream, pressure, temperature, phase, H2S, MW/density                                          |
| B19:B21 | Small-bore instrument connections, ≤ ½", ½"–1", > 1"                                                                                                    |
| C22:D26 | Manual and actuated valves (ESDVs count as actuated), by size                                                                                           |
| E or F  | Flanges per flange face (E) or flanged joints (F), following the project's flange convention                                                            |
| G22:G26 | Pipe length (m), when pipe length counting is on                                                                                                        |
| E28:E41 | Equipment: compressors, fin fan coolers, heat exchangers, pressure vessels, pumps, pipeline (m), pig traps, Xmas trees, plate and frame heat exchangers |
| B72:B77 | Segment notes, one line per row (the rest is on the Notes sheet)                                                                                        |

Pressure is written in **bara** and temperature in **°C**, converted from the project's units (barg
is converted to bara). The phase must be **Liquid** or **Gas**. Everything else in the workbook,
including the formulas, the leak frequency data, the sheet protection and the links, stays exactly
as it is.

The starter library of a new project matches the sheet's equipment rows and size bins. Older
projects get the missing A2.1 types added when the mapping is applied; finer bins (for example
3"–6" and 6"–11") are added together into the A2.1 row that contains them.

In LibreOffice, set **Tools › Options › LibreOffice Calc › Formula › Recalculation on file load** to
**Always** so the results rows are recalculated.

## No template yet?

Without a mapped template, the Excel export writes a new workbook with the **Notes**, **Item List**
and **Unmapped** sheets, so nothing is lost while the template is being agreed.
