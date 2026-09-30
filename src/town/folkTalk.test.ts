import { describe, expect, it } from 'vitest';
import { contentForTests } from '@/game/testContent';
import { folkLines, greetingFor } from './folkTalk';
import { cultureOf } from './layout';
import { festivalAt } from './festivals';

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

describe('festivals', () => {
  it('decorate the right ports in the right months', () => {
    expect(festivalAt('quanzhou', 2)?.name).toBe('元宵節');
    expect(festivalAt('quanzhou', 3)).toBeNull();
    expect(festivalAt('cochin', 9)?.decor).toBe('flowers');
    expect(festivalAt('galle', 5)?.name).toBe('衛塞節');
    expect(festivalAt('hormuz', 5)).toBeNull();
  });

  it('let townsfolk talk about the festival right after the greeting', () => {
    const f = festivalAt('quanzhou', 2)!;
    const lines = folkLines('quanzhou', 'minnan', [], f.text);
    expect(lines[1]).toBe(f.text);
  });
});
