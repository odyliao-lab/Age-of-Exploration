import { PROFESSIONS, UPGRADES } from '@/game/progression';
import { cargoCapacity, crewSlots, myShip } from '@/game/state';
import { useGame } from '../store';
import { ConditionBars } from './Condition';

/** 船隊：船隻與船員（企畫書 9.3、9.4） */
export function FleetPanel() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const openPanel = useGame((s) => s.openPanel);
  const dismiss = useGame((s) => s.dismiss);
  const ship = myShip(game);
  const slots = crewSlots(game);

  return (
    <div className="modal-backdrop">
      <section className="modal sheet" role="dialog" aria-modal="true" aria-label="船隊">
        <header className="sheet-head">
          <h2>船隊</h2>
          <button type="button" className="close" aria-label="關閉" onClick={() => openPanel(null)}>
            ×
          </button>
        </header>

        <article className="ship-card">
          <h3>
            {game.appearance.shipName && `「${game.appearance.shipName}」`}
            {ship.name} <span className="en">{ship.name_en}</span>
          </h3>
          <ul className="ship-stats">
            <li>補給容量：{ship.supplyDays} 天</li>
            <li>貨艙：{cargoCapacity(game)}</li>
            <li>航速：×{Math.round(ship.speed * 100) / 100}</li>
            <li>船體強度：×{Math.round(ship.sturdiness * 100) / 100}</li>
            <li>船員位子：{slots}</li>
          </ul>
          {game.upgrades.length > 0 && (
            <div className="meta">
              改裝：
              {UPGRADES.filter((u) => game.upgrades.includes(u.id))
                .map((u) => u.name)
                .join('、')}
            </div>
          )}
          <p className="lesson">
            <strong>船隻小知識：</strong>
            {ship.lore}
          </p>
          <ConditionBars game={game} />
        </article>

        <h3>
          船員 {game.crew.length} / {slots}
        </h3>
        {game.crew.length === 0 ? (
          <p className="meta">還沒有船員。到各港口的酒館看看，當地人會帶來不同的專長。</p>
        ) : (
          <div className="crew-grid">
            {game.crew.map((id) => {
              const c = world.crew.get(id);
              if (!c) return null;
              return (
                <article key={id} className="crew-card">
                  <h4>
                    {c.name} <span className="tag">{PROFESSIONS[c.profession].name}</span>
                  </h4>
                  <div className="meta">
                    {world.ports.get(c.home_port)?.name}
                    {c.specialty ? ` · ${c.specialty}` : ''}
                  </div>
                  <p>{c.bio}</p>
                  <div className="meta">效果：{PROFESSIONS[c.profession].effect}</div>
                  <button type="button" onClick={() => dismiss(id)}>
                    讓他回家鄉
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
