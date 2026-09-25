import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { runShortcut } from '@/features/markup/shortcuts';
import {
  createLinkCommand,
  deleteLinkCommand,
  requestDeleteLink,
  updateLinkCommand,
} from './link-commands';

const project = () => useProjectStore.getState();
const ui = () => useUiStore.getState();
const box = { minX: 10, minY: 10, maxX: 60, maxY: 40 };

describe('deleting drawing links (LNK-01)', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    const populated = makePopulatedProject();
    const other = makeDrawing({ id: 'drw_target', fileName: 'target.pdf' });
    project().load(projectToDoc({ ...populated, drawings: [...populated.drawings, other] }));
    source = project().doc!.drawingOrder[0]!;
    target = other.id;
    ui().reset();
    ui().openDrawing(source);
  });
  afterEach(() => {
    project().close();
    ui().reset();
  });

  it('deletes a link without a target straight away, as one undo step', () => {
    const id = createLinkCommand(source, box)!;
    expect(requestDeleteLink(id)).toBe(true);
    expect(project().doc!.links[id]).toBeUndefined();
    expect(ui().linkDeleteRequest).toBeNull();
    expect(ui().selectedLinkId).toBeNull();
    project().undo();
    expect(project().doc!.links[id]).toBeDefined();
  });

  it('asks before deleting a link that leads to a drawing', () => {
    const id = createLinkCommand(source, box)!;
    updateLinkCommand(id, { targetDrawingId: target });
    expect(requestDeleteLink(id)).toBe(true);
    expect(project().doc!.links[id]).toBeDefined();
    expect(ui().linkDeleteRequest).toBe(id);
    // The dialog's Delete button.
    deleteLinkCommand(id);
    expect(project().doc!.links[id]).toBeUndefined();
  });

  it('routes the Delete key through the same check', () => {
    const id = createLinkCommand(source, box)!;
    updateLinkCommand(id, { targetDrawingId: target });
    ui().setSelectedLink(id);
    expect(runShortcut({ kind: 'delete' })).toBe(true);
    expect(ui().linkDeleteRequest).toBe(id);
    expect(project().doc!.links[id]).toBeDefined();
  });

  it('deletes nothing in a read-only tab', () => {
    const id = createLinkCommand(source, box)!;
    useProjectStore.setState({ readOnly: true });
    expect(requestDeleteLink(id)).toBe(false);
    expect(project().doc!.links[id]).toBeDefined();
  });
});

describe('Esc', () => {
  beforeEach(() => {
    project().load(projectToDoc(makePopulatedProject()));
    ui().reset();
    ui().openDrawing(project().doc!.drawingOrder[0]!);
  });
  afterEach(() => {
    project().close();
    ui().reset();
  });

  it('returns to the Select tool first, then clears the selection', () => {
    const marker = Object.keys(project().doc!.markers)[0]!;
    ui().setTool('circle');
    ui().setSelection([marker]);
    expect(runShortcut({ kind: 'escape' })).toBe(true);
    expect(ui().tool).toBe('select');
    expect(ui().selection).toEqual([marker]);
    expect(runShortcut({ kind: 'escape' })).toBe(true);
    expect(ui().selection).toEqual([]);
    expect(runShortcut({ kind: 'escape' })).toBe(false);
  });

  it('clears a selected link too', () => {
    const id = createLinkCommand(project().doc!.drawingOrder[0]!, box)!;
    ui().setTool('select');
    ui().setSelectedLink(id);
    expect(runShortcut({ kind: 'escape' })).toBe(true);
    expect(ui().selectedLinkId).toBeNull();
  });
});
