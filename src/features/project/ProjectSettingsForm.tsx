import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useProjectStore } from '@/store/project-store';
import {
  ProjectFormSchema,
  applyFormValuesToDoc,
  formValuesFromDoc,
  type ProjectFormInput,
  type ProjectFormValues,
} from './project-form';
import { ProjectMetadataFields, ProjectRulesFields } from './ProjectFormFields';

/** Edits project metadata and counting rules as one undoable step. */
export function ProjectSettingsForm() {
  const { t } = useTranslation();
  const doc = useProjectStore((s) => s.doc);
  // Only the initial values: later edits by undo/redo reset the form below.
  const initial = useMemo(() => (doc ? formValuesFromDoc(doc) : null), [doc]);
  const readOnly = useProjectStore((s) => s.readOnly);
  const form = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: initial ?? undefined,
  });

  const onSubmit = (values: ProjectFormValues) => {
    const changed = useProjectStore
      .getState()
      .apply(t('project.settings.historyLabel'), (doc) => applyFormValuesToDoc(doc, values));
    form.reset(values);
    if (changed) toast.success(t('project.settings.saved'));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" noValidate>
        <fieldset disabled={readOnly} className="grid gap-5">
          <ProjectMetadataFields />
          <Separator />
          <ProjectRulesFields />
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!form.formState.isDirty}
            onClick={() => initial && form.reset(initial)}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={readOnly || !form.formState.isDirty}>
            {t('project.settings.apply')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
