// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ESDV_COLOUR,
  LINK_OVERLAY,
  MARKER_SELECTION,
  MARKER_WARNING,
  SEGMENT_PALETTE,
  hexToRgb01,
  nextSegmentColour,
  segmentAppearance,
} from './palette';

const css = readFileSync(resolve(import.meta.dirname, '../styles/index.css'), 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];

describe('segment palette (FDS 9.3)', () => {
  it('matches the CSS design tokens', () => {
    SEGMENT_PALETTE.forEach((hex, i) => expect(token(`segment-${i + 1}`)).toBe(hex));
    expect(token('marker-warning')).toBe(MARKER_WARNING);
    expect(token('link-overlay')).toBe(LINK_OVERLAY);
    expect(token('esdv')).toBe(ESDV_COLOUR);
    expect(token('marker-selection')).toBe(MARKER_SELECTION);
  });

  it('never uses a reserved colour as a segment colour', () => {
    const palette: readonly string[] = SEGMENT_PALETTE;
    for (const reserved of [MARKER_WARNING, MARKER_SELECTION, LINK_OVERLAY, ESDV_COLOUR]) {
      expect(palette).not.toContain(reserved);
    }
    expect(new Set(SEGMENT_PALETTE).size).toBe(12);
  });

  it('cycles after 12 colours with a pattern variant', () => {
    expect(segmentAppearance(1)).toMatchObject({ hex: '#332288', variant: 0, dash: [] });
    expect(segmentAppearance(12)).toMatchObject({ cssVar: 'var(--segment-12)', variant: 0 });
    const thirteenth = segmentAppearance(13);
    expect(thirteenth.hex).toBe(SEGMENT_PALETTE[0]);
    expect(thirteenth.variant).toBe(1);
    expect(thirteenth.dash.length).toBeGreaterThan(0);
  });

  it('assigns the lowest unused colour to a new segment', () => {
    expect(nextSegmentColour([])).toBe(1);
    expect(nextSegmentColour([1, 2, 4])).toBe(3);
  });

  it('converts hex to 0..1 RGB', () => {
    expect(hexToRgb01('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb01('#fff')).toEqual({ r: 1, g: 1, b: 1 });
  });
});
