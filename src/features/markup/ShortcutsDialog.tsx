import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { TOOLS } from '@/app/tools';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

function Section({ title, rows }: { title: string; rows: [ReactNode, string[]][] }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="divide-y rounded-md border text-sm">
        {rows.map(([label, keys], i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-3 py-1.5">
            <dt>{label}</dt>
            <dd>
              <Keys keys={keys} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** ANN-08: the list of workspace keyboard shortcuts. */
export function ShortcutsDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'shortcuts');
  const openDialog = useUiStore((s) => s.openDialog);
  const types = useProjectStore((s) => s.doc?.library.equipmentTypes);
  const typeRows: [ReactNode, string[]][] = (types ?? [])
    .filter((type) => type.shortcut)
    .map((type) => [type.name, [type.shortcut!]]);

  return (
    <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'shortcuts' : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Section
            title={t('shortcuts.tools')}
            rows={TOOLS.map((tool) => [t(tool.labelKey), [tool.shortcut]])}
          />
          {typeRows.length > 0 && <Section title={t('shortcuts.types')} rows={typeRows} />}
          <Section
            title={t('shortcuts.editing')}
            rows={[
              [t('shortcuts.undo'), ['Ctrl+Z']],
              [t('shortcuts.redo'), ['Ctrl+Y', 'Ctrl+Shift+Z']],
              [t('shortcuts.copy'), ['Ctrl+C']],
              [t('shortcuts.paste'), ['Ctrl+V']],
              [t('shortcuts.selectAll'), ['Ctrl+A']],
              [t('shortcuts.delete'), ['Delete', 'Backspace']],
              [t('shortcuts.addToSelection'), ['Shift+' + t('shortcuts.click')]],
              [t('shortcuts.nudge'), ['←', '↑', '→', '↓']],
              [t('shortcuts.finish'), ['Enter']],
              [t('shortcuts.deselect'), ['Esc']],
            ]}
          />
          <Section
            title={t('shortcuts.view')}
            rows={[
              [t('shortcuts.zoom'), ['+', '−']],
              [t('shortcuts.fit'), ['0']],
              [t('shortcuts.back'), ['Alt+←']],
              [t('shortcuts.find'), ['Ctrl+F']],
              [t('shortcuts.wheel'), ['Wheel']],
              [
                t('shortcuts.pan'),
                [t('shortcuts.middleDrag'), `${t('shortcuts.space')}+${t('shortcuts.drag')}`],
              ],
            ]}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
