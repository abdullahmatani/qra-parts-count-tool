/**
 * Transient interface state: what is open, selected and visible. None of it is
 * part of the project file, and none of it is undoable.
 */
import { create } from 'zustand';
import type { Box } from '@/domain/markup/geometry';
import type { MarkerFilterState } from '@/domain/markup/presentation';

export type Tool = 'select' | 'circle' | 'dashed' | 'link' | 'esdv' | 'stamp';

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
  | 'newSegment'
  | null;

export interface UiState {
  activeDrawingId: string | null;
  /** Drawings open as tabs (DRW-06). */
  openDrawingIds: string[];
  activeSegmentId: string | null;
  tool: Tool;
  selection: string[];
  /** Markers highlighted from the count table (CNT-06). */
  highlighted: string[];
  viewports: Record<string, Viewport>;
  cursor: { x: number; y: number } | null;
  showLabels: boolean;
  showLinks: boolean;
  filters: MarkerFilters;
  dialog: DialogName;
  /** Offline readiness reported by the service worker. */
  offlineReady: boolean;
  /** Size of the last circle drawn, as a fraction of the drawing's longer side. */
  circleRadiusFraction: number;
  /** Set by double-clicking a marker: the edit panel shows and focuses it (ANN-07). */
  editRequest: { markerId: string; at: number } | null;
  /** SEG-05: an area of a drawing to bring into view once its viewer is ready. */
  pendingFocus: { drawingId: string; box: Box | null } | null;

  openDrawing: (drawingId: string) => void;
  closeDrawing: (drawingId: string) => void;
  setActiveSegment: (segmentId: string | null) => void;
  setTool: (tool: Tool) => void;
  setSelection: (ids: string[]) => void;
  setHighlighted: (ids: string[]) => void;
  setViewport: (drawingId: string, viewport: Viewport) => void;
  setCursor: (cursor: { x: number; y: number } | null) => void;
  toggleLabels: () => void;
  toggleLinks: () => void;
  setFilters: (filters: Partial<MarkerFilters>) => void;
  openDialog: (dialog: DialogName) => void;
  setOfflineReady: (ready: boolean) => void;
  setCircleRadiusFraction: (fraction: number) => void;
  requestEdit: (markerId: string) => void;
  /** Opens a drawing and zooms to an area of it (the whole sheet when `box` is null). */
  focusDrawing: (drawingId: string, box: Box | null) => void;
  clearFocus: () => void;
  reset: () => void;
}

const initial = {
  activeDrawingId: null,
  openDrawingIds: [],
  activeSegmentId: null,
  tool: 'select' as Tool,
  selection: [],
  highlighted: [],
  viewports: {},
  cursor: null,
  showLabels: true,
  showLinks: true,
  filters: { hiddenSegments: [], hiddenTypes: [], showUnassignedOnly: false },
  dialog: null,
  circleRadiusFraction: DEFAULT_CIRCLE_RADIUS_FRACTION,
  editRequest: null,
  pendingFocus: null,
} satisfies Partial<UiState>;

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  offlineReady: false,

  openDrawing: (drawingId) =>
    set((state) => ({
      activeDrawingId: drawingId,
      openDrawingIds: state.openDrawingIds.includes(drawingId)
        ? state.openDrawingIds
        : [...state.openDrawingIds, drawingId],
      selection: state.activeDrawingId === drawingId ? state.selection : [],
    })),

  closeDrawing: (drawingId) =>
    set((state) => {
      const index = state.openDrawingIds.indexOf(drawingId);
      const openDrawingIds = state.openDrawingIds.filter((id) => id !== drawingId);
      const activeDrawingId =
        state.activeDrawingId === drawingId
          ? (openDrawingIds[Math.min(index, openDrawingIds.length - 1)] ?? null)
          : state.activeDrawingId;
      return { openDrawingIds, activeDrawingId };
    }),

  setActiveSegment: (activeSegmentId) => set({ activeSegmentId }),
  setTool: (tool) => set({ tool }),
  setSelection: (selection) => set({ selection }),
  setHighlighted: (highlighted) => set({ highlighted }),
  setViewport: (drawingId, viewport) =>
    set((state) => ({ viewports: { ...state.viewports, [drawingId]: viewport } })),
  setCursor: (cursor) => set({ cursor }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleLinks: () => set((state) => ({ showLinks: !state.showLinks })),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  openDialog: (dialog) => set({ dialog }),
  setOfflineReady: (offlineReady) => set({ offlineReady }),
  setCircleRadiusFraction: (circleRadiusFraction) => set({ circleRadiusFraction }),
  requestEdit: (markerId) =>
    set({ selection: [markerId], editRequest: { markerId, at: Date.now() } }),
  focusDrawing: (drawingId, box) =>
    set((state) => ({
      activeDrawingId: drawingId,
      openDrawingIds: state.openDrawingIds.includes(drawingId)
        ? state.openDrawingIds
        : [...state.openDrawingIds, drawingId],
      selection: state.activeDrawingId === drawingId ? state.selection : [],
      pendingFocus: { drawingId, box },
    })),
  clearFocus: () => set({ pendingFocus: null }),
  reset: () => set({ ...initial }),
}));
