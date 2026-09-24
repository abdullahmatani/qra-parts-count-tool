import { describe, expect, it } from 'vitest';
import { ltr } from './bidi';

describe('ltr', () => {
  it('isolates technical text in right-to-left text only', () => {
    expect(ltr('6" < x ≤ 11"', 'rtl')).toBe('⁦6" < x ≤ 11"⁩');
    expect(ltr('6" < x ≤ 11"', 'ltr')).toBe('6" < x ≤ 11"');
  });
});
