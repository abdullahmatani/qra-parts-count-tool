import { describe, expect, it } from 'vitest';
import { formatSize, parseSize, sizeInInches } from './sizes';

describe('size entry (CNT-01, FDS section 6)', () => {
  it.each([
    ['2', { value: 2, unit: 'in' }],
    ['2"', { value: 2, unit: 'in' }],
    ['2 in', { value: 2, unit: 'in' }],
    ['3/4', { value: 0.75, unit: 'in' }],
    ['3/4"', { value: 0.75, unit: 'in' }],
    ['1-1/2', { value: 1.5, unit: 'in' }],
    ['1 1/2"', { value: 1.5, unit: 'in' }],
    ['0.5', { value: 0.5, unit: 'in' }],
    ['DN50', { value: 50, unit: 'DN' }],
    ['dn 80', { value: 80, unit: 'DN' }],
    ['150 DN', { value: 150, unit: 'DN' }],
    ['2”', { value: 2, unit: 'in' }],
  ])('reads %s', (text, expected) => {
    expect(parseSize(text, 'in')).toEqual(expected);
  });

  it('uses the project unit for a bare number', () => {
    expect(parseSize('50', 'DN')).toEqual({ value: 50, unit: 'DN' });
    expect(parseSize('2"', 'DN')).toEqual({ value: 2, unit: 'in' });
  });

  it('returns null when empty and invalid for anything else', () => {
    expect(parseSize('  ', 'in')).toBeNull();
    for (const text of ['abc', '0', '-2', '1/0', 'DN50.5', '2""', '1/2/3']) {
      expect(parseSize(text, 'in')).toBe('invalid');
    }
  });
});

describe('size conversion and display', () => {
  it('converts DN to inches with the standard equivalents', () => {
    expect(sizeInInches({ value: 50, unit: 'DN' })).toBe(2);
    expect(sizeInInches({ value: 15, unit: 'DN' })).toBe(0.5);
    expect(sizeInInches({ value: 40, unit: 'DN' })).toBe(1.5);
    expect(sizeInInches({ value: 60, unit: 'DN' })).toBe(2.4);
    expect(sizeInInches({ value: 3, unit: 'in' })).toBe(3);
  });

  it('formats sizes as written on drawings', () => {
    expect(formatSize({ value: 2, unit: 'in' })).toBe('2"');
    expect(formatSize({ value: 1.5, unit: 'in' })).toBe('1-1/2"');
    expect(formatSize({ value: 0.75, unit: 'in' })).toBe('3/4"');
    expect(formatSize({ value: 2.3, unit: 'in' })).toBe('2.3"');
    expect(formatSize({ value: 50, unit: 'DN' })).toBe('DN50');
  });
});
