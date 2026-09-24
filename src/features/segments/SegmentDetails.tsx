import { AlertTriangle, ArrowDown, ArrowUp, FileText, Merge, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isSegmentLabelTaken } from '@/domain/actions/segments';
import { drawingDisplayName } from '@/domain/drawings';
import { markerSegmentIds } from '@/domain/markup/presentation';
import type { Segment, SegmentStatus } from '@/domain/schema/types';
import { useProjectStore } from '@/store/project-store';
import { useActiveSegment, useOrderedDrawings } from '@/store/selectors';
import { DeleteSegmentDialog } from './DeleteSegmentDialog';
import { MergeSegmentDialog } from './MergeSegmentDialog';
import { ColourPicker, CommitInput } from './fields';
import { parseOptionalNumber } from './parse';
import {
  linkDrawingCommand,
  moveSegmentCommand,
  showMarker,
  showSegmentOnDrawing,
  unlinkDrawingCommand,
  updateSegmentCommand,
} from './segment-commands';

const STATUSES: SegmentStatus[] = ['notStarted', 'inProgress', 'counted', 'checked'];

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-xs font-medium text-muted-foreground">{children}</h3>;
}

/**
 * The active segment (SEG-02..05, SEG-09): label, colour, description,
 * process data, status, bounding ESDVs and linked drawings. Every field saves
 * as you go and each change can be undone.
 */
export function SegmentDetails() {
  const segment = useActiveSegment();
  if (!segment) return null;
  return <SegmentForm key={segment.id} segment={segment} />;
}

function SegmentForm({ segment }: { segment: Segment }) {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const units = useProjectStore((s) => s.doc?.settings.units);
  const segments = useProjectStore((s) => s.doc?.segments);
  const markers = useProjectStore((s) => s.doc?.markers);
  const drawings = useOrderedDrawings();
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const order = useProjectStore((s) => s.doc?.segmentOrder);
  const position = order?.indexOf(segment.id) ?? -1;
  const segmentCount = order?.length ?? 0;
  const update = (patch: Parameters<typeof updateSegmentCommand>[1]) =>
    updateSegmentCommand(segment.id, patch);

  const markerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const marker of Object.values(markers ?? {})) {
      if (markerSegmentIds(marker).includes(segment.id)) {
        counts.set(marker.drawingId, (counts.get(marker.drawingId) ?? 0) + 1);
      }
    }
    return counts;
  }, [markers, segment.id]);

  const linked = drawings.filter((d) => segment.drawingIds.includes(d.id));
  const unlinked = drawings.filter((d) => !segment.drawingIds.includes(d.id));
  const esdvs = segment.boundingEsdvIds
    .map((id) => markers?.[id])
    .filter((m) => m?.esdv)
    .map((m) => m!);

  const numberField = (
    key: 'pressure' | 'temperature' | 'h2sMoleFraction' | 'molecularWeightOrDensity',
    check: (value: number) => string | null = () => null,
  ) => (
    <CommitInput
      id={`segment-${key}`}
      inputMode="decimal"
      value={segment[key] === null ? '' : String(segment[key])}
      validate={(text) => {
        const value = parseOptionalNumber(text);
        if (value === 'invalid') return 'segments.errors.number';
        return value === null ? null : check(value);
      }}
      onCommit={(text) => update({ [key]: parseOptionalNumber(text) as number | null })}
      disabled={readOnly}
    />
  );
  const textField = (key: 'fluid' | 'phase' | 'equipment' | 'streamNumber') => (
    <CommitInput
      id={`segment-${key}`}
      value={segment[key]}
      onCommit={(value) => update({ [key]: value })}
      disabled={readOnly}
      {...(key === 'phase'
        ? { list: 'segment-phases', placeholder: t('segments.fields.phasePlaceholder') }
        : {})}
    />
  );

  return (
    <div className="space-y-2 text-sm" data-testid="segment-details">
      <div className="flex items-start gap-2">
        <ColourPicker
          value={segment.colour}
          onChange={(colour) => update({ colour })}
          disabled={readOnly}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <CommitInput
            id="segment-label"
            aria-label={t('segments.fields.label')}
            value={segment.label}
            className="font-medium"
            validate={(text) =>
              !text.trim()
                ? 'segments.errors.labelRequired'
                : segments && isSegmentLabelTaken({ segments }, text, segment.id)
                  ? 'segments.errors.labelTaken'
                  : null
            }
            onCommit={(label) => update({ label })}
            disabled={readOnly}
          />
        </div>
        <Select
          value={segment.status}
          onValueChange={(status) => update({ status: status as SegmentStatus })}
          disabled={readOnly}
        >
          <SelectTrigger className="w-32" aria-label={t('segments.fields.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`segments.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        aria-label={t('segments.fields.description')}
        placeholder={t('segments.fields.description')}
        value={segment.description}
        onChange={(event) => update({ description: event.target.value })}
        disabled={readOnly}
        rows={2}
        className="min-h-14 resize-y"
      />

      <Heading>{t('segments.details.process')}</Heading>
      {/* The A2.1 sheet takes "Liquid" or "Gas"; other text is kept but flagged on export. */}
      <datalist id="segment-phases">
        <option value="Gas" />
        <option value="Liquid" />
      </datalist>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <Label htmlFor="segment-equipment" className="text-xs">
            {t('segments.fields.equipment')}
          </Label>
          {textField('equipment')}
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-fluid" className="text-xs">
            {t('segments.fields.fluid')}
          </Label>
          {textField('fluid')}
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-phase" className="text-xs">
            {t('segments.fields.phase')}
          </Label>
          {textField('phase')}
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-pressure" className="text-xs">
            {t('segments.fields.pressure', { unit: units?.pressure ?? '' })}
          </Label>
          {numberField('pressure')}
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-temperature" className="text-xs">
            {t('segments.fields.temperature', { unit: units?.temperature ?? '' })}
          </Label>
          {numberField('temperature')}
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-streamNumber" className="text-xs">
            {t('segments.fields.streamNumber')}
          </Label>
          {textField('streamNumber')}
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-h2sMoleFraction" className="text-xs">
            {t('segments.fields.h2s')}
          </Label>
          {numberField('h2sMoleFraction', (v) =>
            v < 0 || v > 1 ? 'segments.errors.fraction' : null,
          )}
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="segment-molecularWeightOrDensity" className="text-xs">
            {t('segments.fields.molecularWeightOrDensity')}
          </Label>
          {numberField('molecularWeightOrDensity', (v) =>
            v <= 0 ? 'segments.errors.positive' : null,
          )}
        </div>
      </div>

      <Heading>{t('segments.details.esdvs')}</Heading>
      {esdvs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('segments.details.esdvsHint')}</p>
      ) : (
        <ul className="space-y-0.5" data-testid="segment-esdvs">
          {esdvs.map((marker) => (
            <li key={marker.id}>
              <button
                type="button"
                onClick={() => showMarker(marker.id)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-start hover:bg-accent"
              >
                <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--esdv)]" />
                <span className="font-mono text-xs">{marker.esdv!.tag || 'ESDV'}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t(
                    `segments.details.esdvSide.${marker.esdv!.upstreamSegmentId === segment.id ? 'upstream' : 'downstream'}`,
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {esdvs.length > 0 && esdvs.length < 2 && (
        <p className="flex items-center gap-1 text-xs text-marker-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t('segments.details.esdvsFew', { count: esdvs.length })}
        </p>
      )}

      <Heading>{t('segments.details.drawings')}</Heading>
      {linked.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('segments.details.noDrawings')}</p>
      )}
      <ul className="space-y-0.5" data-testid="segment-drawings">
        {linked.map((drawing) => {
          const name = drawingDisplayName(drawing);
          return (
            <li key={drawing.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => showSegmentOnDrawing(segment.id, drawing.id)}
                aria-label={t('segments.details.open', { drawing: name })}
                className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-start hover:bg-accent"
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">{name}</span>
                <span className="ms-auto text-xs whitespace-nowrap text-muted-foreground">
                  {t('segments.details.markerCount', { count: markerCounts.get(drawing.id) ?? 0 })}
                </span>
              </button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6 opacity-60 group-hover:opacity-100"
                aria-label={t('segments.details.unlink', { drawing: name })}
                onClick={() => unlinkDrawingCommand(segment.id, drawing.id)}
                disabled={readOnly}
              >
                <X />
              </Button>
            </li>
          );
        })}
      </ul>
      {unlinked.length > 0 && (
        <Select
          value=""
          onValueChange={(drawingId) => linkDrawingCommand(segment.id, drawingId)}
          disabled={readOnly}
        >
          <SelectTrigger
            className="h-8 w-full text-xs"
            aria-label={t('segments.details.linkDrawing')}
          >
            <SelectValue placeholder={t('segments.details.linkDrawing')} />
          </SelectTrigger>
          <SelectContent>
            {unlinked.map((drawing) => (
              <SelectItem key={drawing.id} value={drawing.id}>
                {drawingDisplayName(drawing)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Heading>{t('segments.details.review')}</Heading>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="segment-countedBy" className="text-xs">
            {t('segments.fields.countedBy')}
          </Label>
          <CommitInput
            id="segment-countedBy"
            value={segment.countedBy}
            onCommit={(countedBy) => update({ countedBy })}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="segment-checkedBy" className="text-xs">
            {t('segments.fields.checkedBy')}
          </Label>
          <CommitInput
            id="segment-checkedBy"
            value={segment.checkedBy}
            onCommit={(checkedBy) => update({ checkedBy })}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('segments.details.moveUp', { label: segment.label })}
          onClick={() => moveSegmentCommand(segment.id, -1)}
          disabled={readOnly || position <= 0}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('segments.details.moveDown', { label: segment.label })}
          onClick={() => moveSegmentCommand(segment.id, 1)}
          disabled={readOnly || position >= segmentCount - 1}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMerging(true)}
          disabled={readOnly || segmentCount < 2}
        >
          <Merge /> {t('segments.details.merge')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setDeleting(true)}
          disabled={readOnly}
        >
          <Trash2 /> {t('segments.details.delete')}
        </Button>
      </div>
      {deleting && <DeleteSegmentDialog segment={segment} onClose={() => setDeleting(false)} />}
      {merging && <MergeSegmentDialog segment={segment} onClose={() => setMerging(false)} />}
    </div>
  );
}
