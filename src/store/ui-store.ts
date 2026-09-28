/**
 * Transient interface state: what is open, selected and visible. None of it is
 * part of the project file, and none of it is undoable.
 */
import { create } from 'zustand';
import type { ItemDefaults } from '@/domain/actions/items';
import type { EsdvShape } from '@/domain/esdv';
import { DOUBLE_LINE_LENGTH_FRACTION } from '@/domain/markup/esdv-boundary';
import type { Box } from '@/domain/markup/geometry';
import type { HighlighterPen } from '@/domain/markup/highlighter';
import type { MarkerFilterState } from '@/domain/markup/presentation';
import type { MarkerSymbol } from '@/domain/schema/types';

export type Tool = 'select' | 'circle' | 'dashed' | 'highlighter' | 'link' | 'esdv' | 'stamp';

export interface Viewport {
  /** Drawing coordinate at the centre of the view. */
  x: number;
  y: number;
  /** Zoom factor, 1 = 100 %. */
  zoom: number;
  /** View rotation in degrees (DRW-05). */
  rotation: 0 | 90 | 180 | 270;
}

export type MarkerFilters = MarkerFilterState;

/** Default circle radius as a fraction of the drawing's longer side. */
export const DEFAULT_CIRCLE_RADIUS_FRACTION = 1 / 200;

/** The size and direction of the last ESDV double line drawn. */
export interface DoubleLineMemory {
  /** Length as a fraction of the drawing's longer side. */
  lengthFraction: number;
  /** Angle in radians, y down: upright across a horizontal pipe at first. */
  angle: number;
}

/** Which field of the edit panel gets the focus: `auto` picks the first one to fill in. */
export type EditField = 'auto' | 'type' | 'size' | 'tag';

export type RightPanelSection = 'segment' | 'count' | 'item' | 'notes';

export type DialogName =
  | 'settings'
  | 'newProject'
  | 'export'
  | 'library'
  | 'templateMapper'
  | 'drawingRegister'
  | 'backups'
  | 'shortcuts'
  | 'openZip'
  | 'linkSuggestions'
  | 'newSegment'
  | null;

export interface UiState {
  activeDrawingId: string | null;
  /** Drawings open as tabs (DRW-06). */
  openDrawingIds: string[];
  /**
   * DRW-06: two drawings side by side. `activeDrawingId` is whichever pane
   * was used last, so panels and shortcuts follow it.
   */
  split: { left: string; right: string } | null;
  activeSegmentId: string | null;
  tool: Tool;
  selection: string[];
  /** Markers highlighted from the count table (CNT-06). */
  highlighted: string[];
  viewports: Record<string, Viewport>;
  /** DRW-09: CAD layers hidden per drawing, for this session. */
  hiddenLayers: Record<string, string[]>;
  cursor: { x: number; y: number } | null;
  showLabels: boolean;
  showLinks: boolean;
  filters: MarkerFilters;
  dialog: DialogName;
  /** Offline readiness reported by the service worker. */
  offlineReady: boolean;
  /** Size of the last circle drawn, as a fraction of the drawing's longer side. */
  circleRadiusFraction: number;
  /** How the next equipment marker is drawn (ring, dot, square or free-form outline). */
  markerSymbol: MarkerSymbol;
  /** The pen the Highlighter tool paints with. */
  highlighterPen: HighlighterPen;
  /** The highlighter follows the drawing's lines (Alt paints freely while it is on). */
  highlighterFollowsLines: boolean;
  /** How the ESDV tool draws the next ESDV: a ring, or a double line across the pipe. */
  esdvShape: EsdvShape;
  /** What a click with the ESDV double line places, away from a highlighter stroke. */
  doubleLine: DoubleLineMemory;
  /** A drawing link with a target, waiting for the user to confirm its deletion. */
  linkDeleteRequest: string | null;
  /** A drawing waiting for the user to confirm its deletion (DeleteDrawingDialog). */
  drawingDeleteRequest: string | null;
  /** Set by double-clicking or placing a marker: the edit panel shows and focuses it (ANN-07). */
  editRequest: { markerId: string; field: EditField; at: number } | null;
  /** The last type and actuation used, for the next item (FDS section 6). */
  itemDefaults: ItemDefaults;
  /** ANN-09: the item placed or edited last; stamp mode repeats it. */
  lastItemId: string | null;
  /** The drawing link being edited (LNK-01); markers and a link are never selected together. */
  selectedLinkId: string | null;
  /** LNK-02: where each followed link came from, for the Back button. */
  navHistory: { drawingId: string; view: Viewport | null }[];
  /** SEG-05: an area of a drawing to bring into view once its viewer is ready. */
  pendingFocus: { drawingId: string; box: Box | null } | null;

  openDrawing: (drawingId: string) => void;
  closeDrawing: (drawingId: string) => void;
  toggleSplit: () => void;
  focusPane: (side: 'left' | 'right') => void;
  setActiveSegment: (segmentId: string | null) => void;
  setTool: (tool: Tool) => void;
  setSelection: (ids: string[]) => void;
  setHighlighted: (ids: string[]) => void;
  setViewport: (drawingId: string, viewport: Viewport) => void;
  setHiddenLayers: (drawingId: string, layers: string[]) => void;
  setCursor: (cursor: { x: number; y: number } | null) => void;
  toggleLabels: () => void;
  toggleLinks: () => void;
  setFilters: (filters: Partial<MarkerFilters>) => void;
  openDialog: (dialog: DialogName) => void;
  setOfflineReady: (ready: boolean) => void;
  setCircleRadiusFraction: (fraction: number) => void;
  setMarkerSymbol: (symbol: MarkerSymbol) => void;
  setHighlighterPen: (pen: HighlighterPen) => void;
  setHighlighterFollowsLines: (on: boolean) => void;
  setEsdvShape: (shape: EsdvShape) => void;
  setDoubleLine: (doubleLine: DoubleLineMemory) => void;
  setLinkDeleteRequest: (linkId: string | null) => void;
  setDrawingDeleteRequest: (drawingId: string | null) => void;
  requestEdit: (markerId: string, field?: EditField) => void;
  setItemDefaults: (defaults: Partial<ItemDefaults>) => void;
  setLastItem: (itemId: string | null) => void;
  /** Opens a drawing and zooms to an area of it (the whole sheet when `box` is null). */
  focusDrawing: (drawingId: string, box: Box | null) => void;
  clearFocus: () => void;
  setSelectedLink: (linkId: string | null) => void;
  pushNav: (entry: { drawingId: string; view: Viewport | null }) => void;
  popNav: () => { drawingId: string; view: Viewport | null } | null;
  reset: () => void;
}

/** Opens a drawing in the pane in use, or just uses the pane that already shows it. */
function showInSplit(
  state: Pick<UiState, 'split' | 'activeDrawingId'>,
  drawingId: string,
): UiState['split'] {
  const { split } = state;
  if (!split || split.left === drawingId || split.right === drawingId) return split;
  return split.right === state.activeDrawingId
    ? { ...split, right: drawingId }
    : { ...split, left: drawingId };
}

const initial = {
  activeDrawingId: null,
  openDrawingIds: [],
  split: null,
  activeSegmentId: null,
  tool: 'select' as Tool,
  selection: [],
  highlighted: [],
  viewports: {},
  hiddenLayers: {},
  cursor: null,
  showLabels: true,
  showLinks: true,
  filters: { hiddenSegments: [], hiddenTypes: [], showUnassignedOnly: false },
  dialog: null,
  circleRadiusFraction: DEFAULT_CIRCLE_RADIUS_FRACTION,
  markerSymbol: 'circle' as MarkerSymbol,
  highlighterPen: 'medium' as HighlighterPen,
  highlighterFollowsLines: true,
  esdvShape: 'circle' as EsdvShape,
  doubleLine: { lengthFraction: DOUBLE_LINE_LENGTH_FRACTION, angle: Math.PI / 2 },
  linkDeleteRequest: null,
  drawingDeleteRequest: null,
  editRequest: null,
  itemDefaults: { equipmentTypeId: null, actuation: null },
  lastItemId: null,
  pendingFocus: null,
  selectedLinkId: null,
  navHistory: [],
} satisfies Partial<UiState>;

export const useUiStore = create<UiState>()((set, get) => ({
  ...initial,
  offlineReady: false,

  openDrawing: (drawingId) =>
    set((state) => ({
      activeDrawingId: drawingId,
      openDrawingIds: state.openDrawingIds.includes(drawingId)
        ? state.openDrawingIds
        : [...state.openDrawingIds, drawingId],
      selection: state.activeDrawingId === drawingId ? state.selection : [],
      split: showInSplit(state, drawingId),
    })),

  closeDrawing: (drawingId) =>
    set((state) => {
      const index = state.openDrawingIds.indexOf(drawingId);
      const openDrawingIds = state.openDrawingIds.filter((id) => id !== drawingId);
      const activeDrawingId =
        state.activeDrawingId === drawingId
          ? (openDrawingIds[Math.min(index, openDrawingIds.length - 1)] ?? null)
          : state.activeDrawingId;
      // Closing a drawing shown in split view ends the split.
      const split =
        state.split && (state.split.left === drawingId || state.split.right === drawingId)
          ? null
          : state.split;
      return { openDrawingIds, activeDrawingId, split };
    }),

  toggleSplit: () =>
    set((state) => {
      if (state.split) return { split: null };
      const active = state.activeDrawingId;
      const other = state.openDrawingIds.find((id) => id !== active);
      return active && other ? { split: { left: active, right: other } } : {};
    }),

  focusPane: (side) =>
    set((state) => {
      const drawingId = state.split?.[side];
      if (!drawingId || drawingId === state.activeDrawingId) return {};
      return { activeDrawingId: drawingId, selection: [] };
    }),

  setActiveSegment: (activeSegmentId) => set({ activeSegmentId }),
  setTool: (tool) => set({ tool }),
  setSelection: (selection) =>
    set(selection.length ? { selection, selectedLinkId: null } : { selection }),
  setHighlighted: (highlighted) => set({ highlighted }),
  setHiddenLayers: (drawingId, layers) =>
    set((state) => ({ hiddenLayers: { ...state.hiddenLayers, [drawingId]: [...layers].sort() } })),
  setViewport: (drawingId, viewport) =>
    set((state) => ({ viewports: { ...state.viewports, [drawingId]: viewport } })),
  setCursor: (cursor) => set({ cursor }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleLinks: () => set((state) => ({ showLinks: !state.showLinks })),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  openDialog: (dialog) => set({ dialog }),
  setOfflineReady: (offlineReady) => set({ offlineReady }),
  setCircleRadiusFraction: (circleRadiusFraction) => set({ circleRadiusFraction }),
  setMarkerSymbol: (markerSymbol) => set({ markerSymbol }),
  setHighlighterPen: (highlighterPen) => set({ highlighterPen }),
  setHighlighterFollowsLines: (highlighterFollowsLines) => set({ highlighterFollowsLines }),
  setEsdvShape: (esdvShape) => set({ esdvShape }),
  setDoubleLine: (doubleLine) => set({ doubleLine }),
  setLinkDeleteRequest: (linkDeleteRequest) => set({ linkDeleteRequest }),
  setDrawingDeleteRequest: (drawingDeleteRequest) => set({ drawingDeleteRequest }),
  requestEdit: (markerId, field = 'auto') =>
    set({ selection: [markerId], editRequest: { markerId, field, at: Date.now() } }),
  setItemDefaults: (defaults) =>
    set((state) => ({ itemDefaults: { ...state.itemDefaults, ...defaults } })),
  setLastItem: (lastItemId) => set({ lastItemId }),
  focusDrawing: (drawingId, box) =>
    set((state) => ({
      activeDrawingId: drawingId,
      openDrawingIds: state.openDrawingIds.includes(drawingId)
        ? state.openDrawingIds
        : [...state.openDrawingIds, drawingId],
      selection: state.activeDrawingId === drawingId ? state.selection : [],
      pendingFocus: { drawingId, box },
      split: showInSplit(state, drawingId),
    })),
  clearFocus: () => set({ pendingFocus: null }),
  setSelectedLink: (selectedLinkId) =>
    set(selectedLinkId ? { selectedLinkId, selection: [] } : { selectedLinkId }),
  pushNav: (entry) => set((state) => ({ navHistory: [...state.navHistory, entry].slice(-50) })),
  popNav: () => {
    const history = get().navHistory;
    const last = history[history.length - 1] ?? null;
    if (last) set({ navHistory: history.slice(0, -1) });
    return last;
  },
  reset: () => set({ ...initial }),
}));
