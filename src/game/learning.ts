/**
 * 自學支援（企畫書 12）：錯題回流（間隔重複）、今日航程、航海日誌統計。
 *
 * 間隔重複使用「現實時間」：答錯的題目 1 天後、3 天後、7 天後再出現，
 * 複習答對就延長間隔，答錯就回到 1 天。時間一律由呼叫端傳入（now，毫秒），保持純函式。
 */
import type { LearningDomain } from '@/data/schema';

export const DAY_MS = 86_400_000;
/** 答對後下一次複習的間隔（天）；超過最後一格就算熟練 */
export const REVIEW_INTERVALS = [1, 3, 7];

export interface ReviewQuestion {
  prompt: string;
  choices: string[];
  answer: number;
  explanation?: string;
}

export interface ReviewItem {
  key: string;
  question: ReviewQuestion;
  domains: LearningDomain[];
  /** 目前在第幾個間隔（0 = 1 天） */
  stage: number;
  due: number;
  mastered: boolean;
  /** 複習時答錯的次數 */
  lapses: number;
}

/** 第一次作答錯誤（或答錯才答對）時加入複習 */
export function scheduleReview(
  items: ReviewItem[],
  key: string,
  question: ReviewQuestion,
  domains: LearningDomain[],
  now: number,
): ReviewItem[] {
  if (items.some((i) => i.key === key)) return items;
  return [
    ...items,
    { key, question, domains, stage: 0, due: now + DAY_MS, mastered: false, lapses: 0 },
  ];
}

export function dueReviews(items: ReviewItem[], now: number): ReviewItem[] {
  return items.filter((i) => !i.mastered && i.due <= now).sort((a, b) => a.due - b.due);
}

export function answerReview(
  items: ReviewItem[],
  key: string,
  correct: boolean,
  now: number,
): ReviewItem[] {
  return items.map((i) => {
    if (i.key !== key) return i;
    if (!correct) return { ...i, stage: 0, due: now + DAY_MS, lapses: i.lapses + 1 };
    const stage = i.stage + 1;
    if (stage >= REVIEW_INTERVALS.length) return { ...i, stage, mastered: true };
    return { ...i, stage, due: now + REVIEW_INTERVALS[stage] * DAY_MS };
  });
}

// ---------------------------------------------------------------- 今日航程

export type DailyGoalKind = 'review' | 'explore' | 'story';

export interface DailyGoal {
  kind: DailyGoalKind;
  label: string;
  target: number;
  progress: number;
}

export interface DailyVoyage {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  goals: DailyGoal[];
  claimed: boolean;
}

export const DAILY_REWARD = { xp: 30, gold: 50 };

export function localDate(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 每天三個短目標（複習、探索、劇本推進各一），10–15 分鐘可以完成。
 * 沒有待複習題目時，複習目標改為「答對一題問答」。
 */
export function newDailyVoyage(now: number, dueCount: number): DailyVoyage {
  return {
    date: localDate(now),
    claimed: false,
    goals: [
      dueCount > 0
        ? {
            kind: 'review',
            label: `複習 ${Math.min(dueCount, 3)} 題錯題`,
            target: Math.min(dueCount, 3),
            progress: 0,
          }
        : { kind: 'review', label: '答對 1 題問答', target: 1, progress: 0 },
      { kind: 'explore', label: '發現 1 項新的圖鑑', target: 1, progress: 0 },
      { kind: 'story', label: '完成 1 個任務步驟', target: 1, progress: 0 },
    ],
  };
}

export function bumpDaily(
  daily: DailyVoyage | null,
  kind: DailyGoalKind,
  amount = 1,
): DailyVoyage | null {
  if (!daily) return daily;
  let changed = false;
  const goals = daily.goals.map((g) => {
    if (g.kind !== kind || g.progress >= g.target) return g;
    changed = true;
    return { ...g, progress: Math.min(g.target, g.progress + amount) };
  });
  return changed ? { ...daily, goals } : daily;
}

export function dailyComplete(daily: DailyVoyage | null): boolean {
  return !!daily && daily.goals.every((g) => g.progress >= g.target);
}

// ---------------------------------------------------------------- 航海日誌

export type Mastery = 'mastered' | 'learning' | 'needs-work' | 'untouched';

export interface DomainStat {
  domain: LearningDomain;
  answered: number;
  firstTry: number;
  pendingReviews: number;
  codex: number;
  mastery: Mastery;
}

export interface QuizLike {
  domains: string[];
  firstTry: boolean;
}

/**
 * 依問答紀錄、待複習題目與圖鑑，估計每個學習領域的掌握程度。
 * 門檻刻意寬鬆：這是給學生自我檢視的回饋，不是考試分數。
 */
export function domainStats(
  quizLog: QuizLike[],
  reviews: ReviewItem[],
  codexDomains: LearningDomain[][],
): DomainStat[] {
  const domains: LearningDomain[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  return domains.map((domain) => {
    const qs = quizLog.filter((q) => q.domains.includes(domain));
    const firstTry = qs.filter((q) => q.firstTry).length;
    const pending = reviews.filter((r) => !r.mastered && r.domains.includes(domain)).length;
    const codex = codexDomains.filter((d) => d.includes(domain)).length;
    let mastery: Mastery = 'untouched';
    if (qs.length > 0) {
      const rate = firstTry / qs.length;
      mastery =
        pending === 0 && rate >= 0.8
          ? 'mastered'
          : rate >= 0.5 && pending <= 1
            ? 'learning'
            : 'needs-work';
    } else if (codex > 0) {
      mastery = 'learning';
    }
    return { domain, answered: qs.length, firstTry, pendingReviews: pending, codex, mastery };
  });
}
