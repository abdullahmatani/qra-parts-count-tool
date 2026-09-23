import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { drawingDisplayName } from '@/domain/drawings';
import { goBack } from './link-commands';

/** LNK-02: returns to the drawing and view the last link was followed from. */
export function BackButton() {
  const { t } = useTranslation();
  const last = useUiStore((s) => s.navHistory[s.navHistory.length - 1]);
  const drawing = useProjectStore((s) => (last ? s.doc?.drawings[last.drawingId] : undefined));
  if (!drawing) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      className="absolute top-2 left-2 z-10 shadow"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => goBack()}
      title="Alt+←"
    >
      <ArrowLeft /> {t('links.back', { drawing: drawingDisplayName(drawing) })}
    </Button>
  );
}
