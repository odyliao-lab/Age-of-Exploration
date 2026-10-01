/**
 * 試玩回饋：玩家按「回饋」寫下感想，自動附上當下的遊戲狀況（劇本、日期、位置、進行中的任務、裝置），
 * 開發者才看得懂「在哪裡卡住」。這裡只放純函式；送出與本機保存在 app 層。
 */
import type { LonLat } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { gameDate, regionAt, type GameState } from './state';
import type { World } from './world';

/** 快速標籤：小朋友不想打字時，點一下也能回報 */
export const FEEDBACK_TAGS = [
  '好玩',
  '卡住了',
  '看不懂',
  '太難',
  '太無聊',
  '有錯字或錯誤',
  '畫面有問題',
  '其他建議',
] as const;

export const FEEDBACK_MAX_CHARS = 2000;

export interface FeedbackContext {
  scenarioId: string;
  scenarioName: string;
  /** 遊戲裡的日期，例如「1519/9/20」 */
  gameDate: string;
  day: number;
  position: LonLat;
  /** 人看得懂的位置：停泊的港口或所在海域 */
  place: string;
  dockedAt: string | null;
  level: number;
  /** 進行中的任務與目前步驟 */
  quests: { id: string; title: string; step: number; steps: number }[];
  /** 建置時間（哪一版） */
  build: string;
  device: { userAgent: string; width: number; height: number; touch: boolean };
}

export interface FeedbackEntry {
  id: string;
  createdAt: number;
  tags: string[];
  message: string;
  context: FeedbackContext;
  /** 已經送到雲端 */
  sent: boolean;
}

/** 從遊戲狀態整理出回饋要附上的狀況（裝置與版本由呼叫端提供） */
export function feedbackContext(
  world: World,
  state: GameState,
  env: Pick<FeedbackContext, 'build' | 'device'>,
): FeedbackContext {
  const d = gameDate(state);
  const scenario = world.scenarios.get(state.scenarioId);
  const port = state.dockedAt ? world.ports.get(state.dockedAt) : null;
  const regionId = regionAt(world, state.ship.position);
  const region = regionId ? world.content.regions.find((r) => r.id === regionId) : null;
  const place = port
    ? `停在${port.name}`
    : `${region ? `${region.name}，` : ''}${formatLonLat(state.ship.position)}`;
  const quests = Object.entries(state.quests)
    .filter(([, q]) => q.status === 'active')
    .map(([id, q]) => {
      const def = world.quests.get(id);
      return { id, title: def?.title ?? id, step: q.step, steps: def?.steps.length ?? 0 };
    });
  return {
    scenarioId: state.scenarioId,
    scenarioName: scenario?.name ?? state.scenarioId,
    gameDate: `${d.year}/${d.month}/${d.day}`,
    day: Math.round(state.day * 10) / 10,
    position: [
      Math.round(state.ship.position[0] * 100) / 100,
      Math.round(state.ship.position[1] * 100) / 100,
    ],
    place,
    dockedAt: state.dockedAt,
    level: state.captain.level,
    quests,
    ...env,
  };
}

/** 整理成一段文字，方便玩家複製貼到訊息裡傳給開發者 */
export function feedbackText(entry: FeedbackEntry): string {
  const c = entry.context;
  const lines = [
    `【試玩回饋】${new Date(entry.createdAt).toLocaleString('zh-TW')}`,
    entry.tags.length ? `標籤：${entry.tags.join('、')}` : '',
    entry.message ? `內容：${entry.message}` : '',
    `劇本：${c.scenarioName}（遊戲日期 ${c.gameDate}，等級 ${c.level}）`,
    `位置：${c.place}`,
    c.quests.length
      ? `任務：${c.quests.map((q) => `${q.title}（第 ${q.step + 1}/${q.steps} 步）`).join('；')}`
      : '',
    `裝置：${c.device.width}×${c.device.height}${c.device.touch ? '、觸控' : ''}；版本 ${c.build}`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** 送出前的檢查：至少選一個標籤或寫幾個字，內容不超過上限 */
export function feedbackReady(tags: string[], message: string): boolean {
  const text = message.trim();
  return (tags.length > 0 || text.length > 0) && text.length <= FEEDBACK_MAX_CHARS;
}
