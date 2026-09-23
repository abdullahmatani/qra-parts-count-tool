import { useTranslation } from 'react-i18next';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Actuation, CountItem } from '@/domain/schema/types';
import { formatSize, parseSize } from '@/domain/sizes';
import { CommitInput } from '@/features/segments/fields';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { updateItemsCommand } from './item-commands';

/** The value every item shares, or undefined when they differ. */
function shared<T>(items: readonly CountItem[], pick: (item: CountItem) => T): T | undefined {
  const first = pick(items[0]!);
  return items.every((item) => pick(item) === first) ? first : undefined;
}

const sizeText = (item: CountItem) =>
  item.nominalSize === null ? '' : formatSize({ value: item.nominalSize, unit: item.sizeUnit });

/**
 * CNT-10: type, actuation and size for several selected items at once. Each
 * field shows the common value, or "Mixed"; a change applies to all of them
 * as one undo step and leaves their other fields alone.
 */
export function BulkItemEditor({ items }: { items: readonly CountItem[] }) {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const library = useProjectStore((s) => s.doc?.library);
  const defaultUnit = useProjectStore((s) => s.doc?.settings.units.size ?? 'in');
  const ids = items.map((item) => item.id);
  const typeId = shared(items, (item) => item.equipmentTypeId);
  const actuation = shared(items, (item) => item.actuation);
  const typeOf = (id: string | null) => library?.equipmentTypes.find((e) => e.id === id);
  // Sizes apply to sized types only: a pump or vessel takes no size.
  const sized = items.filter((item) => typeOf(item.equipmentTypeId)?.sizeRequired !== false);
  const size = sized.length ? shared(sized, sizeText) : '';
  const allActuated = items.every((item) => typeOf(item.equipmentTypeId)?.hasActuation);
  const mixed = t('count.bulk.mixed');

  return (
    <div className="space-y-2" data-testid="bulk-item-editor">
      <p className="text-xs text-muted-foreground">{t('count.bulk.hint')}</p>
      <div className="space-y-1">
        <Label htmlFor="bulk-type" className="text-xs text-muted-foreground">
          {t('count.item.type')}
        </Label>
        <Select
          value={typeId ?? ''}
          onValueChange={(equipmentTypeId) => {
            const next = typeOf(equipmentTypeId);
            updateItemsCommand(ids, {
              equipmentTypeId,
              ...(next?.hasActuation
                ? {
                    actuation:
                      actuation ?? useUiStore.getState().itemDefaults.actuation ?? 'manual',
                  }
                : {}),
            });
          }}
          disabled={readOnly}
        >
          <SelectTrigger id="bulk-type" className="w-full">
            <SelectValue
              placeholder={typeId === undefined ? mixed : t('count.item.typePlaceholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {library?.equipmentTypes.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="flex-1">{option.name}</span>
                {option.shortcut && <Kbd className="ms-2">{option.shortcut}</Kbd>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {allActuated && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground" id="bulk-actuation">
            {t('count.item.actuation')}
            {actuation === undefined ? ` (${mixed})` : ''}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-labelledby="bulk-actuation"
            value={actuation ?? ''}
            onValueChange={(value) =>
              value && updateItemsCommand(ids, { actuation: value as Actuation })
            }
            disabled={readOnly}
          >
            <ToggleGroupItem value="manual" className="px-3">
              {t('count.actuation.manual')}
            </ToggleGroupItem>
            <ToggleGroupItem value="automated" className="px-3">
              {t('count.actuation.automated')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="bulk-size" className="text-xs text-muted-foreground">
          {t('count.item.size')}
        </Label>
        <CommitInput
          id="bulk-size"
          className="font-mono"
          value={size ?? ''}
          placeholder={size === undefined ? mixed : t('count.item.sizePlaceholder')}
          validate={(text) => {
            if (!text.trim()) return null;
            const parsed = parseSize(text, defaultUnit);
            return parsed === 'invalid' || parsed === null ? 'count.item.sizeInvalid' : null;
          }}
          onCommit={(text) => {
            const parsed = parseSize(text, defaultUnit);
            // An empty field leaves the sizes as they are.
            if (parsed && parsed !== 'invalid') {
              updateItemsCommand(
                sized.map((item) => item.id),
                { nominalSize: parsed.value, sizeUnit: parsed.unit },
              );
            }
          }}
          disabled={readOnly || sized.length === 0}
        />
      </div>
    </div>
  );
}
