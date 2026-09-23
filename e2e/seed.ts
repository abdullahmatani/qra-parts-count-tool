/**
 * Seeds a working directory in OPFS with a project file and fixture drawings,
 * for tests of features that come after project creation and import.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AppFixture } from './fixtures';

export function fixture(name: string): Uint8Array {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
}

export interface SeedDrawing {
  file: string;
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
  const written = new Set<string>();
  const entries = drawings.map((d, i) => {
    const bytes = fixture(d.file);
    if (!written.has(d.file)) written.add(d.file);
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
  for (const file of written) await app.writeBytes(directory, `drawings/${file}`, fixture(file));
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
