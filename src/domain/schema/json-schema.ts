import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from './project-file';

export const JSON_SCHEMA_PATH = `docs/schema/project.schema.v${CURRENT_SCHEMA_VERSION}.json`;

/**
 * Builds the JSON Schema for the project file from the Zod schema. The input
 * shape is used, so fields with defaults are optional, as they are on disk.
 */
export function buildProjectJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ProjectSchema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return {
    $schema: schema.$schema,
    $id: `https://qra-parts-count-tool.local/schema/project.schema.v${CURRENT_SCHEMA_VERSION}.json`,
    title: 'QRA Parts Count Tool project file (project.qrapc.json)',
    description: `Schema version ${CURRENT_SCHEMA_VERSION}. Generated from the Zod schemas in src/domain/schema by \`pnpm schema\`; do not edit by hand.`,
    ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema')),
  };
}

export function renderProjectJsonSchema(): string {
  return `${JSON.stringify(buildProjectJsonSchema(), null, 2)}\n`;
}
