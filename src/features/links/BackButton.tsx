import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { drawingDisplayName } from '@/domain/drawings';
import { goBack } from './link-commands';

/** LNK-02: returns to the drawing and view the last link was followed from. */
export function BackButton() {
  const { t, i18n } = useTranslation();
  const last = useUiStore((s) => s.navHistory[s.navHistory.length - 1]);
  const drawing = useProjectStore((s) => (last ? s.doc?.drawings[last.drawingId] : undefined));
  if (!drawing) return null;
  // The viewer is always left to right; the button sits at the interface's start.
  const rtl = i18n.dir() === 'rtl';
  return (
    <Button
      size="sm"
      variant="secondary"
      dir={i18n.dir()}
      className={`absolute top-2 z-10 shadow ${rtl ? 'right-2' : 'left-2'}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => goBack()}
      title="Alt+←"
    >
      <ArrowLeft className="rtl:-scale-x-100" />{' '}
      {t('links.back', { drawing: drawingDisplayName(drawing) })}
    </Button>
  );
}
