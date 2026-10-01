import { describe, expect, it } from 'vitest';
import { seasonAt } from './calendar';

describe('seasonAt', () => {
  it('flips the seasons in the southern hemisphere', () => {
    expect(seasonAt(11, 25)).toBe('秋');
    expect(seasonAt(11, -17)).toBe('春');
    expect(seasonAt(1, -17)).toBe('夏');
    expect(seasonAt(7, -27)).toBe('冬');
  });
});
