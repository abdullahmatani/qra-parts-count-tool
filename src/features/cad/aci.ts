/**
 * AutoCAD Color Index (ACI) palette. Indices 10–249 follow the standard
 * pattern: 24 hues in 15° steps, five brightness levels, each at full and
 * half saturation; 250–255 are greys.
 */
import type { CadColor } from './model';

function hsvToRgb(h: number, s: number, v: number): number {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (value: number) => Math.round((value + m) * 255);
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

const BASE = [
  0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff, 0x808080,
  0xc0c0c0,
];
const LEVELS = [1, 0.8, 0.6, 0.5, 0.3];
const GREYS = [0x333333, 0x5b5b5b, 0x848484, 0xadadad, 0xd6d6d6, 0xffffff];

export const ACI_PALETTE: readonly number[] = Array.from({ length: 256 }, (_, i) => {
  if (i < 10) return BASE[i]!;
  if (i >= 250) return GREYS[i - 250]!;
  const hue = (Math.floor(i / 10) - 1) * 15;
  const shade = i % 10;
  return hsvToRgb(hue, shade % 2 === 0 ? 1 : 0.5, LEVELS[Math.floor(shade / 2)]!);
});

/** Colour index 7 is "white on black, black on white": drawings are shown on white paper. */
export function aciToRgb(index: number): number {
  if (index === 7) return 0x000000;
  return ACI_PALETTE[Math.max(0, Math.min(255, Math.round(index)))] ?? 0;
}

/** Resolves an entity colour (ByLayer/ByBlock already substituted by the caller). */
export function colorToRgb(color: CadColor): number {
  if (color.kind === 'rgb') return color.rgb & 0xffffff;
  if (color.kind === 'aci') return aciToRgb(color.index);
  return 0x000000;
}

export function rgbToCss(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}
