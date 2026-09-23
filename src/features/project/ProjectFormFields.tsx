import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectFormInput } from './project-form';

const BOUNDARY_RULES = ['upstream', 'downstream', 'both', 'neither'] as const;
const FLANGE_CONVENTIONS = ['perJoint', 'perFace'] as const;

function TextField({
  name,
  label,
  autoFocus,
  mono,
}: {
  name:
    | 'name'
    | 'client'
    | 'facility'
    | 'studyRef'
    | 'countRevision'
    | 'pressureUnit'
    | 'temperatureUnit'
    | 'exportFilenamePattern';
  label: string;
  autoFocus?: boolean;
  mono?: boolean;
}) {
  const { control } = useFormContext<ProjectFormInput>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} autoFocus={autoFocus} className={mono ? 'font-mono' : undefined} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Project metadata fields (name, client, facility, study ref, description). */
export function ProjectMetadataFields({ autoFocus }: { autoFocus?: boolean }) {
  const { t } = useTranslation();
  const { control } = useFormContext<ProjectFormInput>();
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <TextField name="name" label={t('project.form.name')} autoFocus={autoFocus} />
      </div>
      <TextField name="client" label={t('project.form.client')} />
      <TextField name="facility" label={t('project.form.facility')} />
      <TextField name="studyRef" label={t('project.form.studyRef')} />
      <TextField name="countRevision" label={t('project.form.countRevision')} />
      <div className="col-span-2">
        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('project.form.description')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

/** Counting rules chosen at project set-up (SEG-08, CNT-09, CNT-12) and units. */
export function ProjectRulesFields() {
  const { t } = useTranslation();
  const { control } = useFormContext<ProjectFormInput>();
  return (
    <div className="grid gap-5">
      <FormField
        control={control}
        name="esdvBoundaryRule"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('project.form.boundaryRule')}</FormLabel>
            <FormDescription>{t('project.form.boundaryRuleHint')}</FormDescription>
            <FormControl>
              <RadioGroup
                value={field.value ?? ''}
                onValueChange={field.onChange}
                className="grid grid-cols-2 gap-2"
                aria-label={t('project.form.boundaryRule')}
              >
                {BOUNDARY_RULES.map((rule) => (
                  <div key={rule} className="flex items-center gap-2">
                    <RadioGroupItem value={rule} id={`rule-${rule}`} />
                    <Label htmlFor={`rule-${rule}`} className="font-normal">
                      {t(`project.boundaryRules.${rule}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="flangeConvention"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('project.form.flangeConvention')}</FormLabel>
            <FormDescription>{t('project.form.flangeConventionHint')}</FormDescription>
            <FormControl>
              <RadioGroup
                value={field.value ?? ''}
                onValueChange={field.onChange}
                className="flex gap-6"
                aria-label={t('project.form.flangeConvention')}
              >
                {FLANGE_CONVENTIONS.map((convention) => (
                  <div key={convention} className="flex items-center gap-2">
                    <RadioGroupItem value={convention} id={`flange-${convention}`} />
                    <Label htmlFor={`flange-${convention}`} className="font-normal">
                      {t(`project.flangeConventions.${convention}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="pipeLengthCounting"
        render={({ field }) => (
          <FormItem className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="grid gap-1">
              <FormLabel>{t('project.form.pipeLength')}</FormLabel>
              <FormDescription>{t('project.form.pipeLengthHint')}</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={control}
          name="sizeUnit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('project.form.sizeUnit')}</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex gap-4 pt-2"
                  aria-label={t('project.form.sizeUnit')}
                >
                  {(['in', 'DN'] as const).map((unit) => (
                    <div key={unit} className="flex items-center gap-2">
                      <RadioGroupItem value={unit} id={`unit-${unit}`} />
                      <Label htmlFor={`unit-${unit}`} className="font-normal">
                        {t(`project.sizeUnits.${unit}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
        <TextField name="pressureUnit" label={t('project.form.pressureUnit')} />
        <TextField name="temperatureUnit" label={t('project.form.temperatureUnit')} />
      </div>
      <TextField
        name="exportFilenamePattern"
        label={t('project.form.exportFilenamePattern')}
        mono
      />
    </div>
  );
}
