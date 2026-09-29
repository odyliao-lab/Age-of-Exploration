import { LEARNING_DOMAIN_LABELS } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import {
  availableCrew,
  availableQuests,
  crewSlots,
  mods,
  portNameKnown,
  shipyardOffers,
} from '@/game/state';
import { PROFESSIONS } from '@/game/progression';
import { repairCost, resupplyCost, shipType } from '@/game/ship';
import { ConditionBars } from './Condition';
import { useGame } from '../store';

export function PortPanel({ portId }: { portId: string }) {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const selectPort = useGame((s) => s.selectPort);
  const beginPlanning = useGame((s) => s.beginPlanning);
  const accept = useGame((s) => s.accept);
  const resupply = useGame((s) => s.resupply);
  const repair = useGame((s) => s.repair);
  const hire = useGame((s) => s.hire);
  const buy = useGame((s) => s.buy);
  const openPanel = useGame((s) => s.openPanel);

  const port = world.ports.get(portId);
  if (!port) return null;
  const scenario = world.scenarios.get(game.scenarioId)!;
  const known = portNameKnown(world, game, portId);
  const docked = game.dockedAt === portId;
  const region = world.regions.get(port.region);
  const tier = scenario.region_tiers[port.region];
  const goods = port.goods.map((g) => world.codex.get(g)).filter((c) => c !== undefined);
  const quests = docked ? availableQuests(world, game, portId) : [];
  const price = mods(world, game).price;
  const recruits = docked ? availableCrew(world, game) : [];
  const offers = docked ? shipyardOffers(world, game) : [];
  const slotsFull = game.crew.length >= crewSlots(game);

  if (!known) {
    return (
      <aside className="port-panel" aria-label="未知港口">
        <button type="button" className="close" aria-label="關閉" onClick={() => selectPort(null)}>
          ×
        </button>
        <h2>未知的港口</h2>
        <p>這是任務的目的地。依照任務提示確認位置，抵達後就會知道它的名字。</p>
        <div className="meta">{formatLonLat(port.location, 0)} 附近</div>
      </aside>
    );
  }

  return (
    <aside className="port-panel" aria-label={`${port.name} 港口資訊`}>
      <button type="button" className="close" aria-label="關閉" onClick={() => selectPort(null)}>
        ×
      </button>
      <h2>
        {port.name}
        <span className="en">{port.name_en}</span>
      </h2>
      {port.historical_names.length > 0 && (
        <div className="meta">舊稱：{port.historical_names.join('、')}</div>
      )}
      <div className="meta">
        {port.country}（{port.country_en}）· {region?.name}
        {tier !== undefined && ` · Tier ${tier}`}
      </div>
      <div className="meta">{formatLonLat(port.location, 2)}</div>
      {port.climate && <div className="meta">氣候：{port.climate}</div>}
      {port.blurb && <p>{port.blurb}</p>}
      {goods.length > 0 && (
        <div className="meta">
          特產：
          {goods.map((g, i) => (
            <span key={g.id}>
              {i > 0 && '、'}
              <button type="button" className="link" onClick={() => openPanel('codex', g.id)}>
                {g.name}
              </button>
            </span>
          ))}
        </div>
      )}
      {port.id === scenario.home_port && <div className="home-tag">你的家鄉港口</div>}

      {docked && (
        <>
          <h3>任務板</h3>
          {quests.length === 0 ? (
            <p className="meta">目前沒有新任務。</p>
          ) : (
            <ul className="quest-list">
              {quests.map((q) => (
                <li key={q.id}>
                  <strong>{q.title}</strong>
                  <ul className="objectives">
                    {q.objectives.map((o, i) => (
                      <li key={i}>
                        <span className="domain">{LEARNING_DOMAIN_LABELS[o.domain]}</span>
                        {o.text}
                      </li>
                    ))}
                  </ul>
                  <div className="meta">
                    獎勵：經驗 {q.reward.xp}、金幣 {q.reward.gold}
                  </div>
                  <button type="button" className="primary" onClick={() => accept(q.id)}>
                    接下任務
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3>船塢與市集</h3>
          <ConditionBars game={game} />
          <div className="row">
            <button
              type="button"
              disabled={
                resupplyCost(game.condition, shipType(game.shipTypeId), price) === 0 ||
                game.gold === 0
              }
              onClick={resupply}
            >
              補給（{resupplyCost(game.condition, shipType(game.shipTypeId), price)} 金幣）
            </button>
            <button
              type="button"
              disabled={repairCost(game.condition, price) === 0 || game.gold === 0}
              onClick={repair}
            >
              修船（{repairCost(game.condition, price)} 金幣）
            </button>
          </div>
          <p className="meta">淡水每天份 1 金幣、糧食每天份 2 金幣；錢不夠時會先補淡水。</p>
          {recruits.length > 0 && (
            <>
              <h3>酒館</h3>
              {slotsFull && <p className="meta">船員位子已滿，換大船或讓船員回家鄉後才能招募。</p>}
              {recruits.map((c) => (
                <article key={c.id} className="crew-card">
                  <h4>
                    {c.name} <span className="tag">{PROFESSIONS[c.profession].name}</span>
                  </h4>
                  {c.specialty && <div className="meta">{c.specialty}</div>}
                  <p>{c.bio}</p>
                  <div className="meta">效果：{PROFESSIONS[c.profession].effect}</div>
                  <button
                    type="button"
                    disabled={slotsFull || game.gold < c.hire_cost}
                    onClick={() => hire(c.id)}
                  >
                    招募（{c.hire_cost} 金幣）
                  </button>
                </article>
              ))}
            </>
          )}
          {offers.length > 0 && (
            <>
              <h3>造船廠</h3>
              {offers.map((o) => (
                <article key={o.def.id} className="crew-card">
                  <h4>
                    {o.def.name} <span className="en">{o.def.name_en}</span>
                  </h4>
                  <div className="meta">
                    補給 {o.def.supplyDays} 天・航速 ×{o.def.speed}・船體 ×{o.def.sturdiness}・船員{' '}
                    {o.def.crewSlots} 人
                  </div>
                  <p>{o.def.lore}</p>
                  <button type="button" disabled={!!o.reason} onClick={() => buy(o.def.id)}>
                    {o.reason ?? `購買（舊船折抵後 ${o.cost} 金幣）`}
                  </button>
                </article>
              ))}
            </>
          )}
          <button type="button" className="primary wide" onClick={beginPlanning}>
            規劃航線
          </button>
        </>
      )}
    </aside>
  );
}
