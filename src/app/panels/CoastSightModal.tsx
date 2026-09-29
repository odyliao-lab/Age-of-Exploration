import { useEffect, useMemo, useRef, useState } from 'react';
import { coastChoices, landAt, type CoastChoice } from '@/game/state';
import { compass16, bearingDeg, distanceKm } from '@/geo/geo';
import { useGame } from '../store';

const SIZE = 240;
const GRID = 72;
/** 草圖涵蓋船四周多少度（緯度方向） */
const SPAN_DEG = 1.6;

/**
 * 看岸形辨位：瞭望員把眼前的海岸畫成草圖，玩家判斷船在哪個地方附近。
 * 草圖由真實海岸資料取樣而成，北方在上，船在正中央。
 */
export function CoastSightModal() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const close = () => useGame.getState().openCoastSight(false);
  const sight = useGame((s) => s.sightCoast);
  const [result, setResult] = useState<{ correct: boolean; answer: CoastChoice } | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const pos = game.ship.position;
  // 選項只在打開時決定一次
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const choices = useMemo(() => coastChoices(world, game, Math.random), []);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    const [lon0, lat0] = pos;
    const cos = Math.max(0.2, Math.cos((lat0 * Math.PI) / 180));
    const cell = SIZE / GRID;
    const land: boolean[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const lat = lat0 + SPAN_DEG / 2 - ((r + 0.5) / GRID) * SPAN_DEG;
        const lon = lon0 + (((c + 0.5) / GRID) * SPAN_DEG - SPAN_DEG / 2) / cos;
        land.push(landAt(world, [lon, lat]));
      }
    }
    ctx.fillStyle = '#e9dcc0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!land[r * GRID + c]) continue;
        ctx.fillStyle = '#c9a86a';
        ctx.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5);
      }
    }
    // 海岸線：陸地格旁邊是海的地方描上墨色
    ctx.fillStyle = '#5a3b20';
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!land[r * GRID + c]) continue;
        const edge = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dr, dc]) => {
          const rr = r + dr;
          const cc = c + dc;
          return rr >= 0 && cc >= 0 && rr < GRID && cc < GRID && !land[rr * GRID + cc];
        });
        if (edge) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
    // 船與北方
    ctx.fillStyle = '#b5482b';
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.font = 'bold 13px "Noto Sans TC", sans-serif';
    ctx.fillText('北', SIZE - 20, 18);
    ctx.fillText('↑', SIZE - 19, 32);
  }, [world, pos]);

  return (
    <div className="modal-backdrop">
      <section className="modal coast-modal" role="dialog" aria-modal="true" aria-label="看岸形">
        <h2>看岸形辨位</h2>
        <div className="coast-body">
          <canvas ref={ref} width={SIZE} height={SIZE} className="coast-canvas" />
          <div>
            <p className="meta">
              瞭望員從桅頂畫下四周的海岸（北方在上，紅點是我們的船，範圍約 180 公里見方）。
              比對你記得的地圖，我們在哪裡附近？
            </p>
            {!result ? (
              <div className="coast-choices">
                {choices.map((c) => (
                  <button key={c.id} type="button" onClick={() => setResult(sight(c.id))}>
                    {c.name}附近
                  </button>
                ))}
              </div>
            ) : (
              <>
                <p>
                  {result.correct ? '沒錯！' : '不對喔。'}
                  我們在「{result.answer.name}」的
                  {compass16(bearingDeg(result.answer.location, pos))}方約{' '}
                  {Math.round(distanceKm(result.answer.location, pos))} 公里
                  {result.correct ? '，位置重新確定了。' : '。今天就先靠航位推算吧。'}
                </p>
                <p className="lesson">
                  <strong>地理小教室：</strong>
                  《鄭和航海圖》上畫滿了沿岸的山形、島嶼與港口，航海者靠著比對眼前的海岸與航海圖來判斷位置。
                  記住海岸線的形狀——半島、海灣、海峽——就是認識地理的第一步。
                </p>
                <div className="row end">
                  <button type="button" className="primary" onClick={close}>
                    繼續航行
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {!result && (
          <div className="row end">
            <button type="button" onClick={close}>
              不看了
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
