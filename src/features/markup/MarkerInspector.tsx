import { AlertTriangle, Plus, ScanSearch, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMarkerWarnings } from '@/features/count/useCount';
import { segmentAppearance } from '@/domain/palette';
import type { Marker, MarkerGeometry } from '@/domain/schema/types';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
import { itemForMarker } from '@/domain/actions/items';
import { itemsByMarker as indexItems } from '@/domain/markup/presentation';
import { BulkItemEditor } from '@/features/count/BulkItemEditor';
import { ItemEditor } from '@/features/count/ItemEditor';
import { findSimilarSymbols } from '@/features/assist/find-similar';
import { addItemCommand } from '@/features/count/item-commands';
import { LinkEditor } from '@/features/links/LinkEditor';
import { EsdvEditor } from '@/features/segments/EsdvEditor';
import { splitSegmentCommand } from '@/features/segments/segment-commands';
import { assignMarkerIds, deleteMarkerIds } from './marker-commands';

const NO_SEGMENT = '__none__';

function round(n: number): string {
  return n.toFixed(1);
}

function geometrySummary(geometry: MarkerGeometry, t: TFunction): [string, string][] {
  switch (geometry.type) {
    case 'circle':
      return [
        [t('markup.inspector.position'), `${round(geometry.cx)}, ${round(geometry.cy)}`],
        [t('markup.inspector.radius'), round(geometry.r)],
      ];
    case 'rect':
      return [
        [t('markup.inspector.position'), `${round(geometry.x)}, ${round(geometry.y)}`],
        [t('markup.inspector.size'), `${round(geometry.width)} × ${round(geometry.height)}`],
      ];
    case 'polyline':
      return [
        [
          t('markup.inspector.size'),
          t('markup.inspector.points', { count: geometry.points.length }),
        ],
      ];
  }
}

/**
 * The selected markers on the active drawing: shape, segment and warnings,
 * with segment reassignment (ANN-03) and delete (ANN-04). Double-clicking a
 * marker focuses this panel (ANN-07); the count item fields join it with the
 * item editor (roadmap #26).
 */
export function MarkerInspector() {
  const { t } = useTranslation();
  const selection = useUiStore((s) => s.selection);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const editRequest = useUiStore((s) => s.editRequest);
  const selectedLinkId = useUiStore((s) => s.selectedLinkId);
  const markersRecord = useProjectStore((s) => s.doc?.markers);
  const readOnly = useProjectStore((s) => s.readOnly);
  const segments = useOrderedSegments();
  const warningMap = useMarkerWarnings();
  const items = useProjectStore((s) => s.doc?.items);
  const itemsByMarker = useMemo(() => indexItems(items ?? {}), [items]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const markers = useMemo(
    () =>
      selection
        .map((id) => markersRecord?.[id])
        .filter((m): m is Marker => !!m && m.drawingId === activeDrawingId),
    [selection, markersRecord, activeDrawingId],
  );

  useEffect(() => {
    if (!editRequest) return;
    rootRef.current?.scrollIntoView({ block: 'nearest' });
    // ESDV and item editors focus their own fields.
    const marker = markersRecord?.[editRequest.markerId];
    const doc = useProjectStore.getState().doc;
    if (!marker?.esdv && !(doc && itemForMarker(doc, editRequest.markerId))) {
      triggerRef.current?.focus();
    }
    // Only a new request moves the focus, not later marker edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  const first = markers[0];
  if (!first) {
    if (selectedLinkId) return <LinkEditor linkId={selectedLinkId} />;
    return <p className="text-sm text-muted-foreground">{t('panels.noItem')}</p>;
  }
  const ids = markers.map((m) => m.id);
  const assignable = markers.filter((m) => !m.esdv);
  const segmentIds = new Set(assignable.map((m) => m.segmentId ?? NO_SEGMENT));
  const segmentValue = segmentIds.size === 1 ? [...segmentIds][0]! : '';
  const warnings = [...new Set(markers.flatMap((m) => warningMap.get(m.id) ?? []))];
  const shape = first.esdv ? 'esdv' : first.geometry.type;
  const item = markers.length === 1 ? itemsByMarker.get(first.id) : undefined;
  const bulkItems =
    markers.length > 1
      ? markers.map((m) => itemsByMarker.get(m.id)).filter((i) => i !== undefined)
      : [];
  const splitFrom =
    segmentValue && segmentValue !== NO_SEGMENT
      ? segments.find((segment) => segment.id === segmentValue)
      : undefined;

  return (
    <div ref={rootRef} className="space-y-3 text-sm" data-testid="marker-inspector">
      <p className="font-medium">
        {markers.length === 1
          ? t(`markup.shapes.${shape}`)
          : t('markup.inspector.selected', { count: markers.length })}
      </p>
      {markers.length === 1 && first.esdv && <EsdvEditor key={first.id} marker={first} />}
      {bulkItems.length > 0 && (
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-xs font-medium">
            {t('count.bulk.title', { count: bulkItems.length })}
          </p>
          <BulkItemEditor items={bulkItems} />
        </div>
      )}
      {markers.length === 1 && !first.esdv && item && <ItemEditor key={item.id} item={item} />}
      {markers.length === 1 && !first.esdv && !item && first.geometry.type === 'circle' && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {t('count.item.noItem')}
          <Button
            size="sm"
            variant="outline"
            onClick={() => addItemCommand(first.id)}
            disabled={readOnly}
          >
            <Plus /> {t('count.item.addItem')}
          </Button>
        </div>
      )}
      {markers.length === 1 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {geometrySummary(first.geometry, t).map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="font-mono text-foreground tabular-nums">
                <bdi dir="ltr">{value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {assignable.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="marker-segment">
            {t('markup.inspector.segment')}
          </label>
          <Select
            value={segmentValue}
            onValueChange={(value) =>
              assignMarkerIds(
                assignable.map((m) => m.id),
                value === NO_SEGMENT ? null : value,
              )
            }
            disabled={readOnly}
          >
            <SelectTrigger id="marker-segment" ref={triggerRef} className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SEGMENT}>{t('markup.noSegment')}</SelectItem>
              {segments.map((segment) => (
                <SelectItem key={segment.id} value={segment.id}>
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-sm"
                    style={{ background: segmentAppearance(segment.colour).cssVar }}
                  />
                  {segment.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {splitFrom && (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          title={t('markup.inspector.splitHint', { label: splitFrom.label })}
          onClick={() =>
            splitSegmentCommand(
              splitFrom.id,
              assignable.map((m) => m.id),
            )
          }
          disabled={readOnly}
        >
          <Scissors /> {t('markup.inspector.split')}
        </Button>
      )}
      {markers.length === 1 && first.geometry.type === 'circle' && item?.equipmentTypeId && (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          title={t('assist.findHint')}
          onClick={() => void findSimilarSymbols(first.id)}
          disabled={readOnly}
        >
          <ScanSearch /> {t('assist.find')}
        </Button>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="flex items-center gap-1.5 text-xs text-marker-warning">
          <AlertTriangle className="size-3.5" /> {t(`markup.warnings.${warning}`)}
        </p>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => deleteMarkerIds(ids)}
        disabled={readOnly}
        className="text-destructive"
      >
        <Trash2 /> {t('markup.inspector.delete')}
      </Button>
    </div>
  );
}
