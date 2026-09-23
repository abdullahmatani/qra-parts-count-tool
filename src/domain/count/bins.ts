/**
 * Size bins (CNT-04, CNT-05). Each bin has explicit edges in inches and says
 * whether each edge is inclusive, e.g. 1" < x ≤ 2". Bins are never stored on
 * items: an item's bin is derived from its size every time (FDS section 5).
 */
import type { Bin, BinSet } from '../schema/types';
import { formatSize } from '../sizes';

export function binContains(bin: Bin, inches: number): boolean {
  if (bin.lower !== null) {
    if (bin.lowerInclusive ? inches < bin.lower : inches <= bin.lower) return false;
  }
  if (bin.upper !== null) {
    if (bin.upperInclusive ? inches > bin.upper : inches >= bin.upper) return false;
  }
  return true;
}

/** The first bin of the set that contains the size, or null when none does. */
export function binFor(binSet: Pick<BinSet, 'bins'>, inches: number): Bin | null {
  return binSet.bins.find((bin) => binContains(bin, inches)) ?? null;
}

const inch = (value: number) => formatSize({ value, unit: 'in' });

/** A readable label from the edges: ≤ 1", 1" < x ≤ 2", > 11", All sizes. */
export function binLabel(
  bin: Pick<Bin, 'lower' | 'lowerInclusive' | 'upper' | 'upperInclusive'>,
): string {
  const { lower, upper } = bin;
  if (lower === null && upper === null) return 'All sizes';
  if (lower === null) return `${bin.upperInclusive ? '≤' : '<'} ${inch(upper!)}`;
  if (upper === null) return `${bin.lowerInclusive ? '≥' : '>'} ${inch(lower)}`;
  return `${inch(lower)} ${bin.lowerInclusive ? '≤' : '<'} x ${bin.upperInclusive ? '≤' : '<'} ${inch(upper)}`;
}

export type BinSetProblem =
  | { kind: 'overlap'; binIds: [string, string]; at: number }
  | { kind: 'gap'; binIds: [string, string]; from: number; to: number }
  | { kind: 'emptyBin'; binId: string };

/**
 * Checks a bin set for overlaps and gaps between neighbouring bins (sorted by
 * lower edge), and for bins that can hold no size. The editor shows these so
 * the user can see the edge rules are complete; they do not block saving.
 */
export function checkBinSet(binSet: Pick<BinSet, 'bins'>): BinSetProblem[] {
  const problems: BinSetProblem[] = [];
  const lowerKey = (b: Bin) => (b.lower === null ? -Infinity : b.lower);
  const sorted = [...binSet.bins].sort((a, b) => lowerKey(a) - lowerKey(b));
  for (const bin of sorted) {
    if (
      bin.lower !== null &&
      bin.upper !== null &&
      (bin.lower > bin.upper ||
        (bin.lower === bin.upper && !(bin.lowerInclusive && bin.upperInclusive)))
    ) {
      problems.push({ kind: 'emptyBin', binId: bin.id });
    }
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const aUpper = a.upper === null ? Infinity : a.upper;
    const bLower = b.lower === null ? -Infinity : b.lower;
    if (aUpper > bLower || (aUpper === bLower && a.upperInclusive && b.lowerInclusive)) {
      problems.push({ kind: 'overlap', binIds: [a.id, b.id], at: bLower });
    } else if (aUpper < bLower || (aUpper === bLower && !a.upperInclusive && !b.lowerInclusive)) {
      problems.push({ kind: 'gap', binIds: [a.id, b.id], from: aUpper, to: bLower });
    }
  }
  return problems;
}
