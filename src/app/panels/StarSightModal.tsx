import { useEffect, useRef, useState } from 'react';
import {
  DEG_PER_ZHI,
  JIAO_PER_ZHI,
  latitudeFromZhi,
  polarisZhi,
  type SightingResult,
} from '@/game/navigation';
import { useGame } from '../store';

const W = 480;
const H = 300;
const HORIZON = 256;
/** 畫面上一指的高度（像素） */
const PX_PER_ZHI = 13;
const POLARIS_X = 300;

function zhiText(zhi: number) {
  const whole = Math.floor(zhi + 1e-6);
  const jiao = Math.round((zhi - whole) * JIAO_PER_ZHI);
  return jiao ? `${whole} 指 ${jiao} 角` : `${whole} 指`;
}

/**
 * 牽星術小遊戲：拖動牽星板的高度，讓下緣貼著海平面、上緣對準北辰星（北極星）。
 * 北極星的高度約等於緯度，量出幾指就能算出船在北緯幾度。
 */
export function StarSightModal() {
  const game = useGame((s) => s.game)!;
  const starLesson = useGame((s) => s.world?.scenarios.get(game.scenarioId)?.star_lesson);
  const close = () => useGame.getState().openStargazing(false);
  const sight = useGame((s) => s.sightStars);
  const [zhi, setZhi] = useState(8);
  const [result, setResult] = useState<SightingResult | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const zhiRef = useRef(zhi);
  useEffect(() => {
    zhiRef.current = zhi;
  }, [zhi]);

  const trueZhi = polarisZhi(game.ship.position[1]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * W,
      y: Math.random() * (HORIZON - 10),
      r: Math.random() < 0.2 ? 1.4 : 0.8,
    }));
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      // 船在浪上搖晃：海平面與星空一起微微上下
      const roll = Math.sin(t * 1.7) * 2.2;
      const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
      sky.addColorStop(0, '#050b1f');
      sky.addColorStop(1, '#16284a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,251,232,${0.5 + 0.4 * Math.sin(t * 2 + s.x)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y + roll, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      const py = HORIZON - trueZhi * PX_PER_ZHI + roll;
      // 北斗七星：斗口兩顆星（天樞、天璇）的連線延長指向北極星
      // 天樞（dipper[0]）與天璇（dipper[1]）在同一條直線上指向北極星
      const dipper = [
        [POLARIS_X + 42, py + 60],
        [POLARIS_X + 56, py + 80],
        [POLARIS_X + 90, py + 72],
        [POLARIS_X + 78, py + 50],
        [POLARIS_X + 100, py + 36],
        [POLARIS_X + 124, py + 30],
        [POLARIS_X + 146, py + 38],
      ];
      ctx.strokeStyle = 'rgba(160,190,230,0.35)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(dipper[1][0], dipper[1][1]);
      ctx.lineTo(POLARIS_X, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(200,215,240,0.6)';
      ctx.beginPath();
      [0, 1, 2, 3, 0].forEach((i, k) =>
        k ? ctx.lineTo(dipper[i][0], dipper[i][1]) : ctx.moveTo(dipper[i][0], dipper[i][1]),
      );
      ctx.moveTo(dipper[3][0], dipper[3][1]);
      for (const i of [4, 5, 6]) ctx.lineTo(dipper[i][0], dipper[i][1]);
      ctx.stroke();
      ctx.fillStyle = '#fffbe8';
      for (const [x, y] of dipper) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 北辰星（北極星）
      ctx.fillStyle = '#fff6c8';
      ctx.shadowColor = '#fff6c8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(POLARIS_X, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '12px "Noto Sans TC", sans-serif';
      ctx.fillText('北辰星（北極星）', POLARIS_X + 8, py - 6);
      ctx.fillText('北斗七星', POLARIS_X + 96, py + 100);
      // 海
      ctx.fillStyle = '#0d1d33';
      ctx.fillRect(0, HORIZON + roll, W, H);
      ctx.strokeStyle = 'rgba(180,200,230,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, HORIZON + roll);
      ctx.lineTo(W, HORIZON + roll);
      ctx.stroke();
      // 牽星板：握在手上，下緣貼齊海平面（手也會晃一點）
      const hand = Math.sin(t * 2.3 + 1) * 1.6;
      const top = HORIZON - zhiRef.current * PX_PER_ZHI + hand;
      const bx = POLARIS_X - 58;
      ctx.fillStyle = '#b07a3f';
      ctx.fillRect(bx, top, 30, HORIZON + hand - top);
      ctx.strokeStyle = '#5e3c1c';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, top, 30, HORIZON + hand - top);
      for (let k = 1; k < zhiRef.current; k++) {
        const y = HORIZON + hand - k * PX_PER_ZHI;
        ctx.beginPath();
        ctx.moveTo(bx, y);
        ctx.lineTo(bx + (k % 5 === 0 ? 14 : 7), y);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // 板子上緣的瞄準線
      ctx.strokeStyle = 'rgba(242,196,107,0.9)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, top);
      ctx.lineTo(POLARIS_X + 40, top);
      ctx.stroke();
      ctx.setLineDash([]);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [trueZhi]);

  return (
    <div className="modal-backdrop">
      <section className="modal star-modal" role="dialog" aria-modal="true" aria-label="牽星術">
        <h2>牽星術：量北辰星的高度</h2>
        <canvas ref={ref} width={W} height={H} className="star-canvas" />
        {!result ? (
          <>
            <p className="meta">
              牽星板的下緣貼著海平面，調整高度，讓上緣的瞄準線剛好碰到北辰星（北極星）。
              找不到北極星的話，把北斗七星斗口兩顆星連起來延長，就會指到它。
            </p>
            <label className="zhi-slider">
              <span>
                牽星板：<strong>{zhiText(zhi)}</strong>（約 {latitudeFromZhi(zhi).toFixed(1)}°）
              </span>
              <input
                type="range"
                min={1}
                max={17}
                step={1 / JIAO_PER_ZHI}
                value={zhi}
                onChange={(e) => setZhi(Number(e.target.value))}
                aria-label="牽星板的指數"
              />
            </label>
            <div className="row end">
              <button type="button" onClick={close}>
                不量了
              </button>
              <button type="button" className="primary" onClick={() => setResult(sight(zhi))}>
                量好了
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {result.quality === 'good' && '量得很準！'}
              {result.quality === 'ok' && '差一點點，但還算可以。'}
              {result.quality === 'miss' && '板子的上緣沒有對準北辰星，這次定位失敗了。'}
              你量到 {zhiText(zhi)}，換算是北緯約 {result.latitude.toFixed(1)}°
              {result.quality !== 'miss' && '，位置誤差變小了'}。
            </p>
            <p className="lesson">
              <strong>地理小教室：</strong>
              在北半球，北極星離海平面的高度（仰角）約等於所在地的緯度。
              {starLesson ??
                `鄭和船隊用十二塊大小不同的牽星板量星高，以「指」為單位，一指約 ${DEG_PER_ZHI}°。`}
              這個方法只能量出南北位置（緯度），東西位置（經度）還是要靠航位推算。
            </p>
            <div className="row end">
              <button type="button" className="primary" onClick={close}>
                繼續航行
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
