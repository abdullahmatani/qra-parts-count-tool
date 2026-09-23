import { FileImage, FileText, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { drawingDisplayName } from '@/domain/drawings';
import type { Drawing } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useMarkerCountsByDrawing, useOrderedDrawings } from '@/store/selectors';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

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
        {visible.map((drawing) => {
          const Icon = drawing.fileType === 'pdf' ? FileText : FileImage;
          const count = counts.get(drawing.id) ?? 0;
          const active = drawing.id === activeDrawingId;
          return (
            <li key={drawing.id}>
              <button
                type="button"
                onClick={() => openDrawing(drawing.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex h-row w-full items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-accent',
                  active && 'bg-accent font-medium',
                )}
                title={drawing.title || drawing.fileName}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {drawingDisplayName(drawing)}
                </span>
                {drawing.revision && (
                  <span className="text-xs text-muted-foreground">{drawing.revision}</span>
                )}
                {count > 0 && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-foreground/60"
                    aria-label={`${count} markers`}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
