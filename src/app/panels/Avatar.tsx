import { COLORS, SKIN_TONES, colorOf, type Appearance } from '@/game/cosmetics';

/** 扁平插畫風的船長頭像（SVG） */
export function Avatar({ look, size = 64 }: { look: Appearance; size?: number }) {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[0];
  const coat = colorOf(COLORS, look.coat);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="avatar">
      <circle cx="32" cy="32" r="31" fill="#e9dcc0" stroke="#2b2118" strokeWidth="1.5" />
      <path d="M12 60 Q14 42 32 41 Q50 42 52 60 Z" fill={coat} stroke="#2b2118" strokeWidth="1.5" />
      <path d="M27 41 L32 49 L37 41" fill="none" stroke="#f4ecd8" strokeWidth="2" />
      <circle cx="32" cy="28" r="11" fill={skin} stroke="#2b2118" strokeWidth="1.5" />
      <circle cx="28" cy="28" r="1.3" fill="#2b2118" />
      <circle cx="36" cy="28" r="1.3" fill="#2b2118" />
      <path d="M29 33 Q32 35 35 33" fill="none" stroke="#2b2118" strokeWidth="1.2" />
      <Hat id={look.hat} />
    </svg>
  );
}

function Hat({ id }: { id: string }) {
  const line = { stroke: '#2b2118', strokeWidth: 1.5 };
  switch (id) {
    case 'futou':
      return (
        <g {...line}>
          <path d="M21 24 Q21 13 32 13 Q43 13 43 24 Z" fill="#2b2118" />
          <path d="M20 22 L10 20 M44 22 L54 20" strokeWidth={2.5} />
        </g>
      );
    case 'douli':
      return <path d="M14 22 L32 8 L50 22 Z" fill="#c9a86a" {...line} />;
    case 'turban':
      return (
        <g {...line}>
          <path d="M20 23 Q20 10 32 10 Q44 10 44 23 Q32 19 20 23 Z" fill="#f4ecd8" />
          <circle cx="32" cy="16" r="2.5" fill="#b5482b" />
        </g>
      );
    case 'barrete':
      // 葡萄牙水手的軟帽：垂向一側的紅色布帽
      return (
        <g {...line}>
          <path d="M20 23 Q20 12 32 12 Q44 12 46 18 Q48 22 44 23 Z" fill="#9b2f1f" />
          <path d="M20 23 L44 23" strokeWidth={2.5} />
        </g>
      );
    case 'flowers':
      // 花環
      return (
        <g {...line}>
          {[22, 27, 32, 37, 42].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={i % 2 ? 17 : 19}
              r={3.2}
              fill={i % 2 ? '#e0b94a' : '#d9653a'}
            />
          ))}
        </g>
      );
    case 'woolcap':
      // 北歐人的羊毛圓帽
      return (
        <g {...line}>
          <path d="M20 23 Q20 11 32 11 Q44 11 44 23 Z" fill="#6b5a3a" />
          <path d="M20 23 L44 23" strokeWidth={3} stroke="#8a6a3a" />
        </g>
      );
    case 'captain':
      return (
        <g {...line}>
          <path d="M18 21 Q32 6 46 21 Z" fill="#2c4a7a" />
          <rect x="17" y="20" width="30" height="4" fill="#2b2118" />
          <circle cx="32" cy="15" r="2.5" fill="#e0b94a" />
        </g>
      );
    case 'feather':
      return (
        <g {...line}>
          <path d="M18 22 Q32 10 46 22 Z" fill="#6b3f1f" />
          <path d="M40 16 Q52 4 56 8 Q50 14 42 18 Z" fill="#b5482b" />
        </g>
      );
    default:
      return (
        <path d="M21 24 Q22 15 32 16 Q42 15 43 24 Q38 19 32 20 Q26 19 21 24 Z" fill="#2b2118" />
      );
  }
}

/** 船旗：底色 + 紋章 */
export function Flag({ look, size = 48 }: { look: Appearance; size?: number }) {
  const bg = colorOf(COLORS, look.flagColor);
  const fg = look.flagColor === 'ivory' || look.flagColor === 'ochre' ? '#2b2118' : '#f4ecd8';
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 60 42" aria-hidden="true" className="flag">
      <rect
        x="1"
        y="1"
        width="58"
        height="40"
        rx="2"
        fill={bg}
        stroke="#2b2118"
        strokeWidth="1.5"
      />
      <Emblem id={look.emblem} color={fg} />
    </svg>
  );
}

export function Emblem({ id, color }: { id: string; color: string }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 2 };
  switch (id) {
    case 'anchor':
      return (
        <g {...p}>
          <circle cx="30" cy="11" r="3" />
          <path d="M30 14 V33 M23 18 H37 M19 26 Q22 34 30 33 Q38 34 41 26" />
        </g>
      );
    case 'star':
      return (
        <path
          d="M30 7 L33 17 L43 17 L35 23 L38 33 L30 27 L22 33 L25 23 L17 17 L27 17 Z"
          fill={color}
        />
      );
    case 'wave':
      return (
        <path {...p} d="M12 26 Q18 16 24 26 T36 26 T48 26 M12 32 Q18 22 24 32 T36 32 T48 32" />
      );
    case 'book':
      return (
        <g {...p}>
          <path d="M14 12 Q22 9 30 13 Q38 9 46 12 V32 Q38 29 30 33 Q22 29 14 32 Z" />
          <path d="M30 13 V33" />
        </g>
      );
    case 'sun':
      return (
        <g {...p}>
          <circle cx="30" cy="21" r="6" fill={color} />
          <path d="M30 7 V11 M30 31 V35 M16 21 H20 M40 21 H44 M20 11 L23 14 M37 28 L40 31 M40 11 L37 14 M23 28 L20 31" />
        </g>
      );
    case 'globe':
      return (
        <g {...p}>
          <circle cx="30" cy="21" r="12" />
          <path d="M18 21 H42 M30 9 Q22 21 30 33 Q38 21 30 9" />
        </g>
      );
    case 'dragon':
      return (
        <path {...p} d="M12 30 Q18 12 28 22 Q34 28 40 16 Q44 10 48 14 M44 12 L46 8 M48 14 L50 18" />
      );
    default:
      // 羅盤
      return (
        <g {...p}>
          <circle cx="30" cy="21" r="12" />
          <path d="M30 9 L33 21 L30 33 L27 21 Z" fill={color} />
          <path d="M18 21 H42" />
        </g>
      );
  }
}
