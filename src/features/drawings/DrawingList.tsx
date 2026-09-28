import {
  AlertTriangle,
  FileImage,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { drawingDisplayName } from '@/domain/drawings';
import type { Drawing } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useMarkerCountsByDrawing, useOrderedDrawings } from '@/store/selectors';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { renameDrawingCommand, requestDeleteDrawing } from './drawing-commands';

function matches(drawing: Drawing, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [drawing.drawingNo, drawing.title, drawing.fileName, drawing.sheet, drawing.revision]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export interface DrawingListProps {
  onImport?: () => void;
}

/** Left-pane drawing list with search (FDS section 6). */
export function DrawingList({ onImport }: DrawingListProps) {
  const { t } = useTranslation();
  const drawings = useOrderedDrawings();
  const counts = useMarkerCountsByDrawing();
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const openDrawing = useUiStore((s) => s.openDrawing);
  const readOnly = useProjectStore((s) => s.readOnly);
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const visible = useMemo(() => drawings.filter((d) => matches(d, query)), [drawings, query]);

  return (
    <section aria-labelledby="drawings-heading" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between ps-3 pe-1 pt-2 pb-1">
        <h2
          id="drawings-heading"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t('drawings.title')}
        </h2>
        {onImport && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('drawings.import')}
            disabled={readOnly}
            onClick={onImport}
          >
            <Plus />
          </Button>
        )}
      </div>
      <div className="relative px-2 pb-2">
        <Search className="pointer-events-none absolute start-4 top-2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('drawings.searchPlaceholder')}
          aria-label={t('drawings.searchPlaceholder')}
          className="h-8 ps-8 text-sm"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" data-testid="drawing-list">
        {drawings.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {t('drawings.empty')}{' '}
            {onImport && !readOnly && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={onImport}>
                {t('drawings.import')}
              </Button>
            )}
          </li>
        )}
        {drawings.length > 0 && visible.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{t('drawings.noMatch')}</li>
        )}
        {visible.map((drawing) => (
          <DrawingRow
            key={drawing.id}
            drawing={drawing}
            markerCount={counts.get(drawing.id) ?? 0}
            active={drawing.id === activeDrawingId}
            readOnly={readOnly}
            renaming={drawing.id === renamingId}
            onOpen={() => openDrawing(drawing.id)}
            onRename={() => setRenamingId(drawing.id)}
            onRenameEnd={() => setRenamingId(null)}
          />
        ))}
      </ul>
    </section>
  );
}

interface DrawingRowProps {
  drawing: Drawing;
  markerCount: number;
  active: boolean;
  readOnly: boolean;
  renaming: boolean;
  onOpen: () => void;
  onRename: () => void;
  onRenameEnd: () => void;
}

/**
 * One drawing in the list: click to open it. Its menu (the ⋯ button, or a
 * right-click on the row) renames it in place or deletes it; F2 renames too.
 */
function DrawingRow({
  drawing,
  markerCount,
  active,
  readOnly,
  renaming,
  onOpen,
  onRename,
  onRenameEnd,
}: DrawingRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Renaming from the menu: the menu must not take the focus back from the name field.
  const keepFocus = useRef(false);
  // A rename ended from the keyboard gives the focus back to the drawing.
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!renaming && refocus.current) button.current?.focus();
    refocus.current = false;
  }, [renaming]);
  const name = drawingDisplayName(drawing);
  const Icon = drawing.fileType === 'pdf' ? FileText : FileImage;

  return (
    <li
      className={cn(
        'group flex h-row items-center rounded-md hover:bg-accent',
        active && 'bg-accent font-medium',
      )}
      data-drawing-id={drawing.id}
      onContextMenu={(event) => {
        if (readOnly || renaming) return;
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      {renaming ? (
        <RenameField
          drawing={drawing}
          onDone={(fromKeyboard) => {
            refocus.current = fromKeyboard;
            onRenameEnd();
          }}
        />
      ) : (
        <button
          ref={button}
          type="button"
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === 'F2' && !readOnly) {
              event.preventDefault();
              onRename();
            }
          }}
          aria-current={active ? 'true' : undefined}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md ps-2 text-start text-sm"
          title={drawing.title || drawing.fileName}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
          {drawing.needsReview && (
            <AlertTriangle
              className="size-3.5 shrink-0 text-marker-warning"
              aria-label={t('drawings.review.flag')}
              data-testid="drawing-needs-review"
            />
          )}
          {drawing.revision && (
            <span className="text-xs text-muted-foreground">{drawing.revision}</span>
          )}
          {markerCount > 0 && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-foreground/60"
              aria-label={`${markerCount} markers`}
            />
          )}
        </button>
      )}
      {!readOnly && !renaming && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('drawings.actions', { name })}
              className="me-0.5 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (keepFocus.current) event.preventDefault();
              keepFocus.current = false;
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                keepFocus.current = true;
                onRename();
              }}
            >
              <Pencil /> {t('drawings.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => requestDeleteDrawing(drawing.id)}
            >
              <Trash2 /> {t('drawings.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** The drawing number, edited in place: Enter or leaving the field renames, Esc cancels. */
function RenameField({
  drawing,
  onDone,
}: {
  drawing: Drawing;
  onDone: (fromKeyboard: boolean) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(drawing.drawingNo);
  const done = useRef(false);
  const finish = (save: boolean, fromKeyboard: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) renameDrawingCommand(drawing.id, value);
    onDone(fromKeyboard);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true, true);
    } else if (event.key === 'Escape') {
      // Esc cancels the rename, not the workspace's tool or selection.
      event.preventDefault();
      event.stopPropagation();
      finish(false, true);
    }
  };
  return (
    <Input
      autoFocus
      value={value}
      placeholder={drawing.fileName}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(true, false)}
      onKeyDown={onKeyDown}
      aria-label={t('drawings.renameLabel', { name: drawingDisplayName(drawing) })}
      data-testid="drawing-rename"
      className="mx-1 h-7 px-1.5 font-mono text-xs"
    />
  );
}
