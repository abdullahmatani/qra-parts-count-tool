import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { Size2D } from '@/domain/schema/types';
import { useElementSize } from '@/hooks/useElementSize';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { isRenderCancelled, type DrawingSource, type RenderTask } from './drawing-source';
import { Minimap } from './Minimap';
import { useDrawingSource } from './useDrawingSource';
import type { ViewerContext, ViewerInteraction, ViewerPointerEvent } from './viewer-context';
import { ViewerControls } from './ViewerControls';
import {
  BASE_SCALE,
  applyMatrix,
  fitView,
  invertMatrix,
  matrixToCss,
  multiplyMatrix,
  panBy,
  rotateBy,
  setZoom,
  viewMatrix,
  zoomAt,
  type Matrix,
  type Point2,
  type ViewState,
} from './view-transform';

/** Delay after the last pan/zoom before the sharp render starts. */
const DETAIL_RENDER_DELAY_MS = 120;
const ZOOM_STEP = 1.25;

export interface DrawingViewerProps {
  drawingId: string;
  /** Rendered in an SVG layer whose user space is drawing coordinates (ANN-02). */
  overlay?: (context: ViewerContext) => ReactNode;
  /** HTML rendered above the canvas in screen coordinates (tooltips, editors). */
  screenOverlay?: (context: ViewerContext) => ReactNode;
  interaction?: ViewerInteraction;
}

function sameView(a: ViewState | null, b: ViewState | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.zoom === b.zoom && a.rotation === b.rotation;
}

/**
 * Drawing canvas with pan, zoom (to 3200 %), fit, rotate and a minimap (DRW-05).
 *
 * Two raster layers are drawn: a low-resolution preview of the whole drawing,
 * repainted on every frame during interaction, and a full-resolution render of
 * just the visible area, made once the view settles. Overlays are SVG in
 * drawing coordinates, so markers stay aligned at every zoom level (ANN-02).
 */
export function DrawingViewer({
  drawingId,
  overlay,
  screenOverlay,
  interaction,
}: DrawingViewerProps) {
  const { t } = useTranslation();
  const drawing = useProjectStore((s) => s.doc?.drawings[drawingId] ?? null);
  const sourceState = useDrawingSource(drawing);
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  const view = useUiStore((s) => s.viewports[drawingId] ?? null);
  const setViewport = useUiStore((s) => s.setViewport);
  const setCursor = useUiStore((s) => s.setCursor);
  const [minimap, setMinimap] = useState(true);

  const ready = sourceState.status === 'ready' ? sourceState : null;
  const drawingSize: Size2D | null = ready?.source.size ?? null;

  // Fit the drawing the first time it is shown.
  useEffect(() => {
    if (ready && size && size.width > 0 && !view) {
      setViewport(drawingId, fitView(ready.source.size, size, 0));
    }
  }, [ready, size, view, drawingId, setViewport]);

  const updateView = useCallback(
    (next: ViewState | ((current: ViewState) => ViewState)) => {
      const current = useUiStore.getState().viewports[drawingId];
      if (!current) return;
      setViewport(drawingId, typeof next === 'function' ? next(current) : next);
    },
    [drawingId, setViewport],
  );

  const context: ViewerContext | null = useMemo(() => {
    if (!view || !size || !drawingSize) return null;
    const matrix = viewMatrix(view, size);
    const inverse = invertMatrix(matrix);
    return {
      drawingId,
      drawingSize,
      canvasSize: size,
      view,
      matrix,
      toDrawing: (p: Point2) => applyMatrix(inverse, p),
      toScreen: (p: Point2) => applyMatrix(matrix, p),
      unitsPerPixel: 1 / (view.zoom * BASE_SCALE),
    };
  }, [view, size, drawingSize, drawingId]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-canvas select-none"
      data-testid="drawing-viewer"
      data-drawing-id={drawingId}
      data-zoom={view?.zoom ?? ''}
      data-rotation={view?.rotation ?? ''}
      data-center-x={view?.x ?? ''}
      data-center-y={view?.y ?? ''}
    >
      {sourceState.status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t('viewer.loading')}
        </div>
      )}
      {sourceState.status === 'error' && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-sm"
        >
          <AlertTriangle className="size-6 text-marker-warning" />
          <p className="font-medium">{t(`viewer.errors.${sourceState.kind}`)}</p>
          <p className="max-w-md text-muted-foreground">{sourceState.message}</p>
        </div>
      )}
      {ready && context && size && (
        <ViewerSurface
          key={drawingId}
          source={ready.source}
          preview={ready.preview}
          context={context}
          size={size}
          overlay={overlay}
          screenOverlay={screenOverlay}
          interaction={interaction}
          updateView={updateView}
          onCursor={setCursor}
        />
      )}
      {ready && context && size && drawingSize && (
        <>
          <ViewerControls
            zoom={context.view.zoom}
            minimap={minimap}
            onZoomIn={() => updateView((v) => setZoom(v, v.zoom * ZOOM_STEP))}
            onZoomOut={() => updateView((v) => setZoom(v, v.zoom / ZOOM_STEP))}
            onActualSize={() => updateView((v) => setZoom(v, 1))}
            onFitPage={() => updateView((v) => fitView(drawingSize, size, v.rotation, 'page'))}
            onFitWidth={() => updateView((v) => fitView(drawingSize, size, v.rotation, 'width'))}
            onRotate={(delta) => updateView((v) => rotateBy(v, delta))}
            onToggleMinimap={() => setMinimap((m) => !m)}
          />
          {minimap && (
            <Minimap
              preview={ready.preview}
              drawingSize={drawingSize}
              view={context.view}
              canvasSize={size}
              onNavigate={(centre) => updateView((v) => ({ ...v, ...centre }))}
            />
          )}
        </>
      )}
    </div>
  );
}

interface ViewerSurfaceProps {
  source: DrawingSource;
  preview: HTMLCanvasElement;
  context: ViewerContext;
  size: Size2D;
  overlay?: DrawingViewerProps['overlay'];
  screenOverlay?: DrawingViewerProps['screenOverlay'];
  interaction?: ViewerInteraction;
  updateView: (next: ViewState | ((current: ViewState) => ViewState)) => void;
  onCursor: (point: Point2 | null) => void;
}

function ViewerSurface({
  source,
  preview,
  context,
  size,
  overlay,
  screenOverlay,
  interaction,
  updateView,
  onCursor,
}: ViewerSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [rendered, setRendered] = useState<{ view: ViewState; size: Size2D } | null>(null);
  const panRef = useRef<{ pointerId: number; last: Point2 } | null>(null);
  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
  const cursorFrame = useRef<number | null>(null);
  const { view, matrix } = context;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  // Preview layer: repaint on every view change (cheap GPU image draw).
  useEffect(() => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(
      matrix[0] * dpr,
      matrix[1] * dpr,
      matrix[2] * dpr,
      matrix[3] * dpr,
      matrix[4] * dpr,
      matrix[5] * dpr,
    );
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 12 * dpr;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, source.size.width, source.size.height);
    ctx.shadowColor = 'transparent';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(preview, 0, 0, source.size.width, source.size.height);
  }, [matrix, size, dpr, preview, source]);

  // Detail layer: sharp render of the visible area once the view settles.
  const previewPixelsPerUnit = preview.width / source.size.width;
  const devicePixelsPerUnit = view.zoom * BASE_SCALE * dpr;
  const needsDetail = devicePixelsPerUnit > previewPixelsPerUnit * 0.9;

  useEffect(() => {
    if (!needsDetail) return;
    const timer = window.setTimeout(() => {
      taskRef.current?.cancel();
      const buffer = (bufferRef.current ??= document.createElement('canvas'));
      const width = Math.round(size.width * dpr);
      const height = Math.round(size.height * dpr);
      buffer.width = width;
      buffer.height = height;
      const task = source.render({
        canvas: buffer,
        view,
        canvasSize: size,
        devicePixelRatio: dpr,
      });
      taskRef.current = task;
      task.promise
        .then(() => {
          const target = detailRef.current;
          const ctx = target?.getContext('2d');
          if (!target || !ctx || taskRef.current !== task) return;
          target.width = width;
          target.height = height;
          ctx.drawImage(buffer, 0, 0);
          setRendered({ view, size });
        })
        .catch((error: unknown) => {
          if (!isRenderCancelled(error)) console.error('Drawing render failed', error);
        });
    }, DETAIL_RENDER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [view, size, dpr, source, needsDetail]);

  useEffect(() => () => taskRef.current?.cancel(), []);

  // Keep the last sharp render aligned while the view moves, until it is redrawn.
  let detailTransform: string | undefined;
  const detailVisible = needsDetail && rendered !== null;
  if (rendered && detailVisible) {
    const same = sameView(rendered.view, view) && rendered.size === size;
    if (!same) {
      const renderedMatrix: Matrix = viewMatrix(rendered.view, rendered.size);
      detailTransform = matrixToCss(multiplyMatrix(matrix, invertMatrix(renderedMatrix)));
    }
  }

  // Wheel zoom at the cursor (non-passive listener so the page does not scroll).
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-event.deltaY * lines * 0.0015);
      updateView((current) => zoomAt(current, size, anchor, factor));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [size, updateView]);

  const toEvent = (event: PointerEvent<HTMLDivElement>): ViewerPointerEvent => {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    return { screen, point: context.toDrawing(screen), native: event };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    const wantsPan =
      event.button === 1 ||
      (event.button === 0 && (spaceRef.current || !interaction?.onPointerDown));
    if (wantsPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
      setPanning(true);
      return;
    }
    interaction?.onPointerDown?.(toEvent(event), context);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      const dx = event.clientX - pan.last.x;
      const dy = event.clientY - pan.last.y;
      pan.last = { x: event.clientX, y: event.clientY };
      updateView((current) => panBy(current, dx, dy));
      return;
    }
    const viewerEvent = toEvent(event);
    if (cursorFrame.current === null) {
      cursorFrame.current = requestAnimationFrame(() => {
        cursorFrame.current = null;
        onCursor(viewerEvent.point);
      });
    }
    interaction?.onPointerMove?.(viewerEvent, context);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setPanning(false);
      return;
    }
    interaction?.onPointerUp?.(toEvent(event), context);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ') {
      spaceRef.current = true;
      event.preventDefault();
      return;
    }
    if (interaction?.onKeyDown?.(event, context)) return;
    const step = 80;
    const handled = (() => {
      switch (event.key) {
        case '+':
        case '=':
          updateView((v) => setZoom(v, v.zoom * ZOOM_STEP));
          return true;
        case '-':
        case '_':
          updateView((v) => setZoom(v, v.zoom / ZOOM_STEP));
          return true;
        case '0':
          updateView((v) => fitView(context.drawingSize, size, v.rotation, 'page'));
          return true;
        case 'ArrowLeft':
          updateView((v) => panBy(v, step, 0));
          return true;
        case 'ArrowRight':
          updateView((v) => panBy(v, -step, 0));
          return true;
        case 'ArrowUp':
          updateView((v) => panBy(v, 0, step));
          return true;
        case 'ArrowDown':
          updateView((v) => panBy(v, 0, -step));
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };

  return (
    <div
      ref={surfaceRef}
      tabIndex={0}
      role="application"
      aria-roledescription="drawing canvas"
      className="absolute inset-0 touch-none outline-none"
      style={{ cursor: panning ? 'grabbing' : (interaction?.cursor ?? 'grab') }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => onCursor(null)}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        interaction?.onDoubleClick?.({ screen, point: context.toDrawing(screen) }, context);
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        if (event.key === ' ') spaceRef.current = false;
      }}
      onBlur={() => {
        spaceRef.current = false;
      }}
    >
      <canvas
        ref={baseRef}
        className="pointer-events-none absolute inset-0"
        style={{ width: size.width, height: size.height }}
        data-testid="viewer-preview-layer"
      />
      <canvas
        ref={detailRef}
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{
          width: size.width,
          height: size.height,
          visibility: detailVisible ? 'visible' : 'hidden',
          transform: detailTransform,
        }}
        data-testid="viewer-detail-layer"
        data-rendered={rendered ? 'true' : 'false'}
      />
      {overlay && (
        <svg
          className="absolute inset-0 overflow-visible"
          width={size.width}
          height={size.height}
          data-testid="viewer-overlay"
        >
          <g transform={matrixToCss(matrix)}>{overlay(context)}</g>
        </svg>
      )}
      {screenOverlay?.(context)}
    </div>
  );
}
