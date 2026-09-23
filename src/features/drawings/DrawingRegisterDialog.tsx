import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { VirtualTable } from '@/components/data/VirtualTable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { removeDrawing, updateDrawing, type DrawingMetadata } from '@/domain/actions/drawings';
import { drawingDisplayName, paperSizeName } from '@/domain/drawings';
import { segmentAppearance } from '@/domain/palette';
import type { Drawing, Segment } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import {
  useMarkerCountsByDrawing,
  useOrderedDrawings,
  useOrderedSegments,
} from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
import { openDrawingImport } from './import-actions';

type TextField = 'drawingNo' | 'sheet' | 'title' | 'revision';

interface Row {
  drawing: Drawing;
  order: number;
  segments: Segment[];
  markers: number;
}

/** Inline-editable metadata cell (DRW-04). Commits on Enter or blur; Escape reverts. */
function EditableCell({
  drawing,
  field,
  readOnly,
  mono,
}: {
  drawing: Drawing;
  field: TextField;
  readOnly: boolean;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  const value = drawing[field];
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === value) return;
    const patch: Partial<DrawingMetadata> = { [field]: next };
    useProjectStore
      .getState()
      .apply(t('register.historyEdit'), (doc) => updateDrawing(doc, drawing.id, patch));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      event.stopPropagation();
      setDraft(null);
    }
  };
  return (
    <Input
      value={draft ?? value}
      readOnly={readOnly}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-label={`${t(`register.columns.${field}`)} ${drawingDisplayName(drawing)}`}
      className={cn(
        'h-7 rounded-sm border-transparent bg-transparent px-1.5 text-sm shadow-none hover:border-input focus-visible:border-ring',
        mono && 'font-mono text-xs',
      )}
    />
  );
}

/** Drawing register: table of drawings with editable metadata (FDS section 6, DRW-04). */
export function DrawingRegisterDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'drawingRegister');
  const openDialog = useUiStore((s) => s.openDialog);
  const openDrawing = useUiStore((s) => s.openDrawing);
  const readOnly = useProjectStore((s) => s.readOnly);
  const drawings = useOrderedDrawings();
  const segments = useOrderedSegments();
  const markerCounts = useMarkerCountsByDrawing();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');
  const [removing, setRemoving] = useState<Drawing | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      drawings.map((drawing, index) => ({
        drawing,
        order: index + 1,
        segments: segments.filter((s) => s.drawingIds.includes(drawing.id)),
        markers: markerCounts.get(drawing.id) ?? 0,
      })),
    [drawings, segments, markerCounts],
  );

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: 'order', header: t('register.columns.order'), accessorFn: (r) => r.order, size: 44 },
      {
        id: 'drawingNo',
        header: t('register.columns.drawingNo'),
        accessorFn: (r) => r.drawing.drawingNo,
        cell: ({ row }) => (
          <EditableCell drawing={row.original.drawing} field="drawingNo" readOnly={readOnly} mono />
        ),
        size: 170,
      },
      {
        id: 'sheet',
        header: t('register.columns.sheet'),
        accessorFn: (r) => r.drawing.sheet,
        cell: ({ row }) => (
          <EditableCell drawing={row.original.drawing} field="sheet" readOnly={readOnly} mono />
        ),
        size: 64,
      },
      {
        id: 'title',
        header: t('register.columns.title'),
        accessorFn: (r) => r.drawing.title,
        cell: ({ row }) => (
          <EditableCell drawing={row.original.drawing} field="title" readOnly={readOnly} />
        ),
        size: 260,
      },
      {
        id: 'revision',
        header: t('register.columns.revision'),
        accessorFn: (r) => r.drawing.revision,
        cell: ({ row }) => (
          <EditableCell drawing={row.original.drawing} field="revision" readOnly={readOnly} mono />
        ),
        size: 56,
      },
      {
        id: 'file',
        header: t('register.columns.file'),
        accessorFn: (r) => `${r.drawing.fileName} ${r.drawing.page ?? ''}`,
        cell: ({ row }) => (
          <span
            className="truncate text-xs text-muted-foreground"
            title={row.original.drawing.fileName}
          >
            {row.original.drawing.fileName}
            {row.original.drawing.page
              ? ` · ${t('register.page', { page: row.original.drawing.page })}`
              : ''}
          </span>
        ),
        size: 200,
      },
      {
        id: 'size',
        header: t('register.columns.size'),
        accessorFn: (r) => paperSizeName(r.drawing.size),
        size: 64,
      },
      {
        id: 'segments',
        header: t('register.columns.segments'),
        accessorFn: (r) => r.segments.map((s) => s.label).join(' '),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.segments.map((segment) => (
              <span key={segment.id} className="flex items-center gap-1 text-xs">
                <span
                  className="size-2 rounded-sm"
                  style={{ background: segmentAppearance(segment.colour).cssVar }}
                />
                {segment.label}
              </span>
            ))}
          </span>
        ),
        size: 140,
      },
      {
        id: 'markers',
        header: t('register.columns.markers'),
        accessorFn: (r) => r.markers,
        size: 70,
      },
      {
        id: 'hash',
        header: t('register.columns.hash'),
        accessorFn: (r) => r.drawing.fileHash,
        cell: ({ row }) => (
          <span
            className="font-mono text-xs text-muted-foreground"
            title={row.original.drawing.fileHash}
          >
            {row.original.drawing.fileHash.slice(0, 8)}
          </span>
        ),
        enableSorting: false,
        size: 80,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex justify-end gap-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`${t('register.open')} ${drawingDisplayName(row.original.drawing)}`}
              title={t('register.open')}
              onClick={() => {
                openDrawing(row.original.drawing.id);
                openDialog(null);
              }}
            >
              <ExternalLink />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={readOnly}
              aria-label={`${t('register.remove')} ${drawingDisplayName(row.original.drawing)}`}
              title={t('register.remove')}
              onClick={() => setRemoving(row.original.drawing)}
            >
              <Trash2 />
            </Button>
          </span>
        ),
        size: 76,
      },
    ],
    [t, readOnly, openDrawing, openDialog],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.drawing.id,
  });
  const tableRows = table.getRowModel().rows;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'drawingRegister' : null)}>
        <DialogContent className="flex h-[85vh] max-w-[min(1400px,95vw)] flex-col sm:max-w-[min(1400px,95vw)]">
          <DialogHeader>
            <DialogTitle>{t('register.title')}</DialogTitle>
            <DialogDescription>{t('register.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('register.search')}
                aria-label={t('register.search')}
                className="h-8 ps-8"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {t('register.count', { count: tableRows.length })}
            </span>
            <Button size="sm" className="ms-auto" disabled={readOnly} onClick={openDrawingImport}>
              <Plus /> {t('drawings.import')}
            </Button>
          </div>
          <VirtualTable
            table={table}
            className="flex-1"
            testId="drawing-register"
            rowHeight={36}
            rowAttributes={(row) => ({ 'data-drawing-id': row.id })}
            empty={
              <p className="p-6 text-center text-sm text-muted-foreground">{t('register.empty')}</p>
            }
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing && t('register.removeTitle', { name: drawingDisplayName(removing) })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('register.removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removing) return;
                const id = removing.id;
                useProjectStore
                  .getState()
                  .apply(t('register.historyRemove'), (doc) => removeDrawing(doc, id));
                useUiStore.getState().closeDrawing(id);
                setRemoving(null);
              }}
            >
              {t('register.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
