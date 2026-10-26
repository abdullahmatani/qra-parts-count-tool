/**
 * Stored results for a sheet's formulas after its inputs change. Excel
 * recalculates on opening, but Protected View, file previews and programs
 * that read the file show the value stored with each formula, which would
 * still be the template's. This works out the formulas it can, simple
 * arithmetic and SUM over cells of the same sheet (the A2.1 results row and
 * its hidden calculation columns), and replaces only their stored value.
 * Any other formula, and any formula that depends on one, keeps its stored
 * value for Excel to recalculate.
 */
import { cellsOf, rowsOf } from './cells';
import { attributes, setAttribute, unescapeXml } from './package';

type Stored = number | boolean | 'text' | 'error' | null;

interface SheetCell {
  stored: Stored;
  /** The formula's text, and how far it is from where that text is written (shared formulas). */
  formula?: { text: string; rowOffset: number; columnOffset: number } | 'unsupported';
}

interface Range {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

class Unsupported extends Error {}

const key = (column: number, row: number) => `${column},${row}`;

function storedValue(cellXml: string, type: string | undefined): Stored {
  const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  if (type === 's' || type === 'str' || type === 'inlineStr') return 'text';
  if (type === 'e') return 'error';
  if (v === undefined) return null;
  if (type === 'b') return v.trim() === '1';
  const n = Number(v);
  return Number.isFinite(n) ? n : 'error';
}

/** Every cell of the sheet, with shared formulas resolved to their master's text. */
function readCells(sheetData: string): Map<string, SheetCell> {
  const cells = new Map<string, SheetCell>();
  const masters = new Map<string, { text: string; column: number; row: number }>();
  const children: { at: string; si: string; column: number; row: number }[] = [];
  for (const row of rowsOf(sheetData)) {
    if (row.inner === null) continue;
    for (const cell of cellsOf(row.inner, row.row)) {
      const start = cell.xml.slice(0, cell.xml.indexOf('>') + 1);
      const at = key(cell.column, row.row);
      const entry: SheetCell = { stored: storedValue(cell.xml, attributes(start).get('t')) };
      const f = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(cell.xml);
      if (f) {
        const a = attributes(`<f${f[1]}>`);
        const type = a.get('t') ?? 'normal';
        const text = unescapeXml(f[2] ?? '');
        if (type === 'normal' && text) {
          entry.formula = { text, rowOffset: 0, columnOffset: 0 };
        } else if (type === 'shared' && a.has('si')) {
          if (text) masters.set(a.get('si')!, { text, column: cell.column, row: row.row });
          children.push({ at, si: a.get('si')!, column: cell.column, row: row.row });
        } else {
          entry.formula = 'unsupported';
        }
      }
      cells.set(at, entry);
    }
  }
  for (const child of children) {
    const master = masters.get(child.si);
    cells.get(child.at)!.formula = master
      ? {
          text: master.text,
          rowOffset: child.row - master.row,
          columnOffset: child.column - master.column,
        }
      : 'unsupported';
  }
  return cells;
}

/** A1 reference parts: column and row, each absolute ($) or relative. */
const REF = /^(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/;

function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Evaluates the supported formulas of one sheet. Results are numbers; null
 * means the formula is left for Excel.
 */
class Evaluator {
  private readonly cells: Map<string, SheetCell>;
  private readonly results = new Map<string, number | null>();
  private readonly busy = new Set<string>();

  constructor(cells: Map<string, SheetCell>) {
    this.cells = cells;
  }

  result(at: string): number | null {
    if (this.results.has(at)) return this.results.get(at)!;
    const formula = this.cells.get(at)?.formula;
    if (!formula) return null;
    let value: number | null = null;
    if (formula !== 'unsupported' && !this.busy.has(at)) {
      this.busy.add(at);
      try {
        value = new FormulaParser(
          formula.text,
          formula.rowOffset,
          formula.columnOffset,
          this,
        ).run();
      } catch (error) {
        // A chain of formulas too long to follow (RangeError) is left for Excel too.
        if (!(error instanceof Unsupported) && !(error instanceof RangeError)) throw error;
      } finally {
        this.busy.delete(at);
      }
    }
    this.results.set(at, value);
    return value;
  }

  /** A cell's value as a formula sees it: a number, or empty (null); text and errors stop. */
  value(column: number, row: number, inSum: boolean): number | null {
    const at = key(column, row);
    const cell = this.cells.get(at);
    if (!cell) return null;
    if (cell.formula) {
      const n = this.result(at);
      if (n === null) throw new Unsupported();
      return n;
    }
    const v = cell.stored;
    if (typeof v === 'number' || v === null) return v;
    // SUM skips text and logical values in cells; arithmetic does not.
    if (inSum && (v === 'text' || typeof v === 'boolean')) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    throw new Unsupported();
  }
}

type Operand = number | Range;

/** Recursive-descent parser that evaluates as it reads: + - * / ^, unary minus, SUM. */
class FormulaParser {
  private at = 0;
  private readonly text: string;
  private readonly rowOffset: number;
  private readonly columnOffset: number;
  private readonly sheet: Evaluator;

  constructor(text: string, rowOffset: number, columnOffset: number, sheet: Evaluator) {
    this.text = text.replace(/^=/, '');
    this.rowOffset = rowOffset;
    this.columnOffset = columnOffset;
    this.sheet = sheet;
  }

  run(): number {
    const value = this.number(this.expression());
    this.space();
    if (this.at !== this.text.length) throw new Unsupported();
    if (!Number.isFinite(value)) throw new Unsupported();
    return value;
  }

  private space(): void {
    while (this.text[this.at] === ' ') this.at += 1;
  }

  private take(token: string): boolean {
    this.space();
    if (this.text.startsWith(token, this.at)) {
      this.at += token.length;
      return true;
    }
    return false;
  }

  /** A single number from an operand; a cell range is only allowed in SUM. */
  private number(operand: Operand): number {
    if (typeof operand === 'number') return operand;
    if (operand.top !== operand.bottom || operand.left !== operand.right) throw new Unsupported();
    return this.sheet.value(operand.left, operand.top, false) ?? 0;
  }

  private expression(): Operand {
    let left = this.term();
    for (;;) {
      if (this.take('+')) left = this.number(left) + this.number(this.term());
      else if (this.take('-')) left = this.number(left) - this.number(this.term());
      else return left;
    }
  }

  private term(): Operand {
    let left = this.power();
    for (;;) {
      if (this.take('*')) left = this.number(left) * this.number(this.power());
      else if (this.take('/')) {
        const divisor = this.number(this.power());
        if (divisor === 0) throw new Unsupported();
        left = this.number(left) / divisor;
      } else return left;
    }
  }

  private power(): Operand {
    let left = this.unary();
    while (this.take('^')) left = this.number(left) ** this.number(this.unary());
    return left;
  }

  private unary(): Operand {
    if (this.take('-')) return -this.number(this.unary());
    if (this.take('+')) return this.unary();
    return this.primary();
  }

  private primary(): Operand {
    this.space();
    const rest = this.text.slice(this.at);
    if (this.take('(')) {
      const inner = this.expression();
      if (!this.take(')')) throw new Unsupported();
      return inner;
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (num) {
      this.at += num[0].length;
      return Number(num[0]);
    }
    const fn = /^([A-Za-z][A-Za-z0-9._]*)\(/.exec(rest);
    if (fn) {
      if (fn[1]!.toUpperCase() !== 'SUM') throw new Unsupported();
      this.at += fn[0].length;
      let total = 0;
      if (!this.take(')')) {
        do total += this.sumArgument(this.expression());
        while (this.take(','));
        if (!this.take(')')) throw new Unsupported();
      }
      return total;
    }
    const range = this.range(rest);
    if (range) return range;
    throw new Unsupported();
  }

  private sumArgument(operand: Operand): number {
    if (typeof operand === 'number') return operand;
    let total = 0;
    for (let row = operand.top; row <= operand.bottom; row += 1) {
      for (let column = operand.left; column <= operand.right; column += 1) {
        total += this.sheet.value(column, row, true) ?? 0;
      }
    }
    return total;
  }

  /** A cell or range on this sheet, moved by the shared-formula offset where relative. */
  private range(rest: string): Range | null {
    const first = REF.exec(rest);
    if (!first) return null;
    let length = first[0].length;
    let second: RegExpExecArray | null = null;
    if (rest[length] === ':') {
      second = REF.exec(rest.slice(length + 1));
      if (!second) throw new Unsupported();
      length += 1 + second[0].length;
    }
    // A name, a function, another sheet or a whole column is not a plain cell reference.
    if (/^[A-Za-z0-9_.!(]/.test(rest.slice(length))) throw new Unsupported();
    this.at += length;
    const a = this.cell(first);
    const b = second ? this.cell(second) : a;
    return {
      top: Math.min(a.row, b.row),
      bottom: Math.max(a.row, b.row),
      left: Math.min(a.column, b.column),
      right: Math.max(a.column, b.column),
    };
  }

  private cell(m: RegExpExecArray): { column: number; row: number } {
    const column = columnNumber(m[2]!) + (m[1] ? 0 : this.columnOffset);
    const row = Number(m[4]) + (m[3] ? 0 : this.rowOffset);
    if (column < 1 || row < 1) throw new Unsupported();
    return { column, row };
  }
}

/** The sheet with each formula it can work out storing its new result; returns the new XML. */
export function refreshFormulaValues(sheetXml: string): string {
  const match = /(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/.exec(sheetXml);
  if (!match) return sheetXml;
  let data = match[2]!;
  const evaluator = new Evaluator(readCells(data));

  const rows = rowsOf(data);
  // Work from the bottom up so earlier offsets stay valid.
  for (const row of rows.slice().reverse()) {
    if (row.inner === null) continue;
    let inner = row.inner;
    for (const cell of cellsOf(row.inner, row.row).reverse()) {
      if (!/<f[\s>/]/.test(cell.xml)) continue;
      const value = evaluator.result(key(cell.column, row.row));
      if (value === null) continue;
      const old = /<v>([\s\S]*?)<\/v>/.exec(cell.xml);
      const start = cell.xml.slice(0, cell.xml.indexOf('>') + 1);
      const type = attributes(start).get('t');
      if (old && !type && Number(old[1]) === value) continue;
      const v = `<v>${Object.is(value, -0) ? 0 : value}</v>`;
      const body = cell.xml.slice(start.length);
      const next =
        setAttribute(start, 't', null) +
        (old ? body.replace(old[0], v) : body.replace(/(<f\b[^>]*\/>|<\/f>)/, `$1${v}`));
      inner = inner.slice(0, cell.start) + next + inner.slice(cell.end);
    }
    if (inner !== row.inner) {
      data = data.slice(0, row.start) + `${row.open}${inner}</row>` + data.slice(row.end);
    }
  }
  return (
    sheetXml.slice(0, match.index) +
    match[1] +
    data +
    match[3] +
    sheetXml.slice(match.index + match[0].length)
  );
}
