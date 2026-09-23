/**
 * Seeds a working directory in OPFS with a project file and fixture drawings,
 * for tests of features that come after project creation and import.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AppFixture } from './fixtures';

/** Reads a committed fixture by name, or any file by absolute file URL. */
export function fixture(name: string | URL): Uint8Array {
  return readFileSync(
    typeof name === 'string' ? new URL(`./fixtures/${name}`, import.meta.url) : name,
  );
}

export interface SeedDrawing {
  file: string;
  /** Read the bytes from here instead of e2e/fixtures/<file>. */
  source?: URL;
  page?: number;
  drawingNo: string;
  title?: string;
  revision?: string;
  width: number;
  height: number;
}

export async function seedProject(
  app: AppFixture,
  directory: string,
  drawings: SeedDrawing[],
  extra: Record<string, unknown> = {},
): Promise<{ drawingIds: string[] }> {
  await app.removeDirectory(directory);
  const now = '2026-09-23T10:00:00.000Z';
  const written = new Map<string, Uint8Array>();
  const entries = drawings.map((d, i) => {
    const bytes = fixture(d.source ?? d.file);
    written.set(d.file, bytes);
    return {
      id: `drw_seed${i}`,
      fileName: d.file,
      originalFileName: d.file,
      fileHash: createHash('sha256').update(bytes).digest('hex'),
      fileType: 'pdf',
      page: d.page ?? 1,
      drawingNo: d.drawingNo,
      title: d.title ?? '',
      revision: d.revision ?? 'A',
      size: { width: d.width, height: d.height },
      importedAt: now,
    };
  });
  for (const [file, bytes] of written) await app.writeBytes(directory, `drawings/${file}`, bytes);
  for (const folder of ['cache', 'templates', 'exports', '.backup']) {
    await app.writeText(directory, `${folder}/.keep`, '');
  }
  const project = {
    schemaVersion: 1,
    id: `prj_seed_${directory}`,
    name: `Seeded ${directory}`,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    settings: { esdvBoundaryRule: 'upstream', flangeConvention: 'perJoint' },
    drawings: entries,
    ...extra,
  };
  await app.writeText(directory, 'project.qrapc.json', JSON.stringify(project, null, 2));
  return { drawingIds: entries.map((e) => e.id) };
}

/** Opens a seeded project through the start screen. */
export async function openSeeded(app: AppFixture, directory: string): Promise<void> {
  await app.pickDirectory(directory);
  await app.page.getByRole('button', { name: /Open project/ }).click();
  await app.page.getByTestId('workspace').waitFor();
}
