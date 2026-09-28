import { AlertTriangle, Check, Eye, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { buildCountTable, findDuplicateTags, type CountTable } from '@/domain/count/count';
import { geometryBounds, unionBoxes } from '@/domain/markup/geometry';
import type { Bin } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { acceptDuplicateCommand, unacceptDuplicateCommand } from './item-commands';
import { useCountEntries } from './useCount';

/** Compact column heading for a bin: ≤1, 1–2, >11 (the full label is the tooltip). */
function shortBinLabel(bin: Bin): string {
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  if (bin.lower === null && bin.upper === null) return '·';
  if (bin.lower === null) return `${bin.upperInclusive ? '≤' : '<'}${n(bin.upper!)}`;
  if (bin.upper === null) return `${bin.lowerInclusive ? '≥' : '>'}${n(bin.lower)}`;
  return `${n(bin.lower)}–${n(bin.upper)}`;
}

/**
 * CNT-06: shows markers from the table. Markers on the open drawing are
 * highlighted in place; otherwise the drawing with the first of them opens,
 * zoomed to them.
 */
function highlight(markerIds: readonly string[]): void {
  const ui = useUiStore.getState();
  const doc = useProjectStore.getState().doc;
  if (!doc || markerIds.length === 0) return;
  const same =
    ui.highlighted.length === markerIds.length &&
    markerIds.every((id) => ui.highlighted.includes(id));
  if (same) {
    ui.setHighlighted([]);
    return;
  }
  ui.setHighlighted([...markerIds]);
  const onActive = markerIds.some((id) => doc.markers[id]?.drawingId === ui.activeDrawingId);
  if (onActive) return;
  const first = doc.markers[markerIds[0]!];
  if (!first) return;
  const box = unionBoxes(
    markerIds
      .map((id) => doc.markers[id])
      .filter((m) => m?.drawingId === first.drawingId)
      .map((m) => geometryBounds(m!.geometry)),
  );
  const pad = 60;
  ui.focusDrawing(
    first.drawingId,
    box && {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    },
  );
  useUiStore.getState().setHighlighted([...markerIds]);
}

function Table({ table }: { table: CountTable }) {
  const { t } = useTranslation();
  const highlighted = useUiStore((s) => s.highlighted);
  const isHighlighted = (ids: readonly string[]) =>
    ids.length > 0 &&
    ids.length === highlighted.length &&
    ids.every((id) => highlighted.includes(id));

  return (
    <div className="space-y-3">
      {table.groups.map((group) => (
        <table
          key={group.binSet.id}
          className="w-full table-fixed border-collapse text-xs tabular-nums"
          data-testid="count-group"
        >
          <caption className="pb-0.5 text-start text-[11px] text-muted-foreground">
            {group.binSet.name}
          </caption>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="w-[38%] py-1 text-start font-medium">
                {t('count.table.type')}
              </th>
              {group.binSet.bins.map((bin) => (
                <th
                  key={bin.id}
                  scope="col"
                  title={bin.label}
                  className="py-1 text-end font-medium"
                >
                  {shortBinLabel(bin)}
                </th>
              ))}
              <th scope="col" className="w-12 py-1 text-end font-semibold">
                {t('count.table.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => {
              const name = row.actuation
                ? `${row.typeName}, ${t(`count.actuation.${row.actuation}`).toLowerCase()}`
                : row.typeName;
              return (
                <tr key={row.key} className="border-b border-border/50" data-testid="count-row">
                  <th scope="row" className="truncate py-1 text-start font-normal" title={name}>
                    {name}
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.binId} className="py-0.5 text-end">
                      {cell.quantity > 0 && (
                        <button
                          type="button"
                          onClick={() => highlight(cell.markerIds)}
                          aria-label={`${name} ${group.binSet.bins.find((b) => b.id === cell.binId)?.label}: ${cell.quantity}`}
                          title={t('count.table.highlight', { count: cell.markerIds.length })}
                          aria-pressed={isHighlighted(cell.markerIds)}
                          className={cn(
                            'min-w-5 rounded px-1 hover:bg-accent',
                            isHighlighted(cell.markerIds) &&
                              'bg-[color-mix(in_oklab,var(--marker-selection)_20%,transparent)] font-semibold',
                          )}
                        >
                          {cell.quantity}
                        </button>
                      )}
                    </td>
                  ))}
                  <td className="py-0.5 text-end font-semibold">{row.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}

      {table.pipeLengths.map((lengths) => (
        <table
          key={lengths.binSet.id}
          className="w-full table-fixed text-xs tabular-nums"
          data-testid="pipe-lengths"
        >
          <caption className="pb-0.5 text-start text-[11px] text-muted-foreground">
            {t('count.table.pipeLengths')}
          </caption>
          <thead>
            <tr className="border-b text-muted-foreground">
              {lengths.binSet.bins.map((bin) => (
                <th key={bin.id} title={bin.label} className="py-1 text-end font-medium">
                  {shortBinLabel(bin)}
                </th>
              ))}
              <th className="w-12 py-1 text-end font-semibold">{t('count.table.total')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {lengths.cells.map((cell) => (
                <td key={cell.binId} className="py-0.5 text-end">
                  {cell.metres > 0 && (
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-accent"
                      onClick={() => highlight(cell.markerIds)}
                    >
                      {cell.metres.toFixed(1)}
                    </button>
                  )}
                </td>
              ))}
              <td className="py-0.5 text-end font-semibold">{lengths.total.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      ))}

      {table.groups.length === 0 && table.pipeLengths.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('count.table.empty')}</p>
      )}
      {table.incomplete.count > 0 && (
        <button
          type="button"
          onClick={() => highlight(table.incomplete.markerIds)}
          title={t('count.table.showIncomplete')}
          className="flex items-center gap-1.5 rounded px-1 text-xs text-marker-warning hover:bg-accent"
          data-testid="count-incomplete"
        >
          <AlertTriangle className="size-3.5" />
          {t('count.table.incomplete', { count: table.incomplete.count })}
        </button>
      )}
    </div>
  );
}

/**
 * The live count for the active segment (CNT-06) or for the whole project in
 * the same layout (CNT-07), with duplicate tags to accept or resolve (CNT-08).
 */
export function CountTablePanel() {
  const { t } = useTranslation();
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const library = useProjectStore((s) => s.doc?.library);
  const pipeLengthCounting = useProjectStore((s) => s.doc?.settings.pipeLengthCounting ?? false);
  const acceptedDuplicates = useProjectStore((s) => s.doc?.acceptedDuplicates);
  const readOnly = useProjectStore((s) => s.readOnly);
  const entries = useCountEntries();
  const [scopeChoice, setScope] = useState<'segment' | 'project'>('segment');
  const scope = activeSegmentId ? scopeChoice : 'project';

  const table = useMemo(
    () =>
      library
        ? buildCountTable(entries, library, scope === 'segment' ? activeSegmentId : null, {
            pipeLengthCounting,
          })
        : null,
    [entries, library, scope, activeSegmentId, pipeLengthCounting],
  );
  const duplicates = useMemo(() => {
    const all = findDuplicateTags(entries, { acceptedDuplicates: acceptedDuplicates ?? [] });
    if (scope === 'project') return all;
    const inSegment = new Set(
      entries.filter((e) => e.segmentId === activeSegmentId).map((e) => e.markerId),
    );
    return all.filter((d) => d.markerIds.some((id) => inSegment.has(id)));
  }, [entries, acceptedDuplicates, scope, activeSegmentId]);

  if (!table) return null;
  return (
    <div className="space-y-2" data-testid="count-table">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={scope}
        onValueChange={(value) => value && setScope(value as 'segment' | 'project')}
        className="w-full"
      >
        <ToggleGroupItem value="segment" disabled={!activeSegmentId} className="flex-1 text-xs">
          {t('count.table.segment')}
        </ToggleGroupItem>
        <ToggleGroupItem value="project" className="flex-1 text-xs">
          {t('count.table.project')}
        </ToggleGroupItem>
      </ToggleGroup>
      <Table table={table} />
      {duplicates.length > 0 && (
        <section className="space-y-1 border-t pt-2" data-testid="duplicates">
          <h3 className="text-xs font-medium">{t('count.duplicates.title')}</h3>
          <p className="text-[11px] text-muted-foreground">{t('count.duplicates.description')}</p>
          <ul className="space-y-0.5">
            {duplicates.map((duplicate) => (
              <li key={duplicate.tag} className="flex items-center gap-1.5 text-xs">
                {duplicate.accepted ? (
                  <Check className="size-3.5 text-muted-foreground" />
                ) : (
                  <AlertTriangle className="size-3.5 text-marker-warning" />
                )}
                <span className="font-mono">{duplicate.tag}</span>
                <span className="truncate text-muted-foreground">
                  {t('count.duplicates.drawings', { count: duplicate.drawingIds.length })}
                </span>
                <span className="ms-auto flex gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-6"
                    aria-label={`${t('count.duplicates.show')} ${duplicate.tag}`}
                    onClick={() => highlight(duplicate.markerIds)}
                  >
                    <Eye />
                  </Button>
                  {duplicate.accepted ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => unacceptDuplicateCommand(duplicate.tag)}
                      disabled={readOnly}
                    >
                      <Undo2 className="size-3" /> {t('count.duplicates.undo')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => acceptDuplicateCommand(duplicate.tag)}
                      disabled={readOnly}
                    >
                      {t('count.duplicates.accept')}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
