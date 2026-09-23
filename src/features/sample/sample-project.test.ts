import { describe, expect, it } from 'vitest';
import { buildCountTable, countEntries } from '@/domain/count/count';
import { starterLibrary } from '@/domain/count/starter-library';
import { preExportCheck } from '@/domain/export/pre-export-check';
import { projectToDoc } from '@/domain/model';
import { checkIntegrity, parseProjectFile, serializeProject } from '@/domain/schema';
import { SAMPLE_SHEETS, SHEET } from './sample-layout';
import { buildSampleProject } from './sample-project';

const now = new Date('2026-09-23T10:00:00Z');
const build = () => buildSampleProject(starterLibrary(), { hash: 'a'.repeat(64) }, now);

describe('sample project (roadmap #46)', () => {
  it('is a valid project file with no integrity problems', () => {
    const project = build();
    expect(parseProjectFile(serializeProject(project)).project).toEqual(project);
    expect(checkIntegrity(project)).toEqual([]);
    expect(project.drawings.map((d) => [d.drawingNo, d.page])).toEqual([
      ['PEFS-S-001', 1],
      ['PEFS-S-002', 2],
    ]);
  });

  it('counts two segments bounded by ESDVs, with one open query', () => {
    const doc = projectToDoc(build());
    const [is01, is02] = doc.segmentOrder.map((id) => doc.segments[id]!);
    expect(is01!.boundingEsdvIds).toHaveLength(3);
    expect(is02!.boundingEsdvIds).toHaveLength(2);
    expect(is02!.drawingIds).toHaveLength(2);

    const entries = countEntries(doc);
    const issues = preExportCheck(doc, entries).filter((c) => c.count > 0);
    // Only the flange whose size the PEFS does not show.
    expect(issues.map((c) => [c.kind, c.count])).toEqual([['incompleteItems', 1]]);

    const table = buildCountTable(entries, doc.library, is01!.id, { pipeLengthCounting: false });
    expect(table.total).toBeGreaterThan(10);
    const notes = Object.values(doc.notes);
    expect(notes).toHaveLength(2);
    expect(notes.find((n) => n.segmentId === is02!.id)?.markerRef).toBe(issues[0]!.markerIds[0]);
    expect(Object.values(doc.links).every((l) => l.targetDrawingId)).toBe(true);
  });

  it('keeps every marker on its sheet', () => {
    const project = build();
    for (const marker of project.markers) {
      const g = marker.geometry;
      const [x, y] = g.type === 'circle' ? [g.cx, g.cy] : g.type === 'rect' ? [g.x, g.y] : [0, 0];
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(SHEET.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(SHEET.height);
    }
    const symbols = SAMPLE_SHEETS.flatMap((s) => s.symbols).filter((s) => s.item || s.between);
    // One marker per counted symbol, plus the highlighted vessel.
    expect(project.markers).toHaveLength(symbols.length + 1);
  });
});
