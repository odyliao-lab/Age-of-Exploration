import { useEffect, useRef } from 'react';
import { LEARNING_DOMAIN_LABELS, type Quest } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { drawPerson, type PersonLook } from '@/town/art';
import { BUILDING_NAMES, type BuildingKind, type Culture } from '@/town/layout';
import {
  PRAY_COST,
  RIVAL_NAME,
  availableCrew,
  availableQuests,
  cargoCapacity,
  familiarRoutes,
  gameDate,
  cargoUsed,
  crewSlots,
  marketQuotes,
  mods,
  reportReward,
  rumorsAt,
  shipyardOffers,
  upgradeOffers,
  myShip,
  unreportedFinds,
} from '@/game/state';
import { PROFESSIONS } from '@/game/progression';
import { repairCost, resupplyCost } from '@/game/ship';
import { distanceKm } from '@/geo/geo';
import { stormRiskAt, windAt } from '@/game/environment';
import { ConditionBars } from '../panels/Condition';
import { useGame } from '../store';

interface Npc {
  name: string;
  look: PersonLook;
  greeting: string;
}

const NPCS: Record<BuildingKind, (c: Culture) => Npc> = {
  office: (c) => ({
    name: c === 'nanyang' ? '宮廷書記官' : '港口官員',
    look: { skin: '#e0b18a', coat: '#34507e', hat: '#2b2118', hair: '#2b2118' },
    greeting: '歡迎。這是本港的概況，還有需要人手的差事。',
  }),
  academy: () => ({
    name: '學者',
    look: { skin: '#f3d2b3', coat: '#7a7a6a', hat: '#2b2118', hair: '#5a5a5a' },
    greeting: '讀萬卷書，行萬里路。想挑戰看看你對海洋與地理的了解嗎？',
  }),
  temple: (c) => ({
    name: c === 'nanyang' ? '廟祝' : '天妃宮廟公',
    look: { skin: '#c68f63', coat: '#e0b94a', hat: null, hair: '#e8e8e8' },
    greeting:
      c === 'nanyang'
        ? '遠來的船長，願神明保佑你一路平安。'
        : '天妃娘娘（媽祖）是討海人的守護神。出海前上炷香，求個平安吧。',
  }),
  tavern: (c) => ({
    name: c === 'nanyang' ? '茶棚老闆' : '酒館老闆娘',
    look: { skin: '#e0b18a', coat: '#b5482b', hat: null, hair: '#2b2118' },
    greeting: '坐下來歇歇腳吧！這裡什麼消息都聽得到，也有人在找船上的差事。',
  }),
  market: () => ({
    name: '商人',
    look: { skin: '#c68f63', coat: '#c79a3a', hat: '#c9a86a', hair: '#2b2118' },
    greeting: '本地的特產最便宜，外地的貨我都收。記住哪裡產什麼，就能賺大錢！',
  }),
  shipyard: () => ({
    name: '船匠',
    look: { skin: '#8d5a3b', coat: '#6b3f1f', hat: null, hair: '#1c1410' },
    greeting: '船體有傷就早點修。想換更大的船，也來找我。',
  }),
  dock: () => ({
    name: '碼頭工頭',
    look: { skin: '#e0b18a', coat: '#4a6b7a', hat: '#c9a86a', hair: '#2b2118' },
    greeting: '淡水和糧食補足了嗎？海上可沒地方買。',
  }),
};

/** 像素人物頭像：把 16×16 的人物放大 */
function Portrait({ look }: { look: PersonLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, 16, 16);
    drawPerson(ctx, 0, 0, 'down', 0, look);
  }, [look]);
  return <canvas ref={ref} width={16} height={16} className="portrait" aria-hidden="true" />;
}

export function BuildingPanel({ kind, culture }: { kind: BuildingKind; culture: Culture }) {
  const leave = useGame((s) => s.leaveBuilding);
  const npc = NPCS[kind](culture);
  const title = BUILDING_NAMES[culture][kind];
  return (
    <div className="modal-backdrop building-backdrop">
      <section className="modal building-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="building-head">
          <Portrait look={npc.look} />
          <div>
            <h2>{title}</h2>
            <div className="meta">{npc.name}</div>
            <p className="speech">「{npc.greeting}」</p>
          </div>
          <button type="button" className="close" aria-label="離開" onClick={leave}>
            ×
          </button>
        </header>
        <div className="building-body">
          {kind === 'office' && <Office />}
          {kind === 'academy' && <Academy />}
          {kind === 'temple' && <Temple />}
          {kind === 'tavern' && <Tavern />}
          {kind === 'market' && <Market />}
          {kind === 'shipyard' && <Shipyard />}
          {kind === 'dock' && <Dock />}
        </div>
        <div className="row end">
          <button type="button" onClick={leave}>
            離開
          </button>
        </div>
      </section>
    </div>
  );
}

function QuestList({ quests }: { quests: Quest[] }) {
  const accept = useGame((s) => s.accept);
  const leave = useGame((s) => s.leaveBuilding);
  if (!quests.length) return <p className="meta">目前沒有新的差事。</p>;
  return (
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
          <button
            type="button"
            className="primary"
            onClick={() => {
              leave();
              accept(q.id);
            }}
          >
            接下
          </button>
        </li>
      ))}
    </ul>
  );
}

function usePort() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const port = world.ports.get(game.dockedAt!)!;
  return { world, game, port };
}

function Office() {
  const { world, game, port } = usePort();
  const openPanel = useGame((s) => s.openPanel);
  const scenario = world.scenarios.get(game.scenarioId)!;
  const region = world.regions.get(port.region);
  const quests = availableQuests(world, game, port.id).filter((q) => q.kind !== 'academy');
  return (
    <>
      <h3>
        {port.name} <span className="en">{port.name_en}</span>
      </h3>
      {port.historical_names.length > 0 && (
        <div className="meta">舊稱：{port.historical_names.join('、')}</div>
      )}
      <div className="meta">
        {port.country}（{port.country_en}）· {region?.name}
        {scenario.region_tiers[port.region] !== undefined &&
          ` · Tier ${scenario.region_tiers[port.region]}`}
      </div>
      <div className="meta">{formatLonLat(port.location, 2)}</div>
      {port.climate && <div className="meta">氣候：{port.climate}</div>}
      {port.blurb && <p>{port.blurb}</p>}
      <div className="meta">
        特產：
        {port.goods.map((g, i) => (
          <span key={g}>
            {i > 0 && '、'}
            <button type="button" className="link" onClick={() => openPanel('codex', g)}>
              {world.codex.get(g)?.name}
            </button>
          </span>
        ))}
      </div>
      <h3>差事</h3>
      <QuestList quests={quests} />
    </>
  );
}

function Academy() {
  const { world, game, port } = usePort();
  const report = useGame((s) => s.report);
  const quests = availableQuests(world, game, port.id).filter((q) => q.kind === 'academy');
  const finds = unreportedFinds(world, game);
  return (
    <>
      <h3>回報發現</h3>
      {finds.length === 0 ? (
        <p className="meta">依酒館的傳聞找到新地方後，回來告訴學者，可以得到賞金與名聲。</p>
      ) : (
        <>
          <ul className="reward-list">
            {finds.map((c) => (
              <li key={c.id}>
                {c.name}：{reportReward(world, c).gold} 金幣、名聲 +
                {reportReward(world, c).reputation}
              </li>
            ))}
          </ul>
          <button type="button" className="primary" onClick={report}>
            📜 回報 {finds.length} 項發現
          </button>
        </>
      )}
      <MonsoonCalendar />
      <h3>學者的挑戰</h3>
      <p className="meta">學者的挑戰都是選擇性的；答錯的題目會在航海日誌裡安排複習。</p>
      <QuestList quests={quests} />
    </>
  );
}

const MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

/** 季風月曆：這一帶全年各月的風向、風力與風暴季，讓玩家自己規劃出航時機 */
function MonsoonCalendar() {
  const { game, port } = usePort();
  const now = gameDate(game).month;
  const months = MONTHS.map((label, i) => {
    const m = i + 1;
    return { m, label, wind: windAt(port.location, m), storm: stormRiskAt(port.location, m) };
  });
  return (
    <>
      <h3>這一帶的季風月曆</h3>
      <p className="meta">
        箭頭是風吹去的方向，越粗風越強。順著風出航最快；🌀
        是風暴好發的月份。學者說：「懂得等風，就懂了一半的航海。」
      </p>
      <ol className="monsoon-cal">
        {months.map(({ m, label, wind, storm }) => (
          <li key={m} className={m === now ? 'now' : undefined}>
            <span className="mon">{label}月</span>
            {wind.from.includes('不定') ? (
              <span className="arrow" aria-hidden="true">
                〜
              </span>
            ) : (
              <span
                className="arrow"
                style={{
                  transform: `rotate(${wind.toward}deg)`,
                  fontWeight: wind.strength > 0.6 ? 900 : 400,
                  opacity: 0.45 + wind.strength * 0.55,
                }}
                aria-hidden="true"
              >
                ↑
              </span>
            )}
            <span className="wind">{wind.strength < 0.15 ? '無風' : `${wind.from}風`}</span>
            {storm.kind !== 'none' && (
              <span className="storm" title={storm.name}>
                🌀
              </span>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function Temple() {
  const { game } = usePort();
  const pray = useGame((s) => s.pray);
  const full = game.condition.morale >= 100;
  return (
    <>
      <ConditionBars game={game} compact />
      <button type="button" disabled={full || game.gold < PRAY_COST} onClick={pray}>
        🙏 上香祈福（{PRAY_COST} 金幣，船員士氣回升）
      </button>
      {full && <p className="meta">船員士氣正旺，不需要祈福。</p>}
      <p className="lesson">
        <strong>地理小教室：</strong>
        媽祖信仰起源於福建湄洲島，隨著閩南人航海與移民傳到台灣、琉球與東南亞。鄭和出使前後都曾祭拜天妃，並在長樂立碑記錄。
      </p>
    </>
  );
}

function Tavern() {
  const { world, game, port } = usePort();
  const hearRumor = useGame((s) => s.hearRumor);
  const hire = useGame((s) => s.hire);
  const rumors = rumorsAt(world, game, port.id);
  const recruits = availableCrew(world, game);
  const slotsFull = game.crew.length >= crewSlots(game);
  // 每天聽到的閒聊不同
  const talk = port.gossip.length ? port.gossip[Math.floor(game.day) % port.gossip.length] : null;
  return (
    <>
      {talk && (
        <p className="gossip">
          <span className="meta">隔壁桌的酒客：</span>「{talk}」
        </p>
      )}
      <h3>傳聞</h3>
      {rumors.length === 0 && <p className="meta">今天沒聽到什麼新鮮事。</p>}
      {rumors.map((c) => (
        <article key={c.id} className="rumor-card">
          <div className="meta">{c.rumor!.from}：</div>
          <p>「{c.rumor!.text}」</p>
          <button type="button" onClick={() => hearRumor(c.id)}>
            📝 記在航海日誌
          </button>
        </article>
      ))}
      <RivalStatus />
      <h3>找工作的人</h3>
      {recruits.length === 0 && <p className="meta">目前沒有人在找船上的差事。</p>}
      {slotsFull && recruits.length > 0 && (
        <p className="meta">船員位子已滿，換大船或讓船員回家鄉後才能招募。</p>
      )}
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
  );
}

function RivalStatus() {
  const { world, game } = usePort();
  const r = game.rival;
  if (!r.target && r.wins + r.losses === 0) return null;
  const c = r.target ? world.codex.get(r.target) : null;
  const left = Math.max(0, Math.ceil(r.due - game.day));
  return (
    <>
      <h3>對手船長{RIVAL_NAME}</h3>
      {c ? (
        <p>
          他也在找{c.rumor?.from ?? '傳聞'}說的那個地方，大約還有 <strong>{left}</strong>{' '}
          天就會回報給學者。搶先一步吧！
        </p>
      ) : (
        <p className="meta">他出海去了，過幾天可能又會來找你比賽。</p>
      )}
      <div className="meta">
        戰績：你贏 {r.wins} 次、他贏 {r.losses} 次
      </div>
    </>
  );
}

function Market() {
  const { world, game, port } = usePort();
  const buyGood = useGame((s) => s.buyGood);
  const sellGood = useGame((s) => s.sellGood);
  const quotes = marketQuotes(world, game, port.id);
  const cap = cargoCapacity(game);
  const used = cargoUsed(game.cargo);
  // 本地特產在前，再來是船上有的貨，最後是其他收購行情
  const order = (g: string) => (port.goods.includes(g) ? 0 : game.cargo[g] ? 1 : 2);
  const rows = [...quotes].sort((a, b) => order(a.good) - order(b.good));
  const origin = (g: string) => {
    const producers = world.content.ports.filter((p) => p.goods.includes(g));
    if (!producers.length) return '—';
    const nearest = producers.reduce((a, b) =>
      distanceKm(a.location, port.location) <= distanceKm(b.location, port.location) ? a : b,
    );
    return nearest.name;
  };
  return (
    <>
      <div className="cargo-bar" aria-label={`貨艙 ${used}/${cap}`}>
        <div className="cargo-fill" style={{ width: `${(used / cap) * 100}%` }} />
        <span>
          貨艙 {used} / {cap}・💰 {game.gold}
        </span>
      </div>
      <table className="market">
        <thead>
          <tr>
            <th>貨物</th>
            <th>產地</th>
            <th>買進</th>
            <th>賣出</th>
            <th>船上</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const c = world.codex.get(q.good)!;
            const lot = game.cargo[q.good];
            const local = port.goods.includes(q.good);
            return (
              <tr key={q.good} className={local ? 'local' : ''}>
                <td>
                  {c.name}
                  {local && <span className="tag">本地特產</span>}
                </td>
                <td className="meta">{local ? '本地' : origin(q.good)}</td>
                <td>{q.buy ?? '—'}</td>
                <td>{q.sell}</td>
                <td>
                  {lot ? (
                    <>
                      {lot.qty}
                      <span className="meta">（均價 {Math.round(lot.cost / lot.qty)}）</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <div className="trade-btns">
                    {q.buy !== null && (
                      <>
                        <button
                          type="button"
                          disabled={used >= cap || game.gold < q.buy}
                          onClick={() => buyGood(q.good, 1)}
                        >
                          買 1
                        </button>
                        <button
                          type="button"
                          disabled={used >= cap || game.gold < q.buy}
                          onClick={() => buyGood(q.good, 5)}
                        >
                          買 5
                        </button>
                      </>
                    )}
                    {lot && (
                      <>
                        <button type="button" onClick={() => sellGood(q.good, 1)}>
                          賣 1
                        </button>
                        <button type="button" onClick={() => sellGood(q.good, lot.qty)}>
                          全賣
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="meta">
        產地的貨最便宜；離產地越遠，收購價越高。買得越多價格越漲、賣得越多價格越跌，過幾天會慢慢恢復。
      </p>
    </>
  );
}

function Shipyard() {
  const { world, game } = usePort();
  const repair = useGame((s) => s.repair);
  const buy = useGame((s) => s.buy);
  const price = mods(world, game).price;
  const offers = shipyardOffers(world, game);
  const upgrades = upgradeOffers(world, game);
  const upgradeShip = useGame((s) => s.upgradeShip);
  const cost = repairCost(game.condition, price);
  return (
    <>
      <ConditionBars game={game} compact />
      <button type="button" disabled={cost === 0 || game.gold === 0} onClick={repair}>
        🔨 修船（{cost} 金幣）
      </button>
      <h3>改裝這艘船</h3>
      {upgrades.map((o) => (
        <article key={o.upgrade.id} className="crew-card">
          <h4>
            {o.upgrade.name} <span className="tag">{o.upgrade.effect}</span>
          </h4>
          <p>{o.upgrade.lore}</p>
          <button type="button" disabled={!!o.reason} onClick={() => upgradeShip(o.upgrade.id)}>
            {o.done ? '✅ 已經改裝' : (o.reason ?? `改裝（${o.cost} 金幣）`)}
          </button>
        </article>
      ))}
      <p className="meta">改裝裝在目前這艘船上；換新船時，改裝會留給舊船。</p>
      {offers.length > 0 && <h3>新船</h3>}
      {offers.map((o) => (
        <article key={o.def.id} className="crew-card">
          <h4>
            {o.def.name} <span className="en">{o.def.name_en}</span>
          </h4>
          <div className="meta">
            補給 {o.def.supplyDays} 天・貨艙 {o.def.cargo}・航速 ×{o.def.speed}・船體 ×
            {o.def.sturdiness}・船員 {o.def.crewSlots} 人
          </div>
          <p>{o.def.lore}</p>
          <button type="button" disabled={!!o.reason} onClick={() => buy(o.def.id)}>
            {o.reason ?? `購買（舊船折抵後 ${o.cost} 金幣）`}
          </button>
        </article>
      ))}
      <p className="meta">船身與船帆的塗裝可以在「船長 → 外觀」選擇。</p>
    </>
  );
}

function Dock() {
  const { world, game } = usePort();
  const resupply = useGame((s) => s.resupply);
  const depart = useGame((s) => s.depart);
  const autoSail = useGame((s) => s.autoSail);
  const routes = familiarRoutes(world, game, game.dockedAt!);
  const price = mods(world, game).price;
  const cost = resupplyCost(game.condition, myShip(game), price);
  return (
    <>
      <ConditionBars game={game} />
      <div className="row">
        <button type="button" disabled={cost === 0 || game.gold === 0} onClick={resupply}>
          🛢️ 補給淡水與糧食（{cost} 金幣）
        </button>
      </div>
      <p className="meta">淡水每天份 1 金幣、糧食每天份 2 金幣；錢不夠時會先補淡水。</p>
      <button type="button" className="primary wide" onClick={depart}>
        ⛵ 出港（親手掌舵）
      </button>
      <h3>熟悉航線</h3>
      {routes.length === 0 ? (
        <p className="meta">親手開船到過的港口，之後可以從這裡沿著同一條航線自動航行。</p>
      ) : (
        <div className="route-list">
          {routes.map((r) => (
            <button key={r.to} type="button" onClick={() => autoSail(r.to)}>
              🧭 {world.ports.get(r.to)?.name}（約 {r.km} 公里、{r.days} 天）
            </button>
          ))}
        </div>
      )}
    </>
  );
}
