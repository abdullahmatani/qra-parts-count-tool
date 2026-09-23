import { useEffect, useState } from 'react';
import type { Drawing } from '@/domain/schema/types';
import { isNotFound } from '@/lib/fs/types';
import { getWorkingDirectory } from '@/services/session';
import type { DrawingSource } from './drawing-source';
import { loadDrawingSource } from './load-source';

export type SourceState =
  | { status: 'loading' }
  | { status: 'ready'; source: DrawingSource; preview: HTMLCanvasElement }
  | { status: 'error'; kind: 'missing' | 'unsupported' | 'failed'; message: string };

/** Longest side of the preview bitmap used for instant pan/zoom and the minimap. */
export const PREVIEW_MAX_DIMENSION = 2048;

/** Loads a drawing's source and its preview from the working directory. */
export function useDrawingSource(drawing: Drawing | null): SourceState {
  const [state, setState] = useState<{ key: string | null; value: SourceState }>({
    key: null,
    value: { status: 'loading' },
  });
  const key = drawing ? `${drawing.id}:${drawing.fileHash}:${drawing.page ?? ''}` : null;

  useEffect(() => {
    if (!drawing || !key) return;
    let cancelled = false;
    let loaded: DrawingSource | null = null;
    const dir = getWorkingDirectory();
    (async () => {
      if (!dir) throw new Error('No working directory is open');
      const source = await loadDrawingSource(dir, drawing);
      loaded = source;
      if (cancelled) return;
      const preview = await source.renderPreview(PREVIEW_MAX_DIMENSION);
      if (!cancelled) setState({ key, value: { status: 'ready', source, preview } });
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
