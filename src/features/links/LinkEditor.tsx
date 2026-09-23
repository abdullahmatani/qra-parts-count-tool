import { ExternalLink, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { linkStatus } from '@/domain/actions/links';
import { drawingDisplayName } from '@/domain/drawings';
import { CommitInput } from '@/features/segments/fields';
import { useProjectStore } from '@/store/project-store';
import { useOrderedDrawings } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
import { deleteLinkCommand, followLink, updateLinkCommand } from './link-commands';

/** LNK-01: the selected link's target drawing, label and saved view. */
export function LinkEditor({ linkId }: { linkId: string }) {
  const { t } = useTranslation();
  const link = useProjectStore((s) => s.doc?.links[linkId]);
  const drawingsRecord = useProjectStore((s) => s.doc?.drawings);
  const readOnly = useProjectStore((s) => s.readOnly);
  const drawings = useOrderedDrawings();
  const targetViewport = useUiStore((s) =>
    link?.targetDrawingId ? s.viewports[link.targetDrawingId] : undefined,
  );
  if (!link || !drawingsRecord) return null;
  const status = linkStatus(link, { drawings: drawingsRecord });

  return (
    <div className="space-y-3 text-sm" data-testid="link-editor">
      <p className="font-medium">{t('links.editor.title')}</p>
      <div className="space-y-1">
        <Label htmlFor="link-target" className="text-xs text-muted-foreground">
          {t('links.editor.target')}
        </Label>
        <Select
          value={
            link.targetDrawingId && drawingsRecord[link.targetDrawingId] ? link.targetDrawingId : ''
          }
          onValueChange={(targetDrawingId) => updateLinkCommand(link.id, { targetDrawingId })}
          disabled={readOnly}
        >
          <SelectTrigger id="link-target" className="w-full">
            <SelectValue placeholder={t('links.editor.chooseTarget')} />
          </SelectTrigger>
          <SelectContent>
            {drawings
              .filter((d) => d.id !== link.sourceDrawingId)
              .map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {drawingDisplayName(d)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {status !== 'ok' && (
          <p className="text-xs text-destructive">{t(`links.status.${status}`)}</p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="link-label" className="text-xs text-muted-foreground">
          {t('links.editor.label')}
        </Label>
        <CommitInput
          id="link-label"
          value={link.label}
          placeholder={t('links.editor.labelPlaceholder')}
          onCommit={(label) => updateLinkCommand(link.id, { label: label.trim() })}
          disabled={readOnly}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t('links.editor.view')}</span>
        <p className="text-xs" data-testid="link-view">
          {link.targetView
            ? t('links.editor.savedView', { zoom: Math.round(link.targetView.zoom * 100) })
            : t('links.editor.wholeDrawing')}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || status !== 'ok' || !targetViewport}
            title={targetViewport ? undefined : t('links.editor.noLastView')}
            onClick={() =>
              targetViewport &&
              updateLinkCommand(link.id, {
                targetView: { x: targetViewport.x, y: targetViewport.y, zoom: targetViewport.zoom },
              })
            }
          >
            {t('links.editor.useLastView')}
          </Button>
          {link.targetView && (
            <Button
              size="sm"
              variant="ghost"
              disabled={readOnly}
              onClick={() => updateLinkCommand(link.id, { targetView: null })}
            >
              {t('links.editor.clearView')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={status !== 'ok'}
          onClick={() => followLink(link.id)}
        >
          <ExternalLink /> {t('links.editor.open')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={readOnly}
          onClick={() => deleteLinkCommand(link.id)}
        >
          <Trash2 /> {t('links.editor.delete')}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('links.editor.hint')}</p>
    </div>
  );
}
