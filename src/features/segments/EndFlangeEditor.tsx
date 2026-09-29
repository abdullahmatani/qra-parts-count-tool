import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { END_FLANGE_DESTINATIONS } from '@/domain/end-flange';
import type { EndFlangeDestination, Marker } from '@/domain/schema/types';
import { updateEndFlangeCommand } from '@/features/markup/marker-commands';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

/**
 * An end flange's tag and where the pipe goes beyond it. Its segment is chosen
 * below it, as for any marker.
 */
export function EndFlangeEditor({ marker }: { marker: Marker }) {
  const { t } = useTranslation();
  const data = marker.endFlange!;
  const readOnly = useProjectStore((s) => s.readOnly);
  const editRequest = useUiStore((s) => s.editRequest);
  const tagRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editRequest?.markerId === marker.id) tagRef.current?.focus();
  }, [editRequest, marker.id]);

  return (
    <div className="space-y-3" data-testid="end-flange-editor">
      <div className="space-y-1">
        <Label htmlFor="end-flange-tag" className="text-xs text-muted-foreground">
          {t('markup.endFlange.tag')}
        </Label>
        <Input
          id="end-flange-tag"
          ref={tagRef}
          value={data.tag}
          placeholder={t('markup.endFlange.tagPlaceholder')}
          onChange={(event) => updateEndFlangeCommand(marker.id, { tag: event.target.value })}
          disabled={readOnly}
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground" id="end-flange-destination">
          {t('markup.endFlange.destination')}
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={data.destination}
          onValueChange={(value) =>
            value &&
            updateEndFlangeCommand(marker.id, { destination: value as EndFlangeDestination })
          }
          disabled={readOnly}
          aria-labelledby="end-flange-destination"
          className="w-full"
        >
          {END_FLANGE_DESTINATIONS.map((destination) => (
            <ToggleGroupItem
              key={destination}
              value={destination}
              data-testid={`end-flange-destination-${destination}`}
              className="min-w-0 flex-1 px-1 text-xs"
            >
              <span className="truncate">{t(`markup.endFlange.destinations.${destination}`)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p className="text-xs text-muted-foreground">{t('markup.endFlange.about')}</p>
    </div>
  );
}
