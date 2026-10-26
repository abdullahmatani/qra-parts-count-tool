import { describe, expect, it } from 'vitest';
import { findCell } from './cells';
import { refreshFormulaValues } from './formula-values';

const sheet = (rows: string) =>
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  `<dimension ref="A1:R71"/><sheetData>${rows}</sheetData><pageMargins left="0.75"/></worksheet>`;

/** The stored value of a cell after the refresh, as Excel would read it. */
function stored(xml: string, ref: string): string | undefined {
  return /<v>([\s\S]*?)<\/v>/.exec(findCell(xml, ref) ?? '')?.[1];
}

describe('stored formula results', () => {
  // The A2.1 layout in small: hole sizes, an input, a shared formula block and the results row.
  const a21 =
    '<row r="1"><c r="C1" s="1"><f>I27</f><v>2</v></c><c r="D1" s="1"><f>J27</f><v>7</v></c></row>' +
    '<row r="2"><c r="B2" t="s"><v>2</v></c><c r="C2" s="5"><f>SUM(N28:N71)</f><v>0</v></c><c r="D2" s="5"><f>SUM(O28:O71)</f><v>0</v></c></row>' +
    '<row r="19"><c r="B19" s="9"><v>4</v></c></row>' +
    '<row r="27"><c r="I27"><v>2</v></c><c r="J27"><v>7</v></c></row>' +
    '<row r="28"><c r="A28" t="s"><v>3</v></c><c r="E28" s="13"><v>2</v></c><c r="H28"><v>0.019</v></c><c r="I28"><v>0.25</v></c><c r="J28"><v>0.5</v></c>' +
    '<c r="N28" s="6"><f t="shared" ref="N28:O29" si="0">$E28*$H28*I28</f><v>0</v></c><c r="O28" s="6"><f t="shared" si="0"/><v>0</v></c></row>' +
    '<row r="29"><c r="E29" s="13"/><c r="H29"><v>0.08</v></c><c r="I29"><v>0.7</v></c><c r="J29"><v>0.2</v></c>' +
    '<c r="N29" s="6"><f t="shared" si="0"/><v>0</v></c><c r="O29" s="6"><f t="shared" si="0"/><v>0</v></c></row>' +
    '<row r="44" hidden="1"><c r="C44" t="s"><v>4</v></c><c r="E44"><f>B19</f><v>0</v></c><c r="H44"><v>0.0004</v></c><c r="I44"><v>0.5</v></c><c r="J44"><v>0.25</v></c>' +
    '<c r="N44" s="6"><f t="shared" ref="N44:O44" si="1">$E44*$H44*I44</f><v>0</v></c><c r="O44" s="6"><f t="shared" si="1"/><v>0</v></c></row>';

  it('works out the results row of an A2.1-style sheet, shared formulas included', () => {
    const out = refreshFormulaValues(sheet(a21));
    expect(stored(out, 'N28')).toBe(String(2 * 0.019 * 0.25));
    expect(stored(out, 'O28')).toBe(String(2 * 0.019 * 0.5));
    expect(stored(out, 'N29')).toBe('0');
    expect(stored(out, 'E44')).toBe('4');
    expect(stored(out, 'O44')).toBe(String(4 * 0.0004 * 0.25));
    expect(Number(stored(out, 'C2'))).toBeCloseTo(2 * 0.019 * 0.25 + 4 * 0.0004 * 0.5, 15);
    expect(Number(stored(out, 'D2'))).toBeCloseTo(2 * 0.019 * 0.5 + 4 * 0.0004 * 0.25, 15);
    // Formulas, styles and the hole sizes (already right) are as they were.
    expect(findCell(out, 'C2')).toMatch(/^<c r="C2" s="5"><f>SUM\(N28:N71\)<\/f><v>/);
    expect(findCell(out, 'O28')).toMatch(/^<c r="O28" s="6"><f t="shared" si="0"\/><v>/);
    expect(findCell(out, 'C1')).toBe('<c r="C1" s="1"><f>I27</f><v>2</v></c>');
    expect(out).toContain('<row r="44" hidden="1">');
    expect(out.endsWith('</sheetData><pageMargins left="0.75"/></worksheet>')).toBe(true);
  });

  it('leaves the sheet as it was when every stored result is already right', () => {
    const xml = sheet(
      '<row r="1"><c r="A1"><v>3</v></c><c r="B1"><f>A1*2</f><v>6</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2"><f>SUM(A1:A2)</f><v>3</v></c></row>',
    );
    expect(refreshFormulaValues(xml)).toBe(xml);
  });

  it("follows Excel's operator rules", () => {
    const cases: [string, number][] = [
      ['2+3*4', 14],
      ['(2+3)*4', 20],
      ['-2^2', 4],
      ['2^-1', 0.5],
      ['10/4-1', 1.5],
      ['SUM(1,2,A1)', 6],
      ['1.5E+2', 150],
      ['A1*B9', 0],
    ];
    for (const [formula, value] of cases) {
      const xml = sheet(
        `<row r="1"><c r="A1"><v>3</v></c><c r="B1"><f>${formula}</f><v>-1</v></c></row>`,
      );
      expect(stored(refreshFormulaValues(xml), 'B1'), formula).toBe(String(value));
    }
  });

  it('leaves formulas it cannot work out, and those that use them, for Excel', () => {
    const rows =
      '<row r="1"><c r="A1"><v>3</v></c><c r="B1" t="s"><v>0</v></c></row>' +
      '<row r="2">' +
      '<c r="A2"><f>\'Other sheet\'!A1*2</f><v>11</v></c>' +
      '<c r="B2"><f>ROUND(A1,0)</f><v>12</v></c>' +
      '<c r="C2"><f>A1*Rate</f><v>13</v></c>' +
      '<c r="D2"><f>A1/0</f><v>14</v></c>' +
      '<c r="E2"><f>B1*2</f><v>15</v></c>' +
      '<c r="F2"><f>A2+1</f><v>16</v></c>' +
      '<c r="G2"><f>G2+1</f><v>17</v></c>' +
      '<c r="H2"><f>A1&amp;"x"</f><v>18</v></c>' +
      '<c r="I2"><f>SUM(A:A)</f><v>19</v></c>' +
      '<c r="J2"><f t="array" ref="J2">A1*2</f><v>20</v></c>' +
      '<c r="K2"><f>A1+1</f><v>0</v></c>' +
      '</row>';
    const out = refreshFormulaValues(sheet(rows));
    const left = ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2'];
    left.forEach((ref, i) => expect(stored(out, ref), ref).toBe(String(11 + i)));
    expect(stored(out, 'K2')).toBe('4');
  });

  it('does not fail on a very long chain of formulas', () => {
    const rows = Array.from(
      { length: 30_000 },
      (_, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}">${i === 0 ? '<v>1</v>' : `<f>A${i}+1</f><v>0</v>`}</c></row>`,
    ).join('');
    const out = refreshFormulaValues(sheet(rows));
    expect(stored(out, 'A2')).toBe('2');
    expect(stored(out, 'A100')).toBe('100');
  });

  it('stores a number where the template held text or an error, or nothing', () => {
    const out = refreshFormulaValues(
      sheet(
        '<row r="1"><c r="A1"><v>3</v></c>' +
          '<c r="B1" t="str"><f>A1+1</f><v></v></c>' +
          '<c r="C1" t="e"><f>A1+2</f><v>#VALUE!</v></c>' +
          '<c r="D1"><f>A1+3</f></c></row>',
      ),
    );
    expect(findCell(out, 'B1')).toBe('<c r="B1"><f>A1+1</f><v>4</v></c>');
    expect(findCell(out, 'C1')).toBe('<c r="C1"><f>A1+2</f><v>5</v></c>');
    expect(findCell(out, 'D1')).toBe('<c r="D1"><f>A1+3</f><v>6</v></c>');
  });
});
