import { describe, expect, it } from 'vitest';
import { docToProject, projectToDoc } from '../model';
import { checkIntegrity, parseProjectFile, serializeProject } from '../schema';
import { makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { addDrawings, removeDrawing } from './drawings';
import { addPlantUnit, assignDrawingsToUnit, removePlantUnit, renamePlantUnit } from './plant';

function docWithDrawings() {
  const doc = projectToDoc(makePopulatedProject());
  const second = makeDrawing({ drawingNo: 'PEFS-002' });
  addDrawings(doc, [second]);
  return { doc, first: doc.drawingOrder[0]!, second: second.id };
}

describe('plant unit actions (DRW-11)', () => {
  it('adds, renames and files drawings under units', () => {
    const { doc, first, second } = docWithDrawings();
    addPlantUnit(doc, { id: 'unt_1', name: 'Unit 100' });
    addPlantUnit(doc, { id: 'unt_1', name: 'Duplicate id' });
    expect(doc.plantUnits).toEqual([{ id: 'unt_1', name: 'Unit 100' }]);

    renamePlantUnit(doc, 'unt_1', 'Unit 100 Separation');
    expect(doc.plantUnits[0]!.name).toBe('Unit 100 Separation');

    assignDrawingsToUnit(doc, [first, second, 'drw_missing'], 'unt_1');
    expect(doc.drawings[first]!.unitId).toBe('unt_1');
    expect(doc.drawings[second]!.unitId).toBe('unt_1');

    // A unit that does not exist changes nothing; null takes drawings out of their unit.
    assignDrawingsToUnit(doc, [first], 'unt_missing');
    expect(doc.drawings[first]!.unitId).toBe('unt_1');
    assignDrawingsToUnit(doc, [first], null);
    expect(doc.drawings[first]!.unitId).toBeNull();
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('deletes a unit and leaves its drawings in the project, unassigned', () => {
    const { doc, first, second } = docWithDrawings();
    addPlantUnit(doc, { id: 'unt_1', name: 'Unit 100' });
    addPlantUnit(doc, { id: 'unt_2', name: 'Unit 200' });
    assignDrawingsToUnit(doc, [first], 'unt_1');
    assignDrawingsToUnit(doc, [second], 'unt_2');
    removePlantUnit(doc, 'unt_1');
    expect(doc.plantUnits.map((u) => u.id)).toEqual(['unt_2']);
    expect(doc.drawings[first]!.unitId).toBeNull();
    expect(doc.drawings[second]!.unitId).toBe('unt_2');
    expect(Object.keys(doc.drawings)).toHaveLength(2);
  });

  it('leaves a drawing imported into a unit deleted meanwhile unassigned', () => {
    const { doc } = docWithDrawings();
    addPlantUnit(doc, { id: 'unt_1', name: 'Unit 100' });
    const kept = makeDrawing({ unitId: 'unt_1' });
    const orphan = makeDrawing({ unitId: 'unt_gone' });
    addDrawings(doc, [kept, orphan]);
    expect(doc.drawings[kept.id]!.unitId).toBe('unt_1');
    expect(doc.drawings[orphan.id]!.unitId).toBeNull();
    removeDrawing(doc, kept.id);
    expect(doc.plantUnits).toHaveLength(1);
  });

  it('saves units and filed drawings, and reads files written before units existed', () => {
    const { doc, first } = docWithDrawings();
    addPlantUnit(doc, { id: 'unt_1', name: 'Unit 100' });
    assignDrawingsToUnit(doc, [first], 'unt_1');
    const reread = parseProjectFile(serializeProject(docToProject(doc))).project;
    expect(reread.plantUnits).toEqual([{ id: 'unt_1', name: 'Unit 100' }]);
    expect(reread.drawings.find((d) => d.id === first)!.unitId).toBe('unt_1');

    const old = JSON.parse(serializeProject(makePopulatedProject()));
    delete old.plantUnits;
    for (const drawing of old.drawings) delete drawing.unitId;
    const parsed = parseProjectFile(JSON.stringify(old)).project;
    expect(parsed.plantUnits).toEqual([]);
    expect(parsed.drawings.every((d) => d.unitId === null)).toBe(true);
  });
});
