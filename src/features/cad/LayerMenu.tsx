import { Layers } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const NONE: string[] = [];

/** DRW-09: show and hide the layers of a DWG/DXF drawing (for this session). */
export function LayerMenu({ drawingId }: { drawingId: string }) {
  const { t } = useTranslation();
  const drawing = useProjectStore((s) => s.doc?.drawings[drawingId]);
  const hidden = useUiStore((s) => s.hiddenLayers[drawingId] ?? NONE);
  const setHidden = useUiStore((s) => s.setHiddenLayers);
  const [layers, setLayers] = useState<string[] | null>(null);
  if (!drawing || drawing.fileType === 'pdf') return null;

  const load = async () => {
    const dir = getWorkingDirectory();
    if (!dir) return;
    const { loadCadDisplayList } = await import('./cad-drawings');
    const list = await loadCadDisplayList(dir, drawing);
    setLayers(list.layers ?? []);
  };

  return (
    <Popover onOpenChange={(open) => open && !layers && void load()}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="absolute start-3 top-3 z-20 h-7 bg-background/90 text-xs"
          data-testid="layer-menu"
        >
          <Layers />
          {hidden.length ? t('layers.buttonHidden', { count: hidden.length }) : t('layers.button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium">{t('layers.title')}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={hidden.length === 0}
            onClick={() => setHidden(drawingId, [])}
          >
            {t('layers.showAll')}
          </Button>
        </div>
        {layers === null ? (
          <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
        ) : layers.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('layers.none')}</p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto" data-testid="layer-list">
            {layers.map((layer) => {
              const id = `layer-${drawingId}-${layer}`;
              return (
                <li
                  key={layer}
                  className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent"
                >
                  <Checkbox
                    id={id}
                    checked={!hidden.includes(layer)}
                    onCheckedChange={(visible) =>
                      setHidden(
                        drawingId,
                        visible === true ? hidden.filter((l) => l !== layer) : [...hidden, layer],
                      )
                    }
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 truncate font-mono text-xs">
                    {layer || t('layers.unnamed')}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{t('layers.hint')}</p>
      </PopoverContent>
    </Popover>
  );
}
