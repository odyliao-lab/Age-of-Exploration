/**
 * 畫面層（不跟著地圖移動）：夜晚變暗與星空、船上的燈、暴風雨的雨絲。
 */
import { Container, Graphics } from 'pixi.js';

const STARS = 140;
const RAIN = 160;

export class NightSky {
  readonly container = new Container();
  private dark = new Graphics();
  private stars = new Graphics();
  private lantern = new Graphics();
  private rainGfx = new Graphics();
  private darkness = 0;
  private raining = false;
  private size = { width: 1, height: 1 };
  private starPts: { x: number; y: number; r: number; tw: number }[] = [];
  private drops: { x: number; y: number; v: number }[] = [];
  private shipScreen: { x: number; y: number } | null = null;
  private time = 0;

  constructor() {
    this.container.addChild(this.dark, this.lantern, this.stars, this.rainGfx);
    this.container.eventMode = 'none';
    for (let i = 0; i < STARS; i++) {
      this.starPts.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() < 0.15 ? 1.6 : 1,
        tw: Math.random() * 6,
      });
    }
    for (let i = 0; i < RAIN; i++)
      this.drops.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 });
  }

  setSize(width: number, height: number) {
    this.size = { width, height };
  }

  /** 0 白天到 1 深夜 */
  setDarkness(d: number) {
    this.darkness = d;
  }

  setRain(on: boolean) {
    this.raining = on;
  }

  setShipScreen(p: { x: number; y: number } | null) {
    this.shipScreen = p;
  }

  update(dt: number) {
    this.time += dt;
    const { width: w, height: h } = this.size;
    const d = this.darkness;

    this.dark.clear();
    if (d > 0 || this.raining) {
      const a = 0.55 * d + (this.raining ? 0.18 : 0);
      this.dark.rect(0, 0, w, h).fill({ color: 0x0b1a33, alpha: Math.min(0.72, a) });
    }

    // 船燈：夜裡船的周圍亮一圈
    this.lantern.clear();
    if (d > 0.3 && this.shipScreen) {
      const { x, y } = this.shipScreen;
      for (let k = 5; k > 0; k--) {
        this.lantern.circle(x, y, 18 + k * 12).fill({ color: 0xf2c46b, alpha: 0.05 * d });
      }
    }

    this.stars.clear();
    if (d > 0.5 && !this.raining) {
      const a = (d - 0.5) * 2;
      for (const s of this.starPts) {
        const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + s.tw);
        this.stars.circle(s.x * w, s.y * h, s.r).fill({ color: 0xfffbe8, alpha: 0.7 * a * tw });
      }
    }

    this.rainGfx.clear();
    if (this.raining) {
      for (const r of this.drops) {
        r.y += r.v * dt * 1.6;
        r.x -= r.v * dt * 0.4;
        if (r.y > 1) {
          r.y -= 1;
          r.x = Math.random() * 1.2;
        }
        const x = r.x * w;
        const y = r.y * h;
        this.rainGfx.moveTo(x, y).lineTo(x - 5, y + 16);
      }
      this.rainGfx.stroke({ width: 1.2, color: 0xcfe0ef, alpha: 0.55 });
    }
  }
}
