import { describe, expect, it } from 'vitest';
import { feedbackContext, feedbackReady, feedbackText, FEEDBACK_MAX_CHARS } from './feedback';
import { acceptQuest, newGame } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const env = {
  build: '2026-10-01T12:00',
  device: { userAgent: 'test', width: 1180, height: 820, touch: true },
};

describe('feedback', () => {
  it('records where the player is and what they are doing', () => {
    let s = newGame(world, 'round-the-world', 1).state;
    s = acceptQuest(world, s, 'rw-00-west').state;
    const c = feedbackContext(world, s, env);
    expect(c.scenarioName).toBe('繞地球一圈');
    expect(c.place).toBe('停在聖盧卡爾');
    expect(c.gameDate).toBe('1519/9/20');
    expect(c.quests[0]).toMatchObject({ id: 'rw-00-west', title: '往西的航路' });
    const text = feedbackText({
      id: 'x',
      createdAt: Date.UTC(2026, 9, 1),
      tags: ['卡住了'],
      message: '找不到海峽',
      context: c,
      sent: false,
    });
    expect(text).toContain('標籤：卡住了');
    expect(text).toContain('內容：找不到海峽');
    expect(text).toContain('往西的航路（第');
    expect(text).toContain('1180×820、觸控');
  });

  it('describes positions at sea by region and coordinates', () => {
    const s = newGame(world, 'round-the-world', 1).state;
    const c = feedbackContext(
      world,
      { ...s, dockedAt: null, ship: { position: [-70, -53], heading: 0 } },
      env,
    );
    expect(c.place).toContain('麥哲倫海峽');
    expect(c.place).toContain('南緯 53.0°');
  });

  it('needs a tag or a few words, and not an essay', () => {
    expect(feedbackReady([], '  ')).toBe(false);
    expect(feedbackReady(['好玩'], '')).toBe(true);
    expect(feedbackReady([], '很好玩')).toBe(true);
    expect(feedbackReady([], 'a'.repeat(FEEDBACK_MAX_CHARS + 1))).toBe(false);
  });
});
