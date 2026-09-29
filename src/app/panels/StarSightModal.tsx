import { useState } from 'react';
import {
  JIAO_PER_ZHI,
  ZHI_DEG,
  degToJiao,
  estimatedPosition,
  formatZhi,
  jiaoToDeg,
  starTarget,
  type SightResult,
} from '@/game/navigation';
import { formatLonLat } from '@/map/projection';
import { useGame } from '../store';

/** 畫面：每度多少像素、地平線位置 */
const PX_PER_DEG = 7;
const HORIZON = 272;
const CX = 190;
/** 牽星板最多疊到 18 指（遊戲中的北方港口緯度較高） */
const MAX_JIAO = 18 * JIAO_PER_ZHI;

const QUALITY_TEXT = {
  exact: '量得很準！',
  good: '量得不錯，差一點點。',
  poor: '差得有點多，下次把板子的上緣對準星星再量。',
};

/** 固定的背景星點（不含要量的星） */
function backgroundStars(): { x: number; y: number; r: number }[] {
  const out = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    out.push({ x: rnd() * 380, y: rnd() * (HORIZON - 12), r: 0.4 + rnd() * 0.9 });
  }
  return out;
}

const STARS = backgroundStars();

/**
 * 牽星術小遊戲（企畫書 v2 4.2）：選擇牽星板的大小（幾指幾角），
 * 讓板子下緣貼著海平線、上緣對準北辰星，就能換算出緯度。
 */
export function StarSightModal() {
  const game = useGame((s) => s.game)!;
  const { takeSight, closeStarSight } = useGame.getState();
  const lat = game.ship.position[1];
  const target = starTarget(lat);
  const estimate = estimatedPosition(game.ship.position, game.nav);
  // 從推算緯度少一兩指開始，讓玩家自己調整
  const [jiao, setJiao] = useState(() =>
    Math.max(0, degToJiao(Math.abs(estimate[1])) - JIAO_PER_ZHI - 1),
  );
  const [result, setResult] = useState<SightResult | null>(null);
  const [hint, setHint] = useState(false);

  const starY = HORIZON - target.altitude * PX_PER_DEG;
  const boardTop = HORIZON - jiaoToDeg(jiao) * PX_PER_DEG;
  const clamp = (v: number) => Math.max(0, Math.min(MAX_JIAO, v));
  const north = target.kind === 'polaris';

  // 北斗七星（斗口兩顆星的連線延長約 5 倍指向北極星）或南十字星（長軸延長約 4.5 倍指向南天極）
  // 低緯度時北斗七星轉到北辰星上方（否則會沉到海平線下）
  const f = starY + 80 > HORIZON ? -1 : 1;
  const pointer = north
    ? { a: { x: CX - 92, y: starY + 70 * f }, b: { x: CX - 70, y: starY + 52 * f } }
    : { a: { x: CX + 40, y: starY - 118 }, b: { x: CX + 30, y: starY - 92 } };
  const asterism = north
    ? [
        pointer.a,
        pointer.b,
        { x: CX - 102, y: starY + 44 * f },
        { x: CX - 122, y: starY + 58 * f },
        { x: CX - 140, y: starY + 52 * f },
        { x: CX - 158, y: starY + 60 * f },
        { x: CX - 176, y: starY + 74 * f },
      ]
    : [pointer.a, pointer.b, { x: CX + 22, y: starY - 112 }, { x: CX + 49, y: starY - 99 }];

  return (
    <div className="modal-backdrop">
      <div className="modal star-modal" role="dialog" aria-modal="true" aria-label="牽星術">
        <h2>牽星術・量{north ? '北辰星' : '南天極'}的高度</h2>
        <p className="star-intro">
          手臂伸直拿著牽星板，<strong>下緣貼著海平線</strong>，選一塊大小剛好的板子，讓
          <strong>上緣對準{north ? '北辰星（北極星）' : '南天極'}</strong>。 {target.howTo}
        </p>

        <svg className="star-sky" viewBox="0 0 380 300" role="img" aria-label="夜空與牽星板">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#07122a" />
              <stop offset="1" stopColor="#1d3557" />
            </linearGradient>
          </defs>
          <rect width="380" height="300" fill="url(#sky)" />
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity="0.6" />
          ))}
          {/* 星座 */}
          {asterism.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.2" fill="#fff" />
          ))}
          {hint && (
            <line
              x1={pointer.a.x}
              y1={pointer.a.y}
              x2={CX}
              y2={starY}
              stroke="#f2d27a"
              strokeDasharray="4 4"
              opacity="0.8"
            />
          )}
          {/* 要量的星：隨著船搖晃微微上下晃動 */}
          <g className="star-bob">
            {north ? (
              <>
                <circle cx={CX} cy={starY} r="3.4" fill="#fff" />
                <circle cx={CX} cy={starY} r="7" fill="#fff" opacity="0.18" />
              </>
            ) : (
              <circle cx={CX} cy={starY} r="5" fill="none" stroke="#f2d27a" strokeDasharray="2 3" />
            )}
          </g>
          {/* 海 */}
          <rect y={HORIZON} width="380" height={300 - HORIZON} fill="#0b2233" />
          <line x1="0" x2="380" y1={HORIZON} y2={HORIZON} stroke="#9fb7c4" strokeWidth="1" />
          {/* 牽星板：下緣貼海平線 */}
          <rect
            x={CX - 34}
            y={boardTop}
            width="68"
            height={HORIZON - boardTop}
            fill="#6b3f1f"
            opacity="0.55"
            stroke="#e8c48a"
            strokeWidth="1.5"
          />
          <line
            x1={CX - 48}
            x2={CX + 48}
            y1={boardTop}
            y2={boardTop}
            stroke="#f2d27a"
            strokeWidth="2"
          />
          {/* 繩子：牽星板中間穿一條繩，拉到眼前固定距離 */}
          <line x1={CX} y1={HORIZON} x2={CX} y2="300" stroke="#e8c48a" strokeWidth="1" />
        </svg>

        {result ? (
          <div className="star-result">
            <p>
              你量得{north ? '北辰星' : '南天極'}高 <strong>{formatZhi(jiao)}</strong>（約{' '}
              {jiaoToDeg(jiao).toFixed(1)}°），換算成
              <strong>
                {result.measuredLat >= 0 ? '北' : '南'}緯 {Math.abs(result.measuredLat).toFixed(1)}°
              </strong>
              。
            </p>
            <p>
              實際緯度是{lat >= 0 ? '北' : '南'}緯 {Math.abs(lat).toFixed(1)}°，相差{' '}
              {Math.abs(result.errorDeg).toFixed(1)}°（約 {Math.round(result.errorKm)} 公里）。
              {QUALITY_TEXT[result.quality]}
            </p>
            <p className="lesson">
              <strong>地理小教室：</strong>
              牽星術只能量出緯度（南北位置）。經度（東西位置）要知道兩地的時差才算得出來， 直到 18
              世紀發明了精準的航海鐘，船員才量得出經度。所以量完星，船長仍然只能「推算」自己偏東還是偏西。
            </p>
            <button type="button" className="primary" autoFocus onClick={closeStarSight}>
              收起牽星板
            </button>
          </div>
        ) : (
          <>
            <div className="star-controls">
              <button type="button" onClick={() => setJiao((j) => clamp(j - JIAO_PER_ZHI))}>
                －1 指
              </button>
              <button type="button" onClick={() => setJiao((j) => clamp(j - 1))}>
                －1 角
              </button>
              <output className="star-reading" aria-live="polite">
                {formatZhi(jiao)}
                <small>約 {jiaoToDeg(jiao).toFixed(1)}°</small>
              </output>
              <button type="button" onClick={() => setJiao((j) => clamp(j + 1))}>
                ＋1 角
              </button>
              <button type="button" onClick={() => setJiao((j) => clamp(j + JIAO_PER_ZHI))}>
                ＋1 指
              </button>
            </div>
            <input
              className="star-slider"
              type="range"
              min={0}
              max={MAX_JIAO}
              value={jiao}
              aria-label="牽星板大小"
              onChange={(e) => setJiao(Number(e.target.value))}
            />
            <p className="meta">
              1 指約 {ZHI_DEG}°，1 指 = 4 角。推算位置：{formatLonLat(estimate, 1)}
            </p>
            <div className="row">
              <button type="button" onClick={() => setHint((h) => !h)}>
                {hint ? '隱藏提示' : north ? '怎麼找北辰星？' : '怎麼找南天極？'}
              </button>
              <button type="button" onClick={closeStarSight}>
                不量了
              </button>
              <button type="button" className="primary" onClick={() => setResult(takeSight(jiao))}>
                量好了
              </button>
            </div>
            {hint && (
              <p className="lesson">
                {north
                  ? '先找到北斗七星：斗口的兩顆星連起來，往斗口外延長約 5 倍，那顆不太亮但位置不動的星就是北辰星。'
                  : '找到燈籠骨星（南十字星）：把十字的長軸往下延長約 4.5 倍，就是南天極的位置（那裡沒有亮星）。'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
