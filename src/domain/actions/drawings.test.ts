import { describe, expect, it } from 'vitest';
import { projectToDoc } from '../model';
import { checkIntegrity } from '../schema';
import { docToProject } from '../model';
import { makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { addDrawings, removeDrawing, updateDrawing } from './drawings';

describe('drawing actions', () => {
  it('adds drawings in order and ignores duplicates', () => {
    const doc = projectToDoc(makePopulatedProject());
    const a = makeDrawing({ drawingNo: 'A' });
    const b = makeDrawing({ drawingNo: 'B' });
    addDrawings(doc, [a, b, a]);
    expect(doc.drawingOrder.slice(-2)).toEqual([a.id, b.id]);
  });

  it('edits metadata (DRW-04)', () => {
    const doc = projectToDoc(makePopulatedProject());
    const id = doc.drawingOrder[0]!;
    updateDrawing(doc, id, { drawingNo: 'NEW-1', revision: 'D' });
    expect(doc.drawings[id]).toMatchObject({ drawingNo: 'NEW-1', revision: 'D' });
  });

  it('removes a drawing with its markers, items and segment links', () => {
    const doc = projectToDoc(makePopulatedProject());
    const id = doc.drawingOrder[0]!;
    const other = makeDrawing({ drawingNo: 'OTHER' });
    addDrawings(doc, [other]);
    doc.links['lnk_1'] = {
      id: 'lnk_1',
      sourceDrawingId: other.id,
      rect: { x: 0, y: 0, width: 5, height: 5 },
      targetDrawingId: id,
      targetView: null,
      label: '',
    };
    removeDrawing(doc, id);
    expect(doc.drawings[id]).toBeUndefined();
    expect(Object.keys(doc.markers)).toHaveLength(0);
    expect(Object.keys(doc.items)).toHaveLength(0);
    expect(Object.values(doc.segments)[0]!.drawingIds).toEqual([]);
    expect(doc.links['lnk_1']!.targetDrawingId).toBeNull();
    expect(checkIntegrity(docToProject(doc)).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
