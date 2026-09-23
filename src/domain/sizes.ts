/**
 * Nominal sizes (CNT-01). Sizes are entered in inches or DN; binning is done
 * in inches, so DN sizes are converted with the standard NPS equivalents.
 * Entry accepts `2`, `2"`, `2 in`, `3/4`, `1-1/2`, `1 1/2`, `DN50` and `50 DN`
 * (FDS section 6).
 */
import type { SizeUnit } from './schema/types';

export interface NominalSize {
  value: number;
  unit: SizeUnit;
}

/** DN → NPS (inches) for standard pipe sizes (ISO 6708 / ASME B36.10). */
const DN_TO_NPS: Readonly<Record<number, number>> = {
  6: 1 / 8,
  8: 1 / 4,
  10: 3 / 8,
  15: 1 / 2,
  20: 3 / 4,
  25: 1,
  32: 1.25,
  40: 1.5,
  50: 2,
  65: 2.5,
  80: 3,
  90: 3.5,
  100: 4,
  125: 5,
  150: 6,
  200: 8,
  250: 10,
  300: 12,
  350: 14,
  400: 16,
  450: 18,
  500: 20,
  550: 22,
  600: 24,
  650: 26,
  700: 28,
  750: 30,
  800: 32,
  850: 34,
  900: 36,
  950: 38,
  1000: 40,
  1050: 42,
  1100: 44,
  1150: 46,
  1200: 48,
};

/** Size in inches, for binning. Non-standard DN values use DN / 25. */
export function sizeInInches(size: NominalSize): number {
  if (size.unit === 'in') return size.value;
  return DN_TO_NPS[size.value] ?? size.value / 25;
}

function parseNumber(text: string): number | null {
  const t = text.trim();
  // Mixed fraction: 1-1/2 or 1 1/2.
  let m = /^(\d+)(?:\s+|-)(\d+)\/(\d+)$/.exec(t);
  if (m) {
    const den = Number(m[3]);
    return den ? Number(m[1]) + Number(m[2]) / den : null;
  }
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m) {
    const den = Number(m[2]);
    return den ? Number(m[1]) / den : null;
  }
  if (/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return Number(t);
  return null;
}

/**
 * Parses a size entry. Returns null for an empty entry and 'invalid' for text
 * that is not a size. A bare number takes `defaultUnit`.
 */
export function parseSize(text: string, defaultUnit: SizeUnit): NominalSize | null | 'invalid' {
  const raw = text.trim().replace(/[″”]/g, '"').replace(/,/g, '.');
  if (!raw) return null;
  let unit: SizeUnit = defaultUnit;
  let body = raw;
  const dnPrefix = /^dn\s*(.+)$/i.exec(body);
  const dnSuffix = /^(.+?)\s*dn$/i.exec(body);
  const inch = /^(.+?)\s*(?:"|in|inch|inches)$/i.exec(body);
  if (dnPrefix) {
    unit = 'DN';
    body = dnPrefix[1]!;
  } else if (dnSuffix) {
    unit = 'DN';
    body = dnSuffix[1]!;
  } else if (inch) {
    unit = 'in';
    body = inch[1]!;
  }
  const value = parseNumber(body);
  if (value === null || !(value > 0) || !Number.isFinite(value)) return 'invalid';
  if (unit === 'DN' && !Number.isInteger(value)) return 'invalid';
  return { value, unit };
}

const FRACTIONS: Readonly<Record<string, string>> = {
  '0.125': '1/8',
  '0.25': '1/4',
  '0.375': '3/8',
  '0.5': '1/2',
  '0.625': '5/8',
  '0.75': '3/4',
  '0.875': '7/8',
};

/** Formats a size the way it is written on drawings: 1-1/2", 3/4", DN50. */
export function formatSize(size: NominalSize): string {
  if (size.unit === 'DN') return `DN${size.value}`;
  const whole = Math.floor(size.value);
  const rest = Math.round((size.value - whole) * 1000) / 1000;
  const fraction = FRACTIONS[String(rest)];
  if (rest === 0) return `${whole}"`;
  if (fraction) return whole ? `${whole}-${fraction}"` : `${fraction}"`;
  return `${size.value}"`;
}
