// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { JSON_SCHEMA_PATH, buildProjectJsonSchema, renderProjectJsonSchema } from './json-schema';
import { serializeProject } from './project-file';
import { makePopulatedProject } from '@/test/fixtures';

describe('generated JSON Schema', () => {
  it('is up to date with the Zod schemas (run `pnpm schema` if this fails)', () => {
    const committed = readFileSync(
      resolve(import.meta.dirname, '../../..', JSON_SCHEMA_PATH),
      'utf8',
    );
    expect(committed).toBe(renderProjectJsonSchema());
  });

  it('accepts a serialised project and rejects an invalid one', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(buildProjectJsonSchema());
    const data = JSON.parse(serializeProject(makePopulatedProject()));
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);

    data.items[0].quantity = -1;
    expect(validate(data)).toBe(false);
  });
});
