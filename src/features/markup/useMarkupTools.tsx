/**
 * Markup tools on the drawing canvas (ANN-01, ANN-04, ANN-07):
 *
 * - Circle and ESDV: click to place a circle of the last-used size, or drag out
 *   its radius. A new ESDV opens in the panel for its tag, size and segments.
 * - Dashed highlight: drag a rectangle around an area, or click points along a
 *   line run and double-click (or press Enter) to finish.
 * - Select: click a marker to select it (Shift/Ctrl adds), drag to move the
 *   selection, drag a handle to resize, drag on empty paper to box-select,
 *   double-click to edit, arrow keys to nudge.
 *
 * Pan stays on the middle button or Space + drag; the wheel zooms.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  boxFromPoints,
  dedupePoints,
  geometryCentre,
  geometryHandles,
  markersInBox,
  pickMarker,
  rectGeometry,
  resizeGeometry,
  type Handle,
  type HandleId,
  type XY,
} from '@/domain/markup/geometry';
import { moveMarkers } from '@/domain/actions/markers';
import { isMarkerVisible, itemsByMarker } from '@/domain/markup/presentation';
import type { Marker, MarkerGeometry } from '@/domain/schema/types';
import type { ViewerContext, ViewerInteraction } from '@/features/viewer/viewer-context';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { MarkerCanvas, MarkerList, type MarkerPreview } from './MarkerLayer';
import { useMarkerEntries } from './useMarkerEntries';
import { MarkerTooltip } from './MarkerTooltip';
import { linkAt } from '@/domain/actions/links';
import { LinkLayer } from '@/features/links/LinkLayer';
import { BackButton } from '@/features/links/BackButton';
import { createLinkCommand, followLink } from '@/features/links/link-commands';
import { Draft, SelectionBox, type DraftShape } from './MarkupDrafts';
import { moveMarkerIds, placeEsdv, placeMarker, resizeMarker } from './marker-commands';

/** Pointer travel (CSS px) before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** Hit tolerance around markers and handles, in CSS px. */
const HIT_TOLERANCE = 6;
const HANDLE_TOLERANCE = 8;

type Gesture =
  | { kind: 'none' }
  | { kind: 'circle'; centre: XY; start: XY; radius: number | null }
  | { kind: 'rect'; start: XY; startScreen: XY; current: XY; dragging: boolean }
  | { kind: 'polyPoint'; point: XY }
  | {
      kind: 'move';
      ids: string[];
      start: XY;
      startScreen: XY;
      delta: XY;
      dragging: boolean;
      /** Clicked marker: becomes the only selection on a click without a drag. */
      clickedId: string;
      additive: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      handle: HandleId;
      original: MarkerGeometry;
      geometry: MarkerGeometry;
    }
  | { kind: 'box'; start: XY; startScreen: XY; current: XY; dragging: boolean; additive: boolean }
  | { kind: 'link'; start: XY; startScreen: XY; current: XY; dragging: boolean }
  | { kind: 'follow'; linkId: string; startScreen: XY };

const NONE: Gesture = { kind: 'none' };

function screenDistance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const HANDLE_CURSORS: Record<string, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export interface MarkupTools {
  interaction: ViewerInteraction;
  overlay: (context: ViewerContext) => ReactNode;
  screenOverlay: (context: ViewerContext) => ReactNode;
}

export function useMarkupTools(drawingId: string): MarkupTools {
  const { t } = useTranslation();
  const tool = useUiStore((s) => s.tool);
  const filters = useUiStore((s) => s.filters);
  const selection = useUiStore((s) => s.selection);
  const readOnly = useProjectStore((s) => s.readOnly);
  const markers = useProjectStore((s) => s.doc?.markers);
  const items = useProjectStore((s) => s.doc?.items);
  const drawingSize = useProjectStore((s) => s.doc?.drawings[drawingId]?.size ?? null);
  const links = useProjectStore((s) => s.doc?.links);
  const showLinks = useUiStore((s) => s.showLinks);
  const selectedLinkId = useUiStore((s) => s.selectedLinkId);
  const canGoBack = useUiStore((s) => s.navHistory.length > 0);

  const [gesture, setGestureState] = useState<Gesture>(NONE);
  const gestureRef = useRef<Gesture>(NONE);
  const setGesture = useCallback((next: Gesture) => {
    gestureRef.current = next;
    setGestureState(next);
  }, []);
  const [polyline, setPolylineState] = useState<{ points: XY[]; hover: XY | null } | null>(null);
  const polylineRef = useRef(polyline);
  const setPolyline = useCallback((next: typeof polyline) => {
    polylineRef.current = next;
    setPolylineState(next);
  }, []);
  const [hover, setHover] = useState<{
    id: string | null;
    handle: HandleId | null;
    linkId?: string | null;
    screen: XY;
  }>({
    id: null,
    handle: null,
    screen: { x: 0, y: 0 },
  });
  const linksHere = useMemo(
    () => Object.values(links ?? {}).filter((link) => link.sourceDrawingId === drawingId),
    [links, drawingId],
  );

  // Markers the tools can see and pick: on this drawing and not filtered out.
  const visible = useMemo(() => {
    const index = itemsByMarker(items ?? {});
    return Object.values(markers ?? {}).filter(
      (m) => m.drawingId === drawingId && isMarkerVisible(m, index.get(m.id), filters),
    );
  }, [markers, items, filters, drawingId]);
  const visibleById = useMemo(() => new Map(visible.map((m) => [m.id, m])), [visible]);
  const selectedHere = useMemo(
    () => selection.filter((id) => visibleById.has(id)),
    [selection, visibleById],
  );
  const single: Marker | null =
    selectedHere.length === 1 ? (visibleById.get(selectedHere[0]!) ?? null) : null;

  const longSide = drawingSize ? Math.max(drawingSize.width, drawingSize.height) : 1000;
  // The ESDV tool draws circles like the circle tool (SEG-01).
  const circleLike = tool === 'circle' || tool === 'esdv';
  const selectLike = !circleLike && tool !== 'dashed' && tool !== 'link';
  const editable = !readOnly;

  const handlesOf = (marker: Marker | null, geometry?: MarkerGeometry): Handle[] =>
    marker && editable ? geometryHandles(geometry ?? marker.geometry) : [];

  /**
   * The resize handle under the pointer. On a small marker the handles crowd its
   * centre, so a handle only wins when the pointer is nearer to it than to the
   * centre; pressing the middle of a marker always moves it.
   */
  const handleAt = (screen: XY, context: ViewerContext): Handle | null => {
    if (!selectLike || !single) return null;
    const centre = context.toScreen(geometryCentre(single.geometry));
    let best: Handle | null = null;
    let bestDistance = HANDLE_TOLERANCE;
    for (const handle of handlesOf(single)) {
      const distance = screenDistance(context.toScreen(handle), screen);
      if (distance <= bestDistance && distance < screenDistance(centre, screen)) {
        best = handle;
        bestDistance = distance;
      }
    }
    return best;
  };

  /** Ends the line run; points closer than 3 px (a double-click) are merged. */
  const finishPolyline = (context: ViewerContext) => {
    const current = polylineRef.current;
    setPolyline(null);
    if (!current) return;
    const points = dedupePoints(current.points, 3 * context.unitsPerPixel);
    if (points.length < 2) return;
    placeMarker(drawingId, { type: 'polyline', points: points.map((p) => [p.x, p.y]) });
  };

  const cancel = (): boolean => {
    if (polylineRef.current) {
      setPolyline(null);
      return true;
    }
    if (gestureRef.current.kind !== 'none') {
      setGesture(NONE);
      return true;
    }
    return false;
  };

  const interaction: ViewerInteraction = {
    cursor:
      circleLike || tool === 'dashed' || tool === 'link'
        ? 'crosshair'
        : gesture.kind === 'move' && gesture.dragging
          ? 'grabbing'
          : hover.handle
            ? (HANDLE_CURSORS[hover.handle] ?? 'move')
            : hover.id
              ? editable
                ? 'move'
                : 'pointer'
              : hover.linkId
                ? 'pointer'
                : 'default',

    onPointerDown(event, context) {
      if (event.native.button !== 0) return;
      event.native.currentTarget.setPointerCapture(event.native.pointerId);
      const { point, screen } = event;
      const additive = event.native.shiftKey || event.native.ctrlKey || event.native.metaKey;

      if (circleLike && editable) {
        setGesture({ kind: 'circle', centre: point, start: screen, radius: null });
        return;
      }
      if (tool === 'dashed' && editable) {
        if (polylineRef.current) setGesture({ kind: 'polyPoint', point });
        else
          setGesture({
            kind: 'rect',
            start: point,
            startScreen: screen,
            current: point,
            dragging: false,
          });
        return;
      }
      if (tool === 'link' && editable) {
        setGesture({
          kind: 'link',
          start: point,
          startScreen: screen,
          current: point,
          dragging: false,
        });
        return;
      }
      if (!selectLike) return;

      const handle = handleAt(screen, context);
      if (handle && single) {
        setGesture({
          kind: 'resize',
          id: single.id,
          handle: handle.id,
          original: single.geometry,
          geometry: single.geometry,
        });
        return;
      }
      const hit = pickMarker(visible, point, HIT_TOLERANCE * context.unitsPerPixel);
      const ui = useUiStore.getState();
      if (hit) {
        let next = ui.selection;
        if (additive) {
          next = next.includes(hit.id) ? next.filter((id) => id !== hit.id) : [...next, hit.id];
        } else if (!next.includes(hit.id)) {
          next = [hit.id];
        }
        if (next !== ui.selection) ui.setSelection(next);
        if (editable && next.includes(hit.id)) {
          setGesture({
            kind: 'move',
            ids: next.filter((id) => visibleById.has(id)),
            start: point,
            startScreen: screen,
            delta: { x: 0, y: 0 },
            dragging: false,
            clickedId: hit.id,
            additive,
          });
        }
        return;
      }
      // LNK-02: a click on a link (not on a marker) follows it.
      const link = showLinks ? linkAt(linksHere, point, 0) : null;
      if (link && !additive) {
        setGesture({ kind: 'follow', linkId: link.id, startScreen: screen });
        return;
      }
      setGesture({
        kind: 'box',
        start: point,
        startScreen: screen,
        current: point,
        dragging: false,
        additive,
      });
    },

    onPointerMove(event, context) {
      const { point, screen } = event;
      const g = gestureRef.current;
      switch (g.kind) {
        case 'circle':
          if (screenDistance(screen, g.start) > DRAG_THRESHOLD) {
            setGesture({ ...g, radius: Math.hypot(point.x - g.centre.x, point.y - g.centre.y) });
          }
          return;
        case 'rect':
          setGesture({
            ...g,
            current: point,
            dragging: g.dragging || screenDistance(screen, g.startScreen) > DRAG_THRESHOLD,
          });
          return;
        case 'move':
          setGesture({
            ...g,
            delta: { x: point.x - g.start.x, y: point.y - g.start.y },
            dragging: g.dragging || screenDistance(screen, g.startScreen) > DRAG_THRESHOLD - 1,
          });
          return;
        case 'resize':
          setGesture({ ...g, geometry: resizeGeometry(g.original, g.handle, point) });
          return;
        case 'box':
        case 'link':
          setGesture({
            ...g,
            current: point,
            dragging: g.dragging || screenDistance(screen, g.startScreen) > DRAG_THRESHOLD,
          });
          return;
        case 'follow':
          if (screenDistance(screen, g.startScreen) > DRAG_THRESHOLD) setGesture(NONE);
          return;
        default:
          break;
      }
      if (polylineRef.current) {
        setPolyline({ ...polylineRef.current, hover: point });
        return;
      }
      if (!selectLike) {
        if (hover.id || hover.handle) setHover({ id: null, handle: null, screen });
        return;
      }
      const handle = handleAt(screen, context);
      const hit = handle ? null : pickMarker(visible, point, HIT_TOLERANCE * context.unitsPerPixel);
      const id = hit?.id ?? null;
      const linkId = !id && !handle && showLinks ? (linkAt(linksHere, point, 0)?.id ?? null) : null;
      if (
        id !== hover.id ||
        (handle?.id ?? null) !== hover.handle ||
        linkId !== (hover.linkId ?? null) ||
        id ||
        linkId
      ) {
        setHover({ id, handle: handle?.id ?? null, linkId, screen });
      }
    },

    onPointerUp(event) {
      const g = gestureRef.current;
      setGesture(NONE);
      const { point } = event;
      switch (g.kind) {
        case 'circle': {
          const ui = useUiStore.getState();
          const radius = g.radius ?? ui.circleRadiusFraction * longSide;
          if (g.radius !== null) ui.setCircleRadiusFraction(g.radius / longSide);
          const circle = { type: 'circle' as const, cx: g.centre.x, cy: g.centre.y, r: radius };
          if (tool === 'esdv') placeEsdv(drawingId, circle);
          else placeMarker(drawingId, circle);
          return;
        }
        case 'rect':
          if (g.dragging) {
            const geometry = rectGeometry(g.start, point);
            if (geometry.type === 'rect' && geometry.width > 0 && geometry.height > 0) {
              placeMarker(drawingId, geometry);
            }
          } else {
            setPolyline({ points: [g.start], hover: null });
          }
          return;
        case 'polyPoint': {
          const current = polylineRef.current;
          if (current) setPolyline({ points: [...current.points, g.point], hover: point });
          return;
        }
        case 'move':
          if (g.dragging) {
            moveMarkerIds(g.ids, g.delta.x, g.delta.y);
          } else if (!g.additive && g.ids.length > 1) {
            useUiStore.getState().setSelection([g.clickedId]);
          }
          return;
        case 'resize':
          if (g.geometry !== g.original) resizeMarker(g.id, g.geometry);
          return;
        case 'link': {
          if (g.dragging) {
            const box = boxFromPoints(g.start, point);
            if (box.maxX > box.minX && box.maxY > box.minY) createLinkCommand(drawingId, box);
          } else {
            // A click with the link tool selects a link for editing.
            useUiStore.getState().setSelectedLink(linkAt(linksHere, point, 0)?.id ?? null);
          }
          return;
        }
        case 'follow':
          followLink(g.linkId);
          return;
        case 'box': {
          const ui = useUiStore.getState();
          if (!g.dragging) {
            if (!g.additive) {
              ui.setSelection([]);
              ui.setSelectedLink(null);
            }
            return;
          }
          const ids = markersInBox(visible, boxFromPoints(g.start, point)).map((m) => m.id);
          ui.setSelection(g.additive ? [...new Set([...ui.selection, ...ids])] : ids);
          return;
        }
        default:
          return;
      }
    },

    onDoubleClick(event, context) {
      if (polylineRef.current) {
        finishPolyline(context);
        return;
      }
      if (!selectLike) return;
      const hit = pickMarker(visible, event.point, HIT_TOLERANCE * context.unitsPerPixel);
      if (hit) useUiStore.getState().requestEdit(hit.id);
    },

    onKeyDown(event, context) {
      if (event.key === 'Escape') {
        if (cancel()) {
          event.preventDefault();
          return true;
        }
        return false;
      }
      if (polylineRef.current) {
        if (event.key === 'Enter') {
          event.preventDefault();
          finishPolyline(context);
          return true;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          const points = polylineRef.current.points.slice(0, -1);
          setPolyline(points.length ? { ...polylineRef.current, points } : null);
          return true;
        }
      }
      // Arrow keys nudge the selection by one screen pixel (ten with Shift).
      const arrows: Record<string, XY> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const arrow = event.altKey || event.ctrlKey || event.metaKey ? undefined : arrows[event.key];
      if (arrow && selectLike && editable && selectedHere.length > 0) {
        const step = event.shiftKey ? 10 : 1;
        const origin = context.toDrawing({ x: 0, y: 0 });
        const moved = context.toDrawing({ x: arrow.x * step, y: arrow.y * step });
        event.preventDefault();
        const dx = moved.x - origin.x;
        const dy = moved.y - origin.y;
        useProjectStore
          .getState()
          .apply(
            t('markup.history.move', { count: selectedHere.length }),
            (draft) => moveMarkers(draft, selectedHere, dx, dy),
            { coalesceKey: `nudge:${selectedHere.join(',')}` },
          );
        return true;
      }
      return false;
    },
  };

  const preview: MarkerPreview | null = useMemo(() => {
    if (gesture.kind === 'move' && gesture.dragging) {
      return { kind: 'move', ids: new Set(gesture.ids), dx: gesture.delta.x, dy: gesture.delta.y };
    }
    if (gesture.kind === 'resize')
      return { kind: 'resize', id: gesture.id, geometry: gesture.geometry };
    return null;
  }, [gesture]);

  const hoveredId = gesture.kind === 'none' ? hover.id : null;
  const entries = useMarkerEntries(drawingId);

  let draft: DraftShape | null = null;
  if (gesture.kind === 'circle') {
    const r = gesture.radius ?? useUiStore.getState().circleRadiusFraction * longSide;
    draft = { type: 'circle', cx: gesture.centre.x, cy: gesture.centre.y, r };
  } else if ((gesture.kind === 'rect' || gesture.kind === 'link') && gesture.dragging) {
    draft = rectGeometry(gesture.start, gesture.current);
  } else if (polyline) {
    const points = polyline.hover ? [...polyline.points, polyline.hover] : polyline.points;
    draft = { type: 'line', points };
  }

  // Shapes being drawn are few, so they stay SVG in drawing coordinates.
  const overlay = (context: ViewerContext) => (
    <g
      className="markup-layer"
      style={{ '--upp': String(context.unitsPerPixel) } as React.CSSProperties}
    >
      {showLinks && (
        <LinkLayer
          links={linksHere}
          unitsPerPixel={context.unitsPerPixel}
          selectedId={selectedLinkId}
          hoveredId={gesture.kind === 'none' ? (hover.linkId ?? null) : null}
        />
      )}
      <Draft shape={draft} />
    </g>
  );

  const screenOverlay = (context: ViewerContext) => {
    const resizing = gesture.kind === 'resize' ? gesture.geometry : undefined;
    const moving = gesture.kind === 'move' && gesture.dragging;
    const handles = selectLike && !moving ? handlesOf(single, resizing) : [];
    return (
      <>
        <MarkerCanvas context={context} entries={entries} preview={preview} hoveredId={hoveredId} />
        <MarkerList entries={entries} />
        {handles.map((handle) => {
          const p = context.toScreen(handle);
          return (
            <div
              key={handle.id}
              data-testid="marker-handle"
              data-handle={handle.id}
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[var(--marker-selection)] bg-white shadow-sm"
              style={{ left: p.x, top: p.y }}
            />
          );
        })}
        {gesture.kind === 'box' && gesture.dragging && (
          <SelectionBox a={context.toScreen(gesture.start)} b={context.toScreen(gesture.current)} />
        )}
        {canGoBack && <BackButton />}
        {polyline && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-foreground/85 px-3 py-1 text-xs text-background shadow"
          >
            {t('markup.polylineHint')}
          </div>
        )}
        {hoveredId && visibleById.get(hoveredId) && (
          <MarkerTooltip
            marker={visibleById.get(hoveredId)!}
            position={hover.screen}
            bounds={context.canvasSize}
          />
        )}
      </>
    );
  };

  return { interaction, overlay, screenOverlay };
}
