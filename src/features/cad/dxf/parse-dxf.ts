/**
 * ASCII DXF reader: converts the text of a DXF file into the neutral CAD model.
 *
 * Supported:
 * - HEADER: $ACADVER, $INSUNITS and $LTSCALE.
 * - TABLES: LAYER (colour, true colour, off/frozen, linetype, line weight, handle),
 *   LTYPE (dash pattern) and BLOCK_RECORD (handle → name, used for layouts).
 * - BLOCKS: block definitions. The *Model_Space and *Paper_Space* containers are
 *   not exposed as blocks; their entities go to model space and the layouts.
 * - ENTITIES: LINE, LWPOLYLINE, POLYLINE (2D and 3D; meshes are skipped), CIRCLE,
 *   ARC, ELLIPSE, SPLINE, TEXT, MTEXT, INSERT with ATTRIBs, SOLID, TRACE, HATCH
 *   (boundaries flattened to point loops), POINT, VIEWPORT, DIMENSION, LEADER and
 *   WIPEOUT. Entities with 67 = 1 are paper space. Other types are counted in
 *   `unsupported`.
 * - OBJECTS: LAYOUT (name, tab order, limits and paper-space block record).
 *
 * Entities whose extrusion is (0, 0, -1), as mirrored geometry often has, are
 * mirrored into world coordinates. Other extrusions are read as if they were
 * (0, 0, 1). Binary DXF is not supported.
 *
 * For speed on files of tens of megabytes, the text is scanned once into arrays
 * of group codes and value offsets; values are only turned into strings or
 * numbers when an entity reader asks for them.
 */
import {
  BY_BLOCK,
  BY_LAYER,
  emptyCadDocument,
  type CadColor,
  type CadDocument,
  type CadEntity,
  type CadLayout,
  type CadStyle,
  type CadVertex,
  type Vec2,
} from '../model';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
/** Group code given to a code line that is not an integer. */
const BAD_CODE = -9999;
/** Hatch boundary arcs are flattened with this many segments per 90°. */
const SEGMENTS_PER_QUARTER = 8;

type ViewportEntity = Extract<CadEntity, { type: 'viewport' }>;
type InsertEntity = Extract<CadEntity, { type: 'insert' }>;

// ---- group reader ----------------------------------------------------------

/**
 * The group code/value pairs of a DXF file, with a cursor. Pair i has code
 * `codes[i]` and the value `text.slice(starts[i], ends[i])` (trailing blanks
 * excluded). Records start at code 0.
 */
class GroupReader {
  readonly text: string;
  readonly codes: Int32Array;
  readonly starts: Int32Array;
  readonly ends: Int32Array;
  readonly length: number;
  pos = 0;

  constructor(text: string, codes: Int32Array, starts: Int32Array, ends: Int32Array, n: number) {
    this.text = text;
    this.codes = codes;
    this.starts = starts;
    this.ends = ends;
    this.length = n;
  }

  get done(): boolean {
    return this.pos >= this.length;
  }

  str(i: number): string {
    return this.text.slice(this.starts[i]!, this.ends[i]!);
  }

  num(i: number): number {
    const n = +this.text.slice(this.starts[i]!, this.ends[i]!);
    return n === n ? n : 0;
  }

  int(i: number): number {
    return +this.text.slice(this.starts[i]!, this.ends[i]!) | 0;
  }

  /** True when the value of pair i is exactly `s` (no string is created). */
  is(i: number, s: string): boolean {
    const start = this.starts[i]!;
    return this.ends[i]! - start === s.length && this.text.startsWith(s, start);
  }

  /** True when the current pair is (0, type). */
  at(type: string): boolean {
    return this.pos < this.length && this.codes[this.pos] === 0 && this.is(this.pos, type);
  }

  /** Index of the first code-0 pair at or after `from` (the length if none). */
  nextRecord(from: number): number {
    const codes = this.codes;
    const n = this.length;
    let i = from;
    while (i < n && codes[i] !== 0) i += 1;
    return i;
  }
}

/** Scans the text into group pairs: a code line, then a value line. */
function tokenize(text: string): GroupReader {
  const n = text.length;
  const newline = text.includes('\n') ? '\n' : '\r';
  let capacity = Math.max(256, Math.floor(n / 16));
  let codes: Int32Array = new Int32Array(capacity);
  let starts: Int32Array = new Int32Array(capacity);
  let ends: Int32Array = new Int32Array(capacity);
  let count = 0;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (pos < n) {
    let eol = text.indexOf(newline, pos);
    if (eol < 0) eol = n;
    const code = parseCode(text, pos, eol);
    pos = eol + 1;
    if (pos > n) break;
    let valueEnd = text.indexOf(newline, pos);
    if (valueEnd < 0) valueEnd = n;
    // Trailing CRs and blanks are not part of a value, except that text values
    // (1 and 3) keep trailing blanks: MTEXT is split into chunks at any character.
    // Leading blanks are kept, except in record types.
    let start = pos;
    let end = valueEnd;
    if (code === 1 || code === 3) while (end > start && text.charCodeAt(end - 1) === 13) end -= 1;
    else while (end > start && text.charCodeAt(end - 1) <= 32) end -= 1;
    if (code === 0) while (start < end && text.charCodeAt(start) <= 32) start += 1;
    if (count === capacity) {
      capacity *= 2;
      codes = grow(codes, capacity);
      starts = grow(starts, capacity);
      ends = grow(ends, capacity);
    }
    codes[count] = code;
    starts[count] = start;
    ends[count] = end;
    count += 1;
    pos = valueEnd + 1;
  }
  return new GroupReader(text, codes, starts, ends, count);
}

function grow(array: Int32Array, capacity: number): Int32Array {
  const next = new Int32Array(capacity);
  next.set(array);
  return next;
}

/** Parses a group code line text[from, to): an integer with optional blanks. */
function parseCode(text: string, from: number, to: number): number {
  let i = from;
  while (i < to && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i += 1;
  let sign = 1;
  if (text.charCodeAt(i) === 45) {
    sign = -1;
    i += 1;
  }
  const digits = i;
  let value = 0;
  for (; i < to; i += 1) {
    const d = text.charCodeAt(i) - 48;
    if (d < 0 || d > 9) break;
    value = value * 10 + d;
  }
  if (i === digits) return BAD_CODE;
  for (; i < to; i += 1) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 13) return BAD_CODE;
  }
  return sign * value;
}

function hasDxfStructure(r: GroupReader): boolean {
  for (let i = 0; i < r.length; i += 1) {
    if (r.codes[i] === 0 && (r.is(i, 'SECTION') || r.is(i, 'EOF'))) return true;
  }
  return false;
}

/** True when pair i is a record that ends a section's contents. */
function isSectionEnd(r: GroupReader, i: number): boolean {
  return r.is(i, 'ENDSEC') || r.is(i, 'EOF') || r.is(i, 'SECTION');
}

// ---- values ----------------------------------------------------------------

/** DXF line weight (1/100 mm; -1 ByLayer, -2 ByBlock, -3 default) → model. */
function lineWeight(value: number): number | undefined {
  if (value === -1) return undefined;
  return value < 0 ? value : value / 100;
}

function aci(index: number): CadColor {
  return { kind: 'aci', index };
}

/** Normalises degrees to [0, 360). */
function norm360(angle: number): number {
  const a = angle % 360;
  return a < 0 ? a + 360 : a;
}

/** Counter-clockwise sweep from start to end in radians, in (0, 2π]. */
function ccwSweep(start: number, end: number): number {
  let sweep = (end - start) % TAU;
  if (sweep < 0) sweep += TAU;
  return sweep < 1e-9 ? TAU : sweep;
}

function isDigit(text: string, i: number): boolean {
  const c = text.charCodeAt(i);
  return c >= 48 && c <= 57;
}

function isHex(text: string, i: number): boolean {
  const c = text.charCodeAt(i);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/** True when text[i..] is a \U+XXXX escape. */
function isUnicodeEscape(text: string, i: number): boolean {
  const u = text.charCodeAt(i + 1);
  return (
    (u === 85 || u === 117) &&
    text.charCodeAt(i + 2) === 43 &&
    isHex(text, i + 3) &&
    isHex(text, i + 4) &&
    isHex(text, i + 5) &&
    isHex(text, i + 6)
  );
}

function unicodeEscape(text: string, i: number): string {
  return String.fromCharCode(Number.parseInt(text.slice(i + 3, i + 7), 16));
}

/**
 * Decodes TEXT control codes: %%c (Ø), %%d (°), %%p (±), %%% (%) and %%nnn,
 * removes the %%u/%%o underline/overline toggles and decodes \U+XXXX.
 */
function decodeTextCodes(text: string): string {
  if (!text.includes('%%') && !text.includes('\\')) return text;
  let out = '';
  let from = 0;
  let i = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 37 && text.charCodeAt(i + 1) === 37 && i + 2 < text.length) {
      const k = text.charCodeAt(i + 2) | 0x20;
      let replacement: string | undefined;
      let length = 3;
      if (k === 99) replacement = 'Ø';
      else if (k === 100) replacement = '°';
      else if (k === 112) replacement = '±';
      else if (k === 37) replacement = '%';
      else if (k === 117 || k === 111) replacement = '';
      else if (isDigit(text, i + 2) && isDigit(text, i + 3) && isDigit(text, i + 4)) {
        replacement = String.fromCharCode(Number(text.slice(i + 2, i + 5)));
        length = 5;
      }
      if (replacement !== undefined) {
        out += text.slice(from, i) + replacement;
        i += length;
        from = i;
        continue;
      }
    } else if (c === 92 && isUnicodeEscape(text, i)) {
      out += text.slice(from, i) + unicodeEscape(text, i);
      i += 7;
      from = i;
      continue;
    }
    i += 1;
  }
  return from === 0 ? text : out + text.slice(from);
}

/** Decodes \U+XXXX in MTEXT, leaving other formatting codes (and \\) as they are. */
function decodeMTextUnicode(text: string): string {
  if (!text.includes('\\U+') && !text.includes('\\u+')) return text;
  let out = '';
  let from = 0;
  let i = 0;
  while (i < text.length) {
    if (text.charCodeAt(i) === 92) {
      if (text.charCodeAt(i + 1) === 92) {
        i += 2;
        continue;
      }
      if (isUnicodeEscape(text, i)) {
        out += text.slice(from, i) + unicodeEscape(text, i);
        i += 7;
        from = i;
        continue;
      }
    }
    i += 1;
  }
  return from === 0 ? text : out + text.slice(from);
}

// ---- common entity properties ----------------------------------------------

/** Common entity groups (layer, colour, linetype, …); one instance is reused. */
class StyleState {
  layer = '0';
  colorIndex = 256;
  rgb = -1;
  lineType: string | undefined = undefined;
  lineWeight: number | undefined = undefined;
  ltScale: number | undefined = undefined;
  invisible = false;
  paper = false;
  layout: string | undefined = undefined;
  nx = 0;
  ny = 0;
  nz = 1;
  /** Last layer name read, reused while consecutive entities share a layer. */
  private lastLayer = '';

  reset(): void {
    this.layer = '0';
    this.colorIndex = 256;
    this.rgb = -1;
    this.lineType = undefined;
    this.lineWeight = undefined;
    this.ltScale = undefined;
    this.invisible = false;
    this.paper = false;
    this.layout = undefined;
    this.nx = 0;
    this.ny = 0;
    this.nz = 1;
  }

  /** Reads pair i if it is a common group; returns false otherwise. */
  read(r: GroupReader, i: number, code: number): boolean {
    switch (code) {
      case 8:
        if (!r.is(i, this.lastLayer)) this.lastLayer = r.str(i);
        this.layer = this.lastLayer || '0';
        return true;
      case 62:
        this.colorIndex = r.int(i);
        return true;
      case 420:
        this.rgb = r.int(i) & 0xffffff;
        return true;
      case 6: {
        const name = r.str(i);
        this.lineType = name.toUpperCase() === 'BYLAYER' ? undefined : name;
        return true;
      }
      case 370:
        this.lineWeight = lineWeight(r.int(i));
        return true;
      case 48:
        this.ltScale = r.num(i);
        return true;
      case 60:
        this.invisible = r.int(i) === 1;
        return true;
      case 67:
        this.paper = r.int(i) === 1;
        return true;
      case 410:
        this.layout = r.str(i);
        return true;
      case 210:
        this.nx = r.num(i);
        return true;
      case 220:
        this.ny = r.num(i);
        return true;
      case 230:
        this.nz = r.num(i);
        return true;
      default:
        return false;
    }
  }

  /** True when the extrusion is (0, 0, -1): OCS x runs along world -x. */
  get mirrored(): boolean {
    return this.nz < 0 && Math.abs(this.nx) < 1 / 64 && Math.abs(this.ny) < 1 / 64;
  }

  color(): CadColor {
    if (this.rgb >= 0) return { kind: 'rgb', rgb: this.rgb };
    const index = this.colorIndex;
    if (index === 0) return BY_BLOCK;
    if (index >= 256 || index <= -256) return BY_LAYER;
    return aci(Math.abs(index));
  }

  toStyle(): CadStyle {
    const style: CadStyle = { layer: this.layer, color: this.color() };
    if (this.lineType !== undefined) style.lineType = this.lineType;
    if (this.lineWeight !== undefined) style.lineWeight = this.lineWeight;
    if (this.ltScale !== undefined) style.lineTypeScale = this.ltScale;
    return style;
  }
}

// ---- parse context ---------------------------------------------------------

interface PaperBlock {
  name: string;
  /** Owner block record handle (upper case) from the BLOCK record. */
  owner: string;
  entities: CadEntity[];
}

interface LayoutInfo {
  name: string;
  tabOrder: number;
  /** Paper-space block record handle (upper case). */
  blockRecord: string;
  limits?: { min: Vec2; max: Vec2 };
}

interface Context {
  doc: CadDocument;
  style: StyleState;
  /** Layer handle (upper case) → layer name. */
  layerByHandle: Map<string, string>;
  /** Block record handle (upper case) → block name. */
  blockRecords: Map<string, string>;
  paperBlocks: PaperBlock[];
  /** ENTITIES-section entities with 67 = 1, with their 410 layout name. */
  paperEntities: { entity: CadEntity; layout: string | undefined }[];
  layouts: LayoutInfo[];
  viewports: ViewportEntity[];
}

type Emit = (entity: CadEntity, paper: boolean, layout: string | undefined) => void;

function countUnsupported(ctx: Context, type: string): void {
  ctx.doc.unsupported[type] = (ctx.doc.unsupported[type] ?? 0) + 1;
}

// ---- sections --------------------------------------------------------------

/**
 * Parses the text of an ASCII DXF file into the neutral CAD model. Unknown
 * sections, objects and entities are skipped; this throws only for binary DXF
 * and for text that is not DXF at all.
 */
export function parseDxf(text: string): CadDocument {
  if (text.startsWith('AutoCAD Binary DXF')) throw new Error('Binary DXF is not supported');
  const r = tokenize(text);
  if (!hasDxfStructure(r)) {
    throw new Error('Not a DXF file: no SECTION/EOF group code structure found');
  }
  const ctx: Context = {
    doc: emptyCadDocument('dxf'),
    style: new StyleState(),
    layerByHandle: new Map(),
    blockRecords: new Map(),
    paperBlocks: [],
    paperEntities: [],
    layouts: [],
    viewports: [],
  };

  while (!r.done) {
    if (r.at('EOF')) break;
    if (!r.at('SECTION')) {
      r.pos += 1;
      continue;
    }
    r.pos += 1;
    const name = !r.done && r.codes[r.pos] === 2 ? r.str(r.pos).trim().toUpperCase() : '';
    if (name === 'HEADER') readHeader(r, ctx.doc);
    else if (name === 'TABLES') readTables(r, ctx);
    else if (name === 'BLOCKS') readBlocks(r, ctx);
    else if (name === 'ENTITIES') readEntitiesSection(r, ctx);
    else if (name === 'OBJECTS') readObjects(r, ctx);
    else skipSection(r);
    if (r.at('ENDSEC')) r.pos += 1;
  }

  finish(ctx);
  return ctx.doc;
}

/** Moves to the section's ENDSEC (or EOF, or the next SECTION). */
function skipSection(r: GroupReader): void {
  r.pos = r.nextRecord(r.pos);
  while (!r.done && !isSectionEnd(r, r.pos)) r.pos = r.nextRecord(r.pos + 1);
}

function readHeader(r: GroupReader, doc: CadDocument): void {
  let variable = '';
  for (r.pos += 1; !r.done; r.pos += 1) {
    const i = r.pos;
    const code = r.codes[i];
    if (code === 0) {
      if (isSectionEnd(r, i)) return;
    } else if (code === 9) variable = r.str(i).trim().toUpperCase();
    else if (variable === '$ACADVER' && code === 1) doc.version = r.str(i).trim();
    else if (variable === '$INSUNITS' && code === 70) doc.units = r.int(i);
    else if (variable === '$LTSCALE' && code === 40) doc.ltScale = r.num(i) || 1;
  }
}

function readTables(r: GroupReader, ctx: Context): void {
  r.pos = r.nextRecord(r.pos);
  while (!r.done && !isSectionEnd(r, r.pos)) {
    const start = r.pos;
    const end = r.nextRecord(start + 1);
    if (r.is(start, 'LAYER')) readLayer(r, start, end, ctx);
    else if (r.is(start, 'LTYPE')) readLineType(r, start, end, ctx.doc);
    else if (r.is(start, 'BLOCK_RECORD')) readBlockRecord(r, start, end, ctx);
    r.pos = end;
  }
}

function readLayer(r: GroupReader, start: number, end: number, ctx: Context): void {
  let name = '';
  let handle = '';
  let colorIndex = 7;
  let rgb = -1;
  let flags = 0;
  let lineType = 'CONTINUOUS';
  let weight = -3;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i];
    if (code === 2) name = r.str(i);
    else if (code === 5) handle = r.str(i);
    else if (code === 62) colorIndex = r.int(i);
    else if (code === 420) rgb = r.int(i) & 0xffffff;
    else if (code === 70) flags = r.int(i);
    else if (code === 6) lineType = r.str(i);
    else if (code === 370) weight = r.int(i);
  }
  if (!name) return;
  ctx.doc.layers[name] = {
    name,
    color: rgb >= 0 ? { kind: 'rgb', rgb } : aci(Math.abs(colorIndex) || 7),
    lineType,
    lineWeight: weight < 0 ? weight : weight / 100,
    // A negative colour means the layer is off; flag bit 1 means frozen.
    visible: colorIndex >= 0 && (flags & 1) === 0,
  };
  if (handle) ctx.layerByHandle.set(handle.toUpperCase(), name);
}

function readLineType(r: GroupReader, start: number, end: number, doc: CadDocument): void {
  let name = '';
  const pattern: number[] = [];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i];
    if (code === 2) name = r.str(i);
    else if (code === 49) pattern.push(r.num(i));
  }
  if (!name) return;
  const lineType = { name, pattern };
  doc.lineTypes[name] = lineType;
  const upper = name.toUpperCase();
  if (upper !== name) doc.lineTypes[upper] = lineType;
}

function readBlockRecord(r: GroupReader, start: number, end: number, ctx: Context): void {
  let name = '';
  let handle = '';
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i];
    if (code === 2) name = r.str(i);
    else if (code === 5) handle = r.str(i);
  }
  if (name && handle) ctx.blockRecords.set(handle.toUpperCase(), name);
}

function readBlocks(r: GroupReader, ctx: Context): void {
  r.pos = r.nextRecord(r.pos);
  while (!r.done && !isSectionEnd(r, r.pos)) {
    const start = r.pos;
    const end = r.nextRecord(start + 1);
    r.pos = end;
    if (!r.is(start, 'BLOCK')) continue;

    let name = '';
    let altName = '';
    let owner = '';
    let inGroup = false;
    const base: Vec2 = [0, 0];
    for (let i = start + 1; i < end; i += 1) {
      const code = r.codes[i];
      if (code === 2 && !name) name = r.str(i);
      else if (code === 3 && !altName) altName = r.str(i);
      else if (code === 10) base[0] = r.num(i);
      else if (code === 20) base[1] = r.num(i);
      else if (code === 102) inGroup = r.str(i).startsWith('{');
      else if (code === 330 && !inGroup) owner = r.str(i).toUpperCase();
    }
    name ||= altName;

    const entities: CadEntity[] = [];
    readEntityList(r, ctx, true, (entity) => entities.push(entity));
    if (r.at('ENDBLK')) r.pos = r.nextRecord(r.pos + 1);
    if (!name) continue;

    const upper = name.toUpperCase();
    if (upper === '*MODEL_SPACE' || upper === '$MODEL_SPACE') {
      for (const entity of entities) ctx.doc.modelSpace.push(entity);
    } else if (upper.startsWith('*PAPER_SPACE') || upper.startsWith('$PAPER_SPACE')) {
      ctx.paperBlocks.push({ name, owner, entities });
    } else {
      ctx.doc.blocks[name] = { name, base, entities };
    }
  }
}

function readEntitiesSection(r: GroupReader, ctx: Context): void {
  r.pos = r.nextRecord(r.pos);
  const model = ctx.doc.modelSpace;
  readEntityList(r, ctx, false, (entity, paper, layout) => {
    if (paper) ctx.paperEntities.push({ entity, layout });
    else model.push(entity);
  });
}

function readObjects(r: GroupReader, ctx: Context): void {
  r.pos = r.nextRecord(r.pos);
  while (!r.done && !isSectionEnd(r, r.pos)) {
    const start = r.pos;
    const end = r.nextRecord(start + 1);
    if (r.is(start, 'LAYOUT')) readLayout(r, start, end, ctx);
    r.pos = end;
  }
}

/**
 * LAYOUT object. Its AcDbPlotSettings part comes first and reuses some codes, so
 * only groups after the `100 AcDbLayout` marker are read (all groups when the
 * writer left out the markers). The paper-space block record is the 330 group
 * after the marker, or a 340 group when there is one.
 */
function readLayout(r: GroupReader, start: number, end: number, ctx: Context): void {
  let inLayout = true;
  for (let i = start + 1; i < end && inLayout; i += 1) if (r.codes[i] === 100) inLayout = false;
  let name = '';
  let tabOrder = 0;
  let record330 = '';
  let record340 = '';
  const min: Vec2 = [0, 0];
  const max: Vec2 = [0, 0];
  let hasMin = false;
  let hasMax = false;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i];
    if (code === 100) inLayout = r.is(i, 'AcDbLayout');
    else if (code === 340) record340 = r.str(i);
    else if (!inLayout) continue;
    else if (code === 1) name = r.str(i).trimEnd();
    else if (code === 71) tabOrder = r.int(i);
    else if (code === 330) record330 = r.str(i);
    else if (code === 10) {
      min[0] = r.num(i);
      hasMin = true;
    } else if (code === 20) min[1] = r.num(i);
    else if (code === 11) {
      max[0] = r.num(i);
      hasMax = true;
    } else if (code === 21) max[1] = r.num(i);
  }
  if (!name) return;
  const info: LayoutInfo = { name, tabOrder, blockRecord: (record340 || record330).toUpperCase() };
  if (hasMin && hasMax) info.limits = { min, max };
  ctx.layouts.push(info);
}

// ---- entities --------------------------------------------------------------

/**
 * Reads entity records from `r.pos` until ENDSEC/EOF (or ENDBLK/BLOCK in a block
 * definition), leaving `r.pos` on that record.
 */
function readEntityList(r: GroupReader, ctx: Context, inBlock: boolean, emit: Emit): void {
  while (r.pos < r.length) {
    const start = r.pos;
    if (r.codes[start] !== 0) {
      r.pos = r.nextRecord(start + 1);
      continue;
    }
    if (isSectionEnd(r, start)) return;
    if (inBlock && (r.is(start, 'ENDBLK') || r.is(start, 'BLOCK'))) return;
    const end = r.nextRecord(start + 1);
    r.pos = end;
    readEntity(r, ctx, r.str(start), start, end, emit);
  }
}

function readEntity(
  r: GroupReader,
  ctx: Context,
  type: string,
  start: number,
  end: number,
  emit: Emit,
): void {
  const st = ctx.style;
  st.reset();
  let entity: CadEntity | null;
  switch (type) {
    case 'LINE':
      entity = readLine(r, start, end, st);
      break;
    case 'LWPOLYLINE':
      entity = readLwPolyline(r, start, end, st);
      break;
    case 'INSERT':
      readInsert(r, ctx, start, end, emit);
      return;
    case 'TEXT':
      entity = readText(r, start, end, st, false);
      break;
    case 'ARC':
    case 'CIRCLE':
      entity = readCircle(r, start, end, st, type === 'ARC');
      break;
    case 'POLYLINE':
      readPolyline(r, ctx, start, end, emit);
      return;
    case 'MTEXT':
      entity = readMText(r, start, end, st);
      break;
    case 'SOLID':
    case 'TRACE':
      entity = readSolid(r, start, end, st);
      break;
    case 'HATCH':
      entity = readHatch(r, start, end, st);
      break;
    case 'POINT':
      entity = readPoint(r, start, end, st);
      break;
    case 'ELLIPSE':
      entity = readEllipse(r, start, end, st);
      break;
    case 'SPLINE':
      entity = readSpline(r, start, end, st);
      break;
    case 'DIMENSION':
    case 'ARC_DIMENSION':
    case 'LARGE_RADIAL_DIMENSION':
      entity = readDimension(r, start, end, st);
      if (!entity) countUnsupported(ctx, type);
      break;
    case 'LEADER':
      entity = readLeader(r, start, end, st);
      break;
    case 'VIEWPORT': {
      const viewport = readViewport(r, start, end, st);
      ctx.viewports.push(viewport);
      entity = viewport;
      break;
    }
    case 'WIPEOUT':
      entity = readWipeout(r, start, end, st);
      break;
    case 'ATTDEF':
    case 'ATTRIB':
    case 'VERTEX':
    case 'SEQEND':
      // Attribute definitions are not drawn. The others belong to an INSERT or
      // POLYLINE, which reads them; here their parent is missing.
      return;
    default:
      countUnsupported(ctx, type);
      return;
  }
  if (entity && !st.invisible) emit(entity, st.paper, st.layout);
}

function readLine(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  const p1: Vec2 = [0, 0];
  const p2: Vec2 = [0, 0];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) p1[0] = r.num(i);
    else if (code === 20) p1[1] = r.num(i);
    else if (code === 11) p2[0] = r.num(i);
    else if (code === 21) p2[1] = r.num(i);
    else st.read(r, i, code);
  }
  return { ...st.toStyle(), type: 'line', start: p1, end: p2 };
}

function readPoint(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  const position: Vec2 = [0, 0];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) position[0] = r.num(i);
    else if (code === 20) position[1] = r.num(i);
    else st.read(r, i, code);
  }
  return { ...st.toStyle(), type: 'point', position };
}

function readCircle(
  r: GroupReader,
  start: number,
  end: number,
  st: StyleState,
  isArc: boolean,
): CadEntity {
  const center: Vec2 = [0, 0];
  let radius = 0;
  let startAngle = 0;
  let endAngle = 360;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) center[0] = r.num(i);
    else if (code === 20) center[1] = r.num(i);
    else if (code === 40) radius = r.num(i);
    else if (code === 50) startAngle = r.num(i);
    else if (code === 51) endAngle = r.num(i);
    else st.read(r, i, code);
  }
  if (st.mirrored) {
    center[0] = -center[0];
    [startAngle, endAngle] = [norm360(180 - endAngle), norm360(180 - startAngle)];
  }
  const style = st.toStyle();
  if (!isArc) return { ...style, type: 'circle', center, radius };
  return { ...style, type: 'arc', center, radius, startAngle, endAngle };
}

function readEllipse(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  const center: Vec2 = [0, 0];
  const majorAxis: Vec2 = [1, 0];
  let ratio = 1;
  let startParam = 0;
  let endParam = TAU;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) center[0] = r.num(i);
    else if (code === 20) center[1] = r.num(i);
    else if (code === 11) majorAxis[0] = r.num(i);
    else if (code === 21) majorAxis[1] = r.num(i);
    else if (code === 40) ratio = r.num(i);
    else if (code === 41) startParam = r.num(i);
    else if (code === 42) endParam = r.num(i);
    else st.read(r, i, code);
  }
  // Centre and axis are in WCS; a (0, 0, -1) extrusion only reverses the
  // direction of the parameter.
  if (st.mirrored) [startParam, endParam] = [-endParam, -startParam];
  return { ...st.toStyle(), type: 'ellipse', center, majorAxis, ratio, startParam, endParam };
}

function readLwPolyline(
  r: GroupReader,
  start: number,
  end: number,
  st: StyleState,
): CadEntity | null {
  const vertices: CadVertex[] = [];
  let last: CadVertex | undefined;
  let flags = 0;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) {
      last = { x: r.num(i), y: 0, bulge: 0 };
      vertices.push(last);
    } else if (code === 20) {
      if (last) last.y = r.num(i);
    } else if (code === 42) {
      if (last) last.bulge = r.num(i);
    } else if (code === 70) flags = r.int(i);
    else st.read(r, i, code);
  }
  if (vertices.length === 0) return null;
  if (st.mirrored) mirrorVertices(vertices);
  return { ...st.toStyle(), type: 'polyline', vertices, closed: (flags & 1) !== 0 };
}

function mirrorVertices(vertices: CadVertex[]): void {
  for (const v of vertices) {
    v.x = -v.x;
    v.bulge = -v.bulge;
  }
}

/** Legacy POLYLINE, followed by its VERTEX records up to SEQEND. */
function readPolyline(r: GroupReader, ctx: Context, start: number, end: number, emit: Emit): void {
  const st = ctx.style;
  let flags = 0;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 70) flags = r.int(i);
    else st.read(r, i, code);
  }
  const vertices: CadVertex[] = [];
  while (r.at('VERTEX')) {
    const vertexStart = r.pos;
    const vertexEnd = r.nextRecord(vertexStart + 1);
    r.pos = vertexEnd;
    const vertex: CadVertex = { x: 0, y: 0, bulge: 0 };
    let vertexFlags = 0;
    for (let i = vertexStart + 1; i < vertexEnd; i += 1) {
      const code = r.codes[i];
      if (code === 10) vertex.x = r.num(i);
      else if (code === 20) vertex.y = r.num(i);
      else if (code === 42) vertex.bulge = r.num(i);
      else if (code === 70) vertexFlags = r.int(i);
    }
    // Spline frame control points are not on the curve.
    if ((vertexFlags & 16) === 0) vertices.push(vertex);
  }
  if (r.at('SEQEND')) r.pos = r.nextRecord(r.pos + 1);

  if (flags & (16 | 64)) {
    countUnsupported(ctx, 'POLYLINE (mesh)');
    return;
  }
  if (vertices.length === 0 || st.invisible) return;
  // 3D polyline vertices are in WCS, 2D ones in OCS.
  if ((flags & 8) === 0 && st.mirrored) mirrorVertices(vertices);
  const closed = (flags & 1) !== 0;
  emit({ ...st.toStyle(), type: 'polyline', vertices, closed }, st.paper, st.layout);
}

function readSpline(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  let flags = 0;
  let degree = 3;
  const knots: number[] = [];
  const weights: number[] = [];
  const controlPoints: Vec2[] = [];
  const fitPoints: Vec2[] = [];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) controlPoints.push([r.num(i), 0]);
    else if (code === 20) setLastY(controlPoints, r.num(i));
    else if (code === 11) fitPoints.push([r.num(i), 0]);
    else if (code === 21) setLastY(fitPoints, r.num(i));
    else if (code === 40) knots.push(r.num(i));
    else if (code === 41) weights.push(r.num(i));
    else if (code === 70) flags = r.int(i);
    else if (code === 71) degree = r.int(i);
    else st.read(r, i, code);
  }
  const spline: CadEntity = {
    ...st.toStyle(),
    type: 'spline',
    degree,
    controlPoints,
    knots,
    fitPoints,
    // Bit 1 closed, bit 2 periodic.
    closed: (flags & 3) !== 0,
  };
  if (weights.length) spline.weights = weights;
  return spline;
}

function setLastY(points: Vec2[], y: number): void {
  const last = points[points.length - 1];
  if (last) last[1] = y;
}

/** TEXT, or an ATTRIB (null when the attribute is invisible). */
function readText(
  r: GroupReader,
  start: number,
  end: number,
  st: StyleState,
  isAttrib: boolean,
): CadEntity | null {
  const position: Vec2 = [0, 0];
  let alignPoint: Vec2 | undefined;
  let height = 0;
  let rotation = 0;
  let widthFactor = 1;
  let hAlign = 0;
  let vAlign = 0;
  let text = '';
  let flags = 0;
  // Vertical alignment is 73 in TEXT and 74 in ATTRIB (where 73 is the field length).
  const vAlignCode = isAttrib ? 74 : 73;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    // A multi-line attribute embeds an MTEXT, with its own groups, after 101.
    if (code === 101) break;
    if (code === 10) position[0] = r.num(i);
    else if (code === 20) position[1] = r.num(i);
    else if (code === 11) (alignPoint ??= [0, 0])[0] = r.num(i);
    else if (code === 21) (alignPoint ??= [0, 0])[1] = r.num(i);
    else if (code === 40) height = r.num(i);
    else if (code === 50) rotation = r.num(i);
    else if (code === 41) widthFactor = r.num(i) || 1;
    else if (code === 72) hAlign = r.int(i);
    else if (code === vAlignCode) vAlign = r.int(i);
    else if (code === 1) text = r.str(i);
    else if (code === 70) flags = r.int(i);
    else st.read(r, i, code);
  }
  if (isAttrib && flags & 1) return null;
  if (st.mirrored) {
    // Mirrored text: x negated, and the text's own x axis mirrored (negative width).
    position[0] = -position[0];
    if (alignPoint) alignPoint[0] = -alignPoint[0];
    rotation = -rotation;
    widthFactor = -widthFactor;
  }
  const entity: CadEntity = {
    ...st.toStyle(),
    type: 'text',
    position,
    height,
    rotation,
    widthFactor,
    hAlign,
    vAlign,
    text: decodeTextCodes(text),
  };
  if (alignPoint) entity.alignPoint = alignPoint;
  return entity;
}

function readMText(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  const position: Vec2 = [0, 0];
  let height = 0;
  let width = 0;
  let attachment = 1;
  let rotation: number | undefined;
  let dirX: number | undefined;
  let dirY = 0;
  let lineSpacing = 1;
  let chunks = '';
  let tail = '';
  let columns = false;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 101) break;
    if (code === 10) position[0] = r.num(i);
    else if (code === 20) position[1] = r.num(i);
    else if (code === 40) height = r.num(i);
    else if (code === 41) width = r.num(i);
    else if (code === 71) attachment = r.int(i) || 1;
    else if (code === 11) dirX = r.num(i);
    else if (code === 21) dirY = r.num(i);
    else if (code === 44) lineSpacing = r.num(i) || 1;
    else if (code === 3) chunks += r.str(i);
    else if (code === 1) tail += r.str(i);
    // Column data (from 75 on) reuses 48 (width), 49 (gutter) and 50 (heights).
    else if (code === 75) columns = true;
    else if (columns && (code === 48 || code === 49 || code === 50)) continue;
    else if (code === 50) rotation = r.num(i);
    else st.read(r, i, code);
  }
  if (rotation === undefined) {
    rotation = dirX !== undefined && (dirX !== 0 || dirY !== 0) ? Math.atan2(dirY, dirX) * DEG : 0;
  }
  return {
    ...st.toStyle(),
    type: 'mtext',
    position,
    height,
    rotation,
    width,
    attachment,
    text: decodeMTextUnicode(chunks + tail),
    lineSpacing,
  };
}

/** INSERT, followed by its ATTRIBs up to SEQEND. */
function readInsert(r: GroupReader, ctx: Context, start: number, end: number, emit: Emit): void {
  const st = ctx.style;
  let block = '';
  const position: Vec2 = [0, 0];
  const scale: Vec2 = [1, 1];
  let rotation = 0;
  let columns = 1;
  let rows = 1;
  let columnSpacing = 0;
  let rowSpacing = 0;
  let hasAttributes = false;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 2) block = r.str(i);
    else if (code === 10) position[0] = r.num(i);
    else if (code === 20) position[1] = r.num(i);
    else if (code === 41) scale[0] = r.num(i);
    else if (code === 42) scale[1] = r.num(i);
    else if (code === 50) rotation = r.num(i);
    else if (code === 70) columns = Math.max(1, r.int(i));
    else if (code === 71) rows = Math.max(1, r.int(i));
    else if (code === 44) columnSpacing = r.num(i);
    else if (code === 45) rowSpacing = r.num(i);
    else if (code === 66) hasAttributes = r.int(i) === 1;
    else st.read(r, i, code);
  }
  if (st.mirrored) {
    // With M the x mirror, M·(p + R(θ)·(o + S·q)) = M·p + R(−θ)·(M·o + M·S·q).
    position[0] = -position[0];
    rotation = -rotation;
    scale[0] = -scale[0];
    columnSpacing = -columnSpacing;
  }
  const insert: InsertEntity = {
    ...st.toStyle(),
    type: 'insert',
    block,
    position,
    scale,
    rotation,
    columns,
    rows,
    columnSpacing,
    rowSpacing,
    attributes: [],
  };
  if (block && !st.invisible) emit(insert, st.paper, st.layout);

  let hadAttribute = false;
  while (r.at('ATTRIB')) {
    const attribStart = r.pos;
    const attribEnd = r.nextRecord(attribStart + 1);
    r.pos = attribEnd;
    hadAttribute = true;
    st.reset();
    const attribute = readText(r, attribStart, attribEnd, st, true);
    if (attribute && !st.invisible) insert.attributes.push(attribute);
  }
  if ((hasAttributes || hadAttribute) && r.at('SEQEND')) r.pos = r.nextRecord(r.pos + 1);
}

function readSolid(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  // Corners 1–4 as x, y pairs (codes 10/20 … 13/23).
  const c = [0, 0, 0, 0, 0, 0, 0, 0];
  let hasFourth = false;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code >= 10 && code <= 13) {
      c[(code - 10) * 2] = r.num(i);
      if (code === 13) hasFourth = true;
    } else if (code >= 20 && code <= 23) c[(code - 20) * 2 + 1] = r.num(i);
    else st.read(r, i, code);
  }
  if (st.mirrored) for (let k = 0; k < 8; k += 2) c[k] = -c[k]!;
  const corner = (k: number): Vec2 => [c[k * 2]!, c[k * 2 + 1]!];
  const triangle = !hasFourth || (c[6] === c[4] && c[7] === c[5]);
  // DXF stores a quadrilateral's corners in the order 1-2-4-3.
  const points = triangle
    ? [corner(0), corner(1), corner(2)]
    : [corner(0), corner(1), corner(3), corner(2)];
  return { ...st.toStyle(), type: 'solid', points };
}

function readDimension(
  r: GroupReader,
  start: number,
  end: number,
  st: StyleState,
): CadEntity | null {
  let block = '';
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 2) block = r.str(i);
    else st.read(r, i, code);
  }
  return block ? { ...st.toStyle(), type: 'dimension', block } : null;
}

function readLeader(r: GroupReader, start: number, end: number, st: StyleState): CadEntity | null {
  const points: Vec2[] = [];
  let arrow = true;
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) points.push([r.num(i), 0]);
    else if (code === 20) setLastY(points, r.num(i));
    else if (code === 71) arrow = r.int(i) === 1;
    else st.read(r, i, code);
  }
  return points.length ? { ...st.toStyle(), type: 'leader', points, arrow } : null;
}

function readViewport(r: GroupReader, start: number, end: number, st: StyleState): ViewportEntity {
  const center: Vec2 = [0, 0];
  const viewCenter: Vec2 = [0, 0];
  let width = 0;
  let height = 0;
  let viewHeight = 0;
  let twist = 0;
  let id = 0;
  let status = 0;
  const frozenLayers: string[] = [];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) center[0] = r.num(i);
    else if (code === 20) center[1] = r.num(i);
    else if (code === 40) width = r.num(i);
    else if (code === 41) height = r.num(i);
    else if (code === 69) id = r.int(i);
    else if (code === 12) viewCenter[0] = r.num(i);
    else if (code === 22) viewCenter[1] = r.num(i);
    else if (code === 45) viewHeight = r.num(i);
    else if (code === 51) twist = r.num(i);
    else if (code === 68) status = r.int(i);
    // Frozen layer handles; resolved to names once the whole file is read.
    else if (code === 331 || code === 341) frozenLayers.push(r.str(i));
    else st.read(r, i, code);
  }
  return {
    ...st.toStyle(),
    type: 'viewport',
    center,
    width,
    height,
    viewCenter,
    viewHeight,
    twist,
    id,
    frozenLayers,
    on: status > 0,
  };
}

/**
 * WIPEOUT. The clip polygon is in image pixel coordinates with y down (−0.5…0.5
 * for a wipeout's 1×1 image), so world = insertion + (x + 0.5)·U + (h − 0.5 − y)·V.
 * Two clip vertices are the corners of a rectangle.
 */
function readWipeout(r: GroupReader, start: number, end: number, st: StyleState): CadEntity {
  let ix = 0;
  let iy = 0;
  let ux = 1;
  let uy = 0;
  let vx = 0;
  let vy = 1;
  let imageHeight = 1;
  const clip: number[] = [];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 10) ix = r.num(i);
    else if (code === 20) iy = r.num(i);
    else if (code === 11) ux = r.num(i);
    else if (code === 21) uy = r.num(i);
    else if (code === 12) vx = r.num(i);
    else if (code === 22) vy = r.num(i);
    else if (code === 23) imageHeight = r.num(i) || 1;
    else if (code === 14) clip.push(r.num(i), 0);
    else if (code === 24) {
      if (clip.length) clip[clip.length - 1] = r.num(i);
    } else st.read(r, i, code);
  }
  let corners = clip;
  if (clip.length === 0) corners = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
  else if (clip.length === 4) {
    const [x0, y0, x1, y1] = clip as [number, number, number, number];
    corners = [x0, y0, x1, y0, x1, y1, x0, y1];
  }
  const points: Vec2[] = [];
  for (let k = 0; k + 1 < corners.length; k += 2) {
    const u = corners[k]! + 0.5;
    const v = imageHeight - 0.5 - corners[k + 1]!;
    points.push([ix + u * ux + v * vx, iy + u * uy + v * vy]);
  }
  return { ...st.toStyle(), type: 'wipeout', points };
}

// ---- hatch -----------------------------------------------------------------

function readHatch(r: GroupReader, start: number, end: number, st: StyleState): CadEntity | null {
  let pattern = '';
  let solid = false;
  let boundaryRead = false;
  const loops: Vec2[][] = [];
  for (let i = start + 1; i < end; i += 1) {
    const code = r.codes[i]!;
    if (code === 2) pattern = r.str(i);
    else if (code === 70) solid = r.int(i) === 1;
    else if (code === 91 && !boundaryRead) {
      // The boundary reuses 10/20 and other codes, and so do the pattern data and
      // seed points after it, so it is read by its counts.
      boundaryRead = true;
      i = readHatchBoundary(r, i + 1, end, r.int(i), loops) - 1;
    } else st.read(r, i, code);
  }
  if (loops.length === 0) return null;
  if (st.mirrored) for (const loop of loops) for (const p of loop) p[0] = -p[0];
  return { ...st.toStyle(), type: 'hatch', loops, solid, pattern };
}

/** Reads `count` boundary paths from pair i; returns the index after them. */
function readHatchBoundary(
  r: GroupReader,
  i: number,
  end: number,
  count: number,
  loops: Vec2[][],
): number {
  const codes = r.codes;
  for (let path = 0; path < count && i < end && codes[i] === 92; path += 1) {
    const flags = r.int(i);
    i += 1;
    const loop: Vec2[] = [];
    if (flags & 2) {
      // Polyline path: 72 has-bulge, 73 closed, 93 vertex count, then 10/20 [42].
      let closed = true;
      let n = 0;
      for (; i < end; i += 1) {
        const code = codes[i];
        if (code === 73) closed = r.int(i) !== 0;
        else if (code === 93) n = r.int(i);
        else if (code !== 72) break;
      }
      const vertices: CadVertex[] = [];
      for (let k = 0; k < n && i < end && codes[i] === 10; k += 1) {
        const vertex: CadVertex = { x: r.num(i), y: 0, bulge: 0 };
        i += 1;
        if (i < end && codes[i] === 20) {
          vertex.y = r.num(i);
          i += 1;
        }
        if (i < end && codes[i] === 42) {
          vertex.bulge = r.num(i);
          i += 1;
        }
        vertices.push(vertex);
      }
      appendPolyline(loop, vertices, closed);
    } else {
      // Edge path: 93 edge count, then edges that start with 72 (edge type).
      let n = 0;
      if (i < end && codes[i] === 93) {
        n = r.int(i);
        i += 1;
      }
      for (let k = 0; k < n && i < end && codes[i] === 72; k += 1) {
        i = readHatchEdge(r, i + 1, end, r.int(i), loop);
      }
    }
    // Source boundary objects: 97 count, then that many 330 handles.
    if (i < end && codes[i] === 97) {
      const m = r.int(i);
      i += 1;
      for (let k = 0; k < m && i < end && codes[i] === 330; k += 1) i += 1;
    }
    while (i < end && codes[i] === 330) i += 1;
    if (loop.length) loops.push(loop);
  }
  return i;
}

/** Groups that can appear in a hatch spline edge (97 is handled separately). */
const SPLINE_EDGE_CODES = new Set([94, 73, 74, 95, 96, 40, 42, 12, 22, 13, 23]);

/** Reads one boundary edge (after its 72 group); returns the index after it. */
function readHatchEdge(r: GroupReader, i: number, end: number, type: number, loop: Vec2[]): number {
  const codes = r.codes;
  if (type === 4) {
    // Spline edge, approximated by its control points (or fit points).
    const control: Vec2[] = [];
    const fit: Vec2[] = [];
    for (; i < end; i += 1) {
      const code = codes[i]!;
      if (code === 10) control.push([r.num(i), 0]);
      else if (code === 20) setLastY(control, r.num(i));
      else if (code === 11) fit.push([r.num(i), 0]);
      else if (code === 21) setLastY(fit, r.num(i));
      else if (code === 97) {
        // The fit point count, unless this is the path's source-object count.
        const next = i + 1 < end ? codes[i + 1] : BAD_CODE;
        if (next !== 11 && next !== 12 && next !== 13 && next !== 72 && next !== 97) break;
      } else if (!SPLINE_EDGE_CODES.has(code)) break;
    }
    for (const [x, y] of control.length ? control : fit) pushPoint(loop, x, y);
    return i;
  }

  let x = 0;
  let y = 0;
  let x2 = 0;
  let y2 = 0;
  let value40 = 0;
  let a0 = 0;
  let a1 = 360;
  let ccw = true;
  for (; i < end; i += 1) {
    const code = codes[i];
    if (code === 10) x = r.num(i);
    else if (code === 20) y = r.num(i);
    else if (code === 11 && type !== 2) x2 = r.num(i);
    else if (code === 21 && type !== 2) y2 = r.num(i);
    else if (code === 40 && type !== 1) value40 = r.num(i);
    else if (code === 50 && type !== 1) a0 = r.num(i);
    else if (code === 51 && type !== 1) a1 = r.num(i);
    else if (code === 73 && type !== 1) ccw = r.int(i) !== 0;
    else break;
  }
  if (type === 1) {
    pushPoint(loop, x, y);
    pushPoint(loop, x2, y2);
  } else if (type === 2) {
    // Circular arc: 40 radius, 50/51 angles in degrees.
    appendArc(loop, x, y, value40, 0, 1, a0 * RAD, a1 * RAD, ccw);
  } else if (type === 3) {
    // Elliptic arc: 11/21 major axis, 40 minor/major ratio, and 50/51 angles,
    // which are converted to parameters.
    const ratio = value40 || 1;
    const param = (deg: number) => Math.atan2(Math.sin(deg * RAD) / ratio, Math.cos(deg * RAD));
    const t0 = param(a0);
    const t1 = Math.abs(a1 - a0) >= 360 - 1e-9 ? t0 + TAU : param(a1);
    appendArc(loop, x, y, x2, y2, ratio, t0, t1, ccw);
  }
  return i;
}

function pushPoint(loop: Vec2[], x: number, y: number): void {
  const last = loop[loop.length - 1];
  const same =
    last &&
    Math.abs(last[0] - x) <= 1e-9 * (1 + Math.abs(x)) &&
    Math.abs(last[1] - y) <= 1e-9 * (1 + Math.abs(y));
  if (!same) loop.push([x, y]);
}

/**
 * Appends points of an elliptical arc (a circle when ratio is 1) with centre
 * (cx, cy) and major axis (mx, my), from parameter t0 to t1 in radians. The
 * angles of a clockwise edge (73 = 0) are stored mirrored, so it runs clockwise
 * from −t0 to −t1.
 */
function appendArc(
  loop: Vec2[],
  cx: number,
  cy: number,
  mx: number,
  my: number,
  ratio: number,
  t0: number,
  t1: number,
  ccw: boolean,
): void {
  const sweep = ccwSweep(t0, t1);
  const from = ccw ? t0 : -t0;
  const step = ccw ? sweep : -sweep;
  const n = Math.max(2, Math.ceil((sweep / (Math.PI / 2)) * SEGMENTS_PER_QUARTER));
  for (let k = 0; k <= n; k += 1) {
    const t = from + (step * k) / n;
    const c = Math.cos(t);
    const s = Math.sin(t) * ratio;
    pushPoint(loop, cx + c * mx - s * my, cy + c * my + s * mx);
  }
}

/** Appends polyline vertices, flattening bulged segments. */
function appendPolyline(loop: Vec2[], vertices: CadVertex[], closed: boolean): void {
  const n = vertices.length;
  for (let k = 0; k < n; k += 1) {
    const v = vertices[k]!;
    pushPoint(loop, v.x, v.y);
    if (v.bulge === 0 || (k === n - 1 && !closed)) continue;
    const next = vertices[(k + 1) % n]!;
    appendBulge(loop, v.x, v.y, next.x, next.y, v.bulge);
  }
}

/** Appends the interior points of a bulged segment (bulge = tan(θ/4), positive CCW). */
function appendBulge(
  loop: Vec2[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(bulge) < 1e-12 || (dx === 0 && dy === 0)) return;
  // The centre is off the chord midpoint along the left normal by chord·(1 − b²)/(4b).
  const f = (1 - bulge * bulge) / (4 * bulge);
  const cx = (x1 + x2) / 2 - dy * f;
  const cy = (y1 + y2) / 2 + dx * f;
  const radius = Math.hypot(x1 - cx, y1 - cy);
  const theta = 4 * Math.atan(bulge);
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const n = Math.max(2, Math.ceil((Math.abs(theta) / (Math.PI / 2)) * SEGMENTS_PER_QUARTER));
  for (let k = 1; k < n; k += 1) {
    const a = a0 + (theta * k) / n;
    pushPoint(loop, cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
}

// ---- assembly --------------------------------------------------------------

function finish(ctx: Context): void {
  const doc = ctx.doc;
  doc.layers['0'] ??= {
    name: '0',
    color: aci(7),
    lineType: 'CONTINUOUS',
    lineWeight: -3,
    visible: true,
  };
  for (const viewport of ctx.viewports) {
    viewport.frozenLayers = viewport.frozenLayers.map(
      (handle) => ctx.layerByHandle.get(handle.toUpperCase()) ?? handle,
    );
  }
  doc.layouts = buildLayouts(ctx);
}

/**
 * Builds the paper-space layouts. Each LAYOUT (except Model) gets the entities of
 * its *Paper_Space* block; ENTITIES-section paper-space entities go to the layout
 * named by their 410 group, else to the active layout (the one whose block is
 * *Paper_Space). Without LAYOUT objects (older files) there is one "Layout1".
 */
function buildLayouts(ctx: Context): CadLayout[] {
  const layouts: CadLayout[] = [];
  const byName = new Map<string, CadLayout>();
  let active: CadLayout | undefined;

  for (const info of ctx.layouts) {
    const upper = info.name.toUpperCase();
    if (upper === 'MODEL' || byName.has(upper)) continue;
    const layout: CadLayout = { name: info.name, tabOrder: info.tabOrder, entities: [] };
    if (info.limits) layout.limits = info.limits;
    const recordName = ctx.blockRecords.get(info.blockRecord)?.toUpperCase();
    const block = ctx.paperBlocks.find(
      (b) =>
        b.name.toUpperCase() === recordName ||
        (info.blockRecord !== '' && b.owner === info.blockRecord),
    );
    if (block) for (const entity of block.entities) layout.entities.push(entity);
    if ((recordName ?? block?.name.toUpperCase()) === '*PAPER_SPACE') active = layout;
    layouts.push(layout);
    byName.set(upper, layout);
  }
  layouts.sort((a, b) => a.tabOrder - b.tabOrder);

  /** The active layout, else the first one, else a new one. */
  const fallback = (name: string | undefined): CadLayout => {
    let layout = active ?? layouts[0];
    if (!layout) {
      layout = { name: name || 'Layout1', tabOrder: 1, entities: [] };
      layouts.push(layout);
      byName.set(layout.name.toUpperCase(), layout);
      active = layout;
    }
    return layout;
  };

  if (ctx.layouts.length === 0) {
    for (const block of ctx.paperBlocks) {
      const upper = block.name.toUpperCase();
      if (block.entities.length === 0 || (upper !== '*PAPER_SPACE' && upper !== '$PAPER_SPACE')) {
        continue;
      }
      const layout = fallback(undefined);
      for (const entity of block.entities) layout.entities.push(entity);
    }
  }

  for (const { entity, layout: name } of ctx.paperEntities) {
    const target = (name && byName.get(name.toUpperCase())) || fallback(name);
    target.entities.push(entity);
  }
  return layouts;
}
