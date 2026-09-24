import { useEffect, useState } from 'react';
import type { Drawing } from '@/domain/schema/types';
import { isNotFound } from '@/lib/fs/types';
import { getWorkingDirectory } from '@/services/session';
import { usePreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import type { DrawingSource } from './drawing-source';
import { loadDrawingSource } from './load-source';
import { previewCachePath, readCachedPreview, writeCachedPreview } from './preview-cache';

export type SourceState =
  | { status: 'loading' }
  | { status: 'ready'; source: DrawingSource; preview: HTMLCanvasElement }
  | { status: 'error'; kind: 'missing' | 'unsupported' | 'failed'; message: string };

/** Longest side of the preview bitmap used for instant pan/zoom and the minimap. */
export const PREVIEW_MAX_DIMENSION = 2048;

/**
 * Loads a drawing's source and its preview from the working directory. The
 * preview comes from `cache/previews/` when it was rendered before.
 */
export function useDrawingSource(drawing: Drawing | null): SourceState {
  const [state, setState] = useState<{ key: string | null; value: SourceState }>({
    key: null,
    value: { status: 'loading' },
  });
  // CAD drawings are re-rendered when the colour mode changes.
  const cadColorMode = usePreferences((s) => s.cadColorMode);
  // …and when layers are hidden or shown (DRW-09).
  const hidden = useUiStore((s) => (drawing ? s.hiddenLayers[drawing.id] : undefined));
  const hiddenKey = hidden?.join('\u0000') ?? '';
  const key = drawing
    ? `${drawing.id}:${drawing.fileHash}:${drawing.page ?? ''}:${drawing.layout ?? ''}:${drawing.fileType === 'pdf' ? '' : `${cadColorMode}:${hiddenKey}`}`
    : null;

  useEffect(() => {
    if (!drawing || !key) return;
    let cancelled = false;
    let loaded: DrawingSource | null = null;
    const dir = getWorkingDirectory();
    (async () => {
      if (!dir) throw new Error('No working directory is open');
      const cachePath = previewCachePath(
        drawing,
        PREVIEW_MAX_DIMENSION,
        drawing.fileType === 'pdf' ? '' : cadColorMode,
      );
      // Previews with hidden layers are not cached: the cache holds the full drawing.
      const [source, cached] = await Promise.all([
        loadDrawingSource(dir, drawing, { hiddenLayers: hidden ?? [] }),
        hiddenKey ? null : readCachedPreview(dir, cachePath).catch(() => null),
      ]);
      loaded = source;
      if (cancelled) return;
      const preview = cached ?? (await source.renderPreview(PREVIEW_MAX_DIMENSION));
      if (cancelled) return;
      setState({ key, value: { status: 'ready', source, preview } });
      if (cached) source.prepare?.();
      else if (!useProjectStore.getState().readOnly && !hiddenKey) {
        void writeCachedPreview(dir, cachePath, preview);
      }
    })().catch((error: unknown) => {
      if (cancelled) return;
      const name = (error as { name?: string })?.name;
      const kind = isNotFound(error)
        ? 'missing'
        : name === 'UnsupportedDrawingError'
          ? 'unsupported'
          : 'failed';
      setState({
        key,
        value: {
          status: 'error',
          kind,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
    // The key captures every drawing field that affects loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.value : { status: 'loading' };
}
