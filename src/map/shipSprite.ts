/**
 * 俯視的帆船，兩種樣式：
 * - 中式帆船（戎克船）：方首、寬尾、三桅竹條硬帆；
 * - 印度洋的三角帆船（dhow）：尖首尖尾、船身細長，兩桅掛長桁三角帆。
 *
 * 帆會依風向「調帆」：風從哪一側吹來，帆就擺到另一側（下風側）；
 * 越接近順風，帆越橫過船身。收帆時只剩捲起的帆束，半帆時帆面較短。
 * 船頭朝上（-y），由容器旋轉成實際航向。
 */
import { Container, Graphics } from 'pixi.js';
import type { SailSetting } from '@/game/sailing';

export interface ShipLook {
  hull: number;
  sail: number;
  flag: number;
  /** 船型樣式（預設中式帆船） */
  rig?: 'junk' | 'lateen' | 'square' | 'vaka';
}

export interface SailTrim {
  /** 風吹向相對於船頭的角度（-180, 180]；0 表示風從船尾吹向船頭 */
  windRel: number;
  /** 船頭與風吹來方向的夾角 0–180 */
  angleOffWind: number;
  sail: SailSetting;
}

const INK = 0x2b2118;
const MASTS = [
  { y: -9, len: 15 },
  { y: 1, len: 21 },
  { y: 11, len: 12 },
];
/** 橫帆船（克拉克帆船）的桅：前桅、主桅掛橫帆，後桅掛三角帆 */
const SQUARE_MASTS = [
  { y: -10, len: 13 },
  { y: 1, len: 17 },
];
const SQUARE_MIZZEN = { y: 12, len: 11 };

/** 三角帆船的桅：主桅在前、後桅較小 */
const LATEEN_MASTS = [
  { y: -5, len: 24 },
  { y: 9, len: 14 },
];

export class ShipSprite {
  readonly root = new Container();
  private hull = new Graphics();
  private sails = new Graphics();
  private flag = new Graphics();
  private look: ShipLook;
  private trim: SailTrim = { windRel: 0, angleOffWind: 180, sail: 1 };

  constructor(look: ShipLook) {
    this.look = look;
    this.root.addChild(this.hull, this.sails, this.flag);
    this.drawHull();
    this.drawRig(0);
  }

  setLook(look: ShipLook) {
    this.look = look;
    this.drawHull();
    this.drawRig(0);
  }

  setTrim(trim: SailTrim) {
    this.trim = trim;
  }

  private drawHull() {
    const g = this.hull;
    g.clear();
    if (this.look.rig === 'vaka') {
      // 雙體獨木舟：兩條細長的船身，中間用橫木與平台連起來
      for (const x of [-6, 6]) {
        g.poly([x, -20, x + 2.5, -12, x + 2.5, 14, x, 20, x - 2.5, 14, x - 2.5, -12], true)
          .fill({ color: this.look.hull })
          .stroke({ width: 1.1, color: INK });
      }
      g.rect(-6, -6, 12, 14)
        .fill({ color: 0x8a5a33, alpha: 0.9 })
        .stroke({ width: 0.8, color: INK });
      for (const y of [-12, 12]) g.moveTo(-6, y).lineTo(6, y);
      g.stroke({ width: 1.2, color: INK });
      return;
    }
    if (this.look.rig === 'square') {
      // 克拉克帆船：圓胖的船身，船頭船尾有高起的船樓
      g.poly(
        [0, -22, 5, -17, 8, -8, 8.5, 6, 7.5, 16, 5, 21, -5, 21, -7.5, 16, -8.5, 6, -8, -8, -5, -17],
        true,
      )
        .fill({ color: this.look.hull })
        .stroke({ width: 1.3, color: INK });
      g.poly([-4, -18, 4, -18, 6, -12, -6, -12], true)
        .fill({ color: 0x8a5a33, alpha: 0.9 })
        .stroke({ width: 0.8, color: INK });
      g.poly([-6.5, 12, 6.5, 12, 5, 20, -5, 20], true)
        .fill({ color: 0x8a5a33, alpha: 0.9 })
        .stroke({ width: 0.8, color: INK });
      return;
    }
    if (this.look.rig === 'lateen') {
      // 尖首尖尾、船身細長；船板用椰子纖維縫合，不用鐵釘
      g.poly(
        [0, -22, 4.5, -12, 6.5, 0, 6, 12, 3.5, 19, 0, 21, -3.5, 19, -6, 12, -6.5, 0, -4.5, -12],
        true,
      )
        .fill({ color: this.look.hull })
        .stroke({ width: 1.3, color: INK });
      g.poly([-4.5, 11, 4.5, 11, 3, 18, -3, 18], true)
        .fill({ color: 0x8a5a33, alpha: 0.9 })
        .stroke({ width: 0.8, color: INK });
      // 縫線
      for (const y of [-10, -2, 6]) g.moveTo(-5, y).lineTo(5, y);
      g.stroke({ width: 0.5, color: INK, alpha: 0.45 });
      return;
    }
    // 方首、船身最寬處在中後段、方尾
    g.poly(
      [
        -4.5, -19, 4.5, -19, 7.5, -10, 8.5, 4, 7.5, 16, 6.5, 20, -6.5, 20, -7.5, 16, -8.5, 4, -7.5,
        -10,
      ],
      true,
    )
      .fill({ color: this.look.hull })
      .stroke({ width: 1.3, color: INK });
    // 甲板與船尾樓
    g.poly([-5.5, 12, 5.5, 12, 5.5, 19, -5.5, 19], true)
      .fill({ color: 0x8a5a33, alpha: 0.9 })
      .stroke({ width: 0.8, color: INK });
    for (const y of [-12, -4, 4]) g.moveTo(-6, y).lineTo(6, y);
    g.stroke({ width: 0.5, color: INK, alpha: 0.5 });
  }

  /** 每一幀依調帆角度與旗子擺動重畫帆與旗 */
  drawRig(time: number) {
    const g = this.sails;
    g.clear();
    const { windRel, angleOffWind, sail } = this.trim;
    // 帆擺向下風側：風從右舷來（windRel < 0 表示風吹向左方），帆向左擺
    const leeward = windRel >= 0 ? 1 : -1;
    // 帆與船身中線的夾角：頂風時貼近中線，順風時接近橫向
    const swing = Math.min(80, Math.max(12, angleOffWind / 2)) * leeward;
    const rad = (swing * Math.PI) / 180;
    if (this.look.rig === 'lateen' || this.look.rig === 'vaka')
      this.drawLateen(g, rad, leeward, sail);
    else if (this.look.rig === 'square') this.drawSquare(g, windRel, leeward, sail, rad);
    else this.drawLug(g, rad, leeward, sail);
    this.drawFlag(time, windRel);
  }

  /**
   * 橫帆：帆桁橫掛在桅上，俯視是一條橫過船身、鼓起的帆面。
   * 橫帆只能轉動有限的角度（大約 45°），所以很難接近逆風。
   */
  private drawSquare(
    g: Graphics,
    windRel: number,
    leeward: number,
    sail: SailSetting,
    rad: number,
  ) {
    // 帆桁與船身垂直的偏轉角：順風時橫著，側風時轉到最多 45°
    const brace = (Math.min(45, Math.abs(windRel) / 2) * leeward * Math.PI) / 180;
    for (const m of SQUARE_MASTS) {
      g.circle(0, m.y, 1.2).fill({ color: INK });
      const half = m.len / 2;
      const cx = Math.cos(brace) * half;
      const cy = Math.sin(brace) * half;
      if (sail === 0) {
        // 收帆：帆捲在帆桁上
        g.moveTo(-cx, m.y - cy)
          .lineTo(cx, m.y + cy)
          .stroke({ width: 2, color: this.look.sail });
        g.moveTo(-cx, m.y - cy)
          .lineTo(cx, m.y + cy)
          .stroke({ width: 0.6, color: INK });
        continue;
      }
      // 帆往下風鼓起（往船尾方向）
      const belly = sail === 2 ? 4 : 2.5;
      const bx = -Math.sin(brace) * belly;
      const by = Math.cos(brace) * belly;
      g.moveTo(-cx, m.y - cy)
        .quadraticCurveTo(bx * 2, m.y + by * 2, cx, m.y + cy)
        .lineTo(-cx, m.y - cy)
        .fill({ color: this.look.sail, alpha: 0.95 })
        .stroke({ width: 0.9, color: INK });
      g.moveTo(-cx * 1.08, m.y - cy * 1.08)
        .lineTo(cx * 1.08, m.y + cy * 1.08)
        .stroke({ width: 1.1, color: INK });
    }
    // 後桅的三角帆，幫助轉向
    const mz = SQUARE_MIZZEN;
    g.circle(0, mz.y, 1).fill({ color: INK });
    if (sail !== 0) {
      const len = mz.len;
      const fx = -Math.sin(rad) * len * 0.3;
      const fy = mz.y - Math.cos(rad) * len * 0.3;
      const ax = Math.sin(rad) * len * 0.7;
      const ay = mz.y + Math.cos(rad) * len * 0.7;
      const nx = Math.cos(rad) * 2.5 * leeward;
      const ny = -Math.sin(rad) * 2.5 * leeward;
      g.moveTo(fx, fy)
        .lineTo(ax, ay)
        .lineTo((fx + ax) / 2 + nx * 1.5, (fy + ay) / 2 + ny * 1.5)
        .lineTo(fx, fy)
        .fill({ color: this.look.sail, alpha: 0.95 })
        .stroke({ width: 0.8, color: INK });
    }
  }

  /** 長桁三角帆：長桁斜掛在桅上，前端壓低、後端高舉；俯視是一片細長的三角形 */
  private drawLateen(g: Graphics, rad: number, leeward: number, sail: SailSetting) {
    for (const m of LATEEN_MASTS) {
      g.circle(0, m.y, 1.1).fill({ color: INK });
      if (sail === 0) {
        // 收帆：長桁放下，沿著船身
        g.moveTo(0, m.y - m.len * 0.45)
          .lineTo(0, m.y + m.len * 0.45)
          .stroke({ width: 1.6, color: this.look.sail });
        g.moveTo(0, m.y - m.len * 0.45)
          .lineTo(0, m.y + m.len * 0.45)
          .stroke({ width: 0.5, color: INK });
        continue;
      }
      const len = m.len * (sail === 1 ? 0.7 : 1);
      // 長桁約四成在桅前、六成在桅後
      const fx = -Math.sin(rad) * len * 0.4;
      const fy = m.y - Math.cos(rad) * len * 0.4;
      const ax = Math.sin(rad) * len * 0.6;
      const ay = m.y + Math.cos(rad) * len * 0.6;
      const belly = (sail === 2 ? 4.5 : 3) * leeward;
      const nx = Math.cos(rad) * belly;
      const ny = -Math.sin(rad) * belly;
      // 帆腳拉到桅的下風側，形成三角形
      const cx = (fx + ax) / 2 + nx * 1.6;
      const cy = (fy + ay) / 2 + ny * 1.6;
      g.moveTo(fx, fy)
        .lineTo(ax, ay)
        .quadraticCurveTo(ax * 0.3 + cx * 0.7, ay * 0.3 + cy * 0.7, cx, cy)
        .lineTo(fx, fy)
        .fill({ color: this.look.sail, alpha: 0.95 })
        .stroke({ width: 0.9, color: INK });
      // 長桁
      g.moveTo(fx * 1.1, fy + (fy - m.y) * 0.1)
        .lineTo(ax * 1.05, ay + (ay - m.y) * 0.05)
        .stroke({ width: 1.1, color: INK });
    }
  }

  private drawLug(g: Graphics, rad: number, leeward: number, sail: SailSetting) {
    for (const m of MASTS) {
      g.circle(0, m.y, 1.2).fill({ color: INK });
      if (sail === 0) {
        // 收帆：帆束沿著船身
        g.roundRect(-1.2, m.y - 1, 2.4, m.len * 0.35, 1)
          .fill({ color: this.look.sail })
          .stroke({ width: 0.6, color: INK });
        continue;
      }
      const len = m.len * (sail === 1 ? 0.6 : 1);
      // 硬帆約兩成在桅前、八成在桅後；俯視是一條略帶弧度的帆面
      const fx = -Math.sin(rad) * len * 0.2;
      const fy = m.y - Math.cos(rad) * len * 0.2;
      const ax = Math.sin(rad) * len * 0.8;
      const ay = m.y + Math.cos(rad) * len * 0.8;
      const belly = 2.2 * (sail === 2 ? 1 : 0.6);
      const nx = Math.cos(rad) * belly * leeward;
      const ny = -Math.sin(rad) * belly * leeward;
      g.moveTo(fx, fy)
        .quadraticCurveTo((fx + ax) / 2 + nx * 2, (fy + ay) / 2 + ny * 2, ax, ay)
        .lineTo(fx, fy)
        .fill({ color: this.look.sail, alpha: 0.95 })
        .stroke({ width: 0.9, color: INK });
      // 竹條（帆骨）
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const bx = fx + (ax - fx) * t;
        const by = fy + (ay - fy) * t;
        g.moveTo(bx - nx * 0.2, by - ny * 0.2).lineTo(bx + nx * 1.4, by + ny * 1.4);
      }
      g.stroke({ width: 0.5, color: INK, alpha: 0.7 });
    }
  }

  /** 船尾旗：順著風飄 */
  private drawFlag(time: number, windRel: number) {
    const f = this.flag;
    f.clear();
    const flagRad = ((windRel + Math.sin(time * 6) * 8) * Math.PI) / 180;
    const px = 0;
    const py = this.look.rig === 'lateen' || this.look.rig === 'vaka' ? 19 : 20;
    // 船體座標以船頭為上（-y）：角度 θ 的方向向量是 (sin θ, -cos θ)
    const tx = px + Math.sin(flagRad) * 7;
    const ty = py - Math.cos(flagRad) * 7;
    const wx = Math.cos(flagRad) * 3;
    const wy = Math.sin(flagRad) * 3;
    f.moveTo(px, py)
      .lineTo(tx, ty)
      .lineTo(tx + wx, ty + wy)
      .lineTo(px + wx, py + wy);
    f.fill({ color: this.look.flag }).stroke({ width: 0.6, color: INK });
  }
}
