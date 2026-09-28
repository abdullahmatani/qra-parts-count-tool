import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { makePopulatedProject } from '@/test/fixtures';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  deleteDrawingCommand,
  renameDrawingCommand,
  requestDeleteDrawing,
} from './drawing-commands';

const project = () => useProjectStore.getState();
const ui = () => useUiStore.getState();

describe('drawing commands (DRW-04)', () => {
  let drawingId: string;

  beforeEach(() => {
    project().load(projectToDoc(makePopulatedProject()));
    drawingId = project().doc!.drawingOrder[0]!;
    ui().reset();
    ui().openDrawing(drawingId);
  });
  afterEach(() => {
    project().close();
    ui().reset();
  });

  it('renames a drawing as one undo step, ignoring blank and unchanged names', () => {
    expect(renameDrawingCommand(drawingId, '  PEFS-1001-A  ')).toBe(true);
    expect(project().doc!.drawings[drawingId]!.drawingNo).toBe('PEFS-1001-A');
    expect(project().past.at(-1)?.label).toBe('rename drawing to PEFS-1001-A');

    const steps = project().past.length;
    expect(renameDrawingCommand(drawingId, '   ')).toBe(false);
    expect(renameDrawingCommand(drawingId, 'PEFS-1001-A')).toBe(false);
    expect(renameDrawingCommand('missing', 'X')).toBe(false);
    expect(project().past).toHaveLength(steps);

    project().undo();
    expect(project().doc!.drawings[drawingId]!.drawingNo).toBe('PEFS-001');
  });

  it('asks before deleting, and not on a read-only project', () => {
    expect(requestDeleteDrawing(drawingId)).toBe(true);
    expect(ui().drawingDeleteRequest).toBe(drawingId);
    ui().setDrawingDeleteRequest(null);
    expect(requestDeleteDrawing('missing')).toBe(false);
    project().setReadOnly(true);
    expect(requestDeleteDrawing(drawingId)).toBe(false);
    expect(ui().drawingDeleteRequest).toBeNull();
  });

  it('deletes a drawing with its markers and items, closes its tab, and undoes', () => {
    expect(deleteDrawingCommand(drawingId)).toBe(true);
    const doc = project().doc!;
    expect(doc.drawings[drawingId]).toBeUndefined();
    expect(doc.drawingOrder).toEqual([]);
    expect(Object.keys(doc.markers)).toEqual([]);
    expect(Object.keys(doc.items)).toEqual([]);
    expect(Object.values(doc.segments)[0]!.drawingIds).toEqual([]);
    expect(ui().openDrawingIds).toEqual([]);
    expect(ui().activeDrawingId).toBeNull();
    expect(project().past.at(-1)?.label).toBe('delete drawing PEFS-001 / 1');

    project().undo();
    expect(project().doc!.drawings[drawingId]).toBeDefined();
    expect(Object.keys(project().doc!.markers)).toHaveLength(2);
    expect(deleteDrawingCommand('missing')).toBe(false);
  });
});
