/**
 * The drawing canvas's right-click menu: undo and redo, the clipboard, the
 * selection, and what applies to the markers selected (edit, count as,
 * move to a segment), with a way to switch tools. A right-click on a marker
 * selects it first (see `useMarkupTools`), so the menu acts on it.
 */
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TOOLS } from '@/app/tools';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { equipmentChoices, type EquipmentChoice } from '@/domain/equipment-choices';
import { choiceName } from '@/features/count/choice-name';
import { updateItemsCommand } from '@/features/count/item-commands';
import { useStage, useStageTools } from '@/features/stage/stage';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  assignMarkerIds,
  copySelection,
  cutSelection,
  deleteMarkerIds,
  hasClipboard,
  pasteClipboard,
  selectAllOnDrawing,
} from './marker-commands';
import type { MarkupContextMenu } from './useMarkupTools';

/**
 * How long (ms) after the menu opens a release cannot choose an item. On
 * Linux and macOS the menu opens when the right button goes down, so letting
 * go of it could otherwise land on the item under the pointer.
 */
const OPEN_GUARD_MS = 250;

/** A value for "No segment" in the segment radio group (segment ids never look like this). */
const NO_SEGMENT = '__none__';

export function CanvasContextMenu({
  drawingId,
  menu,
  children,
}: {
  drawingId: string;
  menu: MarkupContextMenu;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const doc = useProjectStore((s) => s.doc);
  const readOnly = useProjectStore((s) => s.readOnly);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const selection = useUiStore((s) => s.selection);
  const tool = useUiStore((s) => s.tool);
  const stage = useStage();
  const stageTools = useStageTools();
  const editable = !readOnly;
  const openedAt = useRef(0);
  /** An item's action, unless the menu has only just opened (it then stays open). */
  const run = (action: () => unknown) => (event: Event) => {
    if (performance.now() - openedAt.current < OPEN_GUARD_MS) {
      event.preventDefault();
      return;
    }
    action();
  };

  // The selected markers on this drawing.
  const selected = doc ? selection.filter((id) => doc.markers[id]?.drawingId === drawingId) : [];
  const single = selected.length === 1 ? doc?.markers[selected[0]!] : undefined;
  const itemIds = doc
    ? Object.values(doc.items)
        .filter((item) => selected.includes(item.markerId))
        .map((item) => item.id)
    : [];
  const items = doc ? itemIds.map((id) => doc.items[id]!) : [];
  const choices = equipmentChoices(doc?.library.equipmentTypes ?? []);
  // The choice the selected items share, if they share one.
  const sharedChoice = (() => {
    const keys = new Set(
      items.map(
        (item) =>
          choices.find(
            (c) =>
              c.type.id === item.equipmentTypeId &&
              (c.actuation === null || c.actuation === item.actuation),
          )?.key ?? '',
      ),
    );
    return keys.size === 1 ? [...keys][0]! : '';
  })();
  // Segments the selection can move to: ESDVs sit between segments and keep theirs.
  const assignable = doc ? selected.filter((id) => !doc.markers[id]?.esdv) : [];
  const sharedSegment = (() => {
    if (!doc || assignable.length === 0) return '';
    const segments = new Set(assignable.map((id) => doc.markers[id]?.segmentId ?? NO_SEGMENT));
    return segments.size === 1 ? [...segments][0]! : '';
  })();
  const segments = doc
    ? doc.segmentOrder.map((id) => doc.segments[id]).filter((s) => s !== undefined)
    : [];

  const countAs = (choice: EquipmentChoice) => {
    updateItemsCommand(itemIds, {
      equipmentTypeId: choice.type.id,
      ...(choice.actuation ? { actuation: choice.actuation } : {}),
    });
  };

  const copy = () => {
    const count = copySelection();
    if (count) toast(t('markup.copied', { count }), { duration: 1500 });
  };
  const cut = () => {
    const count = cutSelection();
    if (count) toast(t('markup.cut', { count }), { duration: 1500 });
  };
  const paste = () => {
    const count = pasteClipboard(menu.point());
    if (count) toast(t('markup.pasted', { count }), { duration: 1500 });
  };

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) openedAt.current = performance.now();
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60" data-testid="canvas-context-menu">
        {menu.drawingLine && (
          <>
            <ContextMenuItem onSelect={run(menu.finishLine)} data-testid="context-finish-line">
              {t('contextMenu.finishLine')}
              <ContextMenuShortcut>Enter</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={run(menu.cancelDrawing)}>
              {t('contextMenu.cancelDrawing')}
              <ContextMenuShortcut>Esc</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          disabled={!editable || !canUndo}
          onSelect={run(() => useProjectStore.getState().undo())}
          data-testid="context-undo"
        >
          {t('contextMenu.undo')}
          <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable || !canRedo}
          onSelect={run(() => useProjectStore.getState().redo())}
          data-testid="context-redo"
        >
          {t('contextMenu.redo')}
          <ContextMenuShortcut>Ctrl+Y</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!editable || selected.length === 0}
          onSelect={run(cut)}
          data-testid="context-cut"
        >
          {t('contextMenu.cut')}
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={selected.length === 0}
          onSelect={run(copy)}
          data-testid="context-copy"
        >
          {t('contextMenu.copy')}
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable || !hasClipboard()}
          onSelect={run(paste)}
          data-testid="context-paste"
        >
          {t('contextMenu.paste')}
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={!editable || selected.length === 0}
          onSelect={run(() => deleteMarkerIds(selected))}
          data-testid="context-delete"
        >
          {t('contextMenu.delete', { count: selected.length })}
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={run(() => selectAllOnDrawing())}
          data-testid="context-select-all"
        >
          {t('contextMenu.selectAll')}
          <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={selected.length === 0}
          onSelect={run(() => useUiStore.getState().setSelection([]))}
        >
          {t('contextMenu.deselect')}
          <ContextMenuShortcut>Esc</ContextMenuShortcut>
        </ContextMenuItem>

        {(single || (editable && itemIds.length > 0) || (editable && assignable.length > 0)) && (
          <ContextMenuSeparator />
        )}
        {single && (
          <ContextMenuItem
            onSelect={run(() => useUiStore.getState().requestEdit(single.id))}
            data-testid="context-edit"
          >
            {t('contextMenu.edit')}
          </ContextMenuItem>
        )}
        {editable && stage === 'count' && itemIds.length > 0 && choices.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger data-testid="context-count-as">
              {t('contextMenu.countAs', { count: itemIds.length })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 w-64 overflow-y-auto">
              <ContextMenuRadioGroup
                value={sharedChoice}
                onValueChange={(key) => {
                  const choice = choices.find((c) => c.key === key);
                  if (choice) countAs(choice);
                }}
              >
                {choices.map((choice) => (
                  <ContextMenuRadioItem
                    key={choice.key}
                    value={choice.key}
                    className="text-xs"
                    data-testid="context-count-as-choice"
                    data-type-id={choice.type.id}
                    data-actuation={choice.actuation ?? ''}
                  >
                    <span className="truncate">{choiceName(choice, t)}</span>
                    {choice.type.shortcut && (
                      <ContextMenuShortcut>{choice.type.shortcut}</ContextMenuShortcut>
                    )}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {editable && assignable.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger data-testid="context-segment">
              {t('contextMenu.moveToSegment', { count: assignable.length })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 w-56 overflow-y-auto">
              <ContextMenuRadioGroup
                value={sharedSegment}
                onValueChange={(value) =>
                  assignMarkerIds(assignable, value === NO_SEGMENT ? null : value)
                }
              >
                {segments.map((segment) => (
                  <ContextMenuRadioItem
                    key={segment.id}
                    value={segment.id}
                    className="text-xs"
                    data-testid="context-segment-choice"
                  >
                    <span className="truncate">{segment.label}</span>
                  </ContextMenuRadioItem>
                ))}
                <ContextMenuRadioItem value={NO_SEGMENT} className="text-xs">
                  {t('markup.noSegment')}
                </ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger data-testid="context-tool">
            {t('contextMenu.tool')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuRadioGroup
              value={tool}
              onValueChange={(value) =>
                useUiStore.getState().setTool(value as (typeof TOOLS)[number]['tool'])
              }
            >
              {TOOLS.filter((def) => stageTools.includes(def.tool))
                .filter((def) => editable || def.tool === 'select')
                .map((def) => (
                  <ContextMenuRadioItem key={def.tool} value={def.tool} className="text-xs">
                    {t(def.labelKey)}
                    <ContextMenuShortcut>{def.shortcut}</ContextMenuShortcut>
                  </ContextMenuRadioItem>
                ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
