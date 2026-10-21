import {
  AlertTriangle,
  FileImage,
  FileText,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { drawingDisplayName } from '@/domain/drawings';
import type { Drawing, PlantUnit } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { renameDrawingCommand, requestDeleteDrawing } from './drawing-commands';
import { startDrawingDrag } from './drawing-drag';
import { moveDrawingsToUnitCommand } from './plant-commands';

/** Radio value of "no unit" in the Move to unit menu. */
const NO_UNIT = '';

export interface DrawingRowProps {
  drawing: Drawing;
  markerCount: number;
  active: boolean;
  /** A history step pointed at in the undo or redo menu would change it: greyed out. */
  changing: boolean;
  readOnly: boolean;
  renaming: boolean;
  /** The plant units it can be moved to, in name order (DRW-11). */
  units: readonly PlantUnit[];
  /** Indentation in px, in the organised list. */
  indent?: number;
  /** Whether it can be dragged onto a plant unit. */
  draggable?: boolean;
  onOpen: () => void;
  onRename: () => void;
  onRenameEnd: () => void;
  /** Names a new plant unit to move the drawing to. */
  onNewUnit: () => void;
}

/**
 * One drawing in the list: click to open it. Its menu (the ⋯ button, or a
 * right-click on the row) renames it in place, files it under a plant unit
 * or deletes it; F2 renames too.
 */
export function DrawingRow({
  drawing,
  markerCount,
  active,
  changing,
  readOnly,
  renaming,
  units,
  indent = 0,
  draggable = false,
  onOpen,
  onRename,
  onRenameEnd,
  onNewUnit,
}: DrawingRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Renaming or naming a unit from the menu: the menu must not take the focus back from the field.
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
        changing && 'opacity-50 grayscale',
      )}
      style={indent ? { marginInlineStart: indent } : undefined}
      data-drawing-id={drawing.id}
      data-changing={changing ? 'true' : undefined}
      draggable={draggable && !readOnly && !renaming}
      onDragStart={(event) => {
        if (draggable && !readOnly && !renaming) startDrawingDrag(event, drawing.id);
      }}
      onContextMenu={(event) => {
        if (readOnly || renaming) return;
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      {renaming ? (
        <NameField
          initial={drawing.drawingNo}
          placeholder={drawing.fileName}
          label={t('drawings.renameLabel', { name })}
          testId="drawing-rename"
          className="font-mono"
          onCommit={(value) => {
            renameDrawingCommand(drawing.id, value);
          }}
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput /> {t('drawings.moveTo')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={drawing.unitId ?? NO_UNIT}
                  onValueChange={(value) =>
                    moveDrawingsToUnitCommand([drawing.id], value === NO_UNIT ? null : value)
                  }
                >
                  {units.map((unit) => (
                    <DropdownMenuRadioItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </DropdownMenuRadioItem>
                  ))}
                  <DropdownMenuRadioItem value={NO_UNIT}>
                    {t('plant.unassigned')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    keepFocus.current = true;
                    onNewUnit();
                  }}
                >
                  <FolderPlus /> {t('plant.newUnit')}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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

export interface NameFieldProps {
  initial: string;
  placeholder?: string;
  label: string;
  testId?: string;
  className?: string;
  /**
   * Called with the name on Enter or when the field loses the focus. Returning
   * false refuses it: after Enter the field stays open to correct it.
   */
  onCommit: (value: string) => boolean | void;
  onDone: (fromKeyboard: boolean) => void;
}

/** A name edited in place: Enter or leaving the field keeps it, Esc cancels. */
export function NameField({
  initial,
  placeholder,
  label,
  testId,
  className,
  onCommit,
  onDone,
}: NameFieldProps) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean, fromKeyboard: boolean) => {
    if (done.current) return;
    if (save && onCommit(value) === false && fromKeyboard) return;
    done.current = true;
    onDone(fromKeyboard);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true, true);
    } else if (event.key === 'Escape') {
      // Esc cancels the edit, not the workspace's tool or selection.
      event.preventDefault();
      event.stopPropagation();
      finish(false, true);
    }
  };
  return (
    <Input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(true, false)}
      onKeyDown={onKeyDown}
      aria-label={label}
      data-testid={testId}
      className={cn('mx-1 h-7 px-1.5 text-xs', className)}
    />
  );
}
