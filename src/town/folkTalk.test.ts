import { describe, expect, it } from 'vitest';
import { contentForTests } from '@/game/testContent';
import { folkLines, greetingFor } from './folkTalk';
import { cultureOf } from './layout';

describe('townsfolk talk', () => {
  const ports = contentForTests().ports;

  it('gives every port something to say, starting with the local greeting', () => {
    for (const p of ports) {
      const lines = folkLines(p.id, cultureOf(p.country), p.gossip);
      expect(lines.length, p.id).toBeGreaterThanOrEqual(4);
      const g = greetingFor(p.id);
      if (g) expect(lines[0]).toContain(g.lang);
    }
  });

  it('greets in the language of the place', () => {
    expect(greetingFor('quanzhou')?.lang).toBe('閩南話');
    expect(greetingFor('malacca')?.lang).toBe('馬來語');
    expect(greetingFor('kilwa')?.lang).toBe('斯瓦希里語');
  });
});
