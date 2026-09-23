import { describe, expect, it } from 'vitest';
import { docToProject, orderedValues, projectToDoc } from './model';
import { makePopulatedProject, makeSegment } from '@/test/fixtures';

describe('project model conversion', () => {
  it('round-trips a project through the runtime model', () => {
    const project = makePopulatedProject();
    expect(docToProject(projectToDoc(project))).toEqual(project);
  });

  it('keys large collections by id and keeps drawing and segment order', () => {
    const project = makePopulatedProject();
    const second = makeSegment({ label: 'IS-02' });
    project.segments.unshift(second);
    const doc = projectToDoc(project);
    expect(doc.markers[project.markers[0]!.id]).toEqual(project.markers[0]);
    expect(doc.segmentOrder[0]).toBe(second.id);
    expect(docToProject(doc).segments.map((s) => s.label)).toEqual(['IS-02', 'IS-01']);
  });

  it('never drops an entity missing from the order list', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(orderedValues({ a, b }, ['b'])).toEqual([b, a]);
    expect(orderedValues({ a }, ['x', 'a', 'a'])).toEqual([a]);
  });
});
