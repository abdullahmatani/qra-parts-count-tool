import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { previewBin } from '@/domain/count/count';
import type { Actuation, CountItem } from '@/domain/schema/types';
import { formatSize, parseSize } from '@/domain/sizes';
import { CommitInput } from '@/features/segments/fields';
import { parseOptionalNumber } from '@/features/segments/parse';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { updateItemCommand } from './item-commands';
import { useCountEntries } from './useCount';

/** Returns the keyboard focus to the drawing, so the next click places the next item. */
function focusCanvas(): void {
  document.querySelector<HTMLElement>('[role="application"]')?.focus({ preventScroll: true });
}

/**
 * CNT-01, CNT-03, CNT-05, CNT-12: the count item on a marker. A new circle
 * opens here with the last-used type and the focus on size, so typing a size
 * and pressing Enter logs the item and returns to the drawing.
 */
export function ItemEditor({ item }: { item: CountItem }) {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const library = useProjectStore((s) => s.doc?.library);
  const pipeLengthCounting = useProjectStore((s) => s.doc?.settings.pipeLengthCounting ?? false);
  const editRequest = useUiStore((s) => s.editRequest);
  const entries = useCountEntries();
  const typeRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<HTMLInputElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);

  const type = library?.equipmentTypes.find((e) => e.id === item.equipmentTypeId);
  const size = item.nominalSize === null ? null : { value: item.nominalSize, unit: item.sizeUnit };
  const formatted = size ? formatSize(size) : '';
  const [sizeText, setSizeText] = useState(formatted);
  const [sizeError, setSizeError] = useState(false);
  const [shownSize, setShownSize] = useState(formatted);
  if (shownSize !== formatted) {
    setShownSize(formatted);
    setSizeText(formatted);
    setSizeError(false);
  }

  const issues = useMemo(
    () => entries.find((e) => e.kind === 'item' && e.id === item.id)?.issues ?? [],
    [entries, item.id],
  );
  const defaultUnit = useProjectStore((s) => s.doc?.settings.units.size ?? 'in');
  const parsedPreview = parseSize(sizeText, defaultUnit);
  const bin =
    library && parsedPreview && parsedPreview !== 'invalid'
      ? previewBin(library, item.equipmentTypeId, item.actuation, parsedPreview)
      : null;

  useEffect(() => {
    if (editRequest?.markerId !== item.markerId) return;
    const field =
      editRequest.field === 'auto' ? (item.equipmentTypeId ? 'size' : 'type') : editRequest.field;
    if (field === 'type') typeRef.current?.focus();
    else if (field === 'tag') tagRef.current?.focus();
    else sizeRef.current?.select();
    // Only a new request moves the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  const commitSize = (): boolean => {
    const parsed = parseSize(sizeText, defaultUnit);
    if (parsed === 'invalid') {
      setSizeError(true);
      return false;
    }
    setSizeError(false);
    if ((parsed?.value ?? null) !== item.nominalSize || (parsed && parsed.unit !== item.sizeUnit)) {
      updateItemCommand(item.id, {
        nominalSize: parsed?.value ?? null,
        sizeUnit: parsed?.unit ?? item.sizeUnit,
      });
    }
    return true;
  };

  return (
    <div className="space-y-3" data-testid="item-editor">
      <p className="text-xs font-medium text-muted-foreground">
        {t('count.item.title', { seq: item.seq })}
      </p>
      <div className="space-y-1">
        <Label htmlFor="item-type" className="text-xs text-muted-foreground">
          {t('count.item.type')}
        </Label>
        <Select
          value={item.equipmentTypeId ?? ''}
          onValueChange={(equipmentTypeId) => {
            const next = library?.equipmentTypes.find((e) => e.id === equipmentTypeId);
            updateItemCommand(item.id, {
              equipmentTypeId,
              ...(next?.hasActuation && !item.actuation
                ? { actuation: useUiStore.getState().itemDefaults.actuation }
                : {}),
            });
            requestAnimationFrame(() => sizeRef.current?.select());
          }}
          disabled={readOnly}
        >
          <SelectTrigger id="item-type" ref={typeRef} className="w-full">
            <SelectValue placeholder={t('count.item.typePlaceholder')} />
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

      {type?.hasActuation && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground" id="item-actuation">
            {t('count.item.actuation')}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-labelledby="item-actuation"
            value={item.actuation ?? ''}
            onValueChange={(value) =>
              value && updateItemCommand(item.id, { actuation: value as Actuation })
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

      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <div className="space-y-1">
          <Label htmlFor="item-size" className="text-xs text-muted-foreground">
            {t('count.item.size')}
          </Label>
          <Input
            id="item-size"
            ref={sizeRef}
            value={sizeText}
            placeholder={t('count.item.sizePlaceholder')}
            onChange={(event) => setSizeText(event.target.value)}
            onBlur={() => commitSize()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && commitSize()) focusCanvas();
              if (event.key === 'Escape') focusCanvas();
            }}
            aria-invalid={sizeError || undefined}
            aria-describedby="item-size-hint"
            disabled={readOnly}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="item-quantity" className="text-xs text-muted-foreground">
            {t('count.item.quantity')}
          </Label>
          <CommitInput
            id="item-quantity"
            inputMode="numeric"
            value={String(item.quantity)}
            validate={(text) =>
              /^\s*\d+\s*$/.test(text) && Number(text) >= 1 ? null : 'segments.errors.number'
            }
            onCommit={(text) => updateItemCommand(item.id, { quantity: Number(text) })}
            disabled={readOnly}
          />
        </div>
      </div>
      <p id="item-size-hint" className="text-xs text-muted-foreground" data-testid="item-bin">
        {sizeError
          ? t('count.item.sizeInvalid')
          : bin
            ? t('count.item.bin', { bin: bin.label })
            : t('count.item.enterHint')}
      </p>

      {type?.category === 'pipe' && pipeLengthCounting && (
        <div className="space-y-1">
          <Label htmlFor="item-length" className="text-xs text-muted-foreground">
            {t('count.item.pipeLength')}
          </Label>
          <CommitInput
            id="item-length"
            inputMode="decimal"
            value={item.pipeLength === null ? '' : String(item.pipeLength)}
            validate={(text) => {
              const value = parseOptionalNumber(text);
              return value === 'invalid' || (value !== null && value < 0)
                ? 'segments.errors.number'
                : null;
            }}
            onCommit={(text) =>
              updateItemCommand(item.id, { pipeLength: parseOptionalNumber(text) as number | null })
            }
            disabled={readOnly}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="item-tag" className="text-xs text-muted-foreground">
          {t('count.item.tag')}
        </Label>
        <Input
          id="item-tag"
          ref={tagRef}
          value={item.tag}
          onChange={(event) => updateItemCommand(item.id, { tag: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') focusCanvas();
          }}
          disabled={readOnly}
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="item-remarks" className="text-xs text-muted-foreground">
          {t('count.item.remarks')}
        </Label>
        <Textarea
          id="item-remarks"
          value={item.remarks}
          onChange={(event) => updateItemCommand(item.id, { remarks: event.target.value })}
          disabled={readOnly}
          rows={2}
          className="min-h-12"
        />
      </div>

      {issues.length > 0 && (
        <ul className="space-y-0.5" data-testid="item-issues">
          {issues.map((issue) => (
            <li key={issue} className="flex items-center gap-1.5 text-xs text-marker-warning">
              <AlertTriangle className="size-3.5 shrink-0" /> {t(`count.issues.${issue}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
