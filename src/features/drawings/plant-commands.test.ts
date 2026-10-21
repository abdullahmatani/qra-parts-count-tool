import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDrawings } from '@/domain/actions/drawings';
import { projectToDoc } from '@/domain/model';
import { makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { useProjectStore } from '@/store/project-store';
import {
  addPlantUnitCommand,
  deletePlantUnitCommand,
  moveDrawingsToUnitCommand,
  renamePlantCommand,
  renamePlantUnitCommand,
} from './plant-commands';

const project = () => useProjectStore.getState();
const drawing = (id: string) => project().doc!.drawings[id]!;

describe('plant breakdown commands (DRW-11)', () => {
  let first: string;
  let second: string;

  beforeEach(() => {
    const doc = projectToDoc(makePopulatedProject());
    addDrawings(doc, [makeDrawing({ drawingNo: 'PEFS-002', sheet: '' })]);
    project().load(doc);
    [first, second] = project().doc!.drawingOrder as [string, string];
  });
  afterEach(() => project().close());

  it('adds a unit with the drawings to file under it as one undo step', () => {
    const unitId = addPlantUnitCommand('  Unit 100  ', [first]);
    expect(unitId).toMatch(/^unt_/);
    expect(project().doc!.plantUnits).toEqual([{ id: unitId, name: 'Unit 100' }]);
    expect(drawing(first).unitId).toBe(unitId);
    expect(project().past.at(-1)?.label).toBe('add unit Unit 100');

    project().undo();
    expect(project().doc!.plantUnits).toEqual([]);
    expect(drawing(first).unitId).toBeNull();
  });

  it('refuses blank names and names another unit has', () => {
    const unitId = addPlantUnitCommand('Unit 100')!;
    const other = addPlantUnitCommand('Unit 200')!;
    const steps = project().past.length;
    expect(addPlantUnitCommand('   ')).toBeNull();
    expect(addPlantUnitCommand('unit 100')).toBeNull();
    expect(renamePlantUnitCommand(other, 'UNIT 100')).toBe(false);
    expect(renamePlantUnitCommand(other, 'Unit 200')).toBe(false);
    expect(project().past).toHaveLength(steps);

    // A unit can change the case of its own name.
    expect(renamePlantUnitCommand(unitId, 'UNIT 100')).toBe(true);
    expect(project().past.at(-1)?.label).toBe('rename unit to UNIT 100');
  });

  it('moves drawings between units and back to Unassigned', () => {
    const unitId = addPlantUnitCommand('Unit 100')!;
    expect(moveDrawingsToUnitCommand([first, second], unitId)).toBe(true);
    expect(project().past.at(-1)?.label).toBe('move 2 drawings to Unit 100');
    expect(moveDrawingsToUnitCommand([first, second], unitId)).toBe(false);
    expect(moveDrawingsToUnitCommand([first], 'unt_missing')).toBe(false);

    expect(moveDrawingsToUnitCommand([second], null)).toBe(true);
    expect(project().past.at(-1)?.label).toBe('move PEFS-002 to Unassigned');
    expect(drawing(first).unitId).toBe(unitId);
    expect(drawing(second).unitId).toBeNull();
  });

  it('deletes a unit and leaves its drawings unassigned, until undone', () => {
    const unitId = addPlantUnitCommand('Unit 100', [first])!;
    expect(deletePlantUnitCommand(unitId)).toBe(true);
    expect(project().past.at(-1)?.label).toBe('delete unit Unit 100');
    expect(drawing(first).unitId).toBeNull();
    expect(deletePlantUnitCommand(unitId)).toBe(false);
    project().undo();
    expect(drawing(first).unitId).toBe(unitId);
  });

  it("renames the plant, which is the project's facility", () => {
    expect(renamePlantCommand(' Gas plant ')).toBe(true);
    expect(project().doc!.facility).toBe('Gas plant');
    expect(renamePlantCommand('Gas plant')).toBe(false);
    expect(renamePlantCommand('  ')).toBe(false);
  });

  it('changes nothing on a read-only project', () => {
    project().setReadOnly(true);
    expect(addPlantUnitCommand('Unit 100')).toBeNull();
    expect(project().doc!.plantUnits).toEqual([]);
  });
});
