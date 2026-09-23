import { Check } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SEGMENT_PALETTE, segmentAppearance } from '@/domain/palette';
import { cn } from '@/lib/utils';

/**
 * A text input that commits on blur or Enter. `validate` returns an error
 * message key, or null to commit. The input follows outside changes (undo).
 */
export function CommitInput({
  value,
  onCommit,
  validate,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur'> & {
  value: string;
  onCommit: (value: string) => void;
  validate?: (value: string) => string | null;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // Follow outside changes (undo, another panel) of the stored value.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value);
    setError(null);
  }

  const commit = () => {
    if (text === value) {
      setError(null);
      return;
    }
    const problem = validate?.(text) ?? null;
    setError(problem);
    if (!problem) onCommit(text);
  };
  const errorId = props.id ? `${props.id}-error` : undefined;

  return (
    <>
      <Input
        {...props}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setText(value);
            setError(null);
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {t(error as never)}
        </p>
      )}
    </>
  );
}

/** Picks a segment colour: the 12 palette colours, then the patterned variants. */
export function ColourPicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: number;
  onChange: (colour: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = segmentAppearance(value);
  const choices = Array.from({ length: SEGMENT_PALETTE.length * 2 }, (_, i) => i + 1);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={t('segments.fields.colour')}
          className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border bg-background disabled:opacity-50"
        >
          <span
            className="size-5 rounded-sm"
            style={{
              background: current.cssVar,
              outline: current.variant ? '2px dashed var(--background)' : undefined,
              outlineOffset: -5,
            }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div
          className="grid grid-cols-6 gap-1.5"
          role="listbox"
          aria-label={t('segments.fields.colour')}
        >
          {choices.map((index) => {
            const appearance = segmentAppearance(index);
            const selected = index === value;
            return (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={t('segments.fields.colourOption', { index })}
                onClick={() => {
                  onChange(index);
                  setOpen(false);
                }}
                className={cn(
                  'flex size-7 items-center justify-center rounded-sm ring-offset-1',
                  selected && 'ring-2 ring-ring',
                )}
                style={{
                  background: appearance.cssVar,
                  backgroundImage: appearance.variant
                    ? 'repeating-linear-gradient(45deg, transparent 0 3px, rgb(255 255 255 / 0.55) 3px 5px)'
                    : undefined,
                }}
              >
                {selected && <Check className="size-4 text-white" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
