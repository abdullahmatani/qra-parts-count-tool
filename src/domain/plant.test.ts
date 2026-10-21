import { describe, expect, it } from 'vitest';
import { makeDrawing } from '@/test/fixtures';
import { buildPlantTree, compareNames, plantName, sortedUnits, unitNamed } from './plant';

const unit100 = { id: 'unt_100', name: 'Unit 100' };
const unit20 = { id: 'unt_20', name: 'Unit 20 Gas compression' };
const units = [unit100, unit20];

const drawing = (drawingNo: string, unitId: string | null, sheet = '') =>
  makeDrawing({ id: `drw_${drawingNo}_${sheet}`, drawingNo, sheet, unitId, title: '' });

const numbers = (list: { drawingNo: string; sheet: string }[]) =>
  list.map((d) => (d.sheet ? `${d.drawingNo} / ${d.sheet}` : d.drawingNo));

describe('plant breakdown (DRW-11)', () => {
  it('names the plant after the facility, or the project without one', () => {
    expect(plantName({ facility: ' Gas plant ', name: 'Study' })).toBe('Gas plant');
    expect(plantName({ facility: '  ', name: 'Study' })).toBe('Study');
  });

  it('orders names with their numbers as numbers, ignoring case', () => {
    expect(['Unit 100', 'unit 3', 'Unit 20'].sort(compareNames)).toEqual([
      'unit 3',
      'Unit 20',
      'Unit 100',
    ]);
    expect(sortedUnits(units).map((u) => u.id)).toEqual(['unt_20', 'unt_100']);
  });

  it('finds a unit by name, ignoring case and spaces, except the one being renamed', () => {
    expect(unitNamed(units, ' unit 100 ')).toBe(unit100);
    expect(unitNamed(units, 'Unit 100', 'unt_100')).toBeUndefined();
    expect(unitNamed(units, 'Unit 1')).toBeUndefined();
  });

  it('groups drawings by unit, in drawing number order, with the rest unassigned', () => {
    const tree = buildPlantTree(
      [
        drawing('PEFS-1010', 'unt_100'),
        drawing('PEFS-1002', 'unt_100', '2'),
        drawing('PEFS-1002', 'unt_100', '10'),
        drawing('PEFS-2001', 'unt_20'),
        drawing('PEFS-9001', null),
        drawing('PEFS-0001', 'unt_gone'),
      ],
      [...units, { id: 'unt_empty', name: 'Unit 300' }],
    );
    expect(tree.units.map(({ unit, drawings }) => [unit.name, numbers(drawings)])).toEqual([
      ['Unit 20 Gas compression', ['PEFS-2001']],
      ['Unit 100', ['PEFS-1002 / 2', 'PEFS-1002 / 10', 'PEFS-1010']],
      ['Unit 300', []],
    ]);
    // A drawing filed under a unit that no longer exists counts as unassigned.
    expect(numbers(tree.unassigned)).toEqual(['PEFS-0001', 'PEFS-9001']);
  });

  it('filters drawings, keeping whole units whose name matches and dropping empty ones', () => {
    const drawings = [
      drawing('PEFS-1001', 'unt_100'),
      drawing('PEFS-1002', 'unt_100'),
      drawing('PEFS-2001', 'unt_20'),
      drawing('PEFS-9001', null),
    ];
    const byNumber = buildPlantTree(drawings, units, '1002');
    expect(byNumber.units.map(({ unit, drawings }) => [unit.id, numbers(drawings)])).toEqual([
      ['unt_100', ['PEFS-1002']],
    ]);
    expect(byNumber.unassigned).toEqual([]);

    const byUnit = buildPlantTree(drawings, units, 'gas comp');
    expect(byUnit.units.map(({ unit, drawings }) => [unit.id, numbers(drawings)])).toEqual([
      ['unt_20', ['PEFS-2001']],
    ]);
  });
});
