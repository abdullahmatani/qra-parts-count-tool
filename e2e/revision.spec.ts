/**
 * Drawing revision replacement (roadmap #52): the drawing keeps its markers and
 * links; a changed sheet size flags it for review until the user clears it
 * (DRW-07, LNK-05).
 */
import { expect, test } from './fixtures';
import { openMenu } from './helpers';
import { openSeeded, seedProject } from './seed';

const fixturePath = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

test('replaces a drawing with a new revision and flags a size change (DRW-07, LNK-05)', async ({
  app,
}) => {
  const dir = `revision-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [
      {
        file: 'PEFS-2000_multipage.pdf',
        page: 1,
        drawingNo: 'PEFS-2000',
        width: 1191,
        height: 842,
      },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', width: 2384, height: 1684 },
    ],
    {
      segments: [{ id: 'seg_1', label: 'IS-01', colour: 1, drawingIds: ['drw_seed0'] }],
      markers: [
        {
          id: 'mkr_1',
          drawingId: 'drw_seed0',
          segmentId: 'seg_1',
          shape: 'circle',
          geometry: { type: 'circle', cx: 300, cy: 300, r: 12 },
        },
      ],
      links: [
        {
          id: 'lnk_1',
          sourceDrawingId: 'drw_seed1',
          rect: { x: 100, y: 100, width: 200, height: 80 },
          targetDrawingId: 'drw_seed0',
          label: 'To PEFS-2000',
        },
      ],
    },
  );
  await openSeeded(app, dir);
  const page = app.page;

  // Same size (page 2 of the same A3 file): no review needed.
  await openMenu(page, 'Drawing register');
  const register = page.getByRole('dialog', { name: 'Drawing register' });
  await register.getByRole('button', { name: /Replace with a new revision PEFS-2000/ }).click();
  const dialog = page.getByTestId('replace-revision');
  await dialog
    .getByTestId('revision-file-input')
    .setInputFiles(fixturePath('PEFS-2000_multipage.pdf'));
  await expect(dialog.getByText('This is the file the drawing already uses.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Page' }).click();
  await page.getByRole('option', { name: 'Page 2' }).click();
  await expect(dialog.getByText('Same sheet size: markers stay where they are.')).toBeVisible();
  await dialog.getByLabel('New revision').fill('B');
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('now shows rev B')).toBeVisible();

  // Another sheet size (the A1 file): flagged for review.
  await register.getByRole('button', { name: /Replace with a new revision PEFS-2000/ }).click();
  await dialog.getByTestId('revision-file-input').setInputFiles(fixturePath('PEFS-1001_A1.pdf'));
  await expect(dialog.getByTestId('revision-size-warning')).toBeVisible();
  await dialog.getByLabel('New revision').fill('C');
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Escape');

  const list = page.getByTestId('drawing-list');
  await expect(list.getByTestId('drawing-needs-review')).toHaveCount(1);
  await list.getByText('PEFS-2000').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await expect(page.getByTestId('review-banner')).toBeVisible();
  // The marker and the link to this drawing survive.
  await expect(page.locator('[data-marker-id="mkr_1"]')).toBeAttached();

  // The pre-export check lists it until it is marked as reviewed.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await expect(exportDialog.locator('[data-kind="drawingsToReview"]')).toContainText('PEFS-2000');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mark as reviewed' }).click();
  await expect(page.getByTestId('review-banner')).toHaveCount(0);
  await expect(list.getByTestId('drawing-needs-review')).toHaveCount(0);

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
    drawings: {
      id: string;
      revision: string;
      fileName: string;
      page: number;
      needsReview: boolean;
    }[];
    links: { targetDrawingId: string }[];
  };
  expect(project.drawings[0]).toMatchObject({
    id: 'drw_seed0',
    revision: 'C',
    fileName: 'PEFS-1001_A1.pdf',
    page: 1,
    needsReview: false,
  });
  expect(project.links[0]!.targetDrawingId).toBe('drw_seed0');
  // The earlier file stays in drawings/.
  expect(await app.list(dir, 'drawings')).toContain('PEFS-2000_multipage.pdf');
  await app.removeDirectory(dir);
});
