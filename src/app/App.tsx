import { useMemo } from 'react';
import { loadContent } from '@/data/load';
import { LEARNING_DOMAIN_LABELS } from '@/data/schema';

/**
 * M1 骨架：載入並驗證內容，顯示劇本選單。
 * 世界地圖與航行在第一週切片的下一階段加入。
 */
export function App() {
  const result = useMemo(() => {
    try {
      return { content: loadContent(), error: null };
    } catch (e) {
      return { content: null, error: (e as Error).message };
    }
  }, []);

  if (result.error) {
    return (
      <main className="page">
        <h1>內容載入失敗</h1>
        <div className="error">{result.error}</div>
      </main>
    );
  }

  const content = result.content!;

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
