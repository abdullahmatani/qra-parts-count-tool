import { Columns2, Link2, MousePointer2, SquareDashed, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { drawingDisplayName } from '@/domain/drawings';
import type { Drawing } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { SuggestionBar } from '@/features/assist/SuggestionBar';
import { FindBar } from '@/features/search/FindBar';
import { useStage } from '@/features/stage/stage';
import { EndFlangeBar } from './EndFlangeBar';
import { EraserBar } from './EraserBar';
import { EquipmentBar } from './EquipmentBar';
import { EsdvBar } from './EsdvBar';
import { HighlighterBar } from './HighlighterBar';
import { ToolHintBar } from './ToolHintBar';
import { Toolbar } from './Toolbar';

export interface CanvasAreaProps {
  /** Renders the viewer for the active drawing. */
  renderDrawing?: (drawingId: string) => ReactNode;
}

/** The bar under the toolbar: the options of what the tool places, by stage. */
function OptionsBar() {
  const { t } = useTranslation();
  const tool = useUiStore((s) => s.tool);
  const stage = useStage();
  if (stage === 'count') {
    return tool === 'dashed' ? (
      <ToolHintBar icon={SquareDashed} hint={t('stage.countBar.lineRun')} />
    ) : (
      <EquipmentBar />
    );
  }
  switch (tool) {
    case 'highlighter':
      return <HighlighterBar />;
    case 'eraser':
      return <EraserBar />;
    case 'esdv':
      return <EsdvBar />;
    case 'endFlange':
      return <EndFlangeBar />;
    case 'dashed':
      return <ToolHintBar icon={SquareDashed} hint={t('stage.bar.dashed')} />;
    case 'link':
      return <ToolHintBar icon={Link2} hint={t('stage.bar.link')} />;
    default:
      return <ToolHintBar icon={MousePointer2} hint={t('stage.bar.select')} />;
  }
}

interface DrawingTabsProps {
  tabs: Drawing[];
  activeDrawingId: string | null;
  onOpen: (drawingId: string) => void;
  onClose: (drawingId: string) => void;
  split: boolean;
  onToggleSplit: () => void;
}

/**
 * The open drawings as tabs, with the split-view button. Tabs that do not fit
 * scroll sideways (with the mouse wheel too) under a hidden scrollbar, which
 * would otherwise sit over the tabs, and the active tab is kept in view.
 */
function DrawingTabs({
  tabs,
  activeDrawingId,
  onOpen,
  onClose,
  split,
  onToggleSplit,
}: DrawingTabsProps) {
  const { t } = useTranslation();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const overflowing = element.scrollWidth > element.clientWidth;
      if (!overflowing || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      element.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    // Not passive: the page must not scroll while the wheel scrolls the tabs.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    // Scrolls the strip only: scrollIntoView would also move the panes around it.
    const element = strip.current;
    const tab = element?.querySelector('[aria-selected="true"]')?.parentElement;
    if (!element || !tab) return;
    const bounds = element.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    if (box.left < bounds.left) element.scrollLeft -= bounds.left - box.left;
    else if (box.right > bounds.right) element.scrollLeft += box.right - bounds.right;
  }, [activeDrawingId, tabs.length]);

  return (
    <div className="flex h-10 shrink-0 items-end border-b bg-panel">
      <div
        ref={strip}
        role="tablist"
        data-testid="drawing-tabs"
        className="flex h-full min-w-0 flex-1 [scrollbar-width:none] items-end gap-px overflow-x-auto overflow-y-hidden ps-1"
      >
        {tabs.map((drawing) => {
          const active = drawing.id === activeDrawingId;
          const name = drawingDisplayName(drawing);
          return (
            <div
              key={drawing.id}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 ps-3 pe-1.5 text-xs',
                active ? 'bg-background font-medium' : 'bg-muted text-muted-foreground',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={name}
                className="max-w-56 truncate font-mono leading-normal"
                onClick={() => onOpen(drawing.id)}
              >
                {name}
              </button>
              <button
                type="button"
                aria-label={t('canvas.closeTab', { name })}
                className="rounded p-0.5 hover:bg-accent"
                onClick={() => onClose(drawing.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={split}
        aria-label={t('canvas.split')}
        title={t('canvas.split')}
        disabled={!split && tabs.length < 2}
        onClick={onToggleSplit}
        className={cn(
          'mx-1 self-center rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40',
          split && 'bg-accent text-foreground',
        )}
      >
        <Columns2 className="size-4" />
      </button>
    </div>
  );
}

/** Centre pane: toolbar, drawing tabs and the drawing canvas. */
export function CanvasArea({ renderDrawing }: CanvasAreaProps) {
  const { t } = useTranslation();
  const openDrawingIds = useUiStore((s) => s.openDrawingIds);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const openDrawing = useUiStore((s) => s.openDrawing);
  const closeDrawing = useUiStore((s) => s.closeDrawing);
  const split = useUiStore((s) => s.split);
  const toggleSplit = useUiStore((s) => s.toggleSplit);
  const focusPane = useUiStore((s) => s.focusPane);
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const hasDrawings = useProjectStore((s) => (s.doc?.drawingOrder.length ?? 0) > 0);
  const tabs = openDrawingIds.flatMap((id) => (drawings?.[id] ? [drawings[id]] : []));

  return (
    <div className="flex h-full min-w-0 flex-col">
      <Toolbar />
      <OptionsBar />
      {tabs.length > 0 && (
        <DrawingTabs
          tabs={tabs}
          activeDrawingId={activeDrawingId}
          onOpen={openDrawing}
          onClose={closeDrawing}
          split={split !== null}
          onToggleSplit={toggleSplit}
        />
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
