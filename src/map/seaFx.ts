/**
 * 海面的動態效果（企畫書 v2 4.9）：波紋、風的流線、船尾水痕。
 * 都放在世界座標裡（會跟著地圖移動），但以「畫面像素」決定大小，縮放時看起來一樣大。
 * 只在拉近看海時顯示，全世界縮圖時淡出。
 */
import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { WORLD_HEIGHT, WORLD_WIDTH, lonLatToView, type Point } from './projection';
import type { View } from './viewport';

const STREAKS = 90;
const WAKE_SECONDS = 5;

interface Streak {
  x: number;
  y: number;
  age: number;
  life: number;
}

function waveTexture(): Texture {
  const size = 160;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(40, 80, 95, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  // 古地圖式的小波紋：幾個錯落的弧線
  const arcs = [
    [20, 30],
    [95, 18],
    [60, 75],
    [135, 90],
    [25, 120],
    [105, 140],
  ];
  for (const [x, y] of arcs) {
    ctx.beginPath();
    ctx.arc(x, y, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 12, y, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  const t = Texture.from(c);
  t.source.addressMode = 'repeat';
  return t;
}

export class SeaFx {
  readonly under = new Container();
  readonly over = new Container();
  private waves: TilingSprite;
  private streakGfx = new Graphics();
  private wakeGfx = new Graphics();
  private streaks: Streak[] = [];
  private wake: { p: Point; t: number }[] = [];
  private windToward = 225;
  private windStrength = 0.5;
  private view: View = { x: 0, y: 0, scale: 1 };
  private size = { width: 1, height: 1 };
  private time = 0;

  constructor() {
    this.waves = new TilingSprite({
      texture: waveTexture(),
      // 三圈寬：海圖在換日線接起來，鏡頭在哪一圈都有波紋
      width: WORLD_WIDTH * 3,
      height: WORLD_HEIGHT,
    });
    this.under.addChild(this.waves);
    this.over.addChild(this.wakeGfx, this.streakGfx);
  }

  setWind(toward: number, strength: number) {
    this.windToward = toward;
    this.windStrength = strength;
  }

  setView(view: View, size: { width: number; height: number }) {
    this.view = view;
    this.size = size;
    // 波紋固定畫面大小
    this.waves.tileScale.set(1 / view.scale);
    const centerX = (size.width / 2 - view.x) / view.scale;
    this.waves.x = (Math.round((centerX - WORLD_WIDTH / 2) / WORLD_WIDTH) - 1) * WORLD_WIDTH;
    const a = Math.max(0, Math.min(0.9, (view.scale - 2.5) / 8));
    this.waves.alpha = a;
    this.streakGfx.alpha = Math.max(0, Math.min(1, (view.scale - 2) / 4));
  }

  /** 記錄船的位置，畫出逐漸消失的水痕 */
  trackShip(position: LonLat, moving: boolean) {
    const p = lonLatToView(position);
    const last = this.wake[this.wake.length - 1];
    const minStep = 4 / this.view.scale;
    if (moving && (!last || Math.hypot(p.x - last.p.x, p.y - last.p.y) > minStep)) {
      this.wake.push({ p, t: this.time });
    }
  }

  /** 船被移到另一圈海圖時，水痕跟著平移 */
  shiftWake(dx: number) {
    for (const w of this.wake) w.p = { x: w.p.x + dx, y: w.p.y };
  }

  clearWake() {
    this.wake = [];
  }

  update(dt: number) {
    this.time += dt;
    const inv = 1 / this.view.scale;
    const rad = (this.windToward * Math.PI) / 180;
    const dir = { x: Math.sin(rad), y: -Math.cos(rad) };

    // 波紋順著風慢慢漂
    const drift = 6 + 14 * this.windStrength;
    this.waves.tilePosition.x += dir.x * drift * dt;
    this.waves.tilePosition.y += dir.y * drift * dt;

    // 風的流線：在目前畫面範圍內隨機出現、順風移動、淡入淡出
    const left = -this.view.x * inv;
    const top = -this.view.y * inv;
    const w = this.size.width * inv;
    const h = this.size.height * inv;
    const spawn = (s: Streak) => {
      s.x = left + Math.random() * w;
      s.y = top + Math.random() * h;
      s.age = 0;
      s.life = 1.2 + Math.random() * 1.6;
    };
    while (this.streaks.length < STREAKS) {
      const s = { x: 0, y: 0, age: 0, life: 1 };
      spawn(s);
      s.age = Math.random() * s.life;
      this.streaks.push(s);
    }
    const speed = (40 + 160 * this.windStrength) * inv;
    const len = (10 + 22 * this.windStrength) * inv;
    const g = this.streakGfx;
    g.clear();
    if (this.windStrength > 0.05 && g.alpha > 0) {
      for (const s of this.streaks) {
        s.age += dt;
        s.x += dir.x * speed * dt;
        s.y += dir.y * speed * dt;
        if (s.age > s.life || s.x < left || s.y < top || s.x > left + w || s.y > top + h) spawn(s);
        const k = s.age / s.life;
        const alpha = Math.sin(k * Math.PI) * 0.55;
        g.moveTo(s.x, s.y)
          .lineTo(s.x - dir.x * len, s.y - dir.y * len)
          .stroke({ width: 1.3 * inv, color: 0xfbf6ea, alpha });
      }
    }

    // 船尾水痕
    this.wake = this.wake.filter((q) => this.time - q.t < WAKE_SECONDS);
    const wg = this.wakeGfx;
    wg.clear();
    for (let i = 1; i < this.wake.length; i++) {
      const a = this.wake[i - 1];
      const b = this.wake[i];
      const k = 1 - (this.time - b.t) / WAKE_SECONDS;
      wg.moveTo(a.p.x, a.p.y)
        .lineTo(b.p.x, b.p.y)
        .stroke({ width: (1 + 4 * k) * inv, color: 0xffffff, alpha: 0.55 * k });
    }
  }
}
