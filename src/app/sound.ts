/**
 * 音效與背景音樂（企畫書 Q19）：全部以 Web Audio 即時合成，不需要音檔，也沒有授權問題。
 * 設定（音效、音樂開關）存在瀏覽器 localStorage，只是個人偏好。
 */

export type Sfx =
  | 'depart'
  | 'arrive'
  | 'discover'
  | 'levelUp'
  | 'questComplete'
  | 'correct'
  | 'wrong'
  | 'warn'
  | 'storm'
  | 'achievement';

interface SoundSettings {
  sfx: boolean;
  music: boolean;
}

const KEY = 'aoe-sound';
let settings: SoundSettings = { sfx: true, music: false };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) settings = { ...settings, ...(JSON.parse(raw) as Partial<SoundSettings>) };
} catch {
  // 私密瀏覽或停用儲存時使用預設值
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.3) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.2) {
  const a = audio();
  if (!a || !master) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(a.currentTime + start);
}

// 五聲音階（宮商角徵羽），呼應東方寶船的氛圍
const C = 261.63;
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

const SFX: Record<Sfx, () => void> = {
  depart: () => {
    tone(C * 0.5, 0, 0.9, 'triangle', 0.25);
    tone(C * 0.75, 0.05, 0.9, 'triangle', 0.18);
  },
  arrive: () => {
    [0, 0.12, 0.24].forEach((t, i) => tone(C * 2 * PENTA[i * 2], t, 0.6, 'sine', 0.2));
  },
  discover: () => {
    [0, 1, 2, 3].forEach((i) => tone(C * 2 * PENTA[i + 1], i * 0.07, 0.35, 'sine', 0.15));
  },
  levelUp: () => {
    [0, 2, 3, 5].forEach((n, i) => tone(C * PENTA[n] * 2, i * 0.1, 0.5, 'square', 0.08));
  },
  questComplete: () => {
    [0, 3, 5].forEach((n, i) => tone(C * PENTA[n], i * 0.12, 0.7, 'triangle', 0.22));
  },
  correct: () => {
    tone(C * 2 * PENTA[2], 0, 0.25, 'sine', 0.2);
    tone(C * 2 * PENTA[4], 0.1, 0.35, 'sine', 0.2);
  },
  wrong: () => tone(C * 0.6, 0, 0.3, 'sawtooth', 0.08),
  warn: () => {
    tone(C * 0.75, 0, 0.25, 'square', 0.07);
    tone(C * 0.75, 0.3, 0.25, 'square', 0.07);
  },
  storm: () => {
    noise(0, 1.4, 0.35);
    tone(C * 0.25, 0.1, 1.2, 'sawtooth', 0.05);
  },
  achievement: () => {
    [0, 2, 4, 5].forEach((n, i) => tone(C * 2 * PENTA[n], i * 0.09, 0.45, 'triangle', 0.15));
  },
};

export function play(name: Sfx) {
  if (!settings.sfx) return;
  try {
    SFX[name]();
  } catch {
    // 音效失敗不影響遊戲
  }
}

/** 背景音樂：五聲音階的慢速琶音，音量很小 */
function startMusic() {
  if (musicTimer || !audio()) return;
  let step = 0;
  const pattern = [0, 2, 4, 3, 1, 3, 2, 0];
  musicTimer = setInterval(() => {
    const n = pattern[step % pattern.length];
    tone(C * PENTA[n], 0, 1.6, 'sine', 0.06);
    if (step % 4 === 0) tone(C * 0.5, 0, 3, 'triangle', 0.04);
    step++;
  }, 900);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

export function getSoundSettings(): SoundSettings {
  return settings;
}

export function setSoundSettings(next: Partial<SoundSettings>) {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 忽略
  }
  if (settings.music) startMusic();
  else stopMusic();
}

/** 瀏覽器要求使用者互動後才能播放聲音：在第一次點擊時呼叫 */
export function unlockAudio() {
  audio();
  if (settings.music) startMusic();
}
