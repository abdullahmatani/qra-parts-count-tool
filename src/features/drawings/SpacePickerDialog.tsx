import { FileBox } from 'lucide-react';
import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { MODEL_SPACE } from '@/features/cad/model';
import type { CadCandidate } from './import-drawings';
import { useSpacePicker } from './space-picker-store';

function PickerBody({
  candidates,
  onDone,
}: {
  candidates: CadCandidate[];
  onDone: (choice: string[][] | null) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() => candidates.map((c) => new Set(c.defaultSpaces)));
  const toggle = (fileIndex: number, space: string, on: boolean) =>
    setSelected((current) =>
      current.map((set, i) => {
        if (i !== fileIndex) return set;
        const next = new Set(set);
        if (on) next.add(space);
        else next.delete(space);
        return next;
      }),
    );
  const total = selected.reduce((sum, set) => sum + set.size, 0);

  return (
    <>
      <div className="grid max-h-[60vh] gap-4 overflow-y-auto pe-1">
        {candidates.map((candidate, fileIndex) => (
          <section
            key={`${candidate.fileName}-${fileIndex}`}
            className="rounded-md border p-3"
            aria-label={candidate.fileName}
          >
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileBox className="size-4 text-muted-foreground" />
              <span className="font-mono">{candidate.fileName}</span>
              <span className="text-xs text-muted-foreground uppercase">{candidate.fileType}</span>
            </h3>
            <ul className="grid gap-1.5">
              {candidate.spaces.map((space) => {
                const id = `space-${fileIndex}-${space.name}`;
                return (
                  <li key={space.name} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={selected[fileIndex]!.has(space.name)}
                      onCheckedChange={(checked) => toggle(fileIndex, space.name, checked === true)}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {space.name === MODEL_SPACE ? t('spaces.model') : space.name}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {t('spaces.entities', { count: space.entities })}
                      {space.viewports > 0 &&
                        ` · ${t('spaces.viewports', { count: space.viewports })}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone(null)}>
          {t('common.cancel')}
        </Button>
        <Button disabled={total === 0} onClick={() => onDone(selected.map((set) => [...set]))}>
          {t('spaces.import', { count: total })}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Asks which model space or paper-space layouts of DWG/DXF files to import (DRW-02). */
export function SpacePickerDialog() {
  const { t } = useTranslation();
  const request = useSpacePicker((s) => s.request);
  const answer = useSpacePicker((s) => s.answer);
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('spaces.title')}</DialogTitle>
          <DialogDescription>{t('spaces.description')}</DialogDescription>
        </DialogHeader>
        {request && <PickerBody candidates={request.candidates} onDone={answer} />}
      </DialogContent>
    </Dialog>
  );
}
