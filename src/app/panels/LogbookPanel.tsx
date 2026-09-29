import { useState } from 'react';
import { LEARNING_DOMAIN_LABELS } from '@/data/schema';
import {
  DAILY_REWARD,
  dailyComplete,
  domainStats,
  dueReviews,
  type Mastery,
} from '@/game/learning';
import { useGame } from '../store';
import { useNow } from '../useNow';

const MASTERY_LABEL: Record<Mastery, string> = {
  mastered: '已掌握',
  learning: '學習中',
  'needs-work': '需加強',
  untouched: '尚未接觸',
};

/** 航海日誌：今日航程、錯題複習、學習領域掌握度、航海紀錄（企畫書 12.3） */
export function LogbookPanel() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const openPanel = useGame((s) => s.openPanel);
  const claim = useGame((s) => s.claimDaily);
  const now = useNow();
  // 作答後先停在這一題顯示結果，按「下一題」才換題
  const [pinned, setPinned] = useState<string | null>(null);
  const due = dueReviews(game.reviews, now);
  const shownKey = pinned ?? due[0]?.key ?? null;
  const codexDomains = game.discovered.map((id) => world.codex.get(id)?.domains ?? []);
  const stats = domainStats(game.quizLog, game.reviews, codexDomains);
  const daily = game.daily;
  const pending = game.reviews.filter((r) => !r.mastered);
  const mastered = game.reviews.filter((r) => r.mastered).length;

  return (
    <div className="modal-backdrop">
      <section
        className="modal sheet logbook"
        role="dialog"
        aria-modal="true"
        aria-label="航海日誌"
      >
        <header className="sheet-head">
          <h2>航海日誌</h2>
          <div className="row">
            <button type="button" className="no-print" onClick={() => window.print()}>
              列印
            </button>
            <button
              type="button"
              className="close"
              aria-label="關閉"
              onClick={() => openPanel(null)}
            >
              ×
            </button>
          </div>
        </header>

        {daily && (
          <section>
            <h3>
              今日航程 <span className="meta">{daily.date}</span>
            </h3>
            <ul className="daily-goals">
              {daily.goals.map((g) => (
                <li key={g.kind} className={g.progress >= g.target ? 'done' : ''}>
                  <span>
                    {g.progress >= g.target ? '✅' : '⬜'} {g.label}
                  </span>
                  <span className="meta">
                    {g.progress}/{g.target}
                  </span>
                </li>
              ))}
            </ul>
            {daily.claimed ? (
              <p className="meta">今天的航程已完成，明天再來吧！</p>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={!dailyComplete(daily)}
                onClick={claim}
              >
                領取獎勵（經驗 +{DAILY_REWARD.xp}、金幣 +{DAILY_REWARD.gold}）
              </button>
            )}
          </section>
        )}

        <section>
          <h3>
            錯題複習{' '}
            <span className="meta">
              待複習 {due.length}・複習中 {pending.length}・已熟練 {mastered}
            </span>
          </h3>
          {shownKey ? (
            <ReviewCard
              key={shownKey}
              itemKey={shownKey}
              onAnswered={() => setPinned(shownKey)}
              onNext={() => setPinned(null)}
            />
          ) : (
            <p className="meta">
              {pending.length
                ? '目前沒有到期的題目。答錯的題目會在 1 天、3 天、7 天後回來複習。'
                : '目前沒有錯題。第一次答錯的問題會自動加入這裡，隔天再複習。'}
            </p>
          )}
        </section>

        <section>
          <h3>學習領域</h3>
          <ul className="domain-stats">
            {stats.map((s) => (
              <li key={s.domain} className={`mastery-${s.mastery}`}>
                <span className="domain-name">{LEARNING_DOMAIN_LABELS[s.domain]}</span>
                <span className="mastery-tag">{MASTERY_LABEL[s.mastery]}</span>
                <span className="meta">
                  問答 {s.answered} 題（一次答對 {s.firstTry}）・圖鑑 {s.codex} 張
                  {s.pendingReviews ? `・待複習 ${s.pendingReviews}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>航海紀錄</h3>
          <ul className="voyage-log">
            {[...game.log]
              .reverse()
              .slice(0, 40)
              .map((e, i) => (
                <li key={i} className={`log-${e.kind}`}>
                  <span className="meta">第 {e.day} 天</span> {e.text}
                </li>
              ))}
          </ul>
        </section>
      </section>
    </div>
  );
}

function ReviewCard({
  itemKey,
  onAnswered,
  onNext,
}: {
  itemKey: string;
  onAnswered: () => void;
  onNext: () => void;
}) {
  const item = useGame((s) => s.game!.reviews.find((r) => r.key === itemKey))!;
  const answer = useGame((s) => s.answerReview);
  const [result, setResult] = useState<null | { correct: boolean; choice: number }>(null);
  const q = item.question;
  return (
    <div className="review-card">
      <p className="question">{q.prompt}</p>
      <div className="choices">
        {q.choices.map((c, i) => (
          <button
            type="button"
            key={i}
            className={
              !result
                ? 'choice'
                : i === q.answer
                  ? 'choice correct'
                  : i === result.choice
                    ? 'choice wrong'
                    : 'choice'
            }
            disabled={!!result}
            onClick={() => {
              onAnswered();
              setResult({ correct: answer(item.key, i), choice: i });
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {result && (
        <p className={result.correct ? 'lesson' : 'warn'} role="status">
          {result.correct
            ? '答對了！經驗 +5。'
            : `正確答案是「${q.choices[q.answer]}」，明天再複習一次。`}
          {q.explanation ? ` ${q.explanation}` : ''}
        </p>
      )}
      {result && (
        <div className="row end">
          <button type="button" className="primary" onClick={onNext}>
            下一題
          </button>
        </div>
      )}
    </div>
  );
}
