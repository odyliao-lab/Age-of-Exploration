/**
 * 撒網捕魚：航行中每天可以撒一次網，補一點糧食。
 * 漁獲多寡看地理：大陸棚上的淺海陽光照得到、養分多，魚最多；
 * 夏季西南季風吹起時，阿拉伯海西側的湧升流把深海的養分帶上來，也是好漁場；
 * 遠洋深海雖然有鮪魚、鬼頭刀，但魚群分散，常常撈不到什麼。
 */
import type { LonLat } from '@/data/schema';
import type { Sounding } from './navigation';

export interface Catch {
  /** 補到的糧食（天份） */
  food: number;
  /** 撈到的魚 */
  fish: string;
  /** 漁場的類型，用來說明為什麼多或少 */
  ground: 'upwelling' | 'shelf' | 'reef' | 'delta' | 'coast' | 'ocean';
  text: string;
}

const inBox = ([lon, lat]: LonLat, [w, s, e, n]: [number, number, number, number]) =>
  lon >= w && lat >= s && lon <= e && lat <= n;

/** 夏季西南季風時，索馬利亞與阿拉伯半島外海的湧升流 */
function upwelling(pos: LonLat, month: number): boolean {
  return month >= 6 && month <= 9 && inBox(pos, [45, 2, 62, 23]);
}

function fishOf(pos: LonLat, s: Sounding): { fish: string; ground: Catch['ground'] } {
  const [lon, lat] = pos;
  if (inBox(pos, [86, 18, 92.5, 23.5]) && s.tuo !== null) return { fish: '鰣魚', ground: 'delta' };
  if (s.shelf) {
    if (lat > 25 && lon > 117) return { fish: '黃魚', ground: 'shelf' };
    if (lat > 22 && lon > 117) return { fish: '鯧魚', ground: 'shelf' };
    if (lon < 60) return { fish: '石斑魚和蝦', ground: 'shelf' };
    return { fish: '花腹鯖', ground: 'shelf' };
  }
  if (s.bottom === '白色的珊瑚碎屑') return { fish: '石斑魚和鸚哥魚', ground: 'reef' };
  if (s.tuo !== null) {
    if (lat > 22 && lon > 105) return { fish: '白帶魚', ground: 'coast' };
    return { fish: '鯖魚和竹筴魚', ground: 'coast' };
  }
  if (Math.abs(lat) < 23.5) return { fish: '鬼頭刀和幾隻飛魚', ground: 'ocean' };
  return { fish: '一條鰹魚', ground: 'ocean' };
}

const BASE: Record<Catch['ground'], number> = {
  upwelling: 4,
  shelf: 3,
  delta: 3,
  reef: 2.5,
  coast: 2,
  ocean: 0.5,
};

/**
 * 算出這一網的漁獲。luck 是 0～1 的亂數，只影響一點點；地理才是關鍵。
 */
export function castNet(pos: LonLat, s: Sounding, month: number, luck: number): Catch {
  let { fish, ground } = fishOf(pos, s);
  if (upwelling(pos, month)) {
    fish = '一大群沙丁魚';
    ground = 'upwelling';
  }
  const food = Math.max(0, Math.round(BASE[ground] * (0.75 + luck * 0.5) * 2) / 2);
  const text =
    food >= 3
      ? `網子沉甸甸的，撈上${fish}！夠大家吃 ${food} 天。`
      : food >= 1.5
        ? `撈到一些${fish}，補了 ${food} 天份的糧食。`
        : food > 0
          ? `只撈到${fish}，勉強加一餐。`
          : '網子拉上來空空的，只有幾團海草。';
  return { food, fish, ground, text };
}

/** 各種漁場的地理解說（第一次撒網與漁獲特別多或少時顯示） */
export const GROUND_LESSON: Record<Catch['ground'], string> = {
  upwelling:
    '夏天西南季風沿著索馬利亞和阿拉伯半島的海岸吹，把表面的海水推向外海，底下冰冷、富含養分的深層海水就湧上來補充，叫做「湧升流」。養分讓浮游生物大量繁殖，沙丁魚群也跟著來，這時的阿拉伯海西側是一片好漁場。',
  shelf:
    '大陸棚上水淺，陽光照得到海底，河流又帶來養分，浮游生物多，魚也多。世界上重要的漁場大多在大陸棚上，例如東海的黃魚、臺灣海峽的鯧魚。',
  delta: '恆河口一帶河水帶來大量養分，鰣魚每年從海裡游進河口產卵，是孟加拉人最愛的魚。',
  reef: '珊瑚礁像海裡的城市，住著石斑魚、鸚哥魚等各種礁岩魚類。不過礁石會割破漁網，也會刮傷船底，要小心。',
  coast: '靠近陸地的海域比遠洋養分多，常有成群的鯖魚、竹筴魚或白帶魚。',
  ocean:
    '遠洋深海的表層養分少，海水清澈湛藍，魚群分散，撒網很難撈到東西。遠洋的鮪魚、鬼頭刀游得快，漁夫多半用釣的。',
};
