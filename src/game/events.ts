/**
 * 航行事件（企畫書 5.4 導航挑戰、10.1 隨機事件、10.2 海盜處理原則）。
 *
 * 每個事件都附一段地理或歷史知識；問答型事件會記入學習紀錄。
 * 衝突一律以談判、逃離或知識挑戰解決，沒有戰鬥。
 */
import type { LonLat } from '@/data/schema';
import { bearingDeg, compass16, distanceKm, EARTH_RADIUS_KM } from '@/geo/geo';
import { formatLonLat } from '@/map/projection';
import type { Wind } from './environment';

export type EventId = 'doldrums' | 'pirates' | 'flotsam' | 'stargazing' | 'scurvy' | 'lost';

export interface EventQuestion {
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
}

export interface EventChoice {
  id: string;
  label: string;
  hint: string;
}

export interface VoyageEvent {
  kind: 'event';
  id: EventId;
  title: string;
  text: string;
  lesson?: string;
  position: LonLat;
  month: number;
  /** 需要玩家選擇行動的事件 */
  choices?: EventChoice[];
  /** 問答型事件（觀星、迷航、海盜的知識挑戰） */
  question?: EventQuestion;
}

/** 事件結算對遊戲狀態的影響（由 state.ts 套用） */
export interface EventEffect {
  title: string;
  text: string;
  lesson?: string;
  gold?: number;
  xp?: number;
  days?: number;
  morale?: number;
  food?: number;
  water?: number;
  /** 正確答題 */
  correct?: boolean;
}

export interface EventContext {
  position: LonLat;
  heading: number;
  month: number;
  wind: Wind;
  daysAtSea: number;
  /** 最後停泊港口的位置與名稱（迷航題用） */
  lastPort: { name: string; location: LonLat };
  /** 目前所在海域名稱與其他海域名稱（海盜知識挑戰用） */
  regionName: string | null;
  otherRegionNames: string[];
}

/** 海盜出沒的海域：麻六甲海峽、南海南部、蘇祿海、亞丁灣、加勒比海 */
const PIRATE_ZONES: [number, number, number, number][] = [
  [98, 0, 105, 7],
  [105, 0, 112, 6],
  [117, 4, 123, 10],
  [43, 10, 52, 15],
  [-85, 10, -60, 22],
];

const inBox = ([lon, lat]: LonLat, b: [number, number, number, number]) =>
  lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3];

export function eventChances(ctx: EventContext): Partial<Record<EventId, number>> {
  const chances: Partial<Record<EventId, number>> = {
    flotsam: 0.03,
    stargazing: 0.05,
    lost: 0.025,
  };
  if (ctx.wind.strength < 0.2) chances.doldrums = 0.35;
  if (PIRATE_ZONES.some((b) => inBox(ctx.position, b))) chances.pirates = 0.08;
  if (ctx.daysAtSea > 20) chances.scurvy = 0.1;
  return chances;
}

/** 依序以亂數決定洗牌順序 */
function shuffle<T>(items: T[], rand: () => number): { items: T[]; order: number[] } {
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { items: order.map((i) => items[i]), order };
}

function mcq(
  prompt: string,
  correct: string,
  wrong: string[],
  explanation: string,
  rand: () => number,
): EventQuestion {
  const { items, order } = shuffle([correct, ...wrong], rand);
  return { prompt, choices: items, answer: order.indexOf(0), explanation };
}

/** 從某點往某方位移動一段距離 */
export function destinationPoint([lon, lat]: LonLat, bearing: number, km: number): LonLat {
  const d = km / EARTH_RADIUS_KM;
  const b = (bearing * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(((l2 * 180) / Math.PI + 540) % 360) - 180, (p2 * 180) / Math.PI];
}

export function createEvent(id: EventId, ctx: EventContext, rand: () => number): VoyageEvent {
  const base = { kind: 'event' as const, id, position: ctx.position, month: ctx.month };
  switch (id) {
    case 'doldrums':
      return {
        ...base,
        title: '無風帶',
        text: '帆布垂了下來，海面平靜得像一面鏡子。船動也不動，船員們焦躁起來。',
        lesson:
          '赤道附近空氣受熱上升，地面風力微弱，稱為赤道無風帶；南北緯 30° 附近的副熱帶高壓帶也常無風，稱為馬緯度。帆船時代最怕困在這裡。',
        choices: [
          { id: 'wait', label: '耐心等風', hint: '可能耽擱好幾天，消耗補給' },
          { id: 'row', label: '讓船員划槳', hint: '只耽擱一天，但士氣下降' },
        ],
      };
    case 'pirates':
      return {
        ...base,
        title: '海盜船逼近！',
        text: '一艘掛著陌生旗幟的快船擋住去路，船上的人高聲喊話，要你們交出貨物。',
        lesson:
          '麻六甲海峽等狹窄水道是東西方商船的必經之路，自古就有海盜出沒。據《明史》記載，鄭和船隊曾在舊港（今印尼巨港）擒獲海盜首領陳祖義。',
        choices: [
          { id: 'negotiate', label: '談判', hint: '交出一些金幣換取平安（交涉越高付得越少）' },
          { id: 'flee', label: '揚帆逃離', hint: '靠航海術搶風逃走，失敗會損失更多' },
          { id: 'quiz', label: '知識挑戰', hint: '海盜船長說：答對我的問題就放你們走' },
        ],
        question: ctx.regionName
          ? mcq(
              '海盜船長大笑：「連自己在哪片海都不知道的人，不配在這裡航行！說，這片海叫什麼？」',
              ctx.regionName,
              ctx.otherRegionNames.slice(0, 2),
              `船隊正位於「${ctx.regionName}」。熟悉海域名稱與位置，是航海者的基本功。`,
              rand,
            )
          : undefined,
      };
    case 'flotsam': {
      return {
        ...base,
        title: '海上漂流物',
        text: '瞭望員發現遠處漂著一個木箱，裡面有幾枚錢幣和一包用油布包好的香料。',
        lesson:
          '洋流會把漂流物帶到很遠的地方。例如椰子可以隨著洋流漂過整個印度洋，在遙遠的海岸發芽，這也是熱帶島嶼常見椰子樹的原因之一。',
      };
    }
    case 'stargazing': {
      const lat = ctx.position[1];
      const a = Math.round(Math.abs(lat));
      let question: EventQuestion;
      if (lat >= 3) {
        const wrongs = [a + 12, Math.max(0, a - 12), a + 25].map((x) => `北緯約 ${x}°`);
        question = mcq(
          `航海長用牽星板量出北極星在地平線上約 ${a}° 高。船隊大約在哪個緯度？`,
          `北緯約 ${a}°`,
          [...new Set(wrongs)].filter((w) => w !== `北緯約 ${a}°`).slice(0, 3),
          '在北半球，北極星的仰角約等於所在地的緯度。古代航海者就是用這個方法判斷南北位置，鄭和船隊使用的「牽星術」也是同樣的原理。',
          rand,
        );
      } else if (lat <= -3) {
        question = mcq(
          '今晚北方天空怎麼也找不到北極星，南方天空卻清楚看見南十字星。這代表船隊在哪裡？',
          '南半球',
          ['北半球', '北極圈內', '北回歸線上'],
          '北極星位於北天極附近，到了南半球就會沉到地平線以下看不見；南十字星則是南半球航海者辨認南方的重要星座。',
          rand,
        );
      } else {
        question = mcq(
          '北極星幾乎貼在北方的海平面上，南方低空也能看到南十字星。船隊大約在哪裡？',
          '赤道附近',
          ['北回歸線附近', '南回歸線附近', '北極圈附近'],
          '北極星的仰角約等於緯度；在赤道附近，北極星就貼著地平線，南北兩邊的星空都看得到。',
          rand,
        );
      }
      return {
        ...base,
        title: '觀星之夜',
        text: '夜空晴朗，滿天星斗。老舵手招手要你一起觀星，順便考考你。',
        question,
      };
    }
    case 'scurvy':
      return {
        ...base,
        title: '船員生病了',
        text: '在海上待了很久，幾名船員牙齦出血、全身無力。船醫說這是缺乏新鮮蔬果造成的病。',
        lesson:
          '這種病叫壞血病，是缺乏維生素 C 造成的，是大航海時代遠洋船員的一大威脅。有一種說法認為，中國船隊會在船上用木桶發豆芽，補充新鮮蔬菜。',
        choices: [
          { id: 'sprouts', label: '用存糧發豆芽', hint: '消耗 3 天份糧食，保住士氣' },
          { id: 'endure', label: '先忍耐，盡快靠港', hint: '士氣大幅下降' },
        ],
      };
    case 'lost': {
      const from = ctx.lastPort;
      const km = Math.round(distanceKm(from.location, ctx.position) / 10) * 10;
      const bearing = bearingDeg(from.location, ctx.position);
      const dir = compass16(bearing);
      const truth = formatLonLat(ctx.position, 0);
      const decoys = [bearing + 90, bearing + 180, bearing - 90]
        .map((b) => formatLonLat(destinationPoint(from.location, b, Math.max(km, 150)), 0))
        .filter((d) => d !== truth);
      return {
        ...base,
        title: '大霧迷航',
        text: '濃霧籠罩海面，看不見星星也看不見海岸。航海長翻開航海日誌推算位置。',
        question: mcq(
          `「我們從${from.name}出發，大致往${dir}方航行了約 ${km} 公里。」船隊現在最可能在哪裡？`,
          truth,
          [...new Set(decoys)].slice(0, 2),
          `從${from.name}（${formatLonLat(from.location, 0)}）往${dir}方前進，經緯度會朝那個方向變化。這種靠方位與距離推算位置的方法叫做「航位推算」。`,
          rand,
        ),
      };
    }
  }
}

/** 結算選擇型事件；roll 為 0–1 亂數 */
export function resolveChoice(
  ev: VoyageEvent,
  choiceId: string,
  roll: number,
  attrs: { navigation: number; diplomacy: number },
  gold: number,
): EventEffect {
  switch (ev.id) {
    case 'doldrums': {
      if (choiceId === 'row') {
        return {
          title: '划槳前進',
          text: '船員輪流划槳，終於把船帶出無風區。',
          days: 1,
          morale: -10,
          lesson: ev.lesson,
        };
      }
      const days = 2 + Math.round(roll * 3);
      return { title: '等到風了', text: `等了 ${days} 天，終於起風了。`, days, lesson: ev.lesson };
    }
    case 'pirates': {
      if (choiceId === 'negotiate') {
        const pct = Math.max(0.05, 0.25 - 0.03 * (attrs.diplomacy - 1));
        const paid = Math.floor(gold * pct);
        return {
          title: '談判成功',
          text: `你交出 ${paid} 金幣，海盜收下後讓出航道。`,
          gold: -paid,
          lesson: ev.lesson,
        };
      }
      if (choiceId === 'flee') {
        const chance = Math.min(0.9, 0.5 + 0.08 * (attrs.navigation - 1));
        if (roll < chance) {
          return {
            title: '成功脫逃',
            text: '你看準風向搶先轉舵，海盜船追不上。',
            morale: 5,
            lesson: ev.lesson,
          };
        }
        const lost = Math.floor(gold * 0.35);
        return {
          title: '逃跑失敗',
          text: `海盜追了上來，搶走 ${lost} 金幣和一些糧食。`,
          gold: -lost,
          food: -5,
          morale: -10,
          lesson: ev.lesson,
        };
      }
      return { title: '', text: '' };
    }
    case 'scurvy':
      if (choiceId === 'sprouts') {
        return {
          title: '豆芽救了大家',
          text: '幾天後船員的氣色好轉了。',
          food: -3,
          lesson: ev.lesson,
        };
      }
      return {
        title: '苦撐',
        text: '病情讓大家士氣低落，得盡快靠港補充新鮮蔬果。',
        morale: -25,
        lesson: ev.lesson,
      };
    default:
      return { title: '', text: '' };
  }
}

/** 結算問答型事件 */
export function resolveAnswer(ev: VoyageEvent, correct: boolean, gold: number): EventEffect {
  const q = ev.question!;
  switch (ev.id) {
    case 'stargazing':
      return correct
        ? {
            title: '觀星高手',
            text: '老舵手點點頭：「好眼力！」',
            xp: 15,
            correct,
            lesson: q.explanation,
          }
        : {
            title: '再練練',
            text: `正確答案是「${q.choices[q.answer]}」。`,
            correct,
            lesson: q.explanation,
          };
    case 'lost':
      return correct
        ? {
            title: '推算正確',
            text: '你準確推算出位置，船隊很快穿出濃霧。',
            xp: 15,
            correct,
            lesson: q.explanation,
          }
        : {
            title: '推算有誤',
            text: `正確答案是「${q.choices[q.answer]}」。在霧裡繞了一天才找回航線。`,
            days: 1,
            correct,
            lesson: q.explanation,
          };
    case 'pirates':
      if (correct) {
        return {
          title: '海盜放行',
          text: '海盜船長大笑：「有你的！」讓出了航道，還送你一小袋錢當作見面禮。',
          gold: 20,
          xp: 20,
          correct,
          lesson: q.explanation,
        };
      }
      return {
        title: '答錯了',
        text: `正確答案是「${q.choices[q.answer]}」。海盜拿走了 ${Math.floor(gold * 0.3)} 金幣。`,
        gold: -Math.floor(gold * 0.3),
        correct,
        lesson: q.explanation,
      };
    default:
      return { title: '', text: '', correct };
  }
}

export function flotsamEffect(ev: VoyageEvent, roll: number): EventEffect {
  const gold = 10 + Math.round(roll * 30);
  return { title: '撈起漂流物', text: `箱子裡有 ${gold} 金幣。`, gold, lesson: ev.lesson };
}

// ---------------------------------------------------------------- 座標定位挑戰

export interface LocateResult {
  correct: boolean;
  distanceKm: number;
  /** 答錯時：正確位置在點選位置的哪個方位 */
  direction: string;
}

export function checkLocate(guess: LonLat, target: LonLat, toleranceKm: number): LocateResult {
  const d = distanceKm(guess, target);
  return {
    correct: d <= toleranceKm,
    distanceKm: d,
    direction: compass16(bearingDeg(guess, target)),
  };
}
