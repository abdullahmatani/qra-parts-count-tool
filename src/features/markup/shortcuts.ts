/**
 * Workspace keyboard shortcuts (ANN-08, PRJ-09): markup tools, undo/redo and
 * marker editing. Shortcuts are ignored while the user types in a field or a
 * dialog or menu has focus.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { TOOLS } from '@/app/tools';
import { itemForMarker } from '@/domain/actions/items';
import { updateItemCommand } from '@/features/count/item-commands';
import { deleteLinkCommand, goBack } from '@/features/links/link-commands';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  copySelection,
  deleteMarkerIds,
  pasteClipboard,
  selectAllOnDrawing,
  selectedMarkerIds,
} from './marker-commands';

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, [role="combobox"], [role="textbox"]')) return true;
  return !!target.closest(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="menubar"]',
  );
}

export type ShortcutAction =
  | { kind: 'tool'; tool: (typeof TOOLS)[number]['tool'] }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'delete' }
  | { kind: 'copy' }
  | { kind: 'paste' }
  | { kind: 'selectAll' }
  | { kind: 'clearSelection' }
  | { kind: 'equipmentType'; typeId: string }
  | { kind: 'back' };

/**
 * Maps a key press to a workspace action. `typeKeys` maps equipment type
 * shortcut keys (e.g. "1" for valves) to type ids (ANN-08).
 */
export function shortcutFor(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  typeKeys: ReadonlyMap<string, string> = new Map(),
): ShortcutAction | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.altKey) return key === 'arrowleft' && !mod ? { kind: 'back' } : null;
  if (mod) {
    if (key === 'z') return event.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (key === 'y') return { kind: 'redo' };
    if (key === 'c') return { kind: 'copy' };
    if (key === 'v') return { kind: 'paste' };
    if (key === 'a') return { kind: 'selectAll' };
    return null;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') return { kind: 'delete' };
  if (event.key === 'Escape') return { kind: 'clearSelection' };
  if (event.shiftKey) return null;
  const typeId = typeKeys.get(key);
  if (typeId) return { kind: 'equipmentType', typeId };
  const tool = TOOLS.find((def) => def.shortcut.toLowerCase() === key);
  return tool ? { kind: 'tool', tool: tool.tool } : null;
}

const t = i18n.t.bind(i18n);

/** Runs an action; returns false when it did not apply. */
export function runShortcut(action: ShortcutAction): boolean {
  const project = useProjectStore.getState();
  const ui = useUiStore.getState();
  if (!project.doc) return false;
  switch (action.kind) {
    case 'tool':
      if (project.readOnly && action.tool !== 'select') return false;
      ui.setTool(action.tool);
      return true;
    case 'undo':
      return !project.readOnly && project.undo() !== null;
    case 'redo':
      return !project.readOnly && project.redo() !== null;
    case 'delete':
      if (project.readOnly) return false;
      if (ui.selectedLinkId) return deleteLinkCommand(ui.selectedLinkId);
      return deleteMarkerIds(selectedMarkerIds());
    case 'back':
      return goBack();
    case 'copy': {
      const count = copySelection();
      if (count) toast(t('markup.copied', { count }), { duration: 1500 });
      return count > 0;
    }
    case 'paste': {
      if (project.readOnly) return false;
      const count = pasteClipboard();
      if (count) toast(t('markup.pasted', { count }), { duration: 1500 });
      return count > 0;
    }
    case 'selectAll':
      return selectAllOnDrawing() > 0 || ui.activeDrawingId !== null;
    case 'equipmentType': {
      // Sets the type of the selected item and of the next circle placed.
      if (project.readOnly) return false;
      ui.setItemDefaults({ equipmentTypeId: action.typeId });
      const ids = selectedMarkerIds();
      const item = ids.length === 1 ? itemForMarker(project.doc, ids[0]!) : undefined;
      if (item) {
        const type = project.doc.library.equipmentTypes.find((e) => e.id === action.typeId);
        updateItemCommand(item.id, {
          equipmentTypeId: action.typeId,
          ...(type?.hasActuation && !item.actuation
            ? { actuation: ui.itemDefaults.actuation }
            : {}),
        });
        ui.requestEdit(item.markerId, 'size');
      }
      return true;
    }
    case 'clearSelection':
      if (ui.selection.length === 0 && ui.highlighted.length === 0) return false;
      ui.setSelection([]);
      ui.setHighlighted([]);
      return true;
  }
}

/** Installs the workspace shortcuts while a project is open. */
export function useWorkspaceShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (useUiStore.getState().dialog) return;
      const library = useProjectStore.getState().doc?.library;
      const typeKeys = new Map(
        (library?.equipmentTypes ?? [])
          .filter((type) => type.shortcut)
          .map((type) => [type.shortcut!.toLowerCase(), type.id] as const),
      );
      const action = shortcutFor(event, typeKeys);
      if (!action) return;
      // Ctrl+A and Backspace have browser defaults that must not fire on the canvas.
      if (runShortcut(action) || action.kind === 'selectAll') event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
