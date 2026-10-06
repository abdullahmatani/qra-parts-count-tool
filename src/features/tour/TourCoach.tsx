/**
 * The guided tour's coach card: what to do next, an outline round the control
 * to use, and the step ticked off as soon as it is done. It sits over the
 * bottom-left corner of the drawing, can be dragged by its title or folded to
 * one line, and never blocks the app: everything stays clickable.
 */
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GraduationCap,
  LocateFixed,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineMarkdown } from '@/features/help/Markdown';
import { openHelp, useHelpStore } from '@/features/help/help-store';
import { useSearchStore } from '@/features/search/search-store';
import { setStageCommand, useStage } from '@/features/stage/stage';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useTourStore } from './tour-store';
import { TOUR_STEPS, sheetId, spotsBox, type TourContext, type TourStep } from './tour-steps';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height);

function rectOf(element: Element): Rect | null {
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  return {
    left: Math.round(box.left),
    top: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

/** The first target on screen, unless a dialog covers it. */
function findTarget(selectors: readonly string[]): Rect | null {
  const dialog = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]');
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (dialog && !dialog.contains(element)) continue;
      const rect = rectOf(element);
      if (rect) return rect;
    }
  }
  return null;
}

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

/** Room left under the card for the drawing's view controls. */
const CONTROLS_GAP = 56;

/**
 * Follows the layout frame by frame: the step's target, the drawing area, and
 * which bottom corner of the drawing the card can sit in without covering the
 * rings the step draws on the sheet.
 */
function useLayoutTracking(
  enabled: boolean,
  targets: readonly string[] | undefined,
  card: React.RefObject<HTMLElement | null>,
) {
  const [target, setTarget] = useState<Rect | null>(null);
  const [canvas, setCanvas] = useState<Rect | null>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [dialogOpen, setDialogOpen] = useState(false);
  const key = targets?.join('|') ?? '';
  useEffect(() => {
    if (!enabled) return;
    const selectors = key ? key.split('|') : [];
    let frame = 0;
    const tick = () => {
      const nextTarget = selectors.length ? findTarget(selectors) : null;
      setTarget((current) => (sameRect(current, nextTarget) ? current : nextTarget));
      setDialogOpen(!!document.querySelector('[role="dialog"][data-state="open"]'));
      const area = document.querySelector('[data-testid="canvas-area"]');
      const nextCanvas = area ? rectOf(area) : null;
      setCanvas((current) => (sameRect(current, nextCanvas) ? current : nextCanvas));
      const hints = [...document.querySelectorAll('[data-testid="tour-hints"] > *')]
        .map(rectOf)
        .filter((rect): rect is Rect => rect !== null);
      const element = card.current;
      if (nextCanvas && element && hints.length > 0) {
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const top = nextCanvas.top + nextCanvas.height - CONTROLS_GAP - height;
        const at = (left: number): Rect => ({ left, top, width, height });
        const covers = (box: Rect) => hints.some((hint) => overlaps(hint, box));
        const left = at(nextCanvas.left + 12);
        const right = at(nextCanvas.left + nextCanvas.width - 12 - width);
        setSide(covers(left) && !covers(right) ? 'right' : 'left');
      } else {
        setSide('left');
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, key, card]);
  return { target, canvas, side, dialogOpen };
}

/** The state the steps are checked against. */
function useTourContext(): TourContext | null {
  const doc = useProjectStore((s) => s.doc);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const tool = useUiStore((s) => s.tool);
  const itemDefaults = useUiStore((s) => s.itemDefaults);
  const highlighted = useUiStore((s) => s.highlighted);
  const findQuery = useSearchStore((s) => s.query);
  const lastExportFolder = useWorkspaceStore((s) => s.lastExportFolder);
  const visited = useTourStore((s) => s.visited);
  if (!doc) return null;
  return {
    doc,
    activeDrawingId,
    tool,
    itemDefaults,
    highlighted,
    findQuery,
    lastExportFolder,
    visited,
  };
}

function StageHint({ step }: { step: TourStep }) {
  const { t } = useTranslation();
  const stage = useStage();
  if (!step.stage || step.stage === stage) return null;
  const name = t(`stage.${step.stage}`);
  return (
    <p className="flex flex-wrap items-center gap-x-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs">
      {t('tour.wrongStage', { stage: name })}
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={() =>
          step.stage === 'count'
            ? useUiStore.getState().openDialog('startCount')
            : setStageCommand('segments')
        }
      >
        {t('stage.goTo', { stage: name })}
      </Button>
    </p>
  );
}

export function TourCoach() {
  const { t } = useTranslation();
  const active = useTourStore((s) => s.active);
  const projectId = useTourStore((s) => s.projectId);
  const index = useTourStore((s) => s.step);
  const collapsed = useTourStore((s) => s.collapsed);
  const position = useTourStore((s) => s.position);
  const docId = useProjectStore((s) => s.doc?.id ?? null);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const helpOpen = useHelpStore((s) => s.open);
  const ctx = useTourContext();
  const step = TOUR_STEPS[index]!;
  const done = !!(ctx && step.done?.(ctx));
  const showing = active && projectId !== null && docId === projectId;
  const cardRef = useRef<HTMLDivElement>(null);
  const { target, canvas, side, dialogOpen } = useLayoutTracking(
    showing && !helpOpen,
    collapsed ? undefined : step.targets,
    cardRef,
  );
  const arrival = useRef<{ step: number; done: boolean } | null>(null);

  useEffect(() => {
    if (showing && activeDrawingId) useTourStore.getState().visit(activeDrawingId);
  }, [showing, activeDrawingId, index]);

  // A step done while it shows moves on by itself; one already done when reached waits for Next.
  useEffect(() => {
    if (!showing) return;
    if (arrival.current?.step !== index) arrival.current = { step: index, done };
    if (!done || arrival.current.done) return;
    const timer = window.setTimeout(() => useTourStore.getState().advanceFrom(index), 1200);
    return () => window.clearTimeout(timer);
  }, [showing, index, done]);

  if (!showing || helpOpen) return null;

  const tour = useTourStore.getState();
  const last = index === TOUR_STEPS.length - 1;
  const title = t(`tour.steps.${step.id}.title`);
  const sheet = step.spots && ctx ? sheetId(ctx.doc, step.spots.sheet) : null;

  const end = () => {
    tour.end();
    toast.info(t('tour.ended'), { duration: 8000 });
  };

  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const card = cardRef.current;
    if (!card) return;
    const box = card.getBoundingClientRect();
    const offset = { x: event.clientX - box.left, y: event.clientY - box.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      tour.setPosition({
        x: Math.max(0, Math.min(window.innerWidth - box.width, e.clientX - offset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offset.y)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Over a bottom corner of the drawing, above its view controls, unless dragged;
  // at the window's edge while a dialog (in the middle) is open.
  const bottom = canvas ? window.innerHeight - (canvas.top + canvas.height) + CONTROLS_GAP : 40;
  const placement = position
    ? { left: position.x, top: position.y }
    : !canvas || dialogOpen
      ? { left: 16, bottom: dialogOpen ? 16 : bottom }
      : side === 'right'
        ? { right: window.innerWidth - (canvas.left + canvas.width) + 12, bottom }
        : { left: canvas.left + 12, bottom };

  const progress = (
    <span className="text-xs whitespace-nowrap text-muted-foreground">
      {t('tour.progress', { step: index + 1, count: TOUR_STEPS.length })}
    </span>
  );

  return (
    <>
      {target && !collapsed && (
        <div
          aria-hidden="true"
          data-testid="tour-spotlight"
          className="pointer-events-none fixed z-[60] animate-pulse rounded-md ring-[3px] ring-sky-500 ring-offset-2 ring-offset-transparent"
          style={{
            left: target.left - 4,
            top: target.top - 4,
            width: target.width + 8,
            height: target.height + 8,
          }}
        />
      )}
      <section
        ref={cardRef}
        role="region"
        aria-label={t('tour.label')}
        data-testid="tour-card"
        data-step={step.id}
        data-done={done}
        className="fixed z-[60] w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-xl"
        style={placement}
      >
        <div
          className="flex cursor-move items-center gap-2 border-b px-3 py-2 select-none"
          onPointerDown={onDragStart}
          title={t('tour.drag')}
        >
          <GraduationCap className="size-4 shrink-0 text-sky-600" />
          <span className="text-sm font-semibold">{t('tour.label')}</span>
          {collapsed ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {index + 1}/{TOUR_STEPS.length} · {title}
            </span>
          ) : (
            progress
          )}
          <span className="ms-auto flex shrink-0 items-center">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={collapsed ? t('tour.expand') : t('tour.collapse')}
              title={collapsed ? t('tour.expand') : t('tour.collapse')}
              onClick={() => tour.setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronUp /> : <ChevronDown />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('tour.end')}
              title={t('tour.end')}
              onClick={end}
            >
              <X />
            </Button>
          </span>
        </div>
        {!collapsed && (
          <div className="space-y-2.5 p-3">
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width]"
                style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }}
              />
            </div>
            <div aria-live="polite">
              <h2 className="text-sm font-semibold" data-testid="tour-title">
                {title}
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                <InlineMarkdown text={t(`tour.steps.${step.id}.body`)} />
              </p>
            </div>
            <StageHint step={step} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {step.done && (
                <span
                  className={cn(
                    'me-auto flex items-center gap-1.5 text-xs font-medium',
                    done
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground italic',
                  )}
                  data-testid="tour-status"
                >
                  {done ? (
                    <>
                      <Check className="size-3.5" /> {t('tour.done')}
                    </>
                  ) : (
                    t('tour.waiting')
                  )}
                </span>
              )}
              {sheet && step.spots && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto gap-1 p-0 text-xs"
                  onClick={() =>
                    useUiStore.getState().focusDrawing(sheet, spotsBox(step.spots!.at))
                  }
                >
                  <LocateFixed className="size-3.5" /> {t('tour.showMe')}
                </Button>
              )}
              <Button
                variant="link"
                size="sm"
                className="h-auto gap-1 p-0 text-xs"
                onClick={() => openHelp(step.help)}
              >
                <BookOpen className="size-3.5" /> {t('tour.learnMore')}
              </Button>
            </div>
            <div className="flex items-center gap-2 border-t pt-2.5">
              {index > 0 && (
                <Button variant="ghost" size="sm" onClick={tour.back}>
                  <ChevronLeft /> {t('tour.back')}
                </Button>
              )}
              <span className="ms-auto" />
              {index === 0 ? (
                <>
                  <Button variant="ghost" size="sm" onClick={end}>
                    {t('tour.notNow')}
                  </Button>
                  <Button size="sm" onClick={tour.next}>
                    {t('tour.begin')} <ChevronRight />
                  </Button>
                </>
              ) : last ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => openHelp()}>
                    <BookOpen /> {t('tour.openDocs')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      tour.end();
                      toast.success(t('tour.finished'), { duration: 8000 });
                    }}
                  >
                    {t('tour.finish')}
                  </Button>
                </>
              ) : step.done && !done ? (
                <Button variant="outline" size="sm" onClick={tour.next}>
                  {t('tour.skip')} <ChevronRight />
                </Button>
              ) : (
                <Button size="sm" onClick={tour.next}>
                  {t('tour.next')} <ChevronRight />
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
