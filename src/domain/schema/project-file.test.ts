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
