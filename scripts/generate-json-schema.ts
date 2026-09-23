// Writes the JSON Schema for project.qrapc.json, generated from the Zod schemas.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { JSON_SCHEMA_PATH, renderProjectJsonSchema } from '../src/domain/schema/json-schema';

const target = resolve(import.meta.dirname, '..', JSON_SCHEMA_PATH);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, renderProjectJsonSchema());
console.log(`wrote ${JSON_SCHEMA_PATH}`);
