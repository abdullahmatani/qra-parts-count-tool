import { Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ITEM_FIELD_ORDER, columnLetters, splitCellRef } from '@/domain/export/excel-plan';
import {
  autoFillCountCells,
  countRowKeys,
  defaultMapping,
  duplicateCells,
  fromPortableMapping,
  isCellRef,
  rowBins,
  toPortableMapping,
  type CountRowKey,
  type PortableMapping,
} from '@/domain/export/mapping';
import { HeaderField, LayoutMode } from '@/domain/schema/v1';
import type {
  HeaderField as HeaderFieldName,
  Library,
  TemplateMapping,
} from '@/domain/schema/types';
import i18n from '@/i18n';
import { readFile, uniqueFileName, writeFile, getDirectory } from '@/lib/fs/files';
import { cn } from '@/lib/utils';
import { requireWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { downloadText } from '@/lib/download';
import { exportErrorMessage, TEMPLATES_DIR } from './export-actions';
import { previewTemplate, type SheetPreview } from './excel-writer';

type Target = { label: string; set: (ref: string) => void } | null;

function setMapping(mapping: TemplateMapping | null, coalesce = true): void {
  const project = useProjectStore.getState();
  project.apply(
    i18n.t('mapper.history'),
    (draft) => {
      draft.templateMapping = mapping;
    },
    coalesce ? { coalesceKey: 'template-mapping' } : undefined,
  );
}

/** A cell reference field; focusing it makes it the target for clicks in the preview. */
function RefInput({
  label,
  value,
  onChange,
  onFocusTarget,
  active,
  disabled,
  compact,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (ref: string | null) => void;
  onFocusTarget: (target: Target) => void;
  active: boolean;
  disabled: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value ?? '');
  const [shown, setShown] = useState(value ?? '');
  if (shown !== (value ?? '')) {
    setShown(value ?? '');
    setText(value ?? '');
  }
  const invalid = text.trim() !== '' && !isCellRef(text);
  const commit = (next: string) => {
    const trimmed = next.trim().toUpperCase();
    if (trimmed === '') onChange(null);
    else if (isCellRef(trimmed)) onChange(trimmed);
  };
  return (
    <Input
      aria-label={label}
      title={invalid ? t('mapper.cellInvalid') : label}
      value={text}
      placeholder={compact ? '' : t('mapper.cellPlaceholder')}
      onChange={(event) => setText(event.target.value)}
      onFocus={() =>
        onFocusTarget({
          label,
          set: (ref) => {
            setText(ref);
            commit(ref);
          },
        })
      }
      onBlur={() => commit(text)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit(text);
      }}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      className={cn(
        'h-7 font-mono text-xs uppercase',
        compact ? 'w-14 px-1 text-center' : 'w-24',
        active && 'ring-2 ring-[var(--marker-selection)]',
      )}
    />
  );
}

function PreviewGrid({
  sheet,
  mapped,
  onPick,
}: {
  sheet: SheetPreview;
  mapped: Map<string, string>;
  onPick: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const columns = sheet.rows[0]?.length ?? 0;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border" data-testid="template-preview">
      <table className="border-collapse font-mono text-[11px]">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="sticky left-0 z-20 w-8 border bg-muted" />
            {Array.from({ length: columns }, (_, c) => (
              <th key={c} className="min-w-16 border px-1 font-medium text-muted-foreground">
                {columnLetters(c + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, r) => (
            <tr key={r}>
              <th className="sticky left-0 border bg-muted px-1 text-end font-medium text-muted-foreground">
                {r + 1}
              </th>
              {row.map((value, c) => {
                const ref = `${columnLetters(c + 1)}${r + 1}`;
                const what = mapped.get(ref);
                return (
                  <td
                    key={c}
                    onClick={() => onPick(ref)}
                    title={what ? t('mapper.mapped', { what }) : ref}
                    data-cell={ref}
                    className={cn(
                      'max-w-40 cursor-cell truncate border px-1 hover:bg-accent',
                      what &&
                        'bg-[color-mix(in_oklab,var(--marker-selection)_18%,transparent)] font-semibold',
                    )}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CountCellsTab({
  mapping,
  library,
  update,
  target,
  onFocusTarget,
  disabled,
}: {
  mapping: TemplateMapping;
  library: Library;
  update: (patch: Partial<TemplateMapping>) => void;
  target: Target;
  onFocusTarget: (target: Target) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [start, setStart] = useState('');
  const rows = countRowKeys(library);
  const types = new Map(library.equipmentTypes.map((type) => [type.id, type]));
  const cellFor = (row: CountRowKey, binId: string) =>
    mapping.countCells.find(
      (c) =>
        c.equipmentTypeId === row.equipmentTypeId &&
        c.actuation === row.actuation &&
        c.binId === binId,
    )?.cell;
  const setCell = (row: CountRowKey, binId: string, ref: string | null) => {
    const others = mapping.countCells.filter(
      (c) =>
        !(
          c.equipmentTypeId === row.equipmentTypeId &&
          c.actuation === row.actuation &&
          c.binId === binId
        ),
    );
    update({
      countCells: ref ? [...others, { ...row, binId, cell: ref }] : others,
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('mapper.autoFill')}</Label>
          <RefInput
            label={t('mapper.autoFill')}
            value={start}
            onChange={(ref) => setStart(ref ?? '')}
            onFocusTarget={onFocusTarget}
            active={target?.label === t('mapper.autoFill')}
            disabled={disabled}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !isCellRef(start)}
          onClick={() => update({ countCells: autoFillCountCells(library, start, rows) })}
        >
          {t('mapper.autoFillButton')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || mapping.countCells.length === 0}
          onClick={() => update({ countCells: [] })}
        >
          {t('mapper.clearCounts')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('mapper.autoFillHint')}</p>
      <div className="max-h-[42vh] space-y-1 overflow-y-auto">
        {rows.map((row) => {
          const type = types.get(row.equipmentTypeId)!;
          const name = row.actuation
            ? `${type.name}, ${t(`count.actuation.${row.actuation}`).toLowerCase()}`
            : type.name;
          return (
            <div
              key={`${row.equipmentTypeId}|${row.actuation}`}
              className="flex items-center gap-1"
              data-testid="mapper-count-row"
            >
              <span className="w-44 shrink-0 truncate text-xs" title={name}>
                {name}
              </span>
              {rowBins(library, row).map((bin) => (
                <RefInput
                  key={bin.id}
                  compact
                  label={`${name} ${bin.label}`}
                  value={cellFor(row, bin.id)}
                  onChange={(ref) => setCell(row, bin.id, ref)}
                  onFocusTarget={onFocusTarget}
                  active={target?.label === `${name} ${bin.label}`}
                  disabled={disabled}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Section 7, roadmap #36 and #39: map count data to cells of the client's Excel template. */
export function TemplateMapperDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'templateMapper');
  const openDialog = useUiStore((s) => s.openDialog);
  const mapping = useProjectStore((s) => s.doc?.templateMapping ?? null);
  const library = useProjectStore((s) => s.doc?.library);
  const pipeLengthCounting = useProjectStore((s) => s.doc?.settings.pipeLengthCounting ?? false);
  const readOnly = useProjectStore((s) => s.readOnly);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mappingFileRef = useRef<HTMLInputElement>(null);

  // Load the template preview when the dialog opens or the template changes.
  const templateFile = mapping?.templateFile ?? null;
  useEffect(() => {
    if (!open || !templateFile) return;
    let cancelled = false;
    (async () => {
      const dir = requireWorkingDirectory();
      const file = await readFile(dir, `${TEMPLATES_DIR}/${templateFile}`);
      const preview = await previewTemplate(await file.arrayBuffer(), templateFile);
      if (!cancelled) {
        setSheets(preview);
        setError(null);
      }
    })().catch((e: unknown) => {
      if (!cancelled) {
        setSheets(null);
        setError(exportErrorMessage(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, templateFile]);

  const update = (patch: Partial<TemplateMapping>) => {
    if (mapping) setMapping({ ...mapping, ...patch });
  };

  const upload = async (file: File) => {
    try {
      const bytes = await file.arrayBuffer();
      const preview = await previewTemplate(bytes, file.name);
      const dir = requireWorkingDirectory();
      const templates = await getDirectory(dir, TEMPLATES_DIR, { create: true });
      const name = await uniqueFileName(templates, file.name);
      await writeFile(dir, `${TEMPLATES_DIR}/${name}`, file);
      const firstSheet = preview[0]?.name ?? 'Sheet1';
      const next = mapping
        ? {
            ...mapping,
            templateFile: name,
            sheet: preview.some((s) => s.name === mapping.sheet) ? mapping.sheet : firstSheet,
          }
        : defaultMapping(name, firstSheet);
      setMapping(next, false);
      setSheets(preview);
      setError(null);
      toast.success(t('mapper.uploaded', { file: name }));
    } catch (e) {
      setError(exportErrorMessage(e));
    }
  };

  const saveMappingFile = () => {
    if (!mapping || !library) return;
    const json = JSON.stringify(toPortableMapping(mapping, library), null, 2);
    downloadText(`${mapping.templateFile.replace(/\.xlsx$/i, '')}.mapping.json`, `${json}\n`);
  };

  const loadMappingFile = async (file: File) => {
    if (!library) return;
    try {
      const portable = JSON.parse(await file.text()) as PortableMapping;
      const result = fromPortableMapping(
        portable,
        library,
        mapping?.templateFile ?? portable.templateFile,
      );
      setMapping(result.mapping, false);
      if (result.unresolved.length) {
        toast.warning(t('mapper.loadedWithGaps', { count: result.unresolved.length }), {
          description: result.unresolved.slice(0, 8).join('\n'),
        });
      } else toast.success(t('mapper.loaded'));
    } catch {
      toast.error(t('mapper.loadFailed'));
    }
  };

  const mapped = useMemo(() => {
    const out = new Map<string, string>();
    if (!mapping || !library) return out;
    const types = new Map(library.equipmentTypes.map((type) => [type.id, type.name]));
    const bins = new Map(library.binSets.flatMap((b) => b.bins.map((bin) => [bin.id, bin.label])));
    const add = (ref: string | null | undefined, what: string) => {
      if (!ref) return;
      const { column, row } = splitCellRef(ref);
      if (row) out.set(`${column}${row}`, what);
    };
    for (const [field, ref] of Object.entries(mapping.headerFields)) {
      add(ref, t(`mapper.headerFields.${field as HeaderFieldName}`));
    }
    for (const c of mapping.countCells) {
      add(
        c.cell,
        `${types.get(c.equipmentTypeId) ?? '?'}${c.actuation ? ` (${c.actuation})` : ''} ${bins.get(c.binId) ?? ''}`,
      );
    }
    for (const c of mapping.pipeLengthCells) add(c.cell, `Pipe ${bins.get(c.binId) ?? ''}`);
    add(mapping.notesCell, t('mapper.notesCell'));
    return out;
  }, [mapping, library, t]);

  const sheet = sheets?.find((s) => s.name === mapping?.sheet) ?? sheets?.[0] ?? null;
  const duplicates = mapping ? duplicateCells(mapping) : [];
  const disabled = readOnly || !mapping;
  const focus = (next: Target) => setTarget(next);
  const pipe = library?.equipmentTypes.find((type) => type.category === 'pipe');
  const pipeBins =
    pipe && library ? rowBins(library, { equipmentTypeId: pipe.id, actuation: null }) : [];

  return (
    <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'templateMapper' : null)}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <DialogTitle>{t('mapper.title')}</DialogTitle>
          <DialogDescription>{t('mapper.description')}</DialogDescription>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          data-testid="template-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
        <input
          ref={mappingFileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadMappingFile(file);
            event.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="size-5 text-muted-foreground" />
          <span className="font-mono text-sm" data-testid="template-name">
            {mapping?.templateFile ?? t('mapper.noTemplate')}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={readOnly}
          >
            <Upload /> {mapping ? t('mapper.replace') : t('mapper.upload')}
          </Button>
          <span className="ms-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={saveMappingFile} disabled={!mapping}>
              <Download /> {t('mapper.saveFile')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => mappingFileRef.current?.click()}
              disabled={readOnly}
            >
              {t('mapper.loadFile')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setMapping(null, false)}
              disabled={disabled}
            >
              <Trash2 /> {t('mapper.remove')}
            </Button>
          </span>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {mapping && library && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="mapper-layout">
                    {t('mapper.layoutMode')}
                  </Label>
                  <Select
                    value={mapping.layoutMode}
                    onValueChange={(layoutMode) =>
                      update({ layoutMode: layoutMode as TemplateMapping['layoutMode'] })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger id="mapper-layout" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LayoutMode.options.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {t(`export.layoutModes.${mode}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="mapper-sheet">
                    {mapping.layoutMode === 'sheetPerSegment'
                      ? t('mapper.masterSheet')
                      : t('mapper.sheet')}
                  </Label>
                  <Select
                    value={mapping.sheet}
                    onValueChange={(name) => update({ sheet: name })}
                    disabled={disabled || !sheets}
                  >
                    <SelectTrigger id="mapper-sheet" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(sheets ?? [{ name: mapping.sheet, rows: [] }]).map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mapping.layoutMode === 'sheetPerSegment' && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs" htmlFor="mapper-pattern">
                      {t('mapper.sheetNamePattern')}
                    </Label>
                    <Input
                      id="mapper-pattern"
                      value={mapping.sheetNamePattern}
                      onChange={(event) => update({ sheetNamePattern: event.target.value })}
                      disabled={disabled}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                )}
                {(mapping.layoutMode === 'rowPerSegment' ||
                  mapping.layoutMode === 'flatItemList') && (
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="mapper-start">
                      {t('mapper.startRow')}
                    </Label>
                    <Input
                      id="mapper-start"
                      type="number"
                      min={1}
                      value={mapping.startRow}
                      onChange={(event) =>
                        update({ startRow: Math.max(1, Number(event.target.value) || 1) })
                      }
                      disabled={disabled}
                      className="h-8"
                    />
                  </div>
                )}
                {mapping.layoutMode === 'blockPerSegment' && (
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="mapper-offset">
                      {t('mapper.blockOffset')}
                    </Label>
                    <Input
                      id="mapper-offset"
                      type="number"
                      min={1}
                      value={mapping.blockOffset ?? ''}
                      onChange={(event) =>
                        update({
                          blockOffset:
                            Number(event.target.value) > 0
                              ? Math.round(Number(event.target.value))
                              : null,
                        })
                      }
                      disabled={disabled}
                      className="h-8"
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`mapper.layoutHints.${mapping.layoutMode}`)}
              </p>
              <p className="text-xs text-muted-foreground">{t('mapper.pickHint')}</p>
              {duplicates.length > 0 && (
                <p className="text-xs text-marker-warning">
                  {t('mapper.duplicates', { cells: duplicates.join(', ') })}
                </p>
              )}
              <Tabs defaultValue={mapping.layoutMode === 'flatItemList' ? 'items' : 'header'}>
                <TabsList className="flex-wrap">
                  <TabsTrigger value="header">{t('mapper.tabs.header')}</TabsTrigger>
                  {mapping.layoutMode !== 'flatItemList' && (
                    <TabsTrigger value="counts">{t('mapper.tabs.counts')}</TabsTrigger>
                  )}
                  {mapping.layoutMode !== 'flatItemList' && pipeLengthCounting && (
                    <TabsTrigger value="pipe">{t('mapper.tabs.pipe')}</TabsTrigger>
                  )}
                  {mapping.layoutMode !== 'flatItemList' && (
                    <TabsTrigger value="notes">{t('mapper.tabs.notes')}</TabsTrigger>
                  )}
                  {mapping.layoutMode === 'flatItemList' && (
                    <TabsTrigger value="items">{t('mapper.tabs.items')}</TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="header" className="max-h-[42vh] space-y-1 overflow-y-auto pt-2">
                  {HeaderField.options.map((field) => {
                    const label = t(`mapper.headerFields.${field}`);
                    return (
                      <div key={field} className="flex items-center justify-between gap-2">
                        <span className="text-xs">{label}</span>
                        <RefInput
                          label={label}
                          value={mapping.headerFields[field]}
                          onChange={(ref) => {
                            const next = { ...mapping.headerFields };
                            if (ref) next[field] = ref;
                            else delete next[field];
                            update({ headerFields: next });
                          }}
                          onFocusTarget={focus}
                          active={target?.label === label}
                          disabled={disabled}
                        />
                      </div>
                    );
                  })}
                </TabsContent>
                <TabsContent value="counts" className="pt-2">
                  <CountCellsTab
                    mapping={mapping}
                    library={library}
                    update={update}
                    target={target}
                    onFocusTarget={focus}
                    disabled={disabled}
                  />
                </TabsContent>
                <TabsContent value="pipe" className="space-y-1 pt-2">
                  {pipeBins.map((bin) => {
                    const label = `${t('mapper.tabs.pipe')} ${bin.label}`;
                    const current = mapping.pipeLengthCells.find((c) => c.binId === bin.id)?.cell;
                    return (
                      <div key={bin.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs">{bin.label}</span>
                        <RefInput
                          label={label}
                          value={current}
                          onChange={(ref) => {
                            const others = mapping.pipeLengthCells.filter(
                              (c) => c.binId !== bin.id,
                            );
                            update({
                              pipeLengthCells: ref
                                ? [...others, { binId: bin.id, cell: ref }]
                                : others,
                            });
                          }}
                          onFocusTarget={focus}
                          active={target?.label === label}
                          disabled={disabled}
                        />
                      </div>
                    );
                  })}
                </TabsContent>
                <TabsContent value="notes" className="space-y-2 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs">{t('mapper.notesCell')}</span>
                    <RefInput
                      label={t('mapper.notesCell')}
                      value={mapping.notesCell}
                      onChange={(ref) => update({ notesCell: ref })}
                      onFocusTarget={focus}
                      active={target?.label === t('mapper.notesCell')}
                      disabled={disabled}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('mapper.notesHint')}</p>
                </TabsContent>
                <TabsContent value="items" className="max-h-[42vh] space-y-1 overflow-y-auto pt-2">
                  {ITEM_FIELD_ORDER.map((field) => {
                    const label = t(`export.itemFields.${field}`);
                    return (
                      <div key={field} className="flex items-center justify-between gap-2">
                        <span className="text-xs">{label}</span>
                        <RefInput
                          label={label}
                          value={mapping.itemColumns[field]}
                          onChange={(ref) => {
                            const next = { ...mapping.itemColumns };
                            if (ref) next[field] = ref.replace(/\d+$/, '');
                            else delete next[field];
                            update({ itemColumns: next });
                          }}
                          onFocusTarget={focus}
                          active={target?.label === label}
                          disabled={disabled}
                        />
                      </div>
                    );
                  })}
                </TabsContent>
              </Tabs>
            </div>
            <div className="min-w-0 space-y-1">
              {sheet && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t('mapper.preview', { sheet: sheet.name })}
                  </p>
                  <PreviewGrid sheet={sheet} mapped={mapped} onPick={(ref) => target?.set(ref)} />
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
