import type { Draft } from 'immer';
import { ArrowUp, Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  addBin,
  addBinSet,
  addEquipmentType,
  addStarterLibrary,
  deleteBin,
  deleteBinSet,
  deleteEquipmentType,
  moveEquipmentType,
  renameBinSet,
  setEsdvEquipmentType,
  updateBin,
  updateDataset,
  updateEquipmentType,
  type EquipmentTypePatch,
} from '@/domain/actions/library';
import { checkBinSet } from '@/domain/count/bins';
import type { ProjectDoc } from '@/domain/model';
import { EquipmentCategory } from '@/domain/schema/v1';
import type { Bin, BinSet, EquipmentType } from '@/domain/schema/types';
import i18n from '@/i18n';
import { cn } from '@/lib/utils';
import { CommitInput } from '@/features/segments/fields';
import { parseOptionalNumber } from '@/features/segments/parse';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { exportLibraryFile, importLibraryFile } from './library-file-actions';

const t = i18n.t.bind(i18n);
const NONE = '__none__';
const CATEGORIES = EquipmentCategory.options;

function edit(recipe: (draft: Draft<ProjectDoc>) => void, key?: string, label?: string): void {
  useProjectStore
    .getState()
    .apply(label ?? t('library.history.edit'), recipe, key ? { coalesceKey: key } : undefined);
}

function BinSetSelect({
  value,
  binSets,
  onChange,
  label,
  disabled,
}: {
  value: string | null;
  binSets: BinSet[];
  onChange: (id: string | null) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-full text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('library.types.none')}</SelectItem>
        {binSets.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TypeRow({
  type,
  index,
  binSets,
  itemCount,
  readOnly,
}: {
  type: EquipmentType;
  index: number;
  binSets: BinSet[];
  itemCount: number;
  readOnly: boolean;
}) {
  const update = (patch: EquipmentTypePatch, field: string) =>
    edit((d) => updateEquipmentType(d, type.id, patch), `type:${type.id}:${field}`);
  return (
    <tr className="border-b align-top" data-testid="library-type">
      <td className="py-1 pe-1">
        <CommitInput
          aria-label={t('library.types.name')}
          value={type.name}
          validate={(v) => (v.trim() ? null : 'segments.errors.labelRequired')}
          onCommit={(name) => update({ name: name.trim() }, 'name')}
          className="h-8 text-xs"
          disabled={readOnly}
        />
      </td>
      <td className="py-1 pe-1">
        <Select
          value={type.category}
          onValueChange={(category) =>
            update({ category: category as EquipmentType['category'] }, 'category')
          }
          disabled={readOnly}
        >
          <SelectTrigger className="h-8 w-full text-xs" aria-label={t('library.types.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`library.categories.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pe-1 text-center">
        <Switch
          checked={type.hasActuation}
          onCheckedChange={(hasActuation) => update({ hasActuation }, 'hasActuation')}
          aria-label={`${t('library.types.actuation')}: ${type.name}`}
          disabled={readOnly}
        />
      </td>
      <td className="space-y-1 py-1 pe-1">
        {type.hasActuation ? (
          <>
            <BinSetSelect
              label={t('library.types.manualBins')}
              value={type.actuationBinSetIds.manual ?? type.binSetId}
              binSets={binSets}
              onChange={(id) =>
                update({ actuationBinSetIds: { ...type.actuationBinSetIds, manual: id } }, 'manual')
              }
              disabled={readOnly}
            />
            <BinSetSelect
              label={t('library.types.automatedBins')}
              value={type.actuationBinSetIds.automated ?? type.binSetId}
              binSets={binSets}
              onChange={(id) =>
                update(
                  { actuationBinSetIds: { ...type.actuationBinSetIds, automated: id } },
                  'automated',
                )
              }
              disabled={readOnly}
            />
          </>
        ) : (
          <BinSetSelect
            label={t('library.types.binSet')}
            value={type.binSetId}
            binSets={binSets}
            onChange={(binSetId) => update({ binSetId }, 'binSet')}
            disabled={readOnly}
          />
        )}
      </td>
      <td className="py-2 pe-1 text-center">
        <Switch
          checked={type.sizeRequired}
          onCheckedChange={(sizeRequired) => update({ sizeRequired }, 'sizeRequired')}
          aria-label={`${t('library.types.sizeRequired')}: ${type.name}`}
          disabled={readOnly}
        />
      </td>
      <td className="py-1 pe-1">
        <CommitInput
          aria-label={t('library.types.datasetCategory')}
          value={type.datasetCategory}
          onCommit={(datasetCategory) => update({ datasetCategory }, 'datasetCategory')}
          className="h-8 text-xs"
          disabled={readOnly}
        />
      </td>
      <td className="py-1 pe-1">
        <CommitInput
          aria-label={t('library.types.excelKey')}
          value={type.excelKey}
          onCommit={(excelKey) => update({ excelKey }, 'excelKey')}
          className="h-8 font-mono text-xs"
          disabled={readOnly}
        />
      </td>
      <td className="py-1 pe-1">
        <CommitInput
          aria-label={`${t('library.types.shortcut')}: ${type.name}`}
          value={type.shortcut ?? ''}
          maxLength={1}
          onCommit={(key) => update({ shortcut: key.trim() || null }, 'shortcut')}
          className="h-8 w-10 text-center font-mono text-xs"
          disabled={readOnly}
        />
      </td>
      <td className="py-1 whitespace-nowrap">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('library.types.moveUp', { name: type.name })}
          disabled={readOnly || index === 0}
          onClick={() => edit((d) => moveEquipmentType(d, type.id, index - 1))}
        >
          <ArrowUp />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('library.types.delete', { name: type.name })}
          title={itemCount ? t('library.types.inUse', { count: itemCount }) : undefined}
          disabled={readOnly}
          onClick={() =>
            edit(
              (d) => deleteEquipmentType(d, type.id),
              undefined,
              t('library.history.deleteType', { name: type.name }),
            )
          }
        >
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}

function TypesTab({ readOnly }: { readOnly: boolean }) {
  const library = useProjectStore((s) => s.doc!.library);
  const items = useProjectStore((s) => s.doc!.items);
  const counts = new Map<string, number>();
  for (const item of Object.values(items)) {
    if (item.equipmentTypeId)
      counts.set(item.equipmentTypeId, (counts.get(item.equipmentTypeId) ?? 0) + 1);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="esdv-type">{t('library.types.esdvType')}</Label>
          <Select
            value={library.esdvEquipmentTypeId ?? NONE}
            onValueChange={(id) => edit((d) => setEsdvEquipmentType(d, id === NONE ? null : id))}
            disabled={readOnly}
          >
            <SelectTrigger id="esdv-type" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('library.types.none')}</SelectItem>
              {library.equipmentTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="max-w-md text-xs text-muted-foreground">
            {t('library.types.esdvTypeHint')}
          </p>
        </div>
        <div className="ms-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            title={t('library.types.starterHint')}
            onClick={() =>
              edit((d) => void addStarterLibrary(d), undefined, t('library.history.starter'))
            }
            disabled={readOnly}
          >
            {t('library.types.starter')}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              edit((d) => void addEquipmentType(d), undefined, t('library.history.addType'))
            }
            disabled={readOnly}
          >
            <Plus /> {t('library.types.add')}
          </Button>
        </div>
      </div>
      {library.equipmentTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('library.types.empty')}</p>
      ) : (
        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
              <tr className="text-start">
                <th className="w-44 p-2 text-start font-medium">{t('library.types.name')}</th>
                <th className="w-40 p-2 text-start font-medium">{t('library.types.category')}</th>
                <th className="w-20 p-2 font-medium">{t('library.types.actuation')}</th>
                <th className="w-44 p-2 text-start font-medium">{t('library.types.binSet')}</th>
                <th className="w-16 p-2 font-medium">{t('library.types.sizeRequired')}</th>
                <th className="p-2 text-start font-medium">{t('library.types.datasetCategory')}</th>
                <th className="w-28 p-2 text-start font-medium">{t('library.types.excelKey')}</th>
                <th className="w-12 p-2 font-medium">{t('library.types.shortcut')}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="[&_td:first-child]:ps-2">
              {library.equipmentTypes.map((type, index) => (
                <TypeRow
                  key={type.id}
                  type={type}
                  index={index}
                  binSets={library.binSets}
                  itemCount={counts.get(type.id) ?? 0}
                  readOnly={readOnly}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function edgeText(value: number | null): string {
  return value === null ? '' : String(value);
}

function BinRow({ binSet, bin, readOnly }: { binSet: BinSet; bin: Bin; readOnly: boolean }) {
  const update = (patch: Partial<Bin>, field: string) =>
    edit((d) => updateBin(d, binSet.id, bin.id, patch), `bin:${bin.id}:${field}`);
  const numberInput = (key: 'lower' | 'upper', label: string) => (
    <CommitInput
      aria-label={`${label}: ${bin.label}`}
      inputMode="decimal"
      value={edgeText(bin[key])}
      placeholder={t('library.bins.open')}
      validate={(text) => {
        const v = parseOptionalNumber(text);
        return v === 'invalid' || (v !== null && v < 0) ? 'segments.errors.number' : null;
      }}
      onCommit={(text) => update({ [key]: parseOptionalNumber(text) as number | null }, key)}
      className="h-8 w-20 text-end font-mono text-xs"
      disabled={readOnly}
    />
  );
  const inclusive = (key: 'lowerInclusive' | 'upperInclusive', label: string) => (
    <Select
      value={bin[key] ? 'yes' : 'no'}
      onValueChange={(v) => update({ [key]: v === 'yes' }, key)}
      disabled={readOnly}
    >
      <SelectTrigger className="h-8 w-14 text-xs" aria-label={`${label}: ${bin.label}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="no">&lt;</SelectItem>
        <SelectItem value="yes">≤</SelectItem>
      </SelectContent>
    </Select>
  );
  return (
    <tr className="border-b" data-testid="library-bin">
      <td className="py-1 pe-1">{numberInput('lower', t('library.bins.lower'))}</td>
      <td className="py-1 pe-1">{inclusive('lowerInclusive', t('library.bins.lowerEdge'))}</td>
      <td className="px-1 py-1 text-center font-mono text-muted-foreground">x</td>
      <td className="py-1 pe-1">{inclusive('upperInclusive', t('library.bins.upperEdge'))}</td>
      <td className="py-1 pe-1">{numberInput('upper', t('library.bins.upper'))}</td>
      <td className="py-1 pe-1">
        <CommitInput
          aria-label={`${t('library.bins.label')}: ${bin.label}`}
          value={bin.label}
          validate={(v) => (v.trim() ? null : 'segments.errors.labelRequired')}
          onCommit={(label) => update({ label: label.trim() }, 'label')}
          className="h-8 text-xs"
          disabled={readOnly}
        />
      </td>
      <td className="py-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('library.bins.deleteBin', { label: bin.label })}
          onClick={() => edit((d) => deleteBin(d, binSet.id, bin.id))}
          disabled={readOnly}
        >
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}

function BinsTab({ readOnly }: { readOnly: boolean }) {
  const library = useProjectStore((s) => s.doc!.library);
  const [selectedId, setSelectedId] = useState<string | null>(library.binSets[0]?.id ?? null);
  const binSet = library.binSets.find((b) => b.id === selectedId) ?? library.binSets[0] ?? null;
  const labelOf = (id: string) => binSet?.bins.find((b) => b.id === id)?.label ?? id;
  const problems = binSet ? checkBinSet(binSet) : [];
  const users = binSet
    ? library.equipmentTypes.filter(
        (type) =>
          type.binSetId === binSet.id ||
          type.actuationBinSetIds.manual === binSet.id ||
          type.actuationBinSetIds.automated === binSet.id,
      )
    : [];

  const addSet = (copyFrom?: BinSet) => {
    let id = '';
    edit(
      (d) => {
        id = addBinSet(
          d,
          copyFrom ? `${copyFrom.name} (copy)` : t('library.bins.newName'),
          copyFrom?.id,
        );
      },
      undefined,
      t('library.history.addBinSet'),
    );
    if (id) setSelectedId(id);
  };

  return (
    <div className="grid grid-cols-[14rem_1fr] gap-4">
      <div className="space-y-2">
        <ul
          className="max-h-[50vh] space-y-0.5 overflow-y-auto"
          aria-label={t('library.bins.sets')}
        >
          {library.binSets.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setSelectedId(b.id)}
                aria-current={b.id === binSet?.id}
                className={cn(
                  'w-full truncate rounded px-2 py-1 text-start text-sm hover:bg-accent',
                  b.id === binSet?.id && 'bg-accent font-medium',
                )}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" onClick={() => addSet()} disabled={readOnly}>
          <Plus /> {t('library.bins.add')}
        </Button>
      </div>
      {binSet ? (
        <div className="space-y-3" key={binSet.id}>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="bin-set-name">{t('library.bins.name')}</Label>
              <CommitInput
                id="bin-set-name"
                value={binSet.name}
                validate={(v) => (v.trim() ? null : 'segments.errors.labelRequired')}
                onCommit={(name) =>
                  edit((d) => renameBinSet(d, binSet.id, name), `binset:${binSet.id}`)
                }
                disabled={readOnly}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addSet(binSet)}
              disabled={readOnly}
              aria-label={t('library.bins.copy', { name: binSet.name })}
            >
              <Copy />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() =>
                edit(
                  (d) => deleteBinSet(d, binSet.id),
                  undefined,
                  t('library.history.deleteBinSet', { name: binSet.name }),
                )
              }
              disabled={readOnly}
            >
              <Trash2 /> {t('library.bins.delete')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {users.length
              ? t('library.bins.usedBy', { types: users.map((u) => u.name).join(', ') })
              : t('library.bins.unused')}
          </p>
          <p className="text-xs text-muted-foreground">{t('library.bins.hint')}</p>
          <table className="text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-1 text-start font-medium">{t('library.bins.lower')}</th>
                <th />
                <th />
                <th />
                <th className="pb-1 text-start font-medium">{t('library.bins.upper')}</th>
                <th className="pb-1 text-start font-medium">{t('library.bins.label')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {binSet.bins.map((bin) => (
                <BinRow key={bin.id} binSet={binSet} bin={bin} readOnly={readOnly} />
              ))}
            </tbody>
          </table>
          <Button
            size="sm"
            variant="outline"
            onClick={() => edit((d) => void addBin(d, binSet.id))}
            disabled={readOnly}
          >
            <Plus /> {t('library.bins.addBin')}
          </Button>
          <ul className="space-y-0.5 text-xs" data-testid="bin-problems">
            {problems.length === 0 ? (
              <li className="text-muted-foreground">{t('library.bins.ok')}</li>
            ) : (
              problems.map((p, i) => (
                <li key={i} className="text-marker-warning">
                  {p.kind === 'emptyBin'
                    ? t('library.bins.problems.emptyBin', { a: labelOf(p.binId) })
                    : t(`library.bins.problems.${p.kind}`, {
                        a: labelOf(p.binIds[0]),
                        b: labelOf(p.binIds[1]),
                      })}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('library.bins.noSets')}</p>
      )}
    </div>
  );
}

function DatasetTab({ readOnly }: { readOnly: boolean }) {
  const library = useProjectStore((s) => s.doc!.library);
  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-muted-foreground">{t('library.dataset.hint')}</p>
      <div className="space-y-1">
        <Label htmlFor="dataset-name">{t('library.dataset.name')}</Label>
        <CommitInput
          id="dataset-name"
          value={library.datasetName}
          placeholder={t('library.dataset.namePlaceholder')}
          onCommit={(datasetName) => edit((d) => updateDataset(d, { datasetName }), 'dataset:name')}
          disabled={readOnly}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dataset-description">{t('library.dataset.description')}</Label>
        <Textarea
          id="dataset-description"
          value={library.datasetDescription}
          onChange={(event) =>
            edit(
              (d) => updateDataset(d, { datasetDescription: event.target.value }),
              'dataset:description',
            )
          }
          rows={4}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

/** CNT-02, CNT-04: the project's equipment types, bin sets and dataset. */
export function LibraryDialog() {
  const { t: tr } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'library');
  const openDialog = useUiStore((s) => s.openDialog);
  const readOnly = useProjectStore((s) => s.readOnly);
  const hasDoc = useProjectStore((s) => s.doc !== null);
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open && hasDoc} onOpenChange={(next) => openDialog(next ? 'library' : null)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{tr('library.title')}</DialogTitle>
          <DialogDescription>{tr('library.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportLibraryFile()}>
            <Download /> {tr('library.file.export')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => importRef.current?.click()}
          >
            <Upload /> {tr('library.file.import')}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="library-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importLibraryFile(file);
            }}
          />
          <p className="text-xs text-muted-foreground">{tr('library.file.hint')}</p>
        </div>
        {open && hasDoc && (
          <Tabs defaultValue="types">
            <TabsList>
              <TabsTrigger value="types">{tr('library.tabs.types')}</TabsTrigger>
              <TabsTrigger value="bins">{tr('library.tabs.bins')}</TabsTrigger>
              <TabsTrigger value="dataset">{tr('library.tabs.dataset')}</TabsTrigger>
            </TabsList>
            <TabsContent value="types" className="pt-3">
              <TypesTab readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="bins" className="pt-3">
              <BinsTab readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="dataset" className="pt-3">
              <DatasetTab readOnly={readOnly} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
