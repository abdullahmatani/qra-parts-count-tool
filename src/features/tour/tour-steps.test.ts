// @vitest-environment node
/**
 * The guided tour: its practice project, and each step's check, walked through
 * in order the way a user would do the tour, with the app's own actions.
 */
import { describe, expect, it } from 'vitest';
import { addItem, updateItem } from '@/domain/actions/items';
import { addLink, updateLink } from '@/domain/actions/links';
import { addMarker } from '@/domain/actions/markers';
import { addNote } from '@/domain/actions/notes';
import { createSegment } from '@/domain/actions/segments';
import { starterLibrary } from '@/domain/count/starter-library';
import { projectToDoc, type ProjectDoc } from '@/domain/model';
import { checkIntegrity, parseProjectFile, serializeProject } from '@/domain/schema';
import type { Marker, MarkerGeometry } from '@/domain/schema/types';
import { buildTourProject } from '@/features/sample/sample-project';
import { SHEET } from '@/features/sample/sample-layout';
import en from '@/i18n/locales/en.json';
import { newId } from '@/lib/ids';
import { TOUR_STEPS, sheetId, spotsBox, type TourContext, type TourStepId } from './tour-steps';

const now = new Date('2026-10-06T09:00:00Z');
const build = () => buildTourProject(starterLibrary(), { hash: 'a'.repeat(64) }, now);

function marker(
  doc: ProjectDoc,
  drawingId: string,
  segmentId: string | null,
  shape: Marker['shape'],
  geometry: MarkerGeometry,
  extra: Partial<Pick<Marker, 'esdv' | 'endFlange'>> = {},
): string {
  const id = newId('mkr');
  addMarker(doc, {
    id,
    drawingId,
    segmentId,
    shape,
    geometry,
    style: { labelOffset: null, symbol: 'circle', outline: null },
    esdv: null,
    endFlange: null,
    ...extra,
  });
  return id;
}

describe('the practice project', () => {
  it('is a valid project with both sample sheets and nothing marked', () => {
    const project = build();
    expect(parseProjectFile(serializeProject(project)).project).toEqual(project);
    expect(checkIntegrity(project)).toEqual([]);
    expect(project.stage).toBe('segments');
    expect(project.drawings.map((d) => [d.drawingNo, d.page])).toEqual([
      ['PEFS-S-001', 1],
      ['PEFS-S-002', 2],
    ]);
    expect(project.segments).toEqual([]);
    expect(project.markers).toEqual([]);
    expect(project.settings.esdvBoundaryRule).toBe('upstream');
  });
});

describe('tour steps', () => {
  it('each have a title and a text, once', () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.keys(en.tour.steps).sort());
    expect(TOUR_STEPS[0]!.id).toBe('welcome');
    expect(TOUR_STEPS.at(-1)!.id).toBe('finish');
  });

  it('point at spots on the sheet', () => {
    for (const step of TOUR_STEPS) {
      for (const spot of step.spots?.at ?? []) {
        expect(spot.x, step.id).toBeGreaterThan(0);
        expect(spot.x, step.id).toBeLessThan(SHEET.width);
        expect(spot.y, step.id).toBeGreaterThan(0);
        expect(spot.y, step.id).toBeLessThan(SHEET.height);
      }
    }
    expect(spotsBox([{ x: 100, y: 200, r: 10 }], 50)).toEqual({
      minX: 40,
      minY: 140,
      maxX: 160,
      maxY: 260,
    });
  });

  it('tick off one by one as the parts count is done', () => {
    const doc = projectToDoc(build());
    const sheet1 = sheetId(doc, 'PEFS-S-001')!;
    const sheet2 = sheetId(doc, 'PEFS-S-002')!;
    const ctx: TourContext = {
      doc,
      activeDrawingId: null,
      tool: 'select',
      itemDefaults: { equipmentTypeId: null, actuation: null },
      highlighted: [],
      findQuery: '',
      lastExportFolder: null,
      visited: [],
    };
    const step = (id: TourStepId) => TOUR_STEPS.find((s) => s.id === id)!;
    // Every check starts unticked in the fresh practice project.
    for (const s of TOUR_STEPS) expect(s.done?.(ctx) ?? false, s.id).toBe(false);

    const expectDone = (id: TourStepId, change: () => void) => {
      expect(step(id).done!(ctx), `${id} before`).toBe(false);
      change();
      expect(step(id).done!(ctx), `${id} after`).toBe(true);
    };
    const typeOf = (category: string) =>
      doc.library.equipmentTypes.find((t) => t.category === category)!.id;

    expectDone('openDrawing', () => (ctx.activeDrawingId = sheet1));
    expectDone('findText', () => (ctx.findQuery = 'ESD-V'));

    let segment = '';
    expectDone('createSegment', () => {
      segment = createSegment(doc, { label: 'IS-01' });
    });

    const esdv = (x: number, y: number, up: string | null, down: string | null) =>
      marker(
        doc,
        sheet1,
        null,
        'circle',
        { type: 'circle', cx: x, cy: y, r: 17 },
        {
          esdv: {
            tag: '',
            nominalSize: null,
            sizeUnit: 'in',
            upstreamSegmentId: up,
            downstreamSegmentId: down,
            boundaryRuleOverride: null,
          },
        },
      );
    let first = '';
    expectDone('esdv', () => {
      first = esdv(150, 300, null, null);
    });
    expectDone('esdvSegments', () => {
      doc.markers[first]!.esdv!.downstreamSegmentId = segment;
    });
    expectDone('moreEsdvs', () => {
      esdv(920, 150, segment, null);
      esdv(950, 560, segment, null);
    });
    expectDone('endFlange', () =>
      marker(
        doc,
        sheet1,
        segment,
        'endFlange',
        {
          type: 'doubleLine',
          points: [
            [610, 478],
            [630, 478],
          ],
          gap: 4,
        },
        { endFlange: { tag: '', destination: 'closedDrain' } },
      ),
    );
    expectDone('links', () => {
      const link = addLink(doc, sheet1, { minX: 1040, minY: 137, maxX: 1160, maxY: 163 })!;
      updateLink(doc, link, { targetDrawingId: sheet2 });
    });
    expectDone('autoTrace', () =>
      marker(doc, sheet1, segment, 'highlighter', {
        type: 'stroke',
        points: [
          [150, 300],
          [470, 300],
        ],
        width: 6,
      }),
    );
    expectDone('dashed', () =>
      marker(doc, sheet1, segment, 'dashedHighlight', {
        type: 'rect',
        x: 460,
        y: 225,
        width: 320,
        height: 150,
      }),
    );
    expectDone('followLink', () => {
      ctx.visited = [sheet1, sheet2];
      ctx.activeDrawingId = sheet2;
      expect(step('followLink').done!(ctx)).toBe(false);
      ctx.activeDrawingId = sheet1;
    });
    expectDone('startCount', () => (doc.stage = 'count'));
    expectDone('equipmentBar', () => {
      ctx.itemDefaults = { equipmentTypeId: typeOf('valve'), actuation: 'manual' };
    });

    const count = (category: string, x: number, size: number | null) => {
      const id = marker(doc, sheet1, segment, 'circle', { type: 'circle', cx: x, cy: 300, r: 16 });
      const item = addItem(doc, id, {
        equipmentTypeId: typeOf(category),
        actuation: category === 'valve' ? 'manual' : null,
      })!;
      if (size !== null) updateItem(doc, item, { nominalSize: size, sizeUnit: 'in' });
      return item;
    };
    expectDone('circleValve', () => count('valve', 280, 8));
    expectDone('stamp', () => {
      count('flange', 220, 8);
      count('flange', 340, 8);
    });
    let accepted = '';
    expectDone('findSimilar', () => {
      accepted = count('valve', 790, 8);
      count('valve', 640, 8);
    });
    expectDone('sizes', () => updateItem(doc, accepted, { nominalSize: 6 }));
    expectDone('countTable', () => (ctx.highlighted = [first]));
    expectDone('note', () =>
      addNote(doc, { segmentId: segment, author: 'QRA', text: 'V-100 is one vessel' }, now),
    );
    expectDone('status', () => {
      doc.segments[segment]!.status = 'counted';
    });
    expectDone('export', () => (ctx.lastExportFolder = 'exports/2026-10-06_090000'));
  });
});
