import { AlertTriangle, Plus, ScanSearch, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import type { Marker, MarkerGeometry, MarkerSymbol } from '@/domain/schema/types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
import { itemForMarker } from '@/domain/actions/items';
import { itemsByMarker as indexItems, markerKind } from '@/domain/markup/presentation';
import { HIGHLIGHTER_PENS, strokePen, type HighlighterPen } from '@/domain/markup/highlighter';
import { BulkItemEditor } from '@/features/count/BulkItemEditor';
import { ItemEditor } from '@/features/count/ItemEditor';
import { findSimilarSymbols } from '@/features/assist/find-similar';
import { addItemCommand } from '@/features/count/item-commands';
import { LinkEditor } from '@/features/links/LinkEditor';
import { EndFlangeEditor } from '@/features/segments/EndFlangeEditor';
import { EsdvEditor } from '@/features/segments/EsdvEditor';
import { splitSegmentCommand } from '@/features/segments/segment-commands';
import { useStage } from '@/features/stage/stage';
import {
  assignMarkerIds,
  deleteMarkerIds,
  setHighlighterPenCommand,
  setMarkerSymbolCommand,
} from './marker-commands';
import { SymbolIcon } from './SymbolIcon';

const NO_SEGMENT = '__none__';

function round(n: number): string {
  return n.toFixed(1);
}

function geometrySummary(marker: Marker, t: TFunction): [string, string][] {
  const geometry: MarkerGeometry = marker.geometry;
  switch (geometry.type) {
    case 'circle':
      return [
        [t('markup.inspector.position'), `${round(geometry.cx)}, ${round(geometry.cy)}`],
        marker.style.symbol === 'square'
          ? [t('markup.inspector.size'), `${round(2 * geometry.r)} × ${round(2 * geometry.r)}`]
          : [t('markup.inspector.radius'), round(geometry.r)],
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
    case 'stroke':
      return [
        [
          t('markup.inspector.size'),
          t('markup.inspector.points', { count: geometry.points.length }),
        ],
        [t('markup.inspector.width'), round(geometry.width)],
      ];
    case 'doubleLine': {
      const [[x1, y1], [x2, y2]] = geometry.points;
      return [
        [t('markup.inspector.position'), `${round((x1 + x2) / 2)}, ${round((y1 + y2) / 2)}`],
        [t('markup.inspector.length'), round(Math.hypot(x2 - x1, y2 - y1))],
      ];
    }
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
  const drawingSize = useProjectStore((s) =>
    activeDrawingId ? s.doc?.drawings[activeDrawingId]?.size : undefined,
  );
  const readOnly = useProjectStore((s) => s.readOnly);
  const stage = useStage();
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
    // ESDV, end flange and item editors focus their own fields.
    const marker = markersRecord?.[editRequest.markerId];
    const doc = useProjectStore.getState().doc;
    if (!marker?.esdv && !marker?.endFlange && !(doc && itemForMarker(doc, editRequest.markerId))) {
      triggerRef.current?.focus();
    }
    // Only a new request moves the focus, not later marker edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  const first = markers[0];
  if (!first) {
    if (selectedLinkId) return <LinkEditor linkId={selectedLinkId} />;
    return (
      <p className="text-sm text-muted-foreground">
        {t(stage === 'segments' ? 'panels.noSelection' : 'panels.noItem')}
      </p>
    );
  }
  const ids = markers.map((m) => m.id);
  const assignable = markers.filter((m) => !m.esdv);
  const segmentIds = new Set(assignable.map((m) => m.segmentId ?? NO_SEGMENT));
  const segmentValue = segmentIds.size === 1 ? [...segmentIds][0]! : '';
  const warnings = [...new Set(markers.flatMap((m) => warningMap.get(m.id) ?? []))];
  const shape = markerKind(first);
  // Equipment circles can be redrawn as rings, dots or squares.
  const equipment = markers.filter((m) => !m.esdv && m.geometry.type === 'circle');
  const symbols = new Set(equipment.map((m) => m.style.symbol));
  const symbolValue = symbols.size === 1 ? [...symbols][0]! : '';
  // Highlighter strokes can be repainted with another pen.
  const strokes = markers.filter((m) => m.geometry.type === 'stroke');
  const pens = new Set(
    strokes.map((m) =>
      m.geometry.type === 'stroke' && drawingSize ? strokePen(m.geometry, drawingSize) : null,
    ),
  );
  const penValue = pens.size === 1 ? ([...pens][0] ?? '') : '';
  const item = markers.length === 1 ? itemsByMarker.get(first.id) : undefined;
  const bulkItems =
    markers.length > 1
      ? markers.map((m) => itemsByMarker.get(m.id)).filter((i) => i !== undefined)
      : [];
  // Splitting off a new segment is segment set-up, not counting.
  const splitFrom =
    stage === 'segments' && segmentValue && segmentValue !== NO_SEGMENT
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
      {markers.length === 1 && first.endFlange && <EndFlangeEditor key={first.id} marker={first} />}
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
          {geometrySummary(first, t).map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="font-mono text-foreground tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {strokes.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground" id="marker-pen">
            {t('highlighter.pen')}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={penValue}
            onValueChange={(value) =>
              value &&
              setHighlighterPenCommand(
                strokes.map((m) => m.id),
                value as HighlighterPen,
              )
            }
            disabled={readOnly}
            aria-labelledby="marker-pen"
            className="w-full"
          >
            {HIGHLIGHTER_PENS.map((pen) => (
              <ToggleGroupItem
                key={pen}
                value={pen}
                data-testid={`marker-pen-${pen}`}
                className="flex-1 text-xs"
              >
                {t(`highlighter.pens.${pen}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {equipment.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground" id="marker-symbol">
            {t('markup.inspector.shape')}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={symbolValue}
            onValueChange={(value) => {
              // A free-form outline is drawn around the symbol, not chosen here.
              if (value === 'freeform') toast(t('markup.inspector.freeformHint'));
              else if (value) {
                setMarkerSymbolCommand(
                  equipment.map((m) => m.id),
                  value as Exclude<MarkerSymbol, 'freeform'>,
                );
              }
            }}
            disabled={readOnly}
            aria-labelledby="marker-symbol"
            className="w-full"
          >
            {(['dot', 'circle', 'square', 'freeform'] as const).map((symbol) => (
              <ToggleGroupItem
                key={symbol}
                value={symbol}
                data-testid={`marker-symbol-${symbol}`}
                title={
                  symbol === 'freeform'
                    ? t('markup.inspector.freeformHint')
                    : t(`markup.shapes.${symbol}`)
                }
                className="min-w-0 flex-1 gap-1 px-1 text-xs"
              >
                <SymbolIcon symbol={symbol} />
                <span className="truncate">{t(`markup.shapes.${symbol}`)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
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
