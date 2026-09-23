import { useEffect, useRef, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Size2D } from '@/domain/schema/types';
import {
  invertMatrix,
  applyMatrix,
  viewMatrix,
  type Point2,
  type ViewState,
} from './view-transform';

const MAX_W = 200;
const MAX_H = 150;

export interface MinimapProps {
  preview: HTMLCanvasElement;
  drawingSize: Size2D;
  view: ViewState;
  canvasSize: Size2D;
  onNavigate: (centre: Point2) => void;
}

/** Overview of a large sheet with the visible area outlined (DRW-05). */
export function Minimap({ preview, drawingSize, view, canvasSize, onNavigate }: MinimapProps) {
  const { t } = useTranslation();
  const scale = Math.min(MAX_W / drawingSize.width, MAX_H / drawingSize.height);
  const width = Math.round(drawingSize.width * scale);
  const height = Math.round(drawingSize.height * scale);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
  }, [preview, width, height]);

  // Visible area of the main view, as a polygon in minimap pixels.
  const inv = invertMatrix(viewMatrix(view, canvasSize));
  const corners = [
    { x: 0, y: 0 },
    { x: canvasSize.width, y: 0 },
    { x: canvasSize.width, y: canvasSize.height },
    { x: 0, y: canvasSize.height },
  ].map((corner) => {
    const p = applyMatrix(inv, corner);
    return `${(p.x * scale).toFixed(1)},${(p.y * scale).toFixed(1)}`;
  });

  const navigate = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onNavigate({
      x: Math.min(drawingSize.width, Math.max(0, (event.clientX - rect.left) / scale)),
      y: Math.min(drawingSize.height, Math.max(0, (event.clientY - rect.top) / scale)),
    });
  };

  return (
    <div
      className="absolute end-3 bottom-3 overflow-hidden rounded-md border bg-background shadow-md"
      data-testid="minimap"
      aria-label={t('viewer.minimap')}
      role="img"
    >
      <div
        className="relative cursor-crosshair touch-none"
        style={{ width, height }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          navigate(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) navigate(event);
        }}
      >
        <canvas ref={canvasRef} style={{ width, height }} className="block" />
        <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
          <polygon
            points={corners.join(' ')}
            className="fill-sky-500/15 stroke-sky-600"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </div>
  );
}
