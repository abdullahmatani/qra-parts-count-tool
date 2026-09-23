import { useEffect, useMemo, useState } from 'react';
import { findInText, type TextBox } from '@/domain/text-search';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { drawingTextBoxes } from './drawing-text';
import { useSearchStore } from './search-store';

const NONE: TextBox[] = [];

/** The search hits on one drawing while the find bar is open (DRW-08). */
export function useSearchHits(drawingId: string | null): { hits: TextBox[]; loading: boolean } {
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const drawing = useProjectStore((s) => (drawingId ? s.doc?.drawings[drawingId] : undefined));
  const key = drawing ? `${drawing.id}:${drawing.fileHash}` : '';
  const active = open && !!drawing && query.trim() !== '';
  const [loaded, setLoaded] = useState<{ key: string; boxes: TextBox[] } | null>(null);

  useEffect(() => {
    const dir = getWorkingDirectory();
    if (!active || !drawing || !dir) return;
    let live = true;
    drawingTextBoxes(dir, drawing).then(
      (boxes) => live && setLoaded({ key, boxes }),
      () => live && setLoaded({ key, boxes: [] }),
    );
    return () => {
      live = false;
    };
  }, [active, drawing, key]);

  const boxes = loaded?.key === key ? loaded.boxes : null;
  const hits = useMemo(
    () => (active && boxes ? findInText(boxes, query) : NONE),
    [active, boxes, query],
  );
  return { hits, loading: active && boxes === null };
}
