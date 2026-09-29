import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  ProjectFileError,
  ProjectSchema,
  parseProjectFile,
  serializeProject,
  type Migration,
} from './project-file';
import { createProject } from './factory';
import {
  FIXED_NOW,
  makeCircleMarker,
  makeDrawing,
  makePopulatedProject,
  makeSettings,
} from '@/test/fixtures';
import { ProjectV1 } from './v1';

function expectFileError(fn: () => unknown, kind: ProjectFileError['kind']) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFileError);
    expect((error as ProjectFileError).kind).toBe(kind);
    return error as ProjectFileError;
  }
  throw new Error(`Expected ProjectFileError(${kind})`);
}

describe('createProject (PRJ-01)', () => {
  it('creates a valid, empty project with defaults applied', () => {
    const project = createProject(
      { name: 'Study', settings: makeSettings({ esdvBoundaryRule: 'both' }) },
      FIXED_NOW,
    );
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.id).toMatch(/^prj_[0-9a-z]{12}$/);
    expect(project.createdAt).toBe(FIXED_NOW.toISOString());
    expect(project.drawings).toEqual([]);
    expect(project.library.equipmentTypes).toEqual([]);
    expect(project.templateMapping).toBeNull();
    expect(project.nextItemSeq).toBe(1);
    expect(project.settings.esdvBoundaryRule).toBe('both');
    expect(project.settings.units.length).toBe('m');
  });

  it('requires an explicit ESDV boundary rule: there is no default (SEG-08)', () => {
    const input = {
      name: 'Study',
      settings: { flangeConvention: 'perJoint' } as unknown as ReturnType<typeof makeSettings>,
    };
    expect(() => createProject(input, FIXED_NOW)).toThrow();
  });
});

describe('serializeProject / parseProjectFile round trip', () => {
  it('parses what it serialises without loss', () => {
    const project = makePopulatedProject();
    const text = serializeProject(project);
    const { project: parsed, migratedFrom } = parseProjectFile(text);
    expect(migratedFrom).toBeNull();
    expect(parsed).toEqual(project);
  });

  it('writes one entity per line for entity arrays', () => {
    const project = makePopulatedProject();
    const text = serializeProject(project);
    const markerLines = text.split('\n').filter((line) => line.includes('"shape":"circle"'));
    expect(markerLines).toHaveLength(2);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('fills defaults for optional fields missing from a hand-written file', () => {
    const minimal = {
      schemaVersion: 1,
      id: 'prj_1',
      name: 'Minimal',
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      settings: { esdvBoundaryRule: 'neither', flangeConvention: 'perFace' },
    };
    const { project } = parseProjectFile(JSON.stringify(minimal));
    expect(project.client).toBe('');
    expect(project.settings.pipeLengthCounting).toBe(false);
    expect(project.settings.units.size).toBe('in');
    expect(project.markers).toEqual([]);
    expect(project.countRevision).toBe('A');
  });
});

describe('parseProjectFile validation (PRJ-03)', () => {
  it('rejects text that is not JSON', () => {
    expectFileError(() => parseProjectFile('{nope'), 'invalidJson');
  });

  it('rejects JSON that is not a project', () => {
    expectFileError(() => parseProjectFile('[1,2,3]'), 'notAProject');
    expectFileError(() => parseProjectFile('{"name":"x"}'), 'notAProject');
    expectFileError(() => parseProjectFile('{"schemaVersion":0}'), 'notAProject');
  });

  it('refuses files written by a newer schema version', () => {
    const error = expectFileError(
      () => parseProjectFile(JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })),
      'tooNew',
    );
    expect(error.message).toMatch(/newer version/);
  });

  it('reports structural problems with details', () => {
    const project = makePopulatedProject();
    const broken = JSON.parse(serializeProject(project));
    broken.items[0].quantity = 0;
    const error = expectFileError(() => parseProjectFile(JSON.stringify(broken)), 'invalid');
    expect(error.details).toMatch(/items/);
  });

  it('rejects a circle marker with rectangle geometry', () => {
    const drawing = makeDrawing();
    const marker = {
      ...makeCircleMarker(drawing.id),
      geometry: { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
    };
    const result = ProjectV1.shape.markers.safeParse([marker]);
    expect(result.success).toBe(false);
  });

  it('rejects an ESDV on a dashed highlight', () => {
    const drawing = makeDrawing();
    const marker = {
      ...makeCircleMarker(drawing.id),
      shape: 'dashedHighlight',
      geometry: { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
      esdv: { tag: 'ESDV-1' },
    };
    expect(ProjectV1.shape.markers.safeParse([marker]).success).toBe(false);
  });

  it('reads markers written before marker shapes as rings', () => {
    const drawing = makeDrawing();
    const marker = { ...makeCircleMarker(drawing.id), style: { labelOffset: null } };
    const result = ProjectV1.shape.markers.parse([marker]);
    expect(result[0]!.style).toEqual({ labelOffset: null, symbol: 'circle', outline: null });
  });

  it('accepts dots, squares and free-form outlines on equipment circles only', () => {
    const drawing = makeDrawing();
    const circle = makeCircleMarker(drawing.id);
    const parse = (marker: unknown) => ProjectV1.shape.markers.safeParse([marker]).success;
    const outline = [
      [0, -1],
      [1, 0],
      [0, 1],
    ];
    expect(parse({ ...circle, style: { symbol: 'dot' } })).toBe(true);
    expect(parse({ ...circle, style: { symbol: 'square' } })).toBe(true);
    expect(parse({ ...circle, style: { symbol: 'freeform', outline } })).toBe(true);
    // A free-form symbol needs its outline, and only it has one.
    expect(parse({ ...circle, style: { symbol: 'freeform' } })).toBe(false);
    expect(parse({ ...circle, style: { symbol: 'square', outline } })).toBe(false);
    // ESDVs and dashed highlights keep their own look.
    expect(parse({ ...circle, esdv: { tag: 'ESDV-1' }, style: { symbol: 'dot' } })).toBe(false);
    expect(
      parse({
        ...circle,
        shape: 'dashedHighlight',
        geometry: { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
        style: { symbol: 'square' },
      }),
    ).toBe(false);
  });

  it('keeps highlighter strokes and their geometry together', () => {
    const drawing = makeDrawing();
    const parse = (marker: unknown) => ProjectV1.shape.markers.safeParse([marker]).success;
    const stroke = {
      type: 'stroke',
      points: [
        [0, 0],
        [50, 10],
      ],
      width: 16,
    };
    const base = { ...makeCircleMarker(drawing.id), shape: 'highlighter', geometry: stroke };
    expect(parse(base)).toBe(true);
    expect(parse({ ...base, geometry: { ...stroke, width: 0 } })).toBe(false);
    expect(parse({ ...base, geometry: { ...stroke, points: [[0, 0]] } })).toBe(false);
    // A highlighter is always a stroke, and a stroke always a highlighter.
    expect(parse({ ...base, geometry: { type: 'circle', cx: 0, cy: 0, r: 5 } })).toBe(false);
    expect(parse({ ...base, shape: 'dashedHighlight' })).toBe(false);
  });

  it('keeps ESDV double lines and their geometry together', () => {
    const drawing = makeDrawing();
    const parse = (marker: unknown) => ProjectV1.shape.markers.safeParse([marker]).success;
    const line = {
      type: 'doubleLine',
      points: [
        [10, 0],
        [10, 30],
      ],
      gap: 6,
    };
    const esdv = { tag: 'ESDV-101' };
    const base = { ...makeCircleMarker(drawing.id), shape: 'doubleLine', geometry: line, esdv };
    expect(parse(base)).toBe(true);
    expect(parse({ ...base, geometry: { ...line, gap: 0 } })).toBe(false);
    expect(parse({ ...base, geometry: { ...line, points: [[10, 0]] } })).toBe(false);
    // A double line is always an ESDV, drawn with double line geometry.
    expect(parse({ ...base, esdv: null })).toBe(false);
    expect(parse({ ...base, geometry: { type: 'circle', cx: 0, cy: 0, r: 5 } })).toBe(false);
    // An ESDV is a ring or a double line, never a highlight.
    expect(parse({ ...base, shape: 'highlighter', geometry: { ...line, type: 'stroke' } })).toBe(
      false,
    );
  });

  it('keeps end flanges, their bar and their data together', () => {
    const drawing = makeDrawing();
    const parse = (marker: unknown) => ProjectV1.shape.markers.safeParse([marker]).success;
    const bar = {
      type: 'doubleLine',
      points: [
        [10, 0],
        [10, 30],
      ],
      gap: 4,
    };
    const base = {
      ...makeCircleMarker(drawing.id),
      shape: 'endFlange',
      geometry: bar,
      endFlange: { tag: 'FL-1', destination: 'flare' },
    };
    expect(parse(base)).toBe(true);
    // Where it goes defaults to the closed drain; files without end flanges still read.
    const read = ProjectV1.shape.markers.parse([{ ...base, endFlange: {} }])[0]!;
    expect(read.endFlange).toEqual({ tag: '', destination: 'closedDrain' });
    expect(ProjectV1.shape.markers.parse([makeCircleMarker(drawing.id)])[0]!.endFlange).toBeNull();
    expect(parse({ ...base, endFlange: { destination: 'sea' } })).toBe(false);
    // An end flange is a bar across the pipe, with its data; only it has the data.
    expect(parse({ ...base, endFlange: null })).toBe(false);
    expect(parse({ ...base, geometry: { type: 'circle', cx: 0, cy: 0, r: 5 } })).toBe(false);
    expect(parse({ ...makeCircleMarker(drawing.id), endFlange: { tag: '' } })).toBe(false);
    // It is not an ESDV.
    expect(parse({ ...base, esdv: { tag: 'ESDV-1' } })).toBe(false);
  });

  it('rejects a bin whose upper edge is below its lower edge', () => {
    const library = {
      binSets: [
        {
          id: 'bns_1',
          name: 'Bad',
          bins: [
            {
              id: 'bin_1',
              label: 'x',
              lower: 4,
              lowerInclusive: false,
              upper: 2,
              upperInclusive: true,
            },
          ],
        },
      ],
    };
    expect(ProjectV1.shape.library.safeParse(library).success).toBe(false);
  });
});

describe('schema migrations (FDS section 5)', () => {
  const v1Text = serializeProject(makePopulatedProject());

  it('runs each migration in order up to the current version', () => {
    const migrations: Record<number, Migration> = {
      1: (data) => ({ ...data, schemaVersion: 2, addedInV2: true }),
      2: (data) => ({ ...data, schemaVersion: 3 }),
    };
    const schema = ProjectV1.extend({ schemaVersion: z.number().int() });
    const { project, migratedFrom } = parseProjectFile(v1Text, migrations, 3, schema as never);
    expect(migratedFrom).toBe(1);
    expect(project.schemaVersion).toBe(3);
  });

  it('fails when a migration is missing', () => {
    expectFileError(() => parseProjectFile(v1Text, {}, 2), 'noMigration');
  });

  it('fails when a migration does not advance the version', () => {
    expectFileError(
      () => parseProjectFile(v1Text, { 1: (data) => ({ ...data, schemaVersion: 1 }) }, 2),
      'noMigration',
    );
  });

  it('does not mutate the input passed to a migration', () => {
    let received: Record<string, unknown> | null = null;
    const migrations: Record<number, Migration> = {
      1: (data) => {
        received = data;
        data.name = 'changed';
        return { ...data, schemaVersion: 2 };
      },
    };
    expectFileError(() => parseProjectFile(v1Text, migrations, 2), 'invalid');
    expect(received).not.toBeNull();
    expect(JSON.parse(v1Text).name).toBe('Test project');
  });
});
