/**
 * The project as every export sees it (LNK-04). Drawing links are navigation
 * aids for the counter and are never written to exported PDFs, Excel or CSV,
 * so all export code starts from this projection rather than the document.
 */
import { docToProject, type ProjectDoc } from '../model';
import type { Project } from '../schema/types';

export type ExportableProject = Omit<Project, 'links'> & { links: [] };

export function exportableProject(doc: ProjectDoc): ExportableProject {
  const project = docToProject(doc);
  return { ...project, links: [] };
}
