import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { esdvCountingSegmentIds } from '@/domain/esdv';
import { segmentAppearance } from '@/domain/palette';
import type { EsdvBoundaryRule, Marker } from '@/domain/schema/types';
import { formatSize, parseSize } from '@/domain/sizes';
import { updateEsdvCommand } from '@/features/markup/marker-commands';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';

const NONE = '__none__';
const PROJECT_RULE = '__project__';
const RULES: EsdvBoundaryRule[] = ['upstream', 'downstream', 'both', 'neither'];

function SegmentSelect({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const segments = useOrderedSegments();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full" title={hint}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('markup.esdv.none')}</SelectItem>
          {segments.map((segment) => (
            <SelectItem key={segment.id} value={segment.id}>
              <span
                aria-hidden="true"
                className="size-3 rounded-sm"
                style={{ background: segmentAppearance(segment.colour).cssVar }}
              />
              {segment.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** SEG-01, SEG-08: an ESDV's tag, size, segments on each side and counting rule. */
export function EsdvEditor({ marker }: { marker: Marker }) {
  const { t } = useTranslation();
  const esdv = marker.esdv!;
  const readOnly = useProjectStore((s) => s.readOnly);
  const projectRule = useProjectStore((s) => s.doc?.settings.esdvBoundaryRule ?? null);
  const defaultUnit = useProjectStore((s) => s.doc?.settings.units.size ?? 'in');
  const segments = useProjectStore((s) => s.doc?.segments);
  const editRequest = useUiStore((s) => s.editRequest);
  const tagRef = useRef<HTMLInputElement>(null);
  const formatted =
    esdv.nominalSize === null ? '' : formatSize({ value: esdv.nominalSize, unit: esdv.sizeUnit });
  const [sizeText, setSizeText] = useState(formatted);
  const [sizeError, setSizeError] = useState(false);
  // Follow undo/redo and other edits of the stored size.
  const [shownSize, setShownSize] = useState(formatted);
  if (shownSize !== formatted) {
    setShownSize(formatted);
    setSizeText(formatted);
    setSizeError(false);
  }

  useEffect(() => {
    if (editRequest?.markerId === marker.id) tagRef.current?.focus();
  }, [editRequest, marker.id]);

  const commitSize = () => {
    const parsed = parseSize(sizeText, defaultUnit);
    if (parsed === 'invalid') {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    updateEsdvCommand(marker.id, {
      nominalSize: parsed?.value ?? null,
      sizeUnit: parsed?.unit ?? esdv.sizeUnit,
    });
  };

  const counted = esdvCountingSegmentIds(marker, projectRule)
    .map((id) => segments?.[id]?.label)
    .filter(Boolean);

  return (
    <div className="space-y-3" data-testid="esdv-editor">
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div className="space-y-1">
          <Label htmlFor="esdv-tag" className="text-xs text-muted-foreground">
            {t('markup.esdv.tag')}
          </Label>
          <Input
            id="esdv-tag"
            ref={tagRef}
            value={esdv.tag}
            placeholder={t('markup.esdv.tagPlaceholder')}
            onChange={(event) => updateEsdvCommand(marker.id, { tag: event.target.value })}
            disabled={readOnly}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="esdv-size" className="text-xs text-muted-foreground">
            {t('markup.esdv.size')}
          </Label>
          <Input
            id="esdv-size"
            value={sizeText}
            placeholder={t('markup.esdv.sizePlaceholder')}
            onChange={(event) => setSizeText(event.target.value)}
            onBlur={commitSize}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSize();
            }}
            aria-invalid={sizeError}
            aria-describedby={sizeError ? 'esdv-size-error' : undefined}
            disabled={readOnly}
            className="font-mono"
          />
        </div>
      </div>
      {sizeError && (
        <p id="esdv-size-error" className="text-xs text-destructive">
          {t('markup.esdv.sizeInvalid')}
        </p>
      )}
      <SegmentSelect
        id="esdv-upstream"
        label={t('markup.esdv.upstream')}
        hint={t('markup.esdv.upstreamHint')}
        value={esdv.upstreamSegmentId}
        onChange={(value) => updateEsdvCommand(marker.id, { upstreamSegmentId: value })}
        disabled={readOnly}
      />
      <SegmentSelect
        id="esdv-downstream"
        label={t('markup.esdv.downstream')}
        hint={t('markup.esdv.downstreamHint')}
        value={esdv.downstreamSegmentId}
        onChange={(value) => updateEsdvCommand(marker.id, { downstreamSegmentId: value })}
        disabled={readOnly}
      />
      <div className="space-y-1">
        <Label htmlFor="esdv-rule" className="text-xs text-muted-foreground">
          {t('markup.esdv.rule')}
        </Label>
        <Select
          value={esdv.boundaryRuleOverride ?? PROJECT_RULE}
          onValueChange={(value) =>
            updateEsdvCommand(marker.id, {
              boundaryRuleOverride: value === PROJECT_RULE ? null : (value as EsdvBoundaryRule),
            })
          }
          disabled={readOnly}
        >
          <SelectTrigger id="esdv-rule" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PROJECT_RULE}>
              {projectRule
                ? t('markup.esdv.projectRule', { rule: t(`project.boundaryRules.${projectRule}`) })
                : t('markup.esdv.noProjectRule')}
            </SelectItem>
            {RULES.map((rule) => (
              <SelectItem key={rule} value={rule}>
                {t(`project.boundaryRules.${rule}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="esdv-counted-in">
        {counted.length
          ? t('markup.esdv.countedIn', { segments: counted.join(', ') })
          : t('markup.esdv.countedNowhere')}
      </p>
    </div>
  );
}
