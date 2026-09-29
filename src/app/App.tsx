import { lazy, Suspense, useEffect, useState } from 'react';
import { LEARNING_DOMAIN_LABELS, type Scenario } from '@/data/schema';
import { contentResult } from './content';
import { useGame } from './store';

// 海圖與遊戲引擎（含 PixiJS）按需載入，讓劇本選單不必先下載繪圖引擎
const GameScreen = lazy(() => import('./GameScreen'));

export function App() {
  const screen = useGame((s) => s.screen);
  const world = useGame((s) => s.world);

  if (contentResult.error !== null) {
    return (
      <main className="page">
        <h1>內容載入失敗</h1>
        <div className="error">{contentResult.error}</div>
      </main>
    );
  }

  if (screen === 'map' && world) {
    return (
      <Suspense fallback={<main className="page">正在展開海圖…</main>}>
        <GameScreen />
      </Suspense>
    );
  }
  return <ScenarioMenu />;
}

function ScenarioMenu() {
  const content = contentResult.content!;
  useEffect(() => {
    void useGame.getState().refreshSaves();
  }, []);
  return (
    <main className="page">
      <h1>Age of Exploration</h1>
      <p className="subtitle">選擇一個劇本，從家鄉港口出發，親手航向世界。</p>

      <section className="scenario-grid">
        {content.scenarios.map((s) => (
          <ScenarioCard key={s.id} scenario={s} />
        ))}
      </section>

      <section className="howto">
        <h2>怎麼玩</h2>
        <ol>
          <li>在家鄉港口的任務板接下任務。</li>
          <li>按「規劃航線」，在海面上點選航點，最後點選目的港口。航線不能穿越陸地。</li>
          <li>出航後船會自動前進，途中瞭望員會回報發現的島嶼與地標。</li>
          <li>抵達港口完成任務、回答問題，累積經驗、升級船長，並收集圖鑑。</li>
        </ol>
        <p className="meta">進度會自動存在這台裝置的瀏覽器裡。</p>
      </section>
    </main>
  );
}

function ScenarioCard({ scenario: s }: { scenario: Scenario }) {
  const content = contentResult.content!;
  const saves = useGame((st) => st.saves);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = saves.find((x) => x.scenarioId === s.id);
  const home = content.ports.find((p) => p.id === s.home_port);

  // 引擎程式碼與內容索引在第一次出航時才載入
  const run = async (mode: 'new' | 'continue') => {
    setBusy(true);
    const { ensureWorld } = await import('./bootstrap');
    await ensureWorld();
    const st = useGame.getState();
    if (mode === 'new') await st.startNew(s.id);
    else await st.continueGame(s.id);
    setBusy(false);
  };

  return (
    <article className="scenario-card">
      <h2>
        {s.name}
        {s.recommended && <span className="badge">入門推薦</span>}
      </h2>
      <div className="meta">
        {s.culture} · {s.era} · 約 {s.estimated_hours} 小時
      </div>
      <p>{s.tagline}</p>
      <div className="meta">
        家鄉：{home?.name}（{home?.name_en}）
      </div>
      <div className="meta">
        學習領域：{s.domains.map((d) => LEARNING_DOMAIN_LABELS[d]).join('、')}
      </div>
      <ol className="chapters">
        {s.chapters.map((c) => (
          <li key={c.index}>
            {c.title}
            <span className="meta">（Tier {c.tier}）</span>
          </li>
        ))}
      </ol>
      <div className="row">
        {save ? (
          <>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => run('continue')}
            >
              繼續航行
            </button>
            {confirmNew ? (
              <button type="button" className="danger" disabled={busy} onClick={() => run('new')}>
                確定重新開始？
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirmNew(true)}>
                重新開始
              </button>
            )}
          </>
        ) : (
          <button type="button" className="primary" disabled={busy} onClick={() => run('new')}>
            {busy ? '準備中…' : '出航'}
          </button>
        )}
      </div>
      {save && (
        <div className="meta">上次遊玩：{new Date(save.updatedAt).toLocaleString('zh-TW')}</div>
      )}
    </article>
  );
}
