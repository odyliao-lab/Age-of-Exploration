/**
 * 畫面層（不跟著地圖移動）：夜晚變暗與星空、船上的燈、暴風雨的雨絲、海霧。
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
  private mistGfx = new Graphics();
  /** 霧的濃度 0–1，進出霧區時漸變 */
  private mist = 0;
  private misty = false;
  private darkness = 0;
  private raining = false;
  private size = { width: 1, height: 1 };
  private starPts: { x: number; y: number; r: number; tw: number }[] = [];
  private drops: { x: number; y: number; v: number }[] = [];
  private shipScreen: { x: number; y: number } | null = null;
  private time = 0;

  constructor() {
    this.container.addChild(this.dark, this.lantern, this.stars, this.rainGfx, this.mistGfx);
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

  setMist(on: boolean) {
    this.misty = on;
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
    // 黃昏與黎明：天邊一層暖暖的橘紅色霞光
    const glow = Math.sin(Math.PI * Math.min(1, d)) * (this.raining ? 0.3 : 1) * (1 - this.mist);
    if (glow > 0.02) {
      // 細細的橫帶一層層變淡，看起來像漸層
      const bands = 48;
      const band = Math.ceil((h * 0.55) / bands);
      for (let k = 0; k < bands; k++) {
        const t = k / bands;
        this.dark
          .rect(0, k * band, w, band)
          .fill({ color: 0xf28a45, alpha: glow * 0.28 * (1 - t) * (1 - t) });
      }
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
    if (d > 0.5 && !this.raining && this.mist < 0.9) {
      const a = (d - 0.5) * 2 * (1 - this.mist);
      for (const s of this.starPts) {
        const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + s.tw);
        this.stars.circle(s.x * w, s.y * h, s.r).fill({ color: 0xfffbe8, alpha: 0.7 * a * tw });
      }
    }

    // 霧：畫面慢慢蒙上一層白，船附近稍微看得清楚
    this.mist += ((this.misty ? 1 : 0) - this.mist) * Math.min(1, dt * 1.5);
    this.mistGfx.clear();
    if (this.mist > 0.01) {
      const m = this.mist;
      this.mistGfx.rect(0, 0, w, h).fill({ color: 0xe6ebee, alpha: 0.38 * m });
      if (this.shipScreen) {
        const { x, y } = this.shipScreen;
        const R = Math.max(w, h);
        for (let k = 1; k <= 10; k++) {
          const r = R * (0.15 + k * 0.07);
          this.mistGfx.circle(x, y, r).stroke({
            width: R * 0.075,
            color: 0xf1f4f5,
            alpha: 0.045 * m,
          });
        }
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
