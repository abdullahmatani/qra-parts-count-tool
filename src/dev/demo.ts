/**
 * Development aid: `?demo` in the dev server loads an in-memory sample project so
 * the workspace can be viewed without a working directory. Never bundled in
 * production builds (guarded by import.meta.env.DEV in main.tsx).
 */
import { projectToDoc } from '@/domain/model';
import { createProject } from '@/domain/schema/factory';
import type { Drawing, Segment } from '@/domain/schema/types';
import { newId } from '@/lib/ids';
import { useProjectStore } from '@/store/project-store';

export function loadDemoProject(): void {
  const project = createProject({
    name: 'Demo study',
    client: 'Demo client',
    facility: 'Gas plant',
    studyRef: 'QRA-DEMO',
    settings: { esdvBoundaryRule: 'upstream', flangeConvention: 'perJoint' },
  });
  const drawings: Drawing[] = ['PEFS-001', 'PEFS-002', 'PEFS-003'].map((no, i) => ({
    id: newId('drw'),
    fileName: `${no}.pdf`,
    originalFileName: `${no}.pdf`,
    fileHash: '0'.repeat(64),
    fileType: 'pdf',
    page: 1,
    layout: null,
    isCadPlot: false,
    drawingNo: no,
    sheet: String(i + 1),
    title: `Demo drawing ${i + 1}`,
    revision: 'B',
    size: { width: 2384, height: 1684 },
    importedAt: project.createdAt,
    needsReview: false,
  }));
  const segments: Segment[] = ['IS-01', 'IS-02', 'IS-03'].map((label, i) => ({
    id: newId('seg'),
    label,
    description: `Demo segment ${i + 1}`,
    colour: i + 1,
    fluid: 'Natural gas',
    phase: 'Gas',
    pressure: 60,
    temperature: 40,
    status: 'inProgress',
    boundingEsdvIds: [],
    drawingIds: [drawings[i]!.id],
    countedBy: '',
    checkedBy: '',
  }));
  useProjectStore.getState().load(projectToDoc({ ...project, drawings, segments }));
}
