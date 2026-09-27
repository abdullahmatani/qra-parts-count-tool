import { Columns2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { drawingDisplayName } from '@/domain/drawings';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { SuggestionBar } from '@/features/assist/SuggestionBar';
import { FindBar } from '@/features/search/FindBar';
import { EquipmentBar } from './EquipmentBar';
import { EsdvBar } from './EsdvBar';
import { HighlighterBar } from './HighlighterBar';
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
  const split = useUiStore((s) => s.split);
  const tool = useUiStore((s) => s.tool);
  const toggleSplit = useUiStore((s) => s.toggleSplit);
  const focusPane = useUiStore((s) => s.focusPane);
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const hasDrawings = useProjectStore((s) => (s.doc?.drawingOrder.length ?? 0) > 0);
  const tabs = openDrawingIds.flatMap((id) => (drawings?.[id] ? [drawings[id]] : []));

  return (
    <div className="flex h-full min-w-0 flex-col">
      <Toolbar />
      {/* The bar under the toolbar holds the options of what is being placed. */}
      {tool === 'highlighter' ? (
        <HighlighterBar />
      ) : tool === 'esdv' ? (
        <EsdvBar />
      ) : (
        <EquipmentBar />
      )}
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
          <button
            type="button"
            aria-pressed={split !== null}
            aria-label={t('canvas.split')}
            title={t('canvas.split')}
            disabled={!split && tabs.length < 2}
            onClick={toggleSplit}
            className={cn(
              'ms-auto me-1 mb-0.5 rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-40',
              split && 'bg-accent text-foreground',
            )}
          >
            <Columns2 className="size-4" />
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 bg-canvas" data-testid="canvas-area">
        <FindBar />
        <SuggestionBar />
        {split && renderDrawing && drawings?.[split.left] && drawings[split.right] ? (
          (['left', 'right'] as const).map((side) => {
            const drawing = drawings[split[side]]!;
            const focused = drawing.id === activeDrawingId;
            return (
              <div
                key={side}
                data-testid={`pane-${side}`}
                data-focused={focused}
                className={cn(
                  'relative min-w-0 flex-1 border-e last:border-e-0',
                  focused && 'ring-2 ring-primary/40 ring-inset',
                )}
                onPointerDownCapture={() => focusPane(side)}
                onFocusCapture={() => focusPane(side)}
              >
                {renderDrawing(drawing.id)}
                <span className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded bg-background/90 px-1.5 py-0.5 font-mono text-xs shadow-sm">
                  {drawingDisplayName(drawing)}
                </span>
              </div>
            );
          })
        ) : activeDrawingId && drawings?.[activeDrawingId] && renderDrawing ? (
          renderDrawing(activeDrawingId)
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {hasDrawings ? t('canvas.noDrawing') : t('canvas.noDrawings')}
          </div>
        )}
      </div>
    </div>
  );
}
