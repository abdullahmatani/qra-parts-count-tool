# The equipment library

The equipment library defines what can be counted: the equipment types, the size bins each type is
counted in, and the leak frequency dataset they follow. Open it from **Project › Equipment
library**. Changes apply to the open project and can be undone.

## The starter library

A new project starts with a generic library that matches the equipment rows and size bins of the
A2.1 parts count sheet: valves, flanges, small-bore instrument connections, pumps, compressors,
pressure vessels, heat exchangers, filters, pig traps, other equipment and pipe lengths. Adjust it
to the client's leak frequency dataset before counting. **Add starter library** puts back any
starter types and bin sets that are missing.

## Equipment types

Each type has:

| Column             | Meaning                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Name               | How the type is shown in the equipment bar, the item editor and the count table                   |
| Category           | Valve, flange, small-bore connection, pump, compressor, vessel, heat exchanger, filter, and so on |
| Manual / automated | Whether the type is counted by actuation (valves). Each actuation can have its own bin set        |
| Bin set            | The size bins the type is counted in                                                              |
| Size required      | Whether an item of this type needs a size                                                         |
| Excel key          | The key the template mapping uses for this type                                                   |
| Dataset category   | The category of the client's leak frequency dataset the type maps to                              |
| Key                | An optional keyboard key (`1`–`9`) that picks the type while counting                             |

**ESDVs are counted as** picks the type used for ESDVs counted under the boundary rule: each ESDV
adds one automated item of this type to the segment that counts it.

Deleting a type that items use warns you first: those items will need a new type.

## Size bins

A **bin set** is a list of size ranges in inches, for example `1" < x ≤ 2"`. Each edge can include
or exclude its value, and an empty edge means no limit. The editor warns about overlaps, gaps and
empty bins, so that every size falls in exactly one bin. DN sizes are converted to NPS inches.

**New bin set** starts an empty set; **Copy** duplicates one to adjust.

## Dataset

The **Dataset** tab holds the name of the leak frequency dataset the types and bins follow, for
example IOGP 434-01. No dataset is built in.

## Reuse a library

**Export library** saves the types, bins and dataset as a `.library.json` file. **Import library…**
reads one from another project. Importing adds new types and bin sets and updates the ones with the
same Excel key (or name); nothing in the project is removed, and existing items and template
mappings keep working.
