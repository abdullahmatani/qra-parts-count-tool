import {
  ChevronRight,
  Factory,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  Inbox,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildPlantTree, plantName } from '@/domain/plant';
import type { Drawing } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { droppedDrawing, isDrawingDrag } from './drawing-drag';
import { NameField } from './DrawingRow';
import { openDrawingImportIntoUnit } from './import-actions';
import {
  addPlantUnitCommand,
  deletePlantUnitCommand,
  moveDrawingsToUnitCommand,
  renamePlantCommand,
  renamePlantUnitCommand,
} from './plant-commands';

/** Indentation per level of the tree, in px. */
const INDENT = 12;
const EMPTY: never[] = [];
/** Keys of the folders that are not units in the collapsed set. */
const PLANT = 'plant';
const UNASSIGNED = 'unassigned';

export interface PlantTreeProps {
  /** Every drawing, in the project's order. */
  drawings: readonly Drawing[];
  query: string;
  readOnly: boolean;
  /** Drawings to file under the unit being named; null while no unit is being added. */
  newUnit: readonly string[] | null;
  onNewUnit: (drawingIds: readonly string[]) => void;
  onNewUnitEnd: () => void;
  onImport?: () => void;
  renderDrawing: (drawing: Drawing, indent: number) => ReactNode;
}

/**
 * The drawing list organised as the plant breakdown (DRW-11): the plant
 * (the project's facility), its units, and under each unit its drawings by
 * drawing number. Drawings not filed under a unit are listed under
 * Unassigned. Drag a drawing onto a unit (or the plant, or Unassigned, to
 * take it out of its unit) to file it there.
 */
export function PlantTree({
  drawings,
  query,
  readOnly,
  newUnit,
  onNewUnit,
  onNewUnitEnd,
  onImport,
  renderDrawing,
}: PlantTreeProps) {
  const { t } = useTranslation();
  const units = useProjectStore((s) => s.doc?.plantUnits) ?? EMPTY;
  const plant = useProjectStore((s) => (s.doc ? plantName(s.doc) : ''));
  const tree = useMemo(() => buildPlantTree(drawings, units, query), [drawings, units, query]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const filtering = query.trim() !== '';
  // While filtering every folder is open, so no match is hidden.
  const isOpen = (key: string) => filtering || !collapsed.has(key);
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const addUnit = () => {
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(PLANT);
      return next;
    });
    onNewUnit([]);
  };
  const nothingShown = tree.units.length === 0 && tree.unassigned.length === 0;

  return (
    <ul
      className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
      data-testid="drawing-tree"
      aria-label={t('plant.tree')}
    >
      <li>
        <FolderRow
          level={0}
          open={isOpen(PLANT)}
          onToggle={() => toggle(PLANT)}
          icon={<Factory />}
          name={plant}
          nameClassName="font-medium"
          dropTo={null}
          readOnly={readOnly}
          renaming={
            renaming === PLANT && (
              <NameField
                initial={plant}
                label={t('plant.nameLabel')}
                testId="plant-rename"
                onCommit={(value) => {
                  renamePlantCommand(value);
                }}
                onDone={() => setRenaming(null)}
              />
            )
          }
          onRename={() => setRenaming(PLANT)}
          menuLabel={t('plant.actions', { name: plant })}
          menu={(keepFocus) => (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  keepFocus();
                  setRenaming(PLANT);
                }}
              >
                <Pencil /> {t('plant.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  keepFocus();
                  addUnit();
                }}
              >
                <FolderPlus /> {t('plant.addUnit')}
              </DropdownMenuItem>
            </>
          )}
          actions={
            !readOnly && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                aria-label={t('plant.addUnit')}
                title={t('plant.addUnit')}
                onClick={addUnit}
              >
                <FolderPlus />
              </Button>
            )
          }
        />
        {isOpen(PLANT) && (
          <ul>
            {newUnit && !readOnly && (
              <li className="flex h-row items-center gap-1" style={{ marginInlineStart: INDENT }}>
                <FolderPlus className="ms-2 size-4 shrink-0 text-muted-foreground" />
                <NameField
                  initial=""
                  placeholder={t('plant.unitPlaceholder')}
                  label={t('plant.unitName')}
                  testId="unit-name"
                  onCommit={(value) => {
                    if (!value.trim()) return;
                    return addPlantUnitCommand(value, newUnit) !== null;
                  }}
                  onDone={onNewUnitEnd}
                />
              </li>
            )}
            {tree.units.map(({ unit, drawings: unitDrawings }) => (
              <li key={unit.id} data-unit-id={unit.id}>
                <FolderRow
                  level={1}
                  open={isOpen(unit.id)}
                  onToggle={() => toggle(unit.id)}
                  icon={isOpen(unit.id) ? <FolderOpen /> : <Folder />}
                  name={unit.name}
                  count={unitDrawings.length}
                  dropTo={unit.id}
                  readOnly={readOnly}
                  renaming={
                    renaming === unit.id && (
                      <NameField
                        initial={unit.name}
                        label={t('plant.renameUnitLabel', { name: unit.name })}
                        testId="unit-rename"
                        onCommit={(value) => {
                          if (!value.trim() || value.trim() === unit.name) return;
                          return renamePlantUnitCommand(unit.id, value);
                        }}
                        onDone={() => setRenaming(null)}
                      />
                    )
                  }
                  onRename={() => setRenaming(unit.id)}
                  menuLabel={t('plant.unitActions', { name: unit.name })}
                  menu={(keepFocus) => (
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          keepFocus();
                          setRenaming(unit.id);
                        }}
                      >
                        <Pencil /> {t('plant.renameUnit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openDrawingImportIntoUnit(unit.id)}>
                        <FileUp /> {t('plant.importHere')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => deletePlantUnitCommand(unit.id)}
                      >
                        <Trash2 /> {t('plant.deleteUnit')}
                      </DropdownMenuItem>
                    </>
                  )}
                >
                  {unitDrawings.map((drawing) => renderDrawing(drawing, 2 * INDENT))}
                  {unitDrawings.length === 0 && (
                    <li
                      className="py-1 pe-2 text-xs text-muted-foreground"
                      style={{ paddingInlineStart: 2 * INDENT + 8 }}
                    >
                      {t('plant.emptyUnit')}
                    </li>
                  )}
                </FolderRow>
              </li>
            ))}
            {tree.unassigned.length > 0 && (
              <li data-unassigned="true">
                <FolderRow
                  level={1}
                  open={isOpen(UNASSIGNED)}
                  onToggle={() => toggle(UNASSIGNED)}
                  icon={<Inbox />}
                  name={t('plant.unassigned')}
                  nameClassName="italic text-muted-foreground"
                  count={tree.unassigned.length}
                  dropTo={null}
                  readOnly={readOnly}
                >
                  {tree.unassigned.map((drawing) => renderDrawing(drawing, 2 * INDENT))}
                </FolderRow>
              </li>
            )}
            {drawings.length === 0 && (
              <li
                className="py-2 pe-3 text-sm text-muted-foreground"
                style={{ paddingInlineStart: INDENT + 8 }}
              >
                {t('drawings.empty')}{' '}
                {onImport && !readOnly && (
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={onImport}>
                    {t('drawings.import')}
                  </Button>
                )}
              </li>
            )}
            {drawings.length > 0 && filtering && nothingShown && (
              <li
                className="py-2 pe-3 text-sm text-muted-foreground"
                style={{ paddingInlineStart: INDENT + 8 }}
              >
                {t('drawings.noMatch')}
              </li>
            )}
            {drawings.length > 0 && units.length === 0 && !filtering && !readOnly && !newUnit && (
              <li
                className="py-2 pe-3 text-xs text-muted-foreground"
                style={{ paddingInlineStart: INDENT + 8 }}
              >
                {t('plant.noUnits')}
              </li>
            )}
          </ul>
        )}
      </li>
    </ul>
  );
}

interface FolderRowProps {
  level: number;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  name: string;
  nameClassName?: string;
  /** Number of drawings shown in it. */
  count?: number;
  /** The unit a drawing dropped on it is filed under; null takes it out of its unit. */
  dropTo: string | null;
  readOnly: boolean;
  /** The name field shown in place of the folder's name while it is renamed. */
  renaming?: ReactNode;
  onRename?: () => void;
  menuLabel?: string;
  /** The menu's items; an item that opens a name field calls `keepFocus` first. */
  menu?: (keepFocus: () => void) => ReactNode;
  actions?: ReactNode;
  /** The folder's contents, shown while it is open. */
  children?: ReactNode;
}

/**
 * A folder of the tree (the plant, a unit or Unassigned): click to open or
 * close it, drop a drawing on it to file the drawing there. Its menu (the ⋯
 * button, or a right-click) holds its actions; F2 renames it.
 */
function FolderRow({
  level,
  open,
  onToggle,
  icon,
  name,
  nameClassName,
  count,
  dropTo,
  readOnly,
  renaming,
  onRename,
  menuLabel,
  menu,
  actions,
  children,
}: FolderRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Renaming from the menu: the menu must not take the focus back from the name field.
  const [keepFocus, setKeepFocus] = useState(false);
  const keepFocusOnClose = useCallback(() => setKeepFocus(true), []);
  // A rename ended from the keyboard gives the focus back to the folder.
  const button = useRef<HTMLButtonElement>(null);
  const isRenaming = Boolean(renaming);
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && !isRenaming && document.activeElement === document.body) {
      button.current?.focus();
    }
    wasRenaming.current = isRenaming;
  }, [isRenaming]);
  const [over, setOver] = useState(false);
  const canDrop = !readOnly;
  // The plant row takes drops itself; a unit or Unassigned takes them anywhere in it.
  const dropHandlers = canDrop
    ? {
        onDragOver: (event: DragEvent) => {
          if (!isDrawingDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          setOver(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        },
        onDrop: (event: DragEvent) => {
          setOver(false);
          const drawingId = droppedDrawing(event);
          if (!drawingId) return;
          event.preventDefault();
          event.stopPropagation();
          moveDrawingsToUnitCommand([drawingId], dropTo);
        },
      }
    : {};
  const hasMenu = !readOnly && menu !== undefined;
  const row = (
    <div
      className={cn(
        'group flex h-row items-center rounded-md hover:bg-accent',
        over && 'bg-primary/10 ring-1 ring-primary/40 ring-inset',
      )}
      style={level ? { marginInlineStart: level * INDENT } : undefined}
      onContextMenu={(event) => {
        if (!hasMenu || renaming) return;
        event.preventDefault();
        setMenuOpen(true);
      }}
      {...(level === 0 ? dropHandlers : {})}
    >
      {renaming || (
        <button
          ref={button}
          type="button"
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === 'F2' && onRename && !readOnly) {
              event.preventDefault();
              onRename();
            }
          }}
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md ps-1 text-start text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
          title={name}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn('size-3.5! transition-transform rtl:-scale-x-100', open && 'rotate-90')}
          />
          {icon}
          <span className={cn('min-w-0 flex-1 truncate', nameClassName)}>{name}</span>
          {count !== undefined && (
            <span
              className="pe-1 text-xs text-muted-foreground tabular-nums"
              title={t('plant.drawingCount', { count })}
            >
              {count}
            </span>
          )}
        </button>
      )}
      {!renaming && actions}
      {hasMenu && !renaming && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={menuLabel}
              className="me-0.5 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (keepFocus) event.preventDefault();
              setKeepFocus(false);
            }}
          >
            {menu?.(keepFocusOnClose)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
  if (level === 0) return row;
  return (
    <div {...dropHandlers} className={cn(over && 'rounded-md bg-primary/5')}>
      {row}
      {open && children !== undefined && <ul>{children}</ul>}
    </div>
  );
}
