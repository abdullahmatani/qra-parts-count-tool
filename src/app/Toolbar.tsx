import { Link2, Redo2, Search, Tag, Undo2, Unlink } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { segmentAppearance } from '@/domain/palette';
import { useProjectStore } from '@/store/project-store';
import { useUiStore, type Tool } from '@/store/ui-store';
import { MarkerFilterMenu } from '@/features/markup/MarkerFilters';
import { useSearchStore } from '@/features/search/search-store';
import { TOOLS } from './tools';

/**
 * Markup toolbar. The active segment's colour tints the toolbar so the user
 * always sees where new markers go (FDS section 6).
 */
export function Toolbar() {
  const { t } = useTranslation();
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const showLabels = useUiStore((s) => s.showLabels);
  const showLinks = useUiStore((s) => s.showLinks);
  const toggleLabels = useUiStore((s) => s.toggleLabels);
  const toggleLinks = useUiStore((s) => s.toggleLinks);
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const segment = useProjectStore((s) =>
    activeSegmentId ? (s.doc?.segments[activeSegmentId] ?? null) : null,
  );
  const undoLabel = useProjectStore((s) => s.past[s.past.length - 1]?.label ?? null);
  const redoLabel = useProjectStore((s) => s.future[s.future.length - 1]?.label ?? null);
  const readOnly = useProjectStore((s) => s.readOnly);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const appearance = segment ? segmentAppearance(segment.colour) : null;
  const tint = appearance
    ? ({ '--active-segment': appearance.cssVar } as CSSProperties)
    : ({ '--active-segment': 'var(--border)' } as CSSProperties);

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar.label')}
      data-testid="toolbar"
      data-active-segment={segment?.id ?? ''}
      style={tint}
      className="flex h-11 shrink-0 items-center gap-1 border-b border-b-(--active-segment) bg-[color-mix(in_oklab,var(--active-segment)_7%,var(--panel))] px-2"
    >
      <ToggleGroup
        type="single"
        size="sm"
        value={tool}
        onValueChange={(value) => value && setTool(value as Tool)}
        disabled={readOnly}
      >
        {TOOLS.map(({ tool: id, icon: Icon, labelKey, shortcut }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={id} aria-label={t(labelKey)} className="px-2.5">
                <Icon />
                <span className="hidden 2xl:inline">{t(labelKey)}</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              {t(labelKey)} <Kbd>{shortcut}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('toolbar.undo')}
              disabled={!undoLabel || readOnly}
              onClick={() => undo()}
            >
              <Undo2 />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {undoLabel ? t('toolbar.undoLabel', { label: undoLabel }) : t('toolbar.nothingToUndo')}{' '}
          <Kbd>Ctrl+Z</Kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('toolbar.redo')}
              disabled={!redoLabel || readOnly}
              onClick={() => redo()}
            >
              <Redo2 />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {redoLabel ? t('toolbar.redoLabel', { label: redoLabel }) : t('toolbar.nothingToRedo')}{' '}
          <Kbd>Ctrl+Y</Kbd>
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <Toggle
        size="sm"
        pressed={showLabels}
        onPressedChange={toggleLabels}
        aria-label={t('toolbar.labels')}
        title={t('toolbar.labels')}
      >
        <Tag />
      </Toggle>
      <Toggle
        size="sm"
        pressed={showLinks}
        onPressedChange={toggleLinks}
        aria-label={t('toolbar.links')}
        title={t('toolbar.links')}
      >
        {showLinks ? <Link2 /> : <Unlink />}
      </Toggle>
      <MarkerFilterMenu />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('search.open')}
        title={t('search.open')}
        onClick={() => useSearchStore.getState().openFind()}
      >
        <Search />
      </Button>

      <div
        className="ms-auto flex min-w-0 items-center gap-2 ps-2 text-xs whitespace-nowrap text-muted-foreground"
        data-testid="active-segment-chip"
      >
        {segment && appearance ? (
          <>
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ background: appearance.cssVar }}
            />
            <span className="truncate">
              {t('toolbar.activeSegment', { segment: segment.label })}
            </span>
          </>
        ) : (
          <span className="truncate">{t('toolbar.noActiveSegment')}</span>
        )}
      </div>
    </div>
  );
}
