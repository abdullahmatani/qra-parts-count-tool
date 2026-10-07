import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectToDoc, type ProjectDoc } from '@/domain/model';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { makeCircleMarker, makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { describeStep } from './describe-step';
import { HistoryPreviewer, summarizeStep } from './history-changes';

const store = () => useProjectStore.getState();
const doc = () => store().doc!;
const t = i18n.t.bind(i18n);

let drawingId: string;
let segmentId: string;
let m1: string;
let m2: string;
let item1: string;

beforeEach(() => {
  store().load(projectToDoc(makePopulatedProject()));
  drawingId = doc().drawingOrder[0]!;
  segmentId = doc().segmentOrder[0]!;
  [m1, m2] = Object.keys(doc().markers) as [string, string];
  item1 = Object.values(doc().items).find((item) => item.markerId === m1)!.id;
});
afterEach(() => store().close());

/** Deletes a marker with its count item, as the Delete key does. */
function deleteMarker(markerId: string) {
  store().apply('delete marker', (d) => {
    delete d.markers[markerId];
    for (const item of Object.values(d.items))
      if (item.markerId === markerId) delete d.items[item.id];
  });
}

function moveMarker(markerId: string, dx: number) {
  store().apply('move marker', (d) => {
    const g = d.markers[markerId]!.geometry;
    if (g.type === 'circle') g.cx += dx;
  });
}

const lastStep = () => store().past[store().past.length - 1]!;

describe('step summaries', () => {
  it('counts what a step adds, removes and changes, and on which drawing', () => {
    deleteMarker(m1);
    const deleted = summarizeStep(lastStep(), doc());
    expect(deleted.counts.removed).toEqual({ markers: 1, items: 1 });
    expect(deleted.counts.added).toEqual({});
    expect(deleted.drawings).toEqual(['PEFS-001 / 1']);
    expect(describeStep(deleted, t)).toBe('Removes 1 marker, 1 count item · PEFS-001 / 1');

    const marker = makeCircleMarker(drawingId);
    store().apply('add circle', (d) => {
      d.markers[marker.id] = marker;
    });
    expect(summarizeStep(lastStep(), doc()).counts.added).toEqual({ markers: 1 });

    moveMarker(m2, 10);
    expect(describeStep(summarizeStep(lastStep(), doc()), t)).toBe(
      'Changes 1 marker · PEFS-001 / 1',
    );
  });

  it('names the parts of the project outside the drawings', () => {
    store().apply('edit project settings', (d) => {
      d.client = 'Other client';
      d.settings.pipeLengthCounting = true;
      d.segmentOrder = [...d.segmentOrder];
      d.segments[segmentId]!.label = 'IS-02';
    });
    const summary = summarizeStep(lastStep(), doc());
    expect(summary.areas).toEqual(['project', 'settings']);
    expect(describeStep(summary, t)).toBe('Changes 1 segment, project details, project settings');
  });

  it('finds the name of a drawing the step deleted in its patches', () => {
    store().apply('delete drawing', (d) => {
      delete d.drawings[drawingId];
      d.drawingOrder = d.drawingOrder.filter((id) => id !== drawingId);
    });
    const summary = summarizeStep(lastStep(), doc());
    expect(summary.counts.removed).toEqual({ drawings: 1 });
    expect(summary.drawings).toEqual(['PEFS-001 / 1']);
  });

  it('lists the first drawings by name and counts the rest', () => {
    const drawings = ['A', 'B', 'C', 'D'].map((no) => makeDrawing({ drawingNo: no, sheet: '' }));
    store().apply('import drawings', (d) => {
      for (const drawing of drawings) d.drawings[drawing.id] = drawing;
    });
    expect(describeStep(summarizeStep(lastStep(), doc()), t)).toBe('Adds 4 drawings · A, B +2');
  });
});

describe('history preview', () => {
  function previewUndo(steps: number, from: ProjectDoc = doc()) {
    const stack = [...store().past].reverse();
    return new HistoryPreviewer(from, stack, 'undo').preview(steps);
  }

  it('greys out markers a step changes and shows where they would go back to', () => {
    moveMarker(m2, 50);
    const preview = previewUndo(1);
    expect([...preview.changing]).toEqual([m2]);
    expect(preview.ghosts.map((m) => [m.id, m.geometry])).toEqual([
      [m2, { type: 'circle', cx: 300, cy: 200, r: 12 }],
    ]);
  });

  it('shows deleted markers coming back, without greying anything out for them', () => {
    deleteMarker(m1);
    const preview = previewUndo(1);
    expect(preview.changing.size).toBe(0);
    expect(preview.ghosts.map((m) => m.id)).toEqual([m1]);
  });

  it('greys out a marker whose count item an earlier step edits', () => {
    store().apply('edit item', (d) => void (d.items[item1]!.tag = 'HV-2002'));
    moveMarker(m2, 5);
    // One step: only the move.
    expect([...previewUndo(1).changing]).toEqual([m2]);
    // Two steps: the item edit as well, which changes m1's label but not its shape.
    const two = previewUndo(2);
    expect([...two.changing].sort()).toEqual([m1, m2].sort());
    expect(two.ghosts.map((m) => m.id)).toEqual([m2]);
    expect(two.steps).toBe(2);
  });

  it('greys out segments and drawings that would change or go', () => {
    store().apply('edit segment', (d) => void (d.segments[segmentId]!.label = 'IS-09'));
    store().apply('rename drawing', (d) => void (d.drawings[drawingId]!.drawingNo = 'X'));
    const preview = previewUndo(2);
    expect([...preview.segments]).toEqual([segmentId]);
    expect([...preview.drawings]).toEqual([drawingId]);
  });

  it('nets out steps that cancel each other', () => {
    moveMarker(m2, 10);
    moveMarker(m2, -10);
    const preview = previewUndo(2);
    expect(preview.changing.size).toBe(0);
    expect(preview.ghosts).toHaveLength(0);
  });

  it('previews redo from the current document, reusing the documents it reached', () => {
    moveMarker(m2, 10);
    deleteMarker(m1);
    store().undo(2);
    const stack = [...store().future].reverse();
    const previewer = new HistoryPreviewer(doc(), stack, 'redo');
    const one = previewer.preview(1);
    expect([...one.changing]).toEqual([m2]);
    expect(one.ghosts.map((m) => m.id)).toEqual([m2]);
    const two = previewer.preview(2);
    expect([...two.changing].sort()).toEqual([m1, m2].sort());
    expect(previewer.docAfter(2).markers[m1]).toBeUndefined();
    // The document after one step is the one already computed.
    expect(previewer.docAfter(1)).toBe(previewer.docAfter(1));
    expect(previewer.preview(0).changing.size).toBe(0);
  });
});
