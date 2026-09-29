import { LEARNING_DOMAIN_LABELS } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { availableQuests, portNameKnown } from '@/game/state';
import { useGame } from '../store';

export function PortPanel({ portId }: { portId: string }) {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const selectPort = useGame((s) => s.selectPort);
  const beginPlanning = useGame((s) => s.beginPlanning);
  const accept = useGame((s) => s.accept);
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
          <button type="button" className="primary wide" onClick={beginPlanning}>
            規劃航線
          </button>
        </>
      )}
    </aside>
  );
}
