import { lazy, Suspense } from 'react';
import { LEARNING_DOMAIN_LABELS, type ContentBundle } from '@/data/schema';
import { contentResult } from './content';
import { useGame } from './store';

// 海圖（含 PixiJS）按需載入，讓劇本選單不必先下載繪圖引擎
const MapScreen = lazy(() => import('./MapScreen').then((m) => ({ default: m.MapScreen })));

export function App() {
  const screen = useGame((s) => s.screen);

  if (contentResult.error !== null) {
    return (
      <main className="page">
        <h1>內容載入失敗</h1>
        <div className="error">{contentResult.error}</div>
      </main>
    );
  }

  const content = contentResult.content;
  if (screen === 'map') {
    return (
      <Suspense fallback={<main className="page">正在展開海圖…</main>}>
        <MapScreen content={content} />
      </Suspense>
    );
  }
  return <ScenarioMenu content={content} />;
}

function ScenarioMenu({ content }: { content: ContentBundle }) {
  const startScenario = useGame((s) => s.startScenario);

  return (
    <main className="page">
      <h1>Age of Exploration</h1>
      <p className="subtitle">選擇一個劇本，從家鄉港口出發，親手航向世界。</p>

      <section className="scenario-grid">
        {content.scenarios.map((s) => {
          const home = content.ports.find((p) => p.id === s.home_port);
          return (
            <article className="scenario-card" key={s.id}>
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
              <button type="button" className="primary" onClick={() => startScenario(s.id)}>
                出航
              </button>
            </article>
          );
        })}
      </section>

      <p className="stats">
        內容已載入：{content.regions.length} 個海域區、{content.ports.length} 個港口、
        {content.codex.length} 張知識卡、{content.quests.length} 個任務。
      </p>
    </main>
  );
}
