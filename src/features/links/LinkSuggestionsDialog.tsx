import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { addLink, updateLink } from '@/domain/actions/links';
import { drawingDisplayName } from '@/domain/drawings';
import { suggestLinks, type LinkSuggestion } from '@/domain/link-suggestions';
import type { TextBox } from '@/domain/text-search';
import { drawingTextBoxes } from '@/features/search/drawing-text';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

type Scan =
  | { status: 'scanning'; done: number; total: number }
  | { status: 'done'; suggestions: LinkSuggestion[] };

/** LNK-06: links suggested from drawing numbers in the drawings' text, for review. */
export function LinkSuggestionsDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'linkSuggestions');
  const openDialog = useUiStore((s) => s.openDialog);
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const readOnly = useProjectStore((s) => s.readOnly);
  const [scan, setScan] = useState<Scan | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let live = true;
    (async () => {
      const doc = useProjectStore.getState().doc;
      const dir = getWorkingDirectory();
      if (!doc || !dir) return;
      const list = doc.drawingOrder.map((id) => doc.drawings[id]!).filter(Boolean);
      const text = new Map<string, TextBox[]>();
      for (const [i, drawing] of list.entries()) {
        if (!live) return;
        setScan({ status: 'scanning', done: i, total: list.length });
        text.set(drawing.id, await drawingTextBoxes(dir, drawing).catch(() => []));
      }
      const suggestions = suggestLinks(list, text, Object.values(doc.links));
      if (!live) return;
      setScan({ status: 'done', suggestions });
      setChosen(new Set(suggestions.map((_, i) => i)));
    })();
    return () => {
      live = false;
    };
  }, [open]);

  const close = () => {
    openDialog(null);
    setScan(null);
  };

  const add = () => {
    if (scan?.status !== 'done') return;
    const picked = scan.suggestions.filter((_, i) => chosen.has(i));
    useProjectStore
      .getState()
      .apply(t('links.suggest.history', { count: picked.length }), (draft) => {
        for (const s of picked) {
          const id = addLink(draft, s.sourceDrawingId, {
            minX: s.rect.x,
            minY: s.rect.y,
            maxX: s.rect.x + s.rect.width,
            maxY: s.rect.y + s.rect.height,
          });
          if (id) updateLink(draft, id, { targetDrawingId: s.targetDrawingId, label: s.text });
        }
      });
    close();
  };

  const name = (id: string) => (drawings?.[id] ? drawingDisplayName(drawings[id]) : '');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-xl" data-testid="link-suggestions">
        <DialogHeader>
          <DialogTitle>{t('links.suggest.title')}</DialogTitle>
          <DialogDescription>{t('links.suggest.description')}</DialogDescription>
        </DialogHeader>
        {scan?.status === 'scanning' || !scan ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t('links.suggest.scanning', {
              done: scan?.status === 'scanning' ? scan.done : 0,
              total: scan?.status === 'scanning' ? scan.total : 0,
            })}
          </p>
        ) : scan.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('links.suggest.none')}</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {scan.suggestions.map((s, i) => {
              const id = `suggestion-${i}`;
              return (
                <li key={id} className="flex items-center gap-2" data-testid="link-suggestion">
                  <Checkbox
                    id={id}
                    checked={chosen.has(i)}
                    onCheckedChange={(v) =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (v === true) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                  />
                  <label htmlFor={id} className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{name(s.sourceDrawingId)}</span>
                    {' → '}
                    <span className="font-mono text-xs">{name(s.targetDrawingId)}</span>
                    <span className="block truncate text-xs text-muted-foreground">“{s.text}”</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button onClick={add} disabled={readOnly || scan?.status !== 'done' || chosen.size === 0}>
            {t('links.suggest.add', { count: chosen.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
