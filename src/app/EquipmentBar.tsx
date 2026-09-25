import { useTranslation } from 'react-i18next';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ANY_EQUIPMENT, currentChoice, equipmentChoices } from '@/domain/equipment-choices';
import type { MarkerSymbol } from '@/domain/schema/types';
import { SymbolIcon } from '@/features/markup/SymbolIcon';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const SYMBOLS: readonly MarkerSymbol[] = ['dot', 'circle', 'square', 'freeform'];

/** The chosen shape and type stand out against the panel, as the active tool does. */
const CHOSEN = 'aria-checked:ring-1 aria-checked:ring-primary/30 aria-checked:ring-inset';

/** Choosing what or how to place arms the Circle tool (Stamp keeps its own items). */
function armCircleTool(keepStamp: boolean): void {
  const ui = useUiStore.getState();
  if (ui.tool !== 'circle' && !(keepStamp && ui.tool === 'stamp')) ui.setTool('circle');
}

/**
 * The equipment bar under the markup toolbar: the shape new equipment markers
 * are drawn with, and the equipment type (and valve actuation) they are
 * counted as. Both apply to the markers placed next; a placed marker is
 * changed in the panel.
 */
export function EquipmentBar() {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const types = useProjectStore((s) => s.doc?.library.equipmentTypes);
  const markerSymbol = useUiStore((s) => s.markerSymbol);
  const defaults = useUiStore((s) => s.itemDefaults);
  const choices = equipmentChoices(types ?? []);
  const selected = currentChoice(choices, defaults.equipmentTypeId, defaults.actuation);

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
      className="flex h-10 shrink-0 items-center gap-1 border-b bg-panel px-2"
    >
      <span className="px-1 text-xs text-muted-foreground">{t('equipmentBar.shape')}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={markerSymbol}
        // Clicking the chosen shape again (value '') still arms the tool.
        onValueChange={(value) => chooseSymbol((value || markerSymbol) as MarkerSymbol)}
        disabled={readOnly}
        aria-label={t('equipmentBar.shape')}
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
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
        <ToggleGroup
          type="single"
          size="sm"
          value={selected}
          onValueChange={(value) => chooseType(value || selected || ANY_EQUIPMENT)}
          disabled={readOnly}
          aria-label={t('equipmentBar.type')}
          className="gap-0.5"
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
          {choices.map((choice) => {
            const name = choice.actuation
              ? t('equipmentBar.withActuation', {
                  type: choice.type.name,
                  actuation: t(`equipmentBar.actuation.${choice.actuation}`),
                })
              : choice.type.name;
            return (
              <Tooltip key={choice.key}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={choice.key}
                    aria-label={name}
                    data-testid="equipment-choice"
                    data-type-id={choice.type.id}
                    data-actuation={choice.actuation ?? ''}
                    className={`max-w-48 px-2 text-xs ${CHOSEN}`}
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
        {choices.length === 0 && (
          <span className="px-2 text-xs text-muted-foreground">{t('equipmentBar.empty')}</span>
        )}
      </div>
    </div>
  );
}
