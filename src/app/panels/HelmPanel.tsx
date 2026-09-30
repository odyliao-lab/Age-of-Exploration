import { useRef } from 'react';
import { compass16 } from '@/geo/geo';
import { knots, normDeg, type SailSetting } from '@/game/sailing';
import {
  approachHint,
  investigateBlocked,
  merchantInReach,
  envoyInReach,
  armadaInReach,
  rivalShipInReach,
  merchantOffer,
  portInReach,
  positionErrorKm,
  rumorInReach,
  sailingStatus,
  coastSightBlocked,
  starSightBlocked,
  fishBlocked,
  fetchWaterBlocked,
  sunSightBlocked,
  rivalOf,
} from '@/game/state';
import { isNight, timeLabel } from '@/game/navigation';
import { useGame } from '../store';
import { ConditionBars } from './Condition';

const R = 66;

/** 方位角 → SVG 座標（北在上） */
function at(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

/** 環形扇區：從 a0 到 a1（順時針） */
function sector(a0: number, a1: number, r0: number, r1: number) {
  const span = normDeg(a1 - a0);
  if (span <= 0) return '';
  const large = span > 180 ? 1 : 0;
  const p0 = at(a0, r1);
  const p1 = at(a0 + span, r1);
  const p2 = at(a0 + span, r0);
  const p3 = at(a0, r0);
  return `M${p0.x},${p0.y} A${r1},${r1} 0 ${large} 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${r0},${r0} 0 ${large} 0 ${p3.x},${p3.y} Z`;
}

const SAIL_LABELS: Record<SailSetting, string> = { 0: '收帆', 1: '半帆', 2: '滿帆' };

/** 親手駕船的操作面板：舵盤、帆、下錨、時間，以及風與船況 */
export function HelmPanel() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const paused = useGame((s) => s.paused);
  const speed = useGame((s) => s.speed);
  const { steer, trimSail, toggleAnchor, togglePause, setSpeed, dock, investigate } =
    useGame.getState();
  const {
    openStargazing,
    openCoastSight,
    greetMerchant,
    sound,
    sellToMerchant,
    greetEnvoy,
    greetArmada,
    hailRival,
    fish,
    fetchWater,
    sightSun,
  } = useGame.getState();
  const dial = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const helm = game.helm!;
  const st = sailingStatus(world, game)!;
  const from = normDeg(st.wind.toward + 180);
  const calm = st.wind.strength < 0.2;
  const nearPort = portInReach(world, game);
  const port = nearPort ? world.ports.get(nearPort) : null;
  const rumorHere = rumorInReach(world, game);
  const approach = approachHint(world, game);
  const approachPort = approach ? world.ports.get(approach.portId) : null;
  const blocked = rumorHere ? investigateBlocked(world, game, rumorHere) : null;
  const merchant = merchantInReach(game);
  const envoy = envoyInReach(game);
  const armada = armadaInReach(game);
  const rivalShip = rivalShipInReach(game);
  const offer = merchant ? merchantOffer(world, game, merchant.id) : null;
  const errKm = Math.round(positionErrorKm(world, game));
  const lat = game.ship.position[1];
  // 誤差換算成緯度的不確定範圍（1° 約 111 公里）
  const latSpread = errKm / 111;
  const ns = lat >= 0 ? '北緯' : '南緯';
  const latText =
    latSpread < 0.15
      ? `${ns} ${Math.abs(lat).toFixed(1)}°`
      : `${ns}約 ${Math.max(0, Math.abs(lat) - latSpread).toFixed(1)}°～${(Math.abs(lat) + latSpread).toFixed(1)}°`;
  const starBlocked = starSightBlocked(game);
  const night = isNight(game.day);
  const coastBlocked = coastSightBlocked(world, game);
  const canFish = !fishBlocked(game);
  const canFetchWater = !fetchWaterBlocked(world, game);
  const canSightSun = !sunSightBlocked(game);
  const kn = knots(st.motion.speed);
  const sailClass =
    st.motion.pointOfSail === '頂風' ? 'bad' : st.motion.pointOfSail === '迎風' ? 'ok' : 'good';

  const aim = (e: React.PointerEvent) => {
    const box = dial.current!.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) < 8) return;
    const deg = normDeg((Math.atan2(dx, -dy) * 180) / Math.PI);
    steer(Math.round(deg / 5) * 5);
  };

  const windArrow = at(st.wind.toward, 30 + 12 * st.wind.strength);
  const windTail = at(st.wind.toward + 180, 22);
  const headTip = at(game.ship.heading, 50);
  const knob = at(helm.course, R);

  return (
    <>
      <div className="sea-dock">
        {blocked && <div className="sea-note">{blocked}</div>}
        {!blocked && approach && approachPort && (
          <div className="sea-note">
            {approachPort.name}的港口入口在{compass16(approach.bearing)}方約{' '}
            {Math.round(approach.km)} 公里，開過去就能入港。
          </div>
        )}
        <div className="sea-actions">
          {rumorHere && (
            <button
              type="button"
              className="primary"
              disabled={!!blocked}
              title={blocked ?? undefined}
              onClick={() => investigate(rumorHere)}
            >
              🔍 調查這一帶
            </button>
          )}
          {merchant && (
            <>
              <button type="button" onClick={() => greetMerchant(merchant.id, 'news')}>
                🤝 向商船打聽消息
              </button>
              <button type="button" onClick={() => greetMerchant(merchant.id, 'supplies')}>
                🛢️ 向商船買補給（20 金幣）
              </button>
              {offer && (
                <button type="button" onClick={() => sellToMerchant(merchant.id)}>
                  💰 把貨賣給開往{offer.port.name}的商船（{offer.total} 金幣）
                </button>
              )}
            </>
          )}
          {rivalShip && (
            <button type="button" onClick={() => hailRival(rivalShip.id)}>
              📣 向{rivalOf(world, game).name}喊話
            </button>
          )}
          {armada && (
            <button type="button" className="primary" onClick={() => greetArmada(armada.id)}>
              🚩 向寶船艦隊致意
            </button>
          )}
          {envoy && (
            <button type="button" className="primary" onClick={() => greetEnvoy(envoy.id)}>
              🎏 向使節船致意
            </button>
          )}
          {!coastBlocked && errKm > 10 && (
            <button type="button" onClick={() => openCoastSight(true)}>
              🔭 看岸形定位
            </button>
          )}
          <button type="button" onClick={sound} title="放下測深錘，量水深、看海底">
            🪢 測深
          </button>
          {canFetchWater && (
            <button type="button" onClick={fetchWater} title="派小艇上岸找淡水（沙漠海岸找不到）">
              💧 上岸取水
            </button>
          )}
          {canFish && (
            <button type="button" onClick={fish} title="撒網捕魚，補一點糧食（每天一次）">
              🐟 撒網
            </button>
          )}
          {canSightSun && (
            <button type="button" onClick={sightSun} title="量正午太陽的高度，推算緯度">
              ☀️ 正午量太陽
            </button>
          )}
          {night && !starBlocked && (
            <button type="button" onClick={() => openStargazing(true)}>
              ✨ 觀星定位（牽星術）
            </button>
          )}
          {port && (
            <button type="button" className="primary" onClick={() => dock(port.id)}>
              ⚓ 入港：{port.name}
            </button>
          )}
        </div>
      </div>
      <section className="helm-panel" aria-label="掌舵">
        <div className="helm-left">
          <div className="seg" role="group" aria-label="帆">
            {([0, 1, 2] as SailSetting[]).map((s) => (
              <button
                key={s}
                type="button"
                className={helm.sail === s && !helm.anchored ? 'active' : ''}
                aria-pressed={helm.sail === s && !helm.anchored}
                onClick={() => trimSail(s)}
              >
                {SAIL_LABELS[s]}
              </button>
            ))}
            <button
              type="button"
              className={helm.anchored ? 'active' : ''}
              aria-pressed={helm.anchored}
              onClick={toggleAnchor}
            >
              ⚓ {helm.anchored ? '起錨' : '下錨'}
            </button>
          </div>
          <div className="helm-readout">
            <span>
              航向 <strong>{compass16(game.ship.heading)}</strong> {Math.round(game.ship.heading)}°
            </span>
            <span>
              航速 <strong>{kn.toFixed(1)}</strong> 節
            </span>
            <span className={`sail-state ${sailClass}`}>
              {helm.anchored
                ? '下錨中'
                : helm.sail === 0
                  ? '帆已收起'
                  : calm
                    ? '幾乎無風'
                    : st.motion.pointOfSail === '頂風'
                      ? '頂風：帆吃不到風！'
                      : `${st.motion.pointOfSail}・帆效率 ${Math.round(st.motion.efficiency * 100)}%`}
            </span>
          </div>
          <div className="helm-nav">
            <span>🕰️ {timeLabel(game.day)}</span>
            <span title="航位推算：沒有定位時，誤差每天累積">
              📍 {latText}
              {errKm > 8 && <span className="meta">（誤差 ±{errKm} 公里）</span>}
            </span>
            {night && starBlocked && <span className="meta">{starBlocked}</span>}
          </div>
          <div className="helm-env">
            <span className="tag">
              {st.wind.name}
              {!calm && `・從${compass16(from)}吹來`}
            </span>
            {st.current && (
              <span className="tag">
                {st.current.name}・流向{compass16(st.current.toward)}
              </span>
            )}
          </div>
          <ConditionBars game={game} compact />
          <div className="row time-row">
            <button type="button" onClick={togglePause}>
              {paused ? '▶ 繼續' : '⏸ 暫停'}
            </button>
            {([1, 2, 4] as const).map((s) => (
              <button
                type="button"
                key={s}
                className={speed === s ? 'active' : ''}
                aria-pressed={speed === s}
                onClick={() => setSpeed(s)}
              >
                ×{s}
              </button>
            ))}
          </div>
        </div>

        <svg
          ref={dial}
          className="helm-dial"
          viewBox="-80 -80 160 160"
          role="slider"
          aria-label="舵盤：拖曳設定航向"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(helm.course)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') steer(helm.course - 5);
            if (e.key === 'ArrowRight') steer(helm.course + 5);
          }}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            aim(e);
          }}
          onPointerMove={(e) => dragging.current && aim(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <circle r="76" className="dial-bg" />
          {!calm && (
            <>
              {/* 順風到橫風：好開 */}
              <path d={sector(from + 75, from - 75, 58, 72)} className="zone good" />
              {/* 迎風：開得動但慢 */}
              <path d={sector(from + st.noGo, from + 75, 58, 72)} className="zone ok" />
              <path d={sector(from - 75, from - st.noGo, 58, 72)} className="zone ok" />
              {/* 頂風區：帆吃不到風 */}
              <path d={sector(from - st.noGo, from + st.noGo, 58, 72)} className="zone bad" />
            </>
          )}
          {['北', '東', '南', '西'].map((t, i) => {
            const p = at(i * 90, 46);
            return (
              <text key={t} x={p.x} y={p.y} className="dial-label">
                {t}
              </text>
            );
          })}
          {/* 風：從哪裡吹向哪裡 */}
          {!calm && (
            <g className="dial-wind">
              <line x1={windTail.x} y1={windTail.y} x2={windArrow.x} y2={windArrow.y} />
              <circle cx={windArrow.x} cy={windArrow.y} r="4" />
            </g>
          )}
          {/* 船頭方向與設定航向 */}
          <line x1="0" y1="0" x2={headTip.x} y2={headTip.y} className="dial-heading" />
          <circle r="5" className="dial-hub" />
          <circle cx={knob.x} cy={knob.y} r="9" className="dial-knob" />
        </svg>
      </section>
    </>
  );
}
