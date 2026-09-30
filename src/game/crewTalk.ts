/**
 * 夥伴在航行中說話（企畫書 v2 4.8）：讓海上有人味，也順便教地理。
 *
 * - 進入新的海域：介紹這片海；
 * - 接近聽過的傳聞地點：瞭望員給一點方位提示（不直接說答案）；
 * - 平常偶爾聊聊風、洋流、緯線與星空。
 *
 * 純函式：依狀態決定要不要說、說什麼；冷卻時間由呼叫端記錄。
 */
import type { CodexEntry, LonLat, SeaRegion } from '@/data/schema';
import { bearingDeg, compass16, distanceKm } from '@/geo/geo';
import type { Current, Wind } from './environment';

export interface TalkContext {
  position: LonLat;
  wind: Wind;
  current: Current | null;
  night: boolean;
  /** 目前所在海域（沒有則為 null） */
  region: SeaRegion | null;
  /** 上次所在的海域 id */
  lastRegionId: string | null;
  /** 聽過、還沒找到的傳聞地點 */
  openRumors: CodexEntry[];
  /** 已經給過提示的傳聞 */
  hinted: string[];
  /** 說話的人（船員名字或老舵工） */
  speakers: string[];
  /** 船員各自的家鄉話題：{ 說話的人, 內容 } */
  personal?: { speaker: string; text: string }[];
  /** 0–1 亂數 */
  roll: number;
  /** 距離上次閒聊是否夠久 */
  chatReady: boolean;
}

export interface Talk {
  speaker: string;
  text: string;
  /** 這句話是某個傳聞的提示 */
  hintFor?: string;
  /** 這句話是進入新海域 */
  region?: string;
  /** 一般閒聊（呼叫端要重設冷卻） */
  chat?: boolean;
  /** 說的是看得見的自然景象：海圖上會在船邊畫出來 */
  sight?: SeaSight;
}

export type SeaSight = 'flyingfish' | 'dolphins' | 'whale' | 'waterspout' | 'albatross' | 'birds';

const pick = <T>(xs: T[], roll: number): T =>
  xs[Math.min(xs.length - 1, Math.floor(roll * xs.length))];

export function crewTalk(ctx: TalkContext): Talk | null {
  const speaker = ctx.speakers.length ? pick(ctx.speakers, ctx.roll) : '老舵工';

  // 進入新海域
  if (ctx.region && ctx.region.id !== ctx.lastRegionId) {
    return {
      speaker,
      text: `我們進入「${ctx.region.name}」了。${ctx.region.description ?? ''}`,
      region: ctx.region.id,
    };
  }

  // 接近傳聞地點：給方位，不給答案
  for (const c of ctx.openRumors) {
    if (ctx.hinted.includes(c.id)) continue;
    const km = distanceKm(ctx.position, c.location!);
    if (km < c.rumor!.investigate_km * 4 && km > c.rumor!.investigate_km) {
      const dir = compass16(bearingDeg(ctx.position, c.location!));
      return {
        speaker: '瞭望員',
        text: `${dir}方的景色，跟「${c.rumor!.from}」說的有點像……往那邊靠近看看？`,
        hintFor: c.id,
      };
    }
  }

  if (!ctx.chatReady) return null;
  const lines: string[] = [];
  const sights = new Map<string, SeaSight>();
  const nature = (text: string, sight: SeaSight) => {
    lines.push(text);
    sights.set(text, sight);
  };
  const w = ctx.wind;
  if (w.strength >= 0.6)
    lines.push(`這${w.name}真夠力！順著它走，一天能跑三、四百里；逆著它就只能走之字形了。`);
  if (w.strength < 0.2) lines.push('風小得可憐……在海上最怕的不是大浪，是沒風。');
  if (ctx.current) {
    lines.push(
      `腳下這股${ctx.current.name}往${compass16(ctx.current.toward)}方流，順著它走會快一些，逆著走就慢了。`,
    );
  }
  const lat = ctx.position[1];
  if (Math.abs(lat - 23.44) < 1.5) {
    lines.push('北回歸線就在這附近。夏至那天中午，太陽會在頭頂正上方，連影子都看不見。');
  }
  if (Math.abs(lat) < 2) lines.push('我們快到赤道了！再往南，北極星就要沉到海平面下看不見了。');
  if (ctx.night) lines.push('今晚星星真亮。船長，要不要拿牽星板量一量北極星有幾指高？');
  // 海上的自然奇觀：依海域與日夜
  const rid = ctx.region?.id;
  if (Math.abs(lat) < 25) {
    nature(
      '看！海面上有魚飛起來了！飛魚張開大大的胸鰭，能在海面上滑翔好幾十公尺，是為了躲開水裡追牠的大魚。',
      'flyingfish',
    );
    nature('船頭有一群海豚跟著我們跑！牠們喜歡在船頭推起的浪裡衝浪。', 'dolphins');
  }
  if (ctx.night) {
    lines.push('你看船尾的浪花在發藍光！那是海裡的夜光藻，被海水攪動時就會發光。');
  }
  if (rid === 'south-china-sea' || rid === 'malacca-java') {
    nature(
      '遠處有一根從雲裡垂到海面的水柱，那是海上的龍捲風把海水吸上去，古人叫它「龍吸水」。',
      'waterspout',
    );
  }
  if (rid === 'east-china-sea' || rid === 'arabian-sea' || rid === 'east-africa') {
    nature('右舷噴起一道水柱，是鯨魚在換氣！鯨魚跟人一樣是哺乳類，要浮上海面呼吸。', 'whale');
  }
  if (rid === 'arabian-sea') {
    lines.push('風裡帶著細細的沙，陸地那邊就是大沙漠了。這一帶一年下不了幾場雨。');
  }
  if (rid === 'bengal-malabar') {
    lines.push('海水有點發黃，是大河帶來的泥沙。孟加拉灣北邊有好幾條大河出海。');
  }
  if (rid === 'southern-africa' || lat < -30) {
    nature(
      '好大的鳥！那是信天翁，翅膀張開比一個人還寬，在西風帶上幾乎不用拍翅膀就能飛很遠。',
      'albatross',
    );
  }
  lines.push('老一輩的人說，看海的顏色也能知道水深：越藍越深，發綠發黃就要小心淺灘了。');
  nature('海鳥往陸地飛回去的時候，就是快天黑了，也表示附近有島。', 'birds');
  // 船員各自的家鄉話題
  const who = new Map<string, string>();
  for (const p of ctx.personal ?? []) {
    lines.push(p.text);
    who.set(p.text, p.speaker);
  }
  const text = pick(lines, ctx.roll);
  return { speaker: who.get(text) ?? speaker, text, chat: true, sight: sights.get(text) };
}
