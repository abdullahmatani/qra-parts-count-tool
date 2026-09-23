import { describe, expect, it } from 'vitest';
import { projectToDoc } from '../model';
import { checkIntegrity } from '../schema';
import { docToProject } from '../model';
import { makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { countEntries } from '../count/count';
import { preExportCheck } from '../export/pre-export-check';
import {
  addDrawings,
  markDrawingReviewed,
  removeDrawing,
  replaceDrawingRevision,
  updateDrawing,
} from './drawings';

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

describe('revision replacement (DRW-07, LNK-05)', () => {
  const revision = (size: { width: number; height: number }) => ({
    fileName: 'PEFS-001_B.pdf',
    originalFileName: 'PEFS-001_B.pdf',
    fileHash: 'b'.repeat(64),
    fileType: 'pdf' as const,
    page: 1,
    layout: null,
    isCadPlot: false,
    size,
    revision: 'B',
    importedAt: '2026-09-23T10:00:00.000Z',
  });

  it('keeps the drawing, its markers and the links to it', () => {
    const doc = projectToDoc(makePopulatedProject());
    const id = doc.drawingOrder[0]!;
    const other = makeDrawing({ drawingNo: 'OTHER' });
    addDrawings(doc, [other]);
    doc.links.lnk_1 = {
      id: 'lnk_1',
      sourceDrawingId: other.id,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      targetDrawingId: id,
      targetView: null,
      label: '',
    };
    const markers = Object.keys(doc.markers);
    // Within a point: the same sheet.
    expect(replaceDrawingRevision(doc, id, revision({ width: 2384.5, height: 1684 }))).toBe(false);
    expect(doc.drawings[id]).toMatchObject({ revision: 'B', fileHash: 'b'.repeat(64) });
    expect(doc.drawings[id]!.needsReview).toBe(false);
    expect(Object.keys(doc.markers)).toEqual(markers);
    expect(doc.links.lnk_1!.targetDrawingId).toBe(id);
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('flags a changed sheet size for review until cleared', () => {
    const doc = projectToDoc(makePopulatedProject());
    const id = doc.drawingOrder[0]!;
    expect(replaceDrawingRevision(doc, id, revision({ width: 1191, height: 842 }))).toBe(true);
    expect(doc.drawings[id]!.needsReview).toBe(true);
    const check = preExportCheck(doc, countEntries(doc)).find((c) => c.kind === 'drawingsToReview');
    expect(check).toMatchObject({ count: 1, drawingIds: [id], names: ['PEFS-001'] });
    // A later same-size revision does not clear an open review.
    replaceDrawingRevision(doc, id, revision({ width: 1191, height: 842 }));
    expect(doc.drawings[id]!.needsReview).toBe(true);
    markDrawingReviewed(doc, id);
    expect(doc.drawings[id]!.needsReview).toBe(false);
  });
});
