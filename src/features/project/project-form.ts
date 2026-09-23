/**
 * Form model for project set-up and project settings (FDS section 6, "Project
 * setup"). Validation messages are i18n keys.
 */
import { z } from 'zod';
import type { ProjectDoc } from '@/domain/model';
import { schemaV1 } from '@/domain/schema';
import type { NewProjectInput } from '@/domain/schema';

export const ProjectFormSchema = z.object({
  name: z.string().trim().min(1, 'project.form.errors.nameRequired').max(200),
  client: z.string().trim().max(500),
  facility: z.string().trim().max(500),
  studyRef: z.string().trim().max(500),
  description: z.string().max(20_000),
  countRevision: z.string().trim().max(20),
  // SEG-08: no default; the user must choose.
  esdvBoundaryRule: schemaV1.EsdvBoundaryRule.nullable().refine((v) => v !== null, {
    message: 'project.form.errors.boundaryRuleRequired',
  }),
  // CNT-09: chosen explicitly because it changes every flange count.
  flangeConvention: schemaV1.FlangeConvention.nullable().refine((v) => v !== null, {
    message: 'project.form.errors.flangeConventionRequired',
  }),
  pipeLengthCounting: z.boolean(),
  sizeUnit: schemaV1.SizeUnit,
  pressureUnit: z.string().trim().min(1).max(20),
  temperatureUnit: z.string().trim().min(1).max(20),
  exportFilenamePattern: z.string().trim().min(1).max(200),
});

export type ProjectFormInput = z.input<typeof ProjectFormSchema>;
export type ProjectFormValues = z.output<typeof ProjectFormSchema>;

export const EMPTY_PROJECT_FORM: ProjectFormInput = {
  name: '',
  client: '',
  facility: '',
  studyRef: '',
  description: '',
  countRevision: 'A',
  esdvBoundaryRule: null,
  flangeConvention: null,
  pipeLengthCounting: false,
  sizeUnit: 'in',
  pressureUnit: 'barg',
  temperatureUnit: '°C',
  exportFilenamePattern: '{drawingNo}_{rev}_annotated',
};

export function formValuesFromDoc(doc: ProjectDoc): ProjectFormInput {
  return {
    name: doc.name,
    client: doc.client,
    facility: doc.facility,
    studyRef: doc.studyRef,
    description: doc.description,
    countRevision: doc.countRevision,
    esdvBoundaryRule: doc.settings.esdvBoundaryRule,
    flangeConvention: doc.settings.flangeConvention,
    pipeLengthCounting: doc.settings.pipeLengthCounting,
    sizeUnit: doc.settings.units.size,
    pressureUnit: doc.settings.units.pressure,
    temperatureUnit: doc.settings.units.temperature,
    exportFilenamePattern: doc.settings.exportFilenamePattern,
  };
}

function settingsFromValues(values: ProjectFormValues) {
  return {
    esdvBoundaryRule: values.esdvBoundaryRule!,
    flangeConvention: values.flangeConvention!,
    pipeLengthCounting: values.pipeLengthCounting,
    units: {
      size: values.sizeUnit,
      pressure: values.pressureUnit,
      temperature: values.temperatureUnit,
      length: 'm' as const,
    },
    exportFilenamePattern: values.exportFilenamePattern,
  };
}

export function newProjectInputFromValues(values: ProjectFormValues): NewProjectInput {
  return {
    name: values.name,
    client: values.client,
    facility: values.facility,
    studyRef: values.studyRef,
    description: values.description,
    settings: settingsFromValues(values),
  };
}

/** Applies edited form values to the project document (inside a store recipe). */
export function applyFormValuesToDoc(doc: ProjectDoc, values: ProjectFormValues): void {
  doc.name = values.name;
  doc.client = values.client;
  doc.facility = values.facility;
  doc.studyRef = values.studyRef;
  doc.description = values.description;
  doc.countRevision = values.countRevision;
  doc.settings = settingsFromValues(values);
}
