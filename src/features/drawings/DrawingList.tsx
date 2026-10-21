import { FolderTree, List, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { drawingMatches } from '@/domain/drawings';
import { sortedUnits } from '@/domain/plant';
import type { Drawing } from '@/domain/schema/types';
import { usePreferences, type DrawingListView } from '@/store/preferences';
import { useMarkerCountsByDrawing, useOrderedDrawings } from '@/store/selectors';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useChangingDrawings } from '@/features/history/history-store';
import { DrawingRow } from './DrawingRow';
import { PlantTree } from './PlantTree';

const EMPTY: never[] = [];

export interface DrawingListProps {
  onImport?: () => void;
}

/**
 * Left-pane drawing list with search (FDS section 6). It shows all the
 * drawings in one list, or organised as the plant breakdown: plant, unit,
 * drawing (DRW-11).
 */
export function DrawingList({ onImport }: DrawingListProps) {
  const { t } = useTranslation();
  const drawings = useOrderedDrawings();
  const counts = useMarkerCountsByDrawing();
  const units = useProjectStore((s) => s.doc?.plantUnits) ?? EMPTY;
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const openDrawing = useUiStore((s) => s.openDrawing);
  const readOnly = useProjectStore((s) => s.readOnly);
  const view = usePreferences((s) => s.drawingListView);
  const setView = usePreferences((s) => s.setDrawingListView);
  const changing = useChangingDrawings();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // A unit being named, with the drawings to file under it once it is.
  const [newUnit, setNewUnit] = useState<readonly string[] | null>(null);
  const visible = useMemo(
    () => drawings.filter((d) => drawingMatches(d, query)),
    [drawings, query],
  );
  const unitChoices = useMemo(() => sortedUnits(units), [units]);

  const startNewUnit = (drawingIds: readonly string[]) => {
    // Units are named in the organised view, where the new one appears.
    setView('organised');
    setNewUnit(drawingIds);
  };
  const renderDrawing = (drawing: Drawing, indent = 0) => (
    <DrawingRow
      key={drawing.id}
      drawing={drawing}
      markerCount={counts.get(drawing.id) ?? 0}
      active={drawing.id === activeDrawingId}
      changing={changing.has(drawing.id)}
      readOnly={readOnly}
      renaming={drawing.id === renamingId}
      units={unitChoices}
      indent={indent}
      draggable={view === 'organised'}
      onOpen={() => openDrawing(drawing.id)}
      onRename={() => setRenamingId(drawing.id)}
      onRenameEnd={() => setRenamingId(null)}
      onNewUnit={() => startNewUnit([drawing.id])}
    />
  );

  return (
    <section aria-labelledby="drawings-heading" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-1 ps-3 pe-1 pt-2 pb-1">
        <h2
          id="drawings-heading"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t('drawings.title')}
        </h2>
        <div className="flex items-center gap-0.5">
          <ToggleGroup
            type="single"
            size="sm"
            value={view}
            onValueChange={(value) => {
              if (!value) return;
              setView(value as DrawingListView);
              if (value === 'all') setNewUnit(null);
            }}
            aria-label={t('drawings.view')}
            className="gap-0.5"
          >
            <ToggleGroupItem
              value="all"
              aria-label={t('drawings.viewAll')}
              title={t('drawings.viewAll')}
              className="h-7 min-w-7 px-1.5"
            >
              <List />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="organised"
              aria-label={t('drawings.viewOrganised')}
              title={t('drawings.viewOrganised')}
              className="h-7 min-w-7 px-1.5"
            >
              <FolderTree />
            </ToggleGroupItem>
          </ToggleGroup>
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
      {view === 'organised' ? (
        <PlantTree
          drawings={drawings}
          query={query}
          readOnly={readOnly}
          newUnit={newUnit}
          onNewUnit={startNewUnit}
          onNewUnitEnd={() => setNewUnit(null)}
          onImport={onImport}
          renderDrawing={renderDrawing}
        />
      ) : (
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
          {visible.map((drawing) => renderDrawing(drawing))}
        </ul>
      )}
    </section>
  );
}
