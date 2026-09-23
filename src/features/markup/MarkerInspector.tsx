import { AlertTriangle, Trash2 } from 'lucide-react';
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
import { markerWarnings } from '@/domain/markup/presentation';
import { segmentAppearance } from '@/domain/palette';
import type { Marker, MarkerGeometry } from '@/domain/schema/types';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
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
  const markersRecord = useProjectStore((s) => s.doc?.markers);
  const readOnly = useProjectStore((s) => s.readOnly);
  const segments = useOrderedSegments();
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
    triggerRef.current?.focus();
  }, [editRequest]);

  const first = markers[0];
  if (!first) {
    return <p className="text-sm text-muted-foreground">{t('panels.noItem')}</p>;
  }
  const ids = markers.map((m) => m.id);
  const assignable = markers.filter((m) => !m.esdv);
  const segmentIds = new Set(assignable.map((m) => m.segmentId ?? NO_SEGMENT));
  const segmentValue = segmentIds.size === 1 ? [...segmentIds][0]! : '';
  const warnings = [...new Set(markers.flatMap((m) => markerWarnings(m)))];
  const shape = first.esdv ? 'esdv' : first.geometry.type;

  return (
    <div ref={rootRef} className="space-y-3 text-sm" data-testid="marker-inspector">
      <p className="font-medium">
        {markers.length === 1
          ? t(`markup.shapes.${shape}`)
          : t('markup.inspector.selected', { count: markers.length })}
      </p>
      {markers.length === 1 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {geometrySummary(first.geometry, t).map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="font-mono text-foreground tabular-nums">{value}</dd>
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
