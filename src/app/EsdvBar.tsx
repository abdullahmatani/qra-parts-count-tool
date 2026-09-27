import { Circle, Equal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ESDV_SHAPES, type EsdvShape } from '@/domain/esdv';
import { EsdvIcon } from '@/features/markup/EsdvIcon';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

function ShapeIcon({ shape }: { shape: EsdvShape }) {
  return shape === 'doubleLine' ? <Equal className="rotate-90" /> : <Circle />;
}

/**
 * Takes the equipment bar's place while the ESDV tool is in use: whether the
 * next ESDV is drawn as a ring round the valve or as a double line across the
 * pipe (SEG-01).
 */
export function EsdvBar() {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const shape = useUiStore((s) => s.esdvShape);
  const setShape = useUiStore((s) => s.setEsdvShape);

  return (
    <div
      role="toolbar"
      aria-label={t('esdvBar.label')}
      data-testid="esdv-bar"
      className="flex h-10 shrink-0 items-center gap-2 border-b bg-panel px-2"
    >
      <EsdvIcon className="size-4 shrink-0 text-esdv" />
      <span className="shrink-0 text-xs text-muted-foreground">{t('esdvBar.shape')}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={shape}
        onValueChange={(value) => value && setShape(value as EsdvShape)}
        disabled={readOnly}
        aria-label={t('esdvBar.shape')}
        className="gap-0.5"
      >
        {ESDV_SHAPES.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            data-testid={`esdv-shape-${option}`}
            className="gap-1.5 px-2 text-xs text-esdv aria-checked:ring-1 aria-checked:ring-primary/30 aria-checked:ring-inset"
          >
            <ShapeIcon shape={option} />
            <span className="text-foreground">{t(`markup.shapes.${option}`)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <span className="min-w-0 truncate text-xs text-muted-foreground" data-testid="esdv-bar-hint">
        {t(`esdvBar.hints.${shape}`)} {t('esdvBar.split')}
      </span>
    </div>
  );
}
