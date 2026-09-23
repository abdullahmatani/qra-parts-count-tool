import { describe, expect, it } from 'vitest';
import { exportableProject } from '../export/exportable';
import { projectToDoc } from '../model';
import { makeDrawing, makeProject } from '@/test/fixtures';
import { addLink, deleteLink, linkAt, linkStatus, updateLink } from './links';

function setup() {
  const a = makeDrawing({ id: 'drw_a' });
  const b = makeDrawing({ id: 'drw_b', drawingNo: 'PEFS-002' });
  return projectToDoc(makeProject({ drawings: [a, b] }));
}

const box = { minX: 10, minY: 20, maxX: 110, maxY: 70 };

describe('drawing links (LNK-01..05)', () => {
  it('adds a hotspot and points it at another drawing and view', () => {
    const doc = setup();
    const id = addLink(doc, 'drw_a', box)!;
    expect(doc.links[id]).toMatchObject({
      rect: { x: 10, y: 20, width: 100, height: 50 },
      targetDrawingId: null,
    });
    expect(linkStatus(doc.links[id]!, doc)).toBe('noTarget');
    updateLink(doc, id, { targetDrawingId: 'drw_b', label: 'To separator' });
    updateLink(doc, id, { targetView: { x: 500, y: 400, zoom: 2 } });
    expect(doc.links[id]).toMatchObject({
      targetDrawingId: 'drw_b',
      label: 'To separator',
      targetView: { zoom: 2 },
    });
    expect(linkStatus(doc.links[id]!, doc)).toBe('ok');
  });

  it('refuses a missing drawing or the link’s own drawing as the target', () => {
    const doc = setup();
    const id = addLink(doc, 'drw_a', box)!;
    updateLink(doc, id, { targetDrawingId: 'drw_a' });
    updateLink(doc, id, { targetDrawingId: 'drw_missing' });
    expect(doc.links[id]?.targetDrawingId).toBeNull();
    expect(addLink(doc, 'drw_missing', box)).toBeNull();
  });

  it('forgets the saved view when the target changes', () => {
    const doc = setup();
    const c = makeDrawing({ id: 'drw_c' });
    doc.drawings.drw_c = c;
    const id = addLink(doc, 'drw_a', box)!;
    updateLink(doc, id, { targetDrawingId: 'drw_b', targetView: { x: 1, y: 1, zoom: 1 } });
    updateLink(doc, id, { targetDrawingId: 'drw_c' });
    expect(doc.links[id]?.targetView).toBeNull();
  });

  it('flags a link whose target was removed (LNK-05)', () => {
    const doc = setup();
    const id = addLink(doc, 'drw_a', box)!;
    updateLink(doc, id, { targetDrawingId: 'drw_b' });
    delete doc.drawings.drw_b;
    expect(linkStatus(doc.links[id]!, doc)).toBe('broken');
    deleteLink(doc, id);
    expect(doc.links[id]).toBeUndefined();
  });

  it('finds the link under a point', () => {
    const doc = setup();
    const big = addLink(doc, 'drw_a', { minX: 0, minY: 0, maxX: 500, maxY: 500 })!;
    const small = addLink(doc, 'drw_a', box)!;
    const links = Object.values(doc.links);
    expect(linkAt(links, { x: 50, y: 40 }, 0)?.id).toBe(small);
    expect(linkAt(links, { x: 300, y: 300 }, 0)?.id).toBe(big);
    expect(linkAt(links, { x: 600, y: 600 }, 5)).toBeNull();
  });
});

describe('exports (LNK-04)', () => {
  it('never carry drawing links', () => {
    const doc = setup();
    const id = addLink(doc, 'drw_a', box)!;
    updateLink(doc, id, { targetDrawingId: 'drw_b' });
    const exported = exportableProject(doc);
    expect(exported.links).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain(id);
    expect(exported.drawings).toHaveLength(2);
  });
});
