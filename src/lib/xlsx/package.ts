/**
 * An Office Open XML package (.xlsx) opened as its parts, for edits that must
 * leave everything else exactly as it was (EXP-02): parts are kept as bytes
 * and only the ones edited are re-encoded. Relationships and content types
 * are handled as XML text, since the parts are machine-written and regular.
 */
import { createZip, readZip } from '@/lib/zip';

export const REL_TYPES = {
  officeDocument:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  worksheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  calcChain: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain',
  table: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/table',
  pivotTable: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
} as const;

export const CONTENT_TYPES = {
  worksheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  styles: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
} as const;

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const lower = e.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    return String.fromCodePoint(
      lower.startsWith('#x') ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
    );
  });
}

/** Attributes of an element's start tag, by name, unescaped. */
export function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  const start = tag.replace(/^<[\w:.-]+/, '');
  for (const m of start.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out.set(m[1]!, unescapeXml(m[2] ?? m[3] ?? ''));
  }
  return out;
}

/** The start tag with one attribute set (or removed when `value` is null). */
export function setAttribute(tag: string, name: string, value: string | null): string {
  const pattern = new RegExp(`\\s${name.replace(/[.:]/g, '\\$&')}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
  const without = tag.replace(pattern, '');
  if (value === null) return without;
  return without.replace(/\s*(\/?>)$/, ` ${name}="${escapeXml(value)}"$1`);
}

/** The folder of a part, e.g. `xl/worksheets/` for `xl/worksheets/sheet1.xml`. */
function folderOf(part: string): string {
  return part.includes('/') ? part.slice(0, part.lastIndexOf('/') + 1) : '';
}

/** The relationships part that belongs to a part (`xl/_rels/workbook.xml.rels`). */
export function relsPartOf(part: string): string {
  const folder = folderOf(part);
  return `${folder}_rels/${part.slice(folder.length)}.rels`;
}

/** Resolves a relationship target against the part that holds it. */
export function resolveTarget(source: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (folderOf(source) + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/** A target for `part` written relative to `source`, as Excel writes them. */
export function relativeTarget(source: string, part: string): string {
  const from = folderOf(source).split('/').filter(Boolean);
  const to = part.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/');
}

export class XlsxPackage {
  private readonly parts = new Map<string, Uint8Array>();
  private readonly order: string[] = [];
  private readonly text = new Map<string, string>();

  static async open(bytes: ArrayBuffer | Uint8Array): Promise<XlsxPackage> {
    const pkg = new XlsxPackage();
    for (const entry of await readZip(bytes)) {
      pkg.parts.set(entry.name, entry.data);
      pkg.order.push(entry.name);
    }
    if (!pkg.has('[Content_Types].xml')) throw new Error('Not an Office Open XML package.');
    return pkg;
  }

  static empty(): XlsxPackage {
    return new XlsxPackage();
  }

  has(part: string): boolean {
    return this.parts.has(part) || this.text.has(part);
  }

  names(): string[] {
    return [...this.order];
  }

  bytes(part: string): Uint8Array {
    const text = this.text.get(part);
    if (text !== undefined) return encoder.encode(text);
    const data = this.parts.get(part);
    if (!data) throw new Error(`Missing part ${part}.`);
    return data;
  }

  read(part: string): string {
    const text = this.text.get(part);
    if (text !== undefined) return text;
    return decoder.decode(this.bytes(part));
  }

  write(part: string, content: string | Uint8Array): void {
    if (!this.has(part)) this.order.push(part);
    if (typeof content === 'string') {
      this.text.set(part, content);
      this.parts.delete(part);
    } else {
      this.parts.set(part, content);
      this.text.delete(part);
    }
  }

  remove(part: string): void {
    this.parts.delete(part);
    this.text.delete(part);
    const at = this.order.indexOf(part);
    if (at >= 0) this.order.splice(at, 1);
  }

  /** A part name like `xl/worksheets/sheet7.xml` that is not taken yet. */
  freeName(folder: string, stem: string, extension: string): string {
    for (let i = 1; ; i += 1) {
      const name = `${folder}${stem}${i}${extension}`;
      if (!this.has(name)) return name;
    }
  }

  relationships(part: string): Relationship[] {
    const rels = relsPartOf(part);
    if (!this.has(rels)) return [];
    return [...this.read(rels).matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const a = attributes(m[0]);
      return {
        id: a.get('Id') ?? '',
        type: a.get('Type') ?? '',
        target: a.get('Target') ?? '',
        external: a.get('TargetMode') === 'External',
      };
    });
  }

  setRelationships(part: string, rels: readonly Relationship[]): void {
    const relsPart = relsPartOf(part);
    if (rels.length === 0) {
      this.remove(relsPart);
      return;
    }
    const body = rels
      .map(
        (r) =>
          `<Relationship Id="${escapeXml(r.id)}" Type="${escapeXml(r.type)}" Target="${escapeXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`,
      )
      .join('');
    this.write(
      relsPart,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`,
    );
  }

  /** Adds a relationship from `part` to `target` (a part name) and returns its id. */
  addRelationship(part: string, type: string, target: string): string {
    const rels = this.relationships(part);
    const taken = new Set(rels.map((r) => r.id));
    let n = rels.length + 1;
    while (taken.has(`rId${n}`)) n += 1;
    const id = `rId${n}`;
    this.setRelationships(part, [
      ...rels,
      { id, type, target: relativeTarget(part, target), external: false },
    ]);
    return id;
  }

  /** The content type override for a part, if any. */
  contentTypeOverride(part: string): string | null {
    const types = this.read('[Content_Types].xml');
    for (const m of types.matchAll(/<Override\b[^>]*>/g)) {
      const a = attributes(m[0]);
      if (a.get('PartName') === `/${part}`) return a.get('ContentType') ?? null;
    }
    return null;
  }

  setContentTypeOverride(part: string, contentType: string | null): void {
    let types = this.read('[Content_Types].xml');
    types = types.replace(/<Override\b[^>]*>/g, (tag) =>
      attributes(tag).get('PartName') === `/${part}` ? '' : tag,
    );
    if (contentType) {
      types = types.replace(
        /<\/Types>/,
        `<Override PartName="/${escapeXml(part)}" ContentType="${escapeXml(contentType)}"/></Types>`,
      );
    }
    this.write('[Content_Types].xml', types);
  }

  /** The main workbook part, from the package relationships. */
  workbookPart(): string {
    const main = this.relationships('').find((r) => r.type === REL_TYPES.officeDocument);
    return main ? resolveTarget('', main.target) : 'xl/workbook.xml';
  }

  async save(): Promise<ArrayBuffer> {
    const entries = this.order.map((name) => ({ name, data: this.bytes(name) }));
    return (await createZip(entries)).arrayBuffer();
  }
}
