import { newId } from '@/lib/ids';
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from './project-file';
import type { Library, Project, ProjectInput } from './types';

export interface NewProjectInput {
  name: string;
  client?: string;
  facility?: string;
  studyRef?: string;
  description?: string;
  settings: ProjectInput['settings'];
  library?: Library;
  appVersion?: string;
}

/** Creates a new, empty project with schema defaults applied (PRJ-01). */
export function createProject(input: NewProjectInput, now: Date = new Date()): Project {
  const timestamp = now.toISOString();
  return ProjectSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    app: { name: 'qra-parts-count-tool', version: input.appVersion ?? '' },
    id: newId('prj'),
    name: input.name,
    client: input.client ?? '',
    facility: input.facility ?? '',
    studyRef: input.studyRef ?? '',
    description: input.description ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: input.settings,
    library: input.library ?? {},
  } satisfies ProjectInput);
}
