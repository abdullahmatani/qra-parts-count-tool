import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isSegmentLabelTaken, nextSegmentLabel } from '@/domain/actions/segments';
import { nextSegmentColour } from '@/domain/palette';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { ColourPicker } from './fields';
import { parseOptionalNumber } from './parse';
import { createSegmentCommand } from './segment-commands';

interface Draft {
  label: string;
  description: string;
  colour: number;
  fluid: string;
  phase: string;
  pressure: string;
  temperature: string;
}

function initialDraft(): Draft {
  const doc = useProjectStore.getState().doc;
  const segments = doc?.segments ?? {};
  return {
    label: nextSegmentLabel({ segments }),
    description: '',
    colour: nextSegmentColour(Object.values(segments).map((s) => s.colour)),
    fluid: '',
    phase: '',
    pressure: '',
    temperature: '',
  };
}

/** SEG-02: create a segment with its label, description, colour and process data. */
export function NewSegmentDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'newSegment');
  const openDialog = useUiStore((s) => s.openDialog);
  const units = useProjectStore((s) => s.doc?.settings.units);
  return (
    <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'newSegment' : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('segments.new.title')}</DialogTitle>
          <DialogDescription>{t('segments.new.description')}</DialogDescription>
        </DialogHeader>
        {open && (
          <NewSegmentForm
            pressureUnit={units?.pressure ?? ''}
            temperatureUnit={units?.temperature ?? ''}
            onDone={() => openDialog(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewSegmentForm({
  pressureUnit,
  temperatureUnit,
  onDone,
}: {
  pressureUnit: string;
  temperatureUnit: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const segments = useProjectStore.getState().doc?.segments ?? {};
    const next: typeof errors = {};
    if (!draft.label.trim()) next.label = 'segments.errors.labelRequired';
    else if (isSegmentLabelTaken({ segments }, draft.label))
      next.label = 'segments.errors.labelTaken';
    const pressure = parseOptionalNumber(draft.pressure);
    const temperature = parseOptionalNumber(draft.temperature);
    if (pressure === 'invalid') next.pressure = 'segments.errors.number';
    if (temperature === 'invalid') next.temperature = 'segments.errors.number';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const id = createSegmentCommand({
      label: draft.label,
      description: draft.description,
      colour: draft.colour,
      fluid: draft.fluid,
      phase: draft.phase,
      pressure: pressure as number | null,
      temperature: temperature as number | null,
    });
    if (id) onDone();
  };

  const field = (
    key: 'label' | 'fluid' | 'phase' | 'pressure' | 'temperature',
    label: string,
    extra: Partial<React.ComponentProps<typeof Input>> = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`new-segment-${key}`}>{label}</Label>
      <Input
        id={`new-segment-${key}`}
        value={draft[key]}
        onChange={set(key)}
        aria-invalid={errors[key] ? true : undefined}
        {...extra}
      />
      {errors[key] && <p className="text-xs text-destructive">{t(errors[key] as never)}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          {field('label', t('segments.fields.label'), { autoFocus: true })}
        </div>
        <ColourPicker
          value={draft.colour}
          onChange={(colour) => setDraft((d) => ({ ...d, colour }))}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-segment-description">{t('segments.fields.description')}</Label>
        <Textarea
          id="new-segment-description"
          value={draft.description}
          onChange={set('description')}
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('fluid', t('segments.fields.fluid'))}
        {field('phase', t('segments.fields.phase'))}
        {field('pressure', t('segments.fields.pressure', { unit: pressureUnit }), {
          inputMode: 'decimal',
        })}
        {field('temperature', t('segments.fields.temperature', { unit: temperatureUnit }), {
          inputMode: 'decimal',
        })}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit">{t('segments.new.create')}</Button>
      </DialogFooter>
    </form>
  );
}
