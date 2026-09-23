import { describe, expect, it } from 'vitest';
import { projectToDoc } from '../model';
import { makePopulatedProject } from '@/test/fixtures';
import { addNote, deleteNote, segmentNotes, updateNote } from './notes';

function setup() {
  const doc = projectToDoc(makePopulatedProject());
  return { doc, segmentId: doc.segmentOrder[0]!, markerId: Object.keys(doc.markers)[0]! };
}

describe('segment notes (NTE-01, NTE-02, NTE-04)', () => {
  it('adds timestamped entries with author initials, oldest first', () => {
    const { doc, segmentId, markerId } = setup();
    addNote(doc, { segmentId, text: ' Second ', author: 'CK' }, new Date('2026-09-23T12:00:00Z'));
    const id = addNote(
      doc,
      { segmentId, text: 'First', author: 'AM', markerRef: markerId },
      new Date('2026-09-23T10:00:00Z'),
    )!;
    const notes = segmentNotes(doc, segmentId);
    expect(notes.map((n) => [n.author, n.text])).toEqual([
      ['AM', 'First'],
      ['CK', 'Second'],
    ]);
    expect(doc.notes[id]?.markerRef).toBe(markerId);
  });

  it('refuses empty notes, unknown segments and unknown marker references', () => {
    const { doc, segmentId } = setup();
    const now = new Date();
    expect(addNote(doc, { segmentId, text: '  ', author: 'AM' }, now)).toBeNull();
    expect(addNote(doc, { segmentId: 'seg_x', text: 'x', author: 'AM' }, now)).toBeNull();
    const id = addNote(doc, { segmentId, text: 'x', author: 'AM', markerRef: 'mkr_x' }, now)!;
    expect(doc.notes[id]?.markerRef).toBeNull();
  });

  it('edits and deletes notes', () => {
    const { doc, segmentId, markerId } = setup();
    const id = addNote(doc, { segmentId, text: 'x', author: 'AM' }, new Date())!;
    updateNote(doc, id, { text: 'Revised', markerRef: markerId });
    updateNote(doc, id, { text: '  ' });
    expect(doc.notes[id]).toMatchObject({ text: 'Revised', markerRef: markerId });
    deleteNote(doc, id);
    expect(doc.notes[id]).toBeUndefined();
  });
});
