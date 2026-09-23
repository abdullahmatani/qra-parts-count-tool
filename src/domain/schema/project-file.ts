import { z } from 'zod';
import { ProjectV1, SCHEMA_VERSION_1 } from './v1';
import type { Project } from './types';

/** Name of the project file in the working directory (PRJ-02). */
export const PROJECT_FILE_NAME = 'project.qrapc.json';

/** Schema version written by this build. */
export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION_1;

/** Zod schema for the current version. */
export const ProjectSchema = ProjectV1;

/**
 * Upgrades raw project data by one schema version. Keyed by the version it
 * upgrades *from*; each migration must return data with `schemaVersion` set to
 * the next version. Migrations operate on plain JSON, before validation.
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** Registered migrations. Empty while v1 is the only version. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type ProjectFileErrorKind =
  'invalidJson' | 'notAProject' | 'tooNew' | 'noMigration' | 'invalid';

export class ProjectFileError extends Error {
  readonly kind: ProjectFileErrorKind;
  readonly details: string | undefined;

  constructor(kind: ProjectFileErrorKind, message: string, details?: string) {
    super(message);
    this.name = 'ProjectFileError';
    this.kind = kind;
    this.details = details;
  }
}

export interface ParsedProjectFile {
  project: Project;
  /** Version the file was written in, when a migration ran; otherwise null. */
  migratedFrom: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a project file and upgrades it to the current schema (PRJ-03).
 * Throws {@link ProjectFileError} when the file cannot be used.
 */
export function parseProjectFile(
  text: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  currentVersion: number = CURRENT_SCHEMA_VERSION,
  schema: z.ZodType<Project> = ProjectSchema as unknown as z.ZodType<Project>,
): ParsedProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ProjectFileError(
      'invalidJson',
      'The project file is not valid JSON.',
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    throw new ProjectFileError(
      'notAProject',
      'This file is not a QRA Parts Count project (no schemaVersion).',
    );
  }

  const originalVersion = raw.schemaVersion;
  if (!Number.isInteger(originalVersion) || originalVersion < 1) {
    throw new ProjectFileError('notAProject', `Unknown schema version ${originalVersion}.`);
  }
  if (originalVersion > currentVersion) {
    throw new ProjectFileError(
      'tooNew',
      `The project was saved by a newer version of the tool (schema ${originalVersion}; this build reads up to ${currentVersion}). Update the app to open it.`,
    );
  }

  let data: Record<string, unknown> = raw;
  let version = originalVersion;
  while (version < currentVersion) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new ProjectFileError(
        'noMigration',
        `No migration from schema version ${version} is available.`,
      );
    }
    data = migrate(structuredClone(data));
    const next = data.schemaVersion;
    if (typeof next !== 'number' || next <= version) {
      throw new ProjectFileError(
        'noMigration',
        `Migration from schema version ${version} did not advance the version.`,
      );
    }
    version = next;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ProjectFileError(
      'invalid',
      'The project file does not match the expected structure.',
      z.prettifyError(result.error),
    );
  }
  return {
    project: result.data,
    migratedFrom: originalVersion === currentVersion ? null : originalVersion,
  };
}

/**
 * Serialises a project for writing to disk. Scalars and small objects are
 * pretty-printed; entity arrays are written one entity per line, which keeps
 * large projects (NFR-04) compact while staying readable and diff-friendly.
 */
export function serializeProject(project: Project): string {
  const lines: string[] = [];
  const entries = Object.entries(project);
  entries.forEach(([key, value], index) => {
    const comma = index < entries.length - 1 ? ',' : '';
    const name = JSON.stringify(key);
    if (Array.isArray(value) && value.length > 0 && value.every(isRecord)) {
      const rows = value.map((entity) => `    ${JSON.stringify(entity)}`).join(',\n');
      lines.push(`  ${name}: [\n${rows}\n  ]${comma}`);
    } else {
      const json = JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
      lines.push(`  ${name}: ${json}${comma}`);
    }
  });
  return `{\n${lines.join('\n')}\n}\n`;
}
