import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { decideSync, nextCloudStamp, saveSummary } from './sync';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

describe('decideSync', () => {
  const base = { local: 100, cloud: 200 };

  it('handles missing saves', () => {
    expect(decideSync(null, null, null)).toBe('none');
    expect(decideSync(100, null, null)).toBe('upload');
    expect(decideSync(null, 200, null)).toBe('download');
    // 雲端存檔被刪掉、本機仍在：重新上傳
    expect(decideSync(100, null, base)).toBe('upload');
  });

  it('asks the player when a device has never synced and both sides have progress', () => {
    expect(decideSync(100, 200, null)).toBe('conflict');
  });

  it('follows whichever side changed since the last sync', () => {
    expect(decideSync(100, 200, base)).toBe('none');
    expect(decideSync(150, 200, base)).toBe('upload');
    expect(decideSync(100, 250, base)).toBe('download');
    expect(decideSync(150, 250, base)).toBe('conflict');
  });

  it('keeps cloud stamps increasing even with a slow clock', () => {
    expect(nextCloudStamp(1000, null)).toBe(1000);
    expect(nextCloudStamp(1000, 500)).toBe(1000);
    expect(nextCloudStamp(1000, 5000)).toBe(5001);
  });

  it('summarizes progress for the conflict dialog', () => {
    const world = buildWorld(contentForTests());
    const { state } = newGame(world, 'treasure-fleet', 1);
    const sum = saveSummary(state, 42);
    expect(sum).toMatchObject({ updatedAt: 42, day: 1, level: 1, questsDone: 0, ports: 1 });
  });
});
