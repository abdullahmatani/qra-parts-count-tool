# Keyboard shortcuts

Shortcuts work while the drawing or the workspace has focus, not while you type in a field. The
same list is in the app under **Project › Keyboard shortcuts**. On a Mac, use `Cmd` for `Ctrl`.

## Markup tools

| Key | Tool                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `V` | Select: click, `Shift`+click or drag a box; drag to move                                                                                                           |
| `C` | Circle: one leak source per click, then type its size                                                                                                              |
| `D` | Dashed highlight: drag an area, or click points along a run                                                                                                        |
| `H` | Highlighter: paint over a segment's pipework in its colour, following the drawn lines; `Shift` for a straight stroke; `Alt` paints freely (no line or ESDV magnet) |
| `L` | Drawing link: drag a hotspot, then choose the target drawing                                                                                                       |
| `E` | ESDV: click an ESD valve (or drag a double line across the pipe, `Shift` for 45° steps), then set its tag, size and adjoining segments                             |
| `S` | Stamp: each click repeats the last item (type, actuation, size)                                                                                                    |

## Equipment types

Keys set the type of the selected item and of the next circle. The starter library (the
equipment of the A2.1 parts count sheet) uses:

| Key | Type                             |
| --- | -------------------------------- |
| `1` | Valve                            |
| `2` | Flange                           |
| `3` | Small-bore instrument connection |
| `4` | Pressure vessel                  |
| `5` | Pump, centrifugal (single seal)  |

Change or add keys in **Project › Equipment library** (column **Key**).

## Editing

| Keys                     | Action                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `Ctrl+Z`                 | Undo                                                                                |
| `Ctrl+Y`, `Ctrl+Shift+Z` | Redo                                                                                |
| `Ctrl+C`                 | Copy selected markers (with their items)                                            |
| `Ctrl+V`                 | Paste (at the pointer when it is over the drawing)                                  |
| `Ctrl+A`                 | Select all markers on the drawing                                                   |
| `Delete`, `Backspace`    | Delete selected markers, or the selected link (asks first if it leads to a drawing) |
| `Shift`+click            | Add to or remove from the selection                                                 |
| `←` `↑` `→` `↓`          | Nudge selected markers (hold `Shift` for 10 px)                                     |
| `Enter`                  | Finish a dashed line run; in a field, confirm the value                             |
| `Esc`                    | Cancel drawing and return to the Select tool; press again to clear the selection    |
| `F2`                     | Rename the drawing selected in the drawing list                                     |

## View

| Keys                               | Action                              |
| ---------------------------------- | ----------------------------------- |
| `+`, `−`                           | Zoom in, zoom out                   |
| `0`                                | Fit page                            |
| Mouse wheel                        | Zoom at the pointer                 |
| Middle-button drag, `Space`+drag   | Pan                                 |
| `←` `↑` `→` `↓` (nothing selected) | Pan                                 |
| `Alt+←`                            | Back after following a drawing link |
| `Ctrl+F`                           | Find text (tag or line numbers)     |

## Notes

| Keys         | Action       |
| ------------ | ------------ |
| `Ctrl+Enter` | Add the note |
