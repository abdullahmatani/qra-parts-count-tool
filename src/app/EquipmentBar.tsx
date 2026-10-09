import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ANY_EQUIPMENT,
  currentChoice,
  equipmentChoices,
  fitChoices,
  type EquipmentChoice,
} from '@/domain/equipment-choices';
import type { MarkerSymbol } from '@/domain/schema/types';
import { SymbolIcon } from '@/features/markup/SymbolIcon';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const SYMBOLS: readonly MarkerSymbol[] = ['dot', 'circle', 'square', 'freeform'];

/** The chosen shape and type stand out against the panel, as the active tool does. */
const CHOSEN = 'aria-checked:ring-1 aria-checked:ring-primary/30 aria-checked:ring-inset';

/** Space between the type buttons (`gap-0.5`), in px. */
const GAP = 2;

/** A type button: the type's name, with its actuation for valves. */
const CHOICE = 'inline-flex h-8 max-w-48 shrink-0 items-center px-2 text-xs font-medium';

function choiceName(choice: EquipmentChoice, t: TFunction): string {
  return choice.actuation
    ? t('equipmentBar.withActuation', {
        type: choice.type.name,
        actuation: t(`equipmentBar.actuation.${choice.actuation}`),
      })
    : choice.type.name;
}

interface Room {
  /** Width of the row the type buttons go in. */
  available: number;
  /** The "Any type" button, each choice's button, and the "More" button. */
  any: number;
  widths: number[];
  more: number;
}

/**
 * Measures the type buttons in a hidden row and the room the bar leaves for
 * them, again whenever the bar is resized or the library changes.
 */
function useRoom(deps: readonly unknown[]) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const read = () => {
      const spans = [...measure.children] as HTMLElement[];
      setRoom({
        available: row.clientWidth,
        any: spans[0]?.offsetWidth ?? 0,
        widths: spans.slice(1, -1).map((span) => span.offsetWidth),
        more: spans.at(-1)?.offsetWidth ?? 0,
      });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(row);
    // The names are measured again once the interface font has loaded.
    void document.fonts?.ready.then(read);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { rowRef, measureRef, room };
}

/** Choosing what or how to place arms the Circle tool (Stamp keeps its own items). */
function armCircleTool(keepStamp: boolean): void {
  const ui = useUiStore.getState();
  if (ui.tool !== 'circle' && !(keepStamp && ui.tool === 'stamp')) ui.setTool('circle');
}

/**
 * The equipment bar under the markup toolbar, which places equipment markers
 * while counting: a shape arms placing (`C` arms the last one; Stamp places
 * with it too), and the equipment type (and valve actuation) and label say
 * what the next markers count. A placed marker is changed in the panel. The
 * types that do not fit go in a "More" menu; the chosen type always stays in the bar.
 */
export function EquipmentBar() {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const types = useProjectStore((s) => s.doc?.library.equipmentTypes);
  const tool = useUiStore((s) => s.tool);
  const placing = tool === 'circle' || tool === 'stamp';
  const markerSymbol = useUiStore((s) => s.markerSymbol);
  const defaults = useUiStore((s) => s.itemDefaults);
  const choices = equipmentChoices(types ?? []);
  const selected = currentChoice(choices, defaults.equipmentTypeId, defaults.actuation);
  const { rowRef, measureRef, room } = useRoom([types]);
  const shown = new Set(
    room
      ? fitChoices(room.widths, room.available - room.any - GAP, {
          gap: GAP,
          more: room.more,
          chosen: choices.findIndex((c) => c.key === selected),
        })
      : choices.map((_, i) => i),
  );
  const hidden = choices.filter((_, i) => !shown.has(i));

  const chooseSymbol = (symbol: MarkerSymbol) => {
    useUiStore.getState().setMarkerSymbol(symbol);
    armCircleTool(true);
  };

  const chooseType = (key: string) => {
    const choice = choices.find((c) => c.key === key);
    useUiStore.getState().setItemDefaults(
      choice
        ? {
            equipmentTypeId: choice.type.id,
            // Other types leave the remembered valve actuation alone.
            ...(choice.actuation ? { actuation: choice.actuation } : {}),
          }
        : { equipmentTypeId: null },
    );
    armCircleTool(false);
  };

  return (
    <div
      role="toolbar"
      aria-label={t('equipmentBar.label')}
      data-testid="equipment-bar"
      className="relative flex h-10 shrink-0 items-center gap-1 border-b bg-panel px-2"
    >
      <span className="px-1 text-xs text-muted-foreground">{t('equipmentBar.shape')}</span>
      <ToggleGroup
        type="single"
        size="sm"
        // No shape is pressed while the Select tool is.
        value={placing ? markerSymbol : ''}
        // Clicking the chosen shape again (value '') still arms the tool.
        onValueChange={(value) => chooseSymbol((value || markerSymbol) as MarkerSymbol)}
        disabled={readOnly}
        aria-label={t('equipmentBar.shape')}
        data-tour="tool-circle"
      >
        {SYMBOLS.map((symbol) => (
          <Tooltip key={symbol}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={symbol}
                aria-label={t(`markup.shapes.${symbol}`)}
                data-testid={`symbol-${symbol}`}
                className={`px-2 ${CHOSEN}`}
              >
                <SymbolIcon symbol={symbol} />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{t(`markup.shapes.${symbol}`)}</p>
              <p>{t(`equipmentBar.hints.${symbol}`)}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <span className="shrink-0 px-1 text-xs text-muted-foreground">{t('equipmentBar.type')}</span>
      {/* The buttons as they would be drawn, measured to see how many fit. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex h-0 w-0 overflow-hidden whitespace-nowrap"
      >
        <span className={CHOICE}>{t('equipmentBar.any')}</span>
        {choices.map((choice) => (
          <span key={choice.key} className={CHOICE}>
            <span className="truncate">{choiceName(choice, t)}</span>
          </span>
        ))}
        <span className={`${CHOICE} gap-1.5`}>
          {t('equipmentBar.more', { count: choices.length })}
          <ChevronDown className="size-4" />
        </span>
      </div>
      <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        <ToggleGroup
          type="single"
          size="sm"
          value={selected}
          onValueChange={(value) => chooseType(value || selected || ANY_EQUIPMENT)}
          disabled={readOnly}
          aria-label={t('equipmentBar.type')}
          className="min-w-0 gap-0.5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={ANY_EQUIPMENT}
                data-testid="equipment-any"
                className={`px-2 text-xs ${CHOSEN}`}
              >
                {t('equipmentBar.any')}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{t('equipmentBar.anyHint')}</TooltipContent>
          </Tooltip>
          {choices.map((choice, index) => {
            if (!shown.has(index)) return null;
            const name = choiceName(choice, t);
            return (
              <Tooltip key={choice.key}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={choice.key}
                    aria-label={name}
                    data-testid="equipment-choice"
                    data-type-id={choice.type.id}
                    data-actuation={choice.actuation ?? ''}
                    // The chosen type stays in the bar, cut short if the bar is narrow.
                    className={cn(
                      'max-w-48 px-2 text-xs',
                      CHOSEN,
                      choice.key === selected && 'min-w-16 shrink',
                    )}
                  >
                    <span className="truncate">{name}</span>
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  {t('equipmentBar.choiceHint', { name })}
                  {choice.type.shortcut && (
                    <>
                      {' '}
                      <Kbd>{choice.type.shortcut}</Kbd>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
        {hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                disabled={readOnly}
                data-testid="equipment-more"
              >
                {t('equipmentBar.more', { count: hidden.length })}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
              <DropdownMenuRadioGroup value={selected} onValueChange={chooseType}>
                {hidden.map((choice) => (
                  <DropdownMenuRadioItem
                    key={choice.key}
                    value={choice.key}
                    data-testid="equipment-more-choice"
                    className="text-xs"
                  >
                    <span className="truncate">{choiceName(choice, t)}</span>
                    {choice.type.shortcut && (
                      <DropdownMenuShortcut>{choice.type.shortcut}</DropdownMenuShortcut>
                    )}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {choices.length === 0 && (
          <span className="px-2 text-xs text-muted-foreground">{t('equipmentBar.empty')}</span>
        )}
      </div>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <span className="shrink-0 px-1 text-xs text-muted-foreground">{t('equipmentBar.tag')}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Input
            value={defaults.tag ?? ''}
            onChange={(event) => useUiStore.getState().setItemDefaults({ tag: event.target.value })}
            disabled={readOnly}
            maxLength={500}
            placeholder={t('equipmentBar.tagPlaceholder')}
            aria-label={t('equipmentBar.tag')}
            data-testid="equipment-tag"
            className="h-7 w-28 shrink-0 text-xs md:text-xs"
          />
        </TooltipTrigger>
        <TooltipContent>{t('equipmentBar.tagHint')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
