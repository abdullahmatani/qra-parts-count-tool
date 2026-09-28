import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { XY } from '@/domain/markup/geometry';
import { markerKind, markerPaint, markerSegmentIds } from '@/domain/markup/presentation';
import { useMarkerWarnings } from '@/features/count/useCount';
import type { Marker } from '@/domain/schema/types';
import { useProjectStore } from '@/store/project-store';

const WIDTH = 240;

/** ANN-07: a marker's attributes, shown while the pointer rests on it. */
export function MarkerTooltip({
  marker,
  position,
  bounds,
}: {
  marker: Marker;
  position: XY;
  bounds: { width: number; height: number };
}) {
  const { t } = useTranslation();
  const segments = useProjectStore((s) => s.doc?.segments);
  const item = useProjectStore((s) =>
    Object.values(s.doc?.items ?? {}).find((i) => i.markerId === marker.id),
  );
  const type = useProjectStore((s) =>
    item?.equipmentTypeId
      ? s.doc?.library.equipmentTypes.find((e) => e.id === item.equipmentTypeId)
      : undefined,
  );
  const paint = markerPaint(marker, segments ?? {});
  const segmentLabels = markerSegmentIds(marker)
    .map((id) => segments?.[id]?.label)
    .filter(Boolean)
    .join(' / ');
  const shape = markerKind(marker);
  const warnings = useMarkerWarnings().get(marker.id) ?? [];
  const left = position.x + 16 + WIDTH > bounds.width ? position.x - 16 - WIDTH : position.x + 16;
  const top = Math.min(position.y + 16, Math.max(0, bounds.height - 140));

  return (
    <div
      role="tooltip"
      data-testid="marker-tooltip"
      className="pointer-events-none absolute z-20 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      style={{ left, top, width: WIDTH }}
    >
      <div className="flex items-center gap-2 font-medium">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: paint.colour }}
        />
        <span className="truncate">
          {marker.esdv?.tag || item?.tag || t(`markup.shapes.${shape}`)}
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
        <dt>{t('markup.tooltip.segment')}</dt>
        <dd className="truncate text-foreground">{segmentLabels || t('markup.unassigned')}</dd>
        {item ? (
          <>
            <dt>{t('markup.tooltip.item')}</dt>
            <dd className="truncate text-foreground">
              #{item.seq}
              {type ? ` · ${type.name}` : ''}
            </dd>
            {item.nominalSize !== null && (
              <>
                <dt>{t('markup.tooltip.size')}</dt>
                <dd className="text-foreground">
                  {item.sizeUnit === 'DN' ? `DN${item.nominalSize}` : `${item.nominalSize}"`}
                </dd>
              </>
            )}
            {item.quantity !== 1 && (
              <>
                <dt>{t('markup.tooltip.quantity')}</dt>
                <dd className="text-foreground">{item.quantity}</dd>
              </>
            )}
          </>
        ) : marker.esdv || marker.shape === 'highlighter' ? null : (
          <dd className="col-span-2">{t('markup.tooltip.noItem')}</dd>
        )}
      </dl>
      {warnings.map((warning) => (
        <p key={warning} className="mt-1 flex items-center gap-1 text-marker-warning">
          <AlertTriangle className="size-3" /> {t(`markup.warnings.${warning}`)}
        </p>
      ))}
      <p className="mt-1 text-[11px] text-muted-foreground">{t('markup.tooltip.edit')}</p>
    </div>
  );
}
