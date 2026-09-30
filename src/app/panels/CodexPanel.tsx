import { useEffect, useMemo, useRef } from 'react';
import { LEARNING_DOMAIN_LABELS, type CodexEntry } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { sharedProgress, useGame } from '../store';
import { CATEGORY_LABELS } from '../labels';

export function CodexPanel() {
  const world = useGame((s) => s.world)!;
  const discovered = useGame((s) => s.game!.discovered);
  const focus = useGame((s) => s.codexFocus);
  const openPanel = useGame((s) => s.openPanel);
  const showOnMap = useGame((s) => s.showOnMap);
  const rumors = useGame((s) => s.game!.rumors);
  const saves = useGame((s) => s.saves);
  const scenarioId = useGame((s) => s.game!.scenarioId);
  const shared = useMemo(
    () => sharedProgress(world, saves, scenarioId).discovered,
    [world, saves, scenarioId],
  );
  const focusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center' });
  }, [focus]);

  const entries = world.content.codex;
  const found = entries.filter((e) => discovered.includes(e.id)).length;
  const fromOthers = entries.filter((e) => !discovered.includes(e.id) && shared.has(e.id)).length;
  const byCategory = Object.keys(CATEGORY_LABELS)
    .map((cat) => ({
      cat: cat as CodexEntry['category'],
      items: entries.filter((e) => e.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="modal-backdrop">
      <section className="modal sheet" role="dialog" aria-modal="true" aria-label="圖鑑">
        <header className="sheet-head">
          <h2>
            圖鑑{' '}
            <span className="meta">
              {found} / {entries.length}
              {fromOthers > 0 && `（其他劇本另外發現 ${fromOthers} 張）`}
            </span>
          </h2>
          <button type="button" className="close" aria-label="關閉" onClick={() => openPanel(null)}>
            ×
          </button>
        </header>
        {byCategory.map(({ cat, items }) => (
          <div key={cat}>
            <h3>{CATEGORY_LABELS[cat]}</h3>
            <div className="codex-grid">
              {items.map((e) => {
                const own = discovered.includes(e.id);
                const elsewhere = own ? undefined : shared.get(e.id);
                const known = own || !!elsewhere;
                return (
                  <article
                    key={e.id}
                    ref={e.id === focus ? focusRef : undefined}
                    className={`codex-card ${known ? '' : 'locked'} ${e.id === focus ? 'focus' : ''} ${e.category === 'legend' ? 'legend' : ''}`}
                  >
                    {known ? (
                      <>
                        <h4>
                          {e.name} <span className="en">{e.name_en}</span>
                        </h4>
                        <p>{e.body}</p>
                        {e.science_note && (
                          <p className="science">
                            <strong>科學對照：</strong>
                            {e.science_note}
                          </p>
                        )}
                        {e.location && (
                          <div className="meta codex-where">
                            📍 {formatLonLat(e.location)}{' '}
                            <button
                              type="button"
                              className="link"
                              onClick={() => showOnMap(e.location!)}
                            >
                              在海圖上看
                            </button>
                          </div>
                        )}
                        <div className="meta">
                          {e.domains.map((d) => LEARNING_DOMAIN_LABELS[d]).join('、')}
                        </div>
                        <div className="meta source">資料來源：{e.source}</div>
                        {elsewhere && (
                          <div className="meta elsewhere">📖 在「{elsewhere}」劇本發現</div>
                        )}
                      </>
                    ) : (
                      <>
                        <h4>？？？</h4>
                        {e.rumor && rumors.includes(e.id) ? (
                          <p className="meta">聽過的傳聞：「{e.rumor.text}」——還沒找到</p>
                        ) : (
                          <p className="meta">尚未發現</p>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
