# Notes and drawing links

Notes record what a checker needs to know about a segment. Drawing links take you from an
off-page connector to the drawing the pipe continues on.

## Segment notes

The **Notes** section at the bottom of the right pane holds the active segment's notes:
assumptions, open points and checker comments.

1. Type the note in the box. **Bold** and **Bullet list** format the selected text.
2. To refer to a marker, select it on the drawing and turn on **Selected marker** before adding the
   note. Clicking the reference in the note later jumps to the marker.
3. Click **Add note**, or press `Ctrl+Enter`.

Notes are signed with **your initials** and timestamped. Set your initials once in **Settings ›
General › Your initials**, so a checker's comments stay apart from yours. Hover a note to **edit**
or **delete** it; both can be undone.

Notes go to the Excel output: to the mapped notes cell, and in full to a **Notes** sheet.

## Drawing links

A drawing link is a hotspot over an off-page connector that opens the drawing the pipe continues
on. Links are for navigation only and are **never exported**.

### Draw a link

1. Pick the **Drawing link** tool (`L`) and drag a box over the off-page connector.
2. In the panel, choose the **Target drawing** and, optionally, a **Label** such as
   `Continued on PEFS-002`.
3. To open the target at a particular place, open the target drawing once, set the view you want,
   then choose **Save the target's current view** in the link's panel.

### Suggest drawing links

**Project › Suggest drawing links…** reads the text of every drawing and offers a link wherever a
drawing names another drawing in the register, such as an off-page connector `TO PEFS-1002`. Text
that already has a link is skipped. Untick any you do not want, then **Add** them; they are one
undo step. Check the hotspot size on dense drawings.

### Follow a link

With the **Select** tool, click a hotspot to follow it. **Back** (or `Alt+←`) returns to where you
were, at the same view. Hide the hotspots with the link button in the toolbar.

A link with no target is drawn dashed red, and so is a link whose target drawing was deleted.

### Delete a link

Select the link (a click with the Link tool; with the Select tool, a link that has no target yet is
selected instead of followed) and press `Delete`, or click **Delete link**. A link without a target
goes at once; one that leads to a drawing asks first. Either can be undone.
