import { describe, expect, it } from 'vitest';
import { checkIntegrity } from './integrity';
import { makeCircleMarker, makeItem, makePopulatedProject, makeSegment } from '@/test/fixtures';

const codes = (project: Parameters<typeof checkIntegrity>[0]) =>
  checkIntegrity(project).map((issue) => issue.code);

describe('checkIntegrity', () => {
  it('finds no issues in a consistent project', () => {
    expect(checkIntegrity(makePopulatedProject())).toEqual([]);
  });

  it('flags duplicate ids across collections', () => {
    const project = makePopulatedProject();
    project.segments[0]!.id = project.drawings[0]!.id;
    expect(codes(project)).toContain('duplicateId');
  });

  it('flags duplicate segment labels, ignoring case (SEG-02)', () => {
    const project = makePopulatedProject();
    project.segments.push(makeSegment({ label: 'is-01' }));
    expect(codes(project)).toContain('duplicateSegmentLabel');
  });

  it('flags markers on missing drawings and items without markers', () => {
    const project = makePopulatedProject();
    project.markers[0]!.drawingId = 'drw_missing';
    project.items[1]!.markerId = 'mkr_missing';
    const found = codes(project);
    expect(found).toContain('danglingDrawing');
    expect(found).toContain('danglingMarker');
  });

  it('flags an item whose segment differs from its marker', () => {
    const project = makePopulatedProject();
    project.items[0]!.segmentId = null;
    expect(codes(project)).toContain('segmentMismatch');
  });

  it('flags two items sharing one marker and duplicate item numbers', () => {
    const project = makePopulatedProject();
    const marker = project.markers[0]!;
    project.items.push(makeItem(marker, 1));
    const found = codes(project);
    expect(found).toContain('markerShared');
    expect(found).toContain('duplicateSeq');
  });

  it('flags item numbers at or above the next-number counter', () => {
    const project = makePopulatedProject();
    project.nextItemSeq = 2;
    expect(codes(project)).toContain('seqCounter');
  });

  it('flags broken drawing link targets (LNK-05)', () => {
    const project = makePopulatedProject();
    project.links.push({
      id: 'lnk_1',
      sourceDrawingId: project.drawings[0]!.id,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      targetDrawingId: 'drw_gone',
      targetView: null,
      label: '',
    });
    expect(codes(project)).toContain('brokenLink');
  });

  it('flags bounding ESDVs that are not ESDV markers', () => {
    const project = makePopulatedProject();
    const plain = makeCircleMarker(project.drawings[0]!.id);
    project.markers.push(plain);
    project.segments[0]!.boundingEsdvIds = [plain.id];
    expect(codes(project)).toContain('danglingEsdv');
  });
});
