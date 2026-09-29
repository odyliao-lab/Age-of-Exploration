import { useRef } from 'react';
import { compass16 } from '@/geo/geo';
import { knots, normDeg, type SailSetting } from '@/game/sailing';
import { portInReach, rumorInReach, sailingStatus } from '@/game/state';
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
  const dial = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const helm = game.helm!;
  const st = sailingStatus(world, game)!;
  const from = normDeg(st.wind.toward + 180);
  const calm = st.wind.strength < 0.2;
  const nearPort = portInReach(world, game);
  const port = nearPort ? world.ports.get(nearPort) : null;
  const rumorHere = rumorInReach(world, game);
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
      <div className="sea-actions">
        {rumorHere && (
          <button type="button" className="primary" onClick={() => investigate(rumorHere)}>
            🔍 調查這一帶
          </button>
        )}
        {port && (
          <button type="button" className="primary" onClick={() => dock(port.id)}>
            ⚓ 入港：{port.name}
          </button>
        )}
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
