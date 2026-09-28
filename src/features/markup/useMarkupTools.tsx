/**
 * Markup tools on the drawing canvas (ANN-01, ANN-04, ANN-07):
 *
 * - Circle and ESDV: click to place a circle of the last-used size, or drag out
 *   its radius. A new ESDV opens in the panel for its tag, size and segments.
 *   Circles are drawn with the shape chosen in the equipment bar: a ring, a
 *   dot, a square, or a free-form outline dragged around the symbol.
 * - ESDV as a double line (chosen in the ESDV bar): drag across the pipe, with
 *   Shift for a multiple of 45°, or click on a highlighter stroke to put one
 *   square across it. Highlighter strokes are cut where an ESDV crosses them.
 * - Dashed highlight: drag a rectangle around an area, or click points along a
 *   line run and double-click (or press Enter) to finish.
 * - Highlighter: drag to paint over a segment's pipework and equipment in its
 *   colour; hold Shift for a straight stroke. Dragged along a drawn line, the
 *   stroke follows the line round bends and corners (shown dashed until it is
 *   let go). Near an ESDV the stroke snaps to it, and it stops at the ESDV.
 *   Alt paints freely, without either magnet.
 * - Select: click a marker to select it (Shift/Ctrl adds), drag to move the
 *   selection, drag a handle to resize, drag on empty paper to box-select,
 *   double-click to edit, arrow keys to nudge.
 * - Esc cancels a shape being drawn and returns to Select.
 *
 * Pan stays on the middle button or Space + drag; the wheel zooms.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DOT_SCALE,
  MIN_MARKER_SIZE,
  boxFromPoints,
  dedupePoints,
  freeformSymbol,
  geometryCentre,
  geometryHandles,
  markersInBox,
  pickMarker,
  rectGeometry,
  resizeGeometry,
  simplifyPath,
  type Handle,
  type HandleId,
  type XY,
} from '@/domain/markup/geometry';
import {
  doubleLine,
  doubleLineForClick,
  doubleLineGap,
  snapAngle,
  snapToEsdv,
} from '@/domain/markup/esdv-boundary';
import { penWidth } from '@/domain/markup/highlighter';
import { LineTracer, inkMap, type InkMap } from '@/domain/markup/line-trace';
import { UNASSIGNED_COLOUR, segmentAppearance } from '@/domain/palette';
import { isMarkerVisible, itemsByMarker } from '@/domain/markup/presentation';
import type { Marker, MarkerGeometry, MarkerSymbol, StrokeGeometry } from '@/domain/schema/types';
import type { ViewerContext, ViewerInteraction } from '@/features/viewer/viewer-context';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { MarkerCanvas, MarkerList, type MarkerPreview } from './MarkerLayer';
import { useMarkerEntries } from './useMarkerEntries';
import { MarkerTooltip } from './MarkerTooltip';
import { linkAt, linkStatus } from '@/domain/actions/links';
import { LinkLayer } from '@/features/links/LinkLayer';
import { BackButton } from '@/features/links/BackButton';
import { createLinkCommand, followLink } from '@/features/links/link-commands';
import { Draft, SelectionBox, type DraftShape } from './MarkupDrafts';
import {
  moveMarkerIds,
  placeEsdv,
  placeMarker,
  placeStroke,
  resizeMarker,
} from './marker-commands';

/** Pointer travel (CSS px) before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** Hit tolerance around markers and handles, in CSS px. */
const HIT_TOLERANCE = 6;
const HANDLE_TOLERANCE = 8;
/** How near an ESDV (CSS px) a highlighter stroke snaps to it. */
const MAGNET = 14;

type Gesture =
  | { kind: 'none' }
  | { kind: 'circle'; centre: XY; start: XY; radius: number | null }
  | { kind: 'freeform'; points: XY[]; startScreen: XY; lastScreen: XY; dragging: boolean }
  | {
      kind: 'stroke';
      points: XY[];
      startScreen: XY;
      lastScreen: XY;
      dragging: boolean;
      /** Width in drawing units, fixed when the stroke starts. */
      width: number;
      /** The ESDV the stroke snapped to at its start: its end does not snap back to it. */
      fromEsdvId: string | null;
      /** Shift is held: a straight stroke from the start. */
      straight: boolean;
      /** The path the line magnet has traced (drawing units), shown dashed; null without it. */
      trace: XY[] | null;
      /** Where the traced path holds on to a line, if it does. */
      traceEnd: XY | null;
    }
  | { kind: 'doubleLine'; start: XY; startScreen: XY; current: XY; dragging: boolean }
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

/** The ink of the drawing as shown, read once per view (the line magnet). */
const inkMaps = new WeakMap<ImageData, InkMap>();

function inkOf(context: ViewerContext): InkMap | null {
  const pixels = context.readPixels?.();
  if (!pixels) return null;
  let map = inkMaps.get(pixels);
  if (!map) {
    map = inkMap(pixels.data, pixels.width, pixels.height);
    inkMaps.set(pixels, map);
  }
  return map;
}

/**
 * The line magnet of a stroke being painted. It works in the pixels of the
 * view the stroke began in, so a zoom during the stroke does not upset it.
 */
interface StrokeTrace {
  tracer: LineTracer;
  toScreen: (p: XY) => XY;
  toDrawing: (p: XY) => XY;
  unitsPerPixel: number;
}

function traceView(trace: StrokeTrace | null): { trace: XY[] | null; traceEnd: XY | null } {
  if (!trace) return { trace: null, traceEnd: null };
  return {
    trace: trace.tracer.path().map(trace.toDrawing),
    traceEnd: trace.tracer.onLine ? trace.toDrawing(trace.tracer.target) : null,
  };
}

/** Pointer travel (CSS px) between the points kept for a free-form outline. */
const FREEFORM_STEP = 2;

/** The symbol a circle-drawing tool places: ESDVs are always rings. */
function placedSymbol(tool: string, symbol: MarkerSymbol): MarkerSymbol {
  return tool === 'esdv' ? 'circle' : symbol;
}

/** The end of a line from `start` towards `p`, turned to a multiple of 45° when `constrain` is set. */
function lineEnd(start: XY, p: XY, constrain: boolean): XY {
  if (!constrain) return p;
  const angle = snapAngle(Math.atan2(p.y - start.y, p.x - start.x));
  const length = Math.hypot(p.x - start.x, p.y - start.y);
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
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
  const markerSymbol = useUiStore((s) => s.markerSymbol);
  const symbol = placedSymbol(tool, markerSymbol);
  const esdvShape = useUiStore((s) => s.esdvShape);
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
  // Highlighter strokes are painted in the colour of the segment they go to.
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const activeSegment = useProjectStore((s) =>
    activeSegmentId ? s.doc?.segments[activeSegmentId] : undefined,
  );

  const [gesture, setGestureState] = useState<Gesture>(NONE);
  const gestureRef = useRef<Gesture>(NONE);
  const setGesture = useCallback((next: Gesture) => {
    gestureRef.current = next;
    setGestureState(next);
  }, []);
  const traceRef = useRef<StrokeTrace | null>(null);
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
  // The highlighter's magnet: the point on an ESDV a stroke would snap to.
  const [snap, setSnapState] = useState<XY | null>(null);
  const setSnap = useCallback((next: XY | null) => {
    setSnapState((prev) =>
      prev === next || (prev && next && prev.x === next.x && prev.y === next.y) ? prev : next,
    );
  }, []);
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
  const esdvsHere = useMemo(() => visible.filter((m) => m.esdv), [visible]);

  const longSide = drawingSize ? Math.max(drawingSize.width, drawingSize.height) : 1000;
  // The ESDV tool draws a double line across the pipe, or a ring like the
  // circle tool (SEG-01); stamp mode (ANN-09) draws circles too.
  const doubleLineTool = tool === 'esdv' && esdvShape === 'doubleLine';
  const circleLike = tool === 'circle' || (tool === 'esdv' && !doubleLineTool) || tool === 'stamp';
  const drawingTool =
    circleLike || doubleLineTool || tool === 'dashed' || tool === 'highlighter' || tool === 'link';
  const selectLike = !drawingTool;
  const editable = !readOnly;

  /** The ESDV a highlighter stroke snaps to at `point` (none while Alt is held). */
  const snapAt = (
    point: XY,
    context: ViewerContext,
    altKey: boolean,
    exceptId: string | null = null,
  ) => {
    if (altKey) return null;
    const esdvs = exceptId ? esdvsHere.filter((m) => m.id !== exceptId) : esdvsHere;
    return snapToEsdv(esdvs, point, MAGNET * context.unitsPerPixel);
  };

  /** A double line placed with a click: across the highlighter stroke under it, if any. */
  const clickedDoubleLine = (point: XY, context: ViewerContext) => {
    const memory = useUiStore.getState().doubleLine;
    const strokes = visible
      .map((m) => m.geometry)
      .filter((g): g is StrokeGeometry => g.type === 'stroke');
    return doubleLineForClick(
      point,
      strokes,
      { angle: memory.angle, length: memory.lengthFraction * longSide },
      doubleLineGap(context.drawingSize),
      HIT_TOLERANCE * context.unitsPerPixel,
    );
  };

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
      traceRef.current = null;
      setGesture(NONE);
      return true;
    }
    return false;
  };

  const interaction: ViewerInteraction = {
    cursor: drawingTool
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
        if (symbol === 'freeform') {
          setGesture({
            kind: 'freeform',
            points: [point],
            startScreen: screen,
            lastScreen: screen,
            dragging: false,
          });
        } else {
          setGesture({ kind: 'circle', centre: point, start: screen, radius: null });
        }
        return;
      }
      if (doubleLineTool && editable) {
        setGesture({
          kind: 'doubleLine',
          start: point,
          startScreen: screen,
          current: point,
          dragging: false,
        });
        return;
      }
      if (tool === 'highlighter' && editable) {
        const ui = useUiStore.getState();
        // The magnet: a stroke begun near an ESDV starts on it.
        const snapped = snapAt(point, context, event.native.altKey);
        const start = snapped?.point ?? point;
        // The line magnet: the stroke follows the drawing's lines (not with Alt).
        const ink = ui.highlighterFollowsLines && !event.native.altKey ? inkOf(context) : null;
        traceRef.current = ink
          ? {
              tracer: new LineTracer(ink, context.toScreen(start), { exact: snapped !== null }),
              toScreen: context.toScreen,
              toDrawing: context.toDrawing,
              unitsPerPixel: context.unitsPerPixel,
            }
          : null;
        setGesture({
          kind: 'stroke',
          points: [start],
          startScreen: screen,
          lastScreen: screen,
          dragging: false,
          width: penWidth(ui.highlighterPen, context.drawingSize),
          fromEsdvId: snapped?.marker.id ?? null,
          straight: false,
          ...traceView(traceRef.current),
        });
        setSnap(null);
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
      // LNK-02: a click on a link (not on a marker) follows it, or selects it
      // when it leads nowhere yet (see onPointerUp).
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
        case 'stroke': {
          const dragging = g.dragging || screenDistance(screen, g.startScreen) > DRAG_THRESHOLD;
          // Shift draws a straight stroke from where it started, as along a pipe.
          if (event.native.shiftKey) {
            setGesture({
              ...g,
              points: [g.points[0]!, point],
              lastScreen: screen,
              dragging,
              straight: true,
            });
          } else if (screenDistance(screen, g.lastScreen) >= FREEFORM_STEP) {
            const trace = traceRef.current;
            trace?.tracer.moveTo(trace.toScreen(point));
            setGesture({
              ...g,
              points: [...g.points, point],
              lastScreen: screen,
              dragging,
              straight: false,
              ...traceView(trace),
            });
          }
          // Shows the ESDV the stroke will end on if it is let go here.
          setSnap(snapAt(point, context, event.native.altKey, g.fromEsdvId)?.point ?? null);
          return;
        }
        case 'doubleLine':
          setGesture({
            ...g,
            current: lineEnd(g.start, point, event.native.shiftKey),
            dragging: g.dragging || screenDistance(screen, g.startScreen) > DRAG_THRESHOLD,
          });
          return;
        case 'freeform':
          if (screenDistance(screen, g.lastScreen) >= FREEFORM_STEP) {
            setGesture({
              ...g,
              points: [...g.points, point],
              lastScreen: screen,
              dragging: g.dragging || screenDistance(screen, g.startScreen) > DRAG_THRESHOLD,
            });
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
        if (tool === 'highlighter' && editable) {
          setSnap(snapAt(point, context, event.native.altKey)?.point ?? null);
        }
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

    onPointerUp(event, context) {
      const g = gestureRef.current;
      setGesture(NONE);
      const { point } = event;
      switch (g.kind) {
        case 'circle': {
          const ui = useUiStore.getState();
          // A dot is smaller than a ring; the remembered size is the ring's.
          const scale = symbol === 'dot' ? DOT_SCALE : 1;
          const radius = g.radius ?? ui.circleRadiusFraction * longSide * scale;
          if (g.radius !== null) ui.setCircleRadiusFraction(g.radius / scale / longSide);
          const circle = { type: 'circle' as const, cx: g.centre.x, cy: g.centre.y, r: radius };
          if (tool === 'esdv') placeEsdv(drawingId, circle);
          else placeMarker(drawingId, circle, { stamp: tool === 'stamp', symbol });
          return;
        }
        case 'stroke': {
          setSnap(null);
          const trace = traceRef.current;
          traceRef.current = null;
          // Let go near an ESDV, the stroke ends on it.
          const esdvEnd = snapAt(point, context, event.native.altKey, g.fromEsdvId)?.point;
          let end: XY[];
          if (event.native.shiftKey) {
            // A straight stroke goes where it is drawn: the line magnet leaves it alone.
            end = [g.points[0]!, esdvEnd ?? point];
          } else if (trace) {
            // The traced path, in whole pixels: straightened to within a pixel below.
            // Let go near an ESDV, it is traced to the ESDV, not past it.
            trace.tracer.moveTo(trace.toScreen(esdvEnd ?? point));
            end = trace.tracer.path().map(trace.toDrawing);
            if (esdvEnd) end.push(esdvEnd);
          } else {
            end = [...g.points, esdvEnd ?? point];
          }
          const tolerance = trace?.unitsPerPixel ?? context.unitsPerPixel;
          const path = dedupePoints(simplifyPath(end, tolerance), tolerance);
          if (!g.dragging || path.length < 2) {
            toast(t('markup.highlighterHint'), { duration: 2500 });
            return;
          }
          placeStroke(drawingId, {
            type: 'stroke',
            points: path.map((p) => [p.x, p.y]),
            width: g.width,
          });
          return;
        }
        case 'doubleLine': {
          if (!g.dragging) {
            placeEsdv(drawingId, clickedDoubleLine(g.start, context));
            return;
          }
          const end = lineEnd(g.start, point, event.native.shiftKey);
          const length = Math.hypot(end.x - g.start.x, end.y - g.start.y);
          if (length < MIN_MARKER_SIZE) return;
          useUiStore.getState().setDoubleLine({
            lengthFraction: length / longSide,
            angle: Math.atan2(end.y - g.start.y, end.x - g.start.x),
          });
          placeEsdv(drawingId, doubleLine(g.start, end, doubleLineGap(context.drawingSize)));
          return;
        }
        case 'freeform': {
          // Points closer than a screen pixel to the line through their
          // neighbours add nothing to a hand-drawn outline.
          const path = simplifyPath([...g.points, point], context.unitsPerPixel);
          const shape = g.dragging ? freeformSymbol(path) : null;
          if (!shape) {
            toast(t('markup.freeformHint'), { duration: 2500 });
            return;
          }
          placeMarker(drawingId, shape.geometry, {
            stamp: tool === 'stamp',
            symbol: 'freeform',
            outline: shape.outline,
          });
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
        case 'follow': {
          // A link without a (live) target cannot be followed: select it, so
          // the panel shows why and it can be given a target or deleted.
          const doc = useProjectStore.getState().doc;
          const link = doc?.links[g.linkId];
          if (doc && link && linkStatus(link, doc) !== 'ok') {
            useUiStore.getState().setSelectedLink(link.id);
          } else {
            followLink(g.linkId);
          }
          return;
        }
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

    onPointerLeave() {
      setSnap(null);
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
        // Otherwise the workspace shortcut handles it: Select tool, then deselect.
        if (!cancel()) return false;
        useUiStore.getState().setTool('select');
        event.preventDefault();
        return true;
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
        moveMarkerIds(selectedHere, moved.x - origin.x, moved.y - origin.y, {
          coalesceKey: `nudge:${selectedHere.join(',')}`,
        });
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
    const scale = symbol === 'dot' ? DOT_SCALE : 1;
    const r = gesture.radius ?? useUiStore.getState().circleRadiusFraction * longSide * scale;
    draft = { type: 'circle', cx: gesture.centre.x, cy: gesture.centre.y, r, symbol };
  } else if (gesture.kind === 'freeform') {
    draft = { type: 'outline', points: gesture.points };
  } else if (gesture.kind === 'stroke') {
    const colour = activeSegment ? segmentAppearance(activeSegment.colour).hex : UNASSIGNED_COLOUR;
    // Following a line, the path shows dashed until it is let go.
    draft =
      gesture.trace && !gesture.straight
        ? { type: 'trace', points: gesture.trace, end: gesture.traceEnd, colour }
        : { type: 'stroke', points: gesture.points, width: gesture.width, colour };
  } else if (gesture.kind === 'doubleLine' && drawingSize) {
    draft = gesture.dragging
      ? doubleLine(gesture.start, gesture.current, doubleLineGap(drawingSize))
      : null;
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
        {snap && tool === 'highlighter' && (
          <div
            data-testid="esdv-snap"
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-esdv bg-esdv/20 shadow-sm"
            style={{ left: context.toScreen(snap).x, top: context.toScreen(snap).y }}
          />
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
