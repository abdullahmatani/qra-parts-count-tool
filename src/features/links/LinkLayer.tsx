import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { linkStatus } from '@/domain/actions/links';
import { drawingDisplayName } from '@/domain/drawings';
import { ESDV_COLOUR, LINK_OVERLAY } from '@/domain/palette';
import type { DrawingLink } from '@/domain/schema/types';
import { useProjectStore } from '@/store/project-store';

/**
 * LNK-03: drawing links as blue hatched rectangles with a link icon, in
 * drawing coordinates. Links without a valid target are drawn dashed red.
 */
export function LinkLayer({
  links,
  unitsPerPixel: upp,
  selectedId,
  hoveredId,
}: {
  links: readonly DrawingLink[];
  unitsPerPixel: number;
  selectedId: string | null;
  hoveredId: string | null;
}) {
  const { t } = useTranslation();
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const hatchId = `link-hatch-${useId().replace(/:/g, '')}`;
  if (!drawings || links.length === 0) return null;
  return (
    <g data-testid="link-layer">
      <defs>
        <pattern
          id={hatchId}
          patternUnits="userSpaceOnUse"
          width={8 * upp}
          height={8 * upp}
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={8 * upp}
            stroke={LINK_OVERLAY}
            strokeWidth={2 * upp}
            strokeOpacity={0.3}
          />
        </pattern>
      </defs>
      {links.map((link) => {
        const status = linkStatus(link, { drawings });
        const colour = status === 'ok' ? LINK_OVERLAY : ESDV_COLOUR;
        const emphasis = link.id === selectedId ? 2.5 : link.id === hoveredId ? 2 : 1.5;
        const target = link.targetDrawingId ? drawings[link.targetDrawingId] : undefined;
        const title =
          status === 'ok'
            ? t('links.status.ok', { drawing: drawingDisplayName(target!) })
            : t(`links.status.${status}`);
        const icon = 16 * upp;
        return (
          <g
            key={link.id}
            data-testid="drawing-link"
            data-link-id={link.id}
            data-status={status}
            data-selected={link.id === selectedId ? 'true' : 'false'}
          >
            <title>{link.label ? `${link.label}: ${title}` : title}</title>
            <rect
              x={link.rect.x}
              y={link.rect.y}
              width={link.rect.width}
              height={link.rect.height}
              fill={`url(#${hatchId})`}
              stroke={colour}
              strokeWidth={emphasis * upp}
              strokeDasharray={status === 'ok' ? undefined : `${6 * upp} ${4 * upp}`}
            />
            <g transform={`translate(${link.rect.x} ${link.rect.y}) scale(${icon / 24})`}>
              <rect
                width={24}
                height={24}
                rx={4}
                fill="#ffffff"
                stroke={colour}
                strokeWidth={1.5}
              />
              <g fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round">
                <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
                <line x1={8} y1={12} x2={16} y2={12} />
              </g>
            </g>
            {link.label && (
              <text
                x={link.rect.x + icon + 3 * upp}
                y={link.rect.y + 12 * upp}
                fontSize={11 * upp}
                fontWeight={600}
                fill={colour}
                stroke="#ffffff"
                strokeWidth={3 * upp}
                paintOrder="stroke"
              >
                {link.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
