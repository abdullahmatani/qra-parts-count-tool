/**
 * Segment and marker colours (FDS section 9.3). These values mirror the CSS
 * tokens in src/styles/index.css and are used wherever CSS is not available,
 * such as annotated PDF export. A unit test keeps the two in sync.
 */
export const SEGMENT_PALETTE = [
  '#332288',
  '#117733',
  '#44aa99',
  '#882255',
  '#aa4499',
  '#999933',
  '#cc6677',
  '#33bbee',
  '#ee3377',
  '#8c564b',
  '#4477aa',
  '#225555',
] as const;

export const MARKER_WARNING = '#f59e0b';
/** Selected and hovered markers, and shapes being drawn (screen only). */
export const MARKER_SELECTION = '#0284c7';
export const LINK_OVERLAY = '#2563eb';
export const ESDV_COLOUR = '#dc2626';
/** Colour for markers that belong to no segment. */
export const UNASSIGNED_COLOUR = '#64748b';
/** Fill opacity of a dot marker: reads as a dot, still shows the symbol under it. */
export const DOT_ALPHA = 0.7;
/** Opacity of a highlighter stroke: the linework under it stays readable. */
export const HIGHLIGHTER_ALPHA = 0.35;

/** Stroke dash patterns used after the palette cycles; index 0 is solid. */
export const SEGMENT_DASH_VARIANTS: readonly (readonly number[])[] = [
  [],
  [6, 3],
  [2, 2],
  [8, 3, 2, 3],
];

export interface SegmentAppearance {
  /** 1-based colour index as stored on the segment. */
  index: number;
  /** Hex colour. */
  hex: string;
  /** CSS custom property holding the colour, e.g. `var(--segment-3)`. */
  cssVar: string;
  /** 0 for the first cycle of 12 colours, 1 for the second, and so on. */
  variant: number;
  /** Dash pattern for the variant (empty for solid). */
  dash: readonly number[];
}

/** Resolves a segment's colour index to a colour and pattern variant. */
export function segmentAppearance(colourIndex: number): SegmentAppearance {
  const index = Math.max(1, Math.floor(colourIndex));
  const slot = (index - 1) % SEGMENT_PALETTE.length;
  const variant = Math.floor((index - 1) / SEGMENT_PALETTE.length);
  return {
    index,
    hex: SEGMENT_PALETTE[slot]!,
    cssVar: `var(--segment-${slot + 1})`,
    variant,
    dash: SEGMENT_DASH_VARIANTS[variant % SEGMENT_DASH_VARIANTS.length]!,
  };
}

/** Picks the next colour index for a new segment: the lowest index not yet used. */
export function nextSegmentColour(usedIndices: Iterable<number>): number {
  const used = new Set(usedIndices);
  let index = 1;
  while (used.has(index)) index += 1;
  return index;
}

/** Converts `#rrggbb` to 0..1 RGB components (for pdf-lib). */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
