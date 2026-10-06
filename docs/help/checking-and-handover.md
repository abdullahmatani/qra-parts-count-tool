# Checking and handing over

A count is checked by a second engineer before it is issued. The app keeps the checker's work
apart from the counter's, and packs the whole study into one file to send.

## Checking a count

- The checker opens the same folder (or a copy), reviews the drawings, and signs their notes with
  their own initials (set in **Settings › General › Your initials**).
- Segment **status** (**Not started**, **In progress**, **Counted**, **Checked**) and **Counted by**
  and **Checked by** show where each segment stands. Set them in the segment panel while counting.
- The **count table** traces every total back to its markers: click a count to highlight them.
- The **pre-export check** in the Export dialog lists what is still unfinished.

## Send a study as one file

**Project › Export project as .zip** saves one file with the project, the drawings, the template
and the exports. Caches and backups are left out. The recipient opens it with **Open a project
.zip** on the start screen, which unpacks it into an empty folder they choose. The `.zip` itself is
not changed.

## Firefox and Safari

Firefox and Safari cannot write to folders. In them, the start screen offers **Open a project .zip
(read-only)**: the study opens in the browser tab, where drawings, markers, counts and notes can be
checked and exports run. Nothing is saved, so download the exports with **Download exports (.zip)**
in the Export dialog.

## Archive

Because everything about a study is inside its working directory, archiving the folder (or the
project `.zip`) keeps the drawings, counts, notes, mappings and every export together. The program
does not need to be archived with it: any later version of the app opens older project files, and
upgrades them with a backup of the original in `.backup/`.
