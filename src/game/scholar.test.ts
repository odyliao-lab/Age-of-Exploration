import { describe, expect, it } from 'vitest';
import { scholarQuestion } from './scholar';
import { answerScholar, newGame, scholarToday } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const ports = world.content.ports;
const name = (g: string) => world.codex.get(g)?.name ?? g;

describe("scholar's daily quiz", () => {
  it('asks well-formed questions about known ports', () => {
    for (let day = 0; day < 60; day++) {
      for (let i = 0; i < 3; i++) {
        const q = scholarQuestion(ports, name, day, i)!;
        expect(q).not.toBeNull();
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        // 物產題：正確答案的港口真的出產那種貨
        const m = q.prompt.match(/「(.+)」是哪一個港口的特產/);
        if (m) {
          const port = ports.find((p) => p.name === q.choices[q.answer])!;
          expect(port.goods.map(name)).toContain(m[1]);
        }
      }
    }
    expect(scholarQuestion(ports.slice(0, 2), name, 0, 0)).toBeNull();
  });

  it('gives three questions a day, rewarding right answers', () => {
    let s = {
      ...newGame(world, 'treasure-fleet', 1).state,
      visitedPorts: ['quanzhou', 'guangzhou', 'malacca', 'galle', 'calicut', 'hormuz'],
    };
    const gold0 = s.gold;
    for (let i = 0; i < 3; i++) {
      const t = scholarToday(world, s)!;
      expect(t.remaining).toBe(3 - i);
      s = answerScholar(world, s, t.question.answer)!.state;
    }
    expect(scholarToday(world, s)).toBeNull();
    expect(s.gold).toBe(gold0 + 30);
    expect(scholarToday(world, { ...s, day: s.day + 1 })).not.toBeNull();
  });
});
