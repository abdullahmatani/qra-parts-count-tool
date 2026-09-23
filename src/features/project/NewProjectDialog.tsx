import { zodResolver } from '@hookform/resolvers/zod';
import { FolderOpen, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import type { FsDirHandle } from '@/lib/fs/types';
import { useUiStore } from '@/store/ui-store';
import { createNewProject, openProject, pickWorkingDirectory } from './project-actions';
import {
  EMPTY_PROJECT_FORM,
  ProjectFormSchema,
  newProjectInputFromValues,
  type ProjectFormInput,
  type ProjectFormValues,
} from './project-form';
import { ProjectMetadataFields, ProjectRulesFields } from './ProjectFormFields';

/** Project set-up: working folder, metadata and counting rules (FDS section 3, step 1). */
export function NewProjectDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'newProject');
  const openDialog = useUiStore((s) => s.openDialog);
  const [dir, setDir] = useState<FsDirHandle | null>(null);
  const [folderError, setFolderError] = useState<'required' | 'exists' | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: EMPTY_PROJECT_FORM,
  });

  const close = () => {
    openDialog(null);
    form.reset(EMPTY_PROJECT_FORM);
    setDir(null);
    setFolderError(null);
  };

  const chooseFolder = async () => {
    const picked = await pickWorkingDirectory();
    if (picked) {
      setDir(picked);
      setFolderError(null);
    }
  };

  const onSubmit = async (values: ProjectFormValues) => {
    if (!dir) {
      setFolderError('required');
      return;
    }
    setBusy(true);
    try {
      const result = await createNewProject(dir, newProjectInputFromValues(values));
      if (result === 'exists') setFolderError('exists');
      else close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? openDialog('newProject') : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('project.new.title')}</DialogTitle>
          <DialogDescription>{t('project.new.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () => !dir && setFolderError('required'))}
            className="grid gap-6"
            noValidate
          >
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('project.new.folder')}</span>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={chooseFolder}>
                  <FolderOpen /> {t('project.new.chooseFolder')}
                </Button>
                <span className="font-mono text-sm" data-testid="chosen-folder">
                  {dir ? dir.name : t('project.new.noFolder')}
                </span>
              </div>
              {folderError === 'required' && (
                <p className="text-sm text-destructive">{t('project.new.folderRequired')}</p>
              )}
              {folderError === 'exists' && dir && (
                <p className="text-sm text-destructive">
                  {t('project.new.folderHasProject')}{' '}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={async () => {
                      if (await openProject(dir)) close();
                    }}
                  >
                    {t('project.new.openInstead')}
                  </Button>
                </p>
              )}
            </div>
            <Separator />
            <ProjectMetadataFields autoFocus />
            <Separator />
            <ProjectRulesFields />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {t('project.new.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
