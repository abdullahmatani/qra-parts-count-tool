import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { drawingDisplayName } from '@/domain/drawings';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { Toolbar } from './Toolbar';

export interface CanvasAreaProps {
  /** Renders the viewer for the active drawing. */
  renderDrawing?: (drawingId: string) => ReactNode;
}

/** Centre pane: toolbar, drawing tabs and the drawing canvas. */
export function CanvasArea({ renderDrawing }: CanvasAreaProps) {
  const { t } = useTranslation();
  const openDrawingIds = useUiStore((s) => s.openDrawingIds);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const openDrawing = useUiStore((s) => s.openDrawing);
  const closeDrawing = useUiStore((s) => s.closeDrawing);
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const hasDrawings = useProjectStore((s) => (s.doc?.drawingOrder.length ?? 0) > 0);
  const tabs = openDrawingIds.flatMap((id) => (drawings?.[id] ? [drawings[id]] : []));

  return (
    <div className="flex h-full min-w-0 flex-col">
      <Toolbar />
      {tabs.length > 0 && (
        <div
          role="tablist"
          className="flex h-8 shrink-0 items-end gap-px overflow-x-auto border-b bg-panel ps-1"
        >
          {tabs.map((drawing) => {
            const active = drawing.id === activeDrawingId;
            const name = drawingDisplayName(drawing);
            return (
              <div
                key={drawing.id}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-t-md border border-b-0 ps-2 pe-1 text-xs',
                  active ? 'bg-background font-medium' : 'bg-muted text-muted-foreground',
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="max-w-48 truncate font-mono"
                  onClick={() => openDrawing(drawing.id)}
                >
                  {name}
                </button>
                <button
                  type="button"
                  aria-label={t('canvas.closeTab', { name })}
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={() => closeDrawing(drawing.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="relative min-h-0 flex-1 bg-canvas" data-testid="canvas-area">
        {activeDrawingId && drawings?.[activeDrawingId] && renderDrawing ? (
          renderDrawing(activeDrawingId)
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {hasDrawings ? t('canvas.noDrawing') : t('canvas.noDrawings')}
          </div>
        )}
      </div>
    </div>
  );
}
