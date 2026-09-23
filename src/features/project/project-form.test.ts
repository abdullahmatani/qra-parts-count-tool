import { describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { makeProject } from '@/test/fixtures';
import {
  EMPTY_PROJECT_FORM,
  ProjectFormSchema,
  applyFormValuesToDoc,
  formValuesFromDoc,
  newProjectInputFromValues,
} from './project-form';

describe('project form', () => {
  it('requires a name, boundary rule and flange convention (SEG-08, CNT-09)', () => {
    const result = ProjectFormSchema.safeParse(EMPTY_PROJECT_FORM);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'project.form.errors.nameRequired',
        'project.form.errors.boundaryRuleRequired',
        'project.form.errors.flangeConventionRequired',
      ]),
    );
  });

  it('builds project settings from valid values', () => {
    const values = ProjectFormSchema.parse({
      ...EMPTY_PROJECT_FORM,
      name: '  Study  ',
      esdvBoundaryRule: 'downstream',
      flangeConvention: 'perFace',
      pipeLengthCounting: true,
    });
    const input = newProjectInputFromValues(values);
    expect(input.name).toBe('Study');
    expect(input.settings).toMatchObject({
      esdvBoundaryRule: 'downstream',
      flangeConvention: 'perFace',
      pipeLengthCounting: true,
      units: { size: 'in', length: 'm' },
    });
  });

  it('round-trips project settings through the form', () => {
    const doc = projectToDoc(makeProject());
    const values = ProjectFormSchema.parse({ ...formValuesFromDoc(doc), client: 'New client' });
    applyFormValuesToDoc(doc, values);
    expect(doc.client).toBe('New client');
    expect(formValuesFromDoc(doc).esdvBoundaryRule).toBe('upstream');
  });
});
