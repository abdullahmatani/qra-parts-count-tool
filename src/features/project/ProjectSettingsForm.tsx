import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useDoc, useProjectStore } from '@/store/project-store';
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
  const initial = useDoc(formValuesFromDoc);
  const readOnly = useProjectStore((s) => s.readOnly);
  const form = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: initial,
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
            onClick={() => form.reset(initial)}
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
