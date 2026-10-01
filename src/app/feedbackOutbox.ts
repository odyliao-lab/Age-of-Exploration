/**
 * 試玩回饋的寄件匣：先存在這台裝置上，登入雲端時再送出。
 * 沒有登入、沒有網路，或雲端還沒建好 feedback 資料表時，回饋也不會遺失，
 * 玩家可以按「複製」貼到訊息裡傳給開發者。
 */
import type { FeedbackEntry } from '@/game/feedback';
import { cloudConfigured, pushFeedback } from './cloud';
import { useCloud } from './cloudSync';

const KEY = 'aoe-feedback';
/** 只留最近的幾則，避免占滿瀏覽器空間 */
const KEEP = 30;

export function loadFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as FeedbackEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function storeFeedback(list: FeedbackEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, KEEP)));
  } catch {
    // 瀏覽器不讓存（無痕模式、空間滿了）：這次的回饋仍可以複製
  }
}

export type SendResult = 'sent' | 'saved' | 'failed';

/** 存下新的回饋，能送就送；回傳這一則的結果 */
export async function submitFeedback(entry: FeedbackEntry): Promise<SendResult> {
  storeFeedback([entry, ...loadFeedback().filter((e) => e.id !== entry.id)]);
  if (!cloudConfigured() || !useCloud.getState().user) return 'saved';
  try {
    await pushFeedback({
      scenarioId: entry.context.scenarioId,
      tags: entry.tags,
      message: entry.message,
      context: entry.context,
    });
  } catch {
    return 'failed';
  }
  storeFeedback(loadFeedback().map((e) => (e.id === entry.id ? { ...e, sent: true } : e)));
  return 'sent';
}

/** 登入後把之前沒送出的回饋補送 */
export async function flushFeedback(): Promise<number> {
  if (!cloudConfigured() || !useCloud.getState().user) return 0;
  let sent = 0;
  for (const e of loadFeedback().filter((x) => !x.sent)) {
    if ((await submitFeedback(e)) !== 'sent') break;
    sent++;
  }
  return sent;
}
