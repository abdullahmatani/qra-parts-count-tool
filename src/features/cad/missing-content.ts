/**
 * Wording for what a CAD drawing cannot show (DRW-02). The import summary and
 * the notice on the drawing tell the user, so content the readers cannot draw
 * is never left out unnoticed.
 */
import i18n from '@/i18n';
import type { MissingContent } from './display-list';

const t = i18n.t.bind(i18n);

/** A readable name for a CAD entity type, e.g. "Multileader"; the type itself when unknown. */
export function entityTypeName(type: string): string {
  const key = `cadMissing.types.${type}`;
  return i18n.exists(key) ? t(key as never) : type;
}

export interface MissingLine {
  /** The sentence shown to the user. */
  text: string;
  /** The CAD entity type, for entity lines. */
  type?: string;
}

/** One line per kind of missing content: entities (most first), then external references and blocks. */
export function missingLines(missing: MissingContent): MissingLine[] {
  const entities = Object.entries(missing.entities)
    .sort(([a, m], [b, n]) => n - m || a.localeCompare(b))
    .map(([type, count]) => ({
      text: t('cadMissing.entity', { count, name: entityTypeName(type) }),
      type,
    }));
  return [
    ...entities,
    ...missing.xrefs.map((name) => ({ text: t('cadMissing.xref', { name }) })),
    ...missing.blocks.map((name) => ({ text: t('cadMissing.block', { name }) })),
  ];
}
