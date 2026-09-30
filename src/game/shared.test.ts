import { describe, expect, it } from 'vitest';
import { sharedProgress } from './shared';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

describe('sharedProgress', () => {
  it('collects codex and achievements from the other scenarios only', () => {
    const world = buildWorld(contentForTests());
    const saves = [
      { scenarioId: 'treasure-fleet', discovered: ['kuroshio'], achievements: ['equator'] },
      { scenarioId: 'monsoon-merchant', discovered: ['kamal', 'kuroshio'], achievements: [] },
    ];
    const s = sharedProgress(world, saves, 'treasure-fleet');
    expect(s.discovered.get('kamal')).toBe('季風商人');
    expect(s.discovered.has('kuroshio')).toBe(true);
    expect(s.achievements.has('equator')).toBe(false);
    const m = sharedProgress(world, saves, 'monsoon-merchant');
    expect(m.achievements.get('equator')).toBe('東方寶船');
  });
});
