/**
 * 看得見的海洋生物與景象：船員說「看！海豚！」的時候，船邊真的出現海豚。
 * 放在世界座標裡，大小以畫面像素計（除以縮放倍率），幾秒後消失。
 */
import { Container, Graphics } from 'pixi.js';
import type { SeaSight } from '@/game/crewTalk';

interface Sighting {
  kind: SeaSight;
  /** 出現時船的位置（世界座標）與航向 */
  x: number;
  y: number;
  heading: number;
  t0: number;
}

const DURATION: Record<SeaSight, number> = {
  dolphins: 6,
  whale: 6,
  flyingfish: 3.5,
  waterspout: 9,
  albatross: 7,
  birds: 6,
};

/** 淡入淡出：開頭與結尾各 0.6 秒 */
function fade(age: number, dur: number): number {
  return Math.max(0, Math.min(1, age / 0.6, (dur - age) / 0.6));
}

export class SeaLife {
  readonly container = new Container();
  private gfx = new Graphics();
  private list: Sighting[] = [];
  private time = 0;
  private scale = 1;

  constructor() {
    this.container.addChild(this.gfx);
    this.container.eventMode = 'none';
  }

  setScale(scale: number) {
    this.scale = scale;
  }

  show(kind: SeaSight, at: { x: number; y: number }, heading: number) {
    this.list = this.list.filter((s) => s.kind !== kind);
    this.list.push({ kind, x: at.x, y: at.y, heading, t0: this.time });
  }

  update(dt: number) {
    this.time += dt;
    const g = this.gfx;
    g.clear();
    this.list = this.list.filter((s) => this.time - s.t0 < DURATION[s.kind]);
    // 船在航行時會放大顯示，生物也跟著放大，才看得清楚
    const px = 1.8 / this.scale;
    for (const s of this.list) {
      const age = this.time - s.t0;
      const a = fade(age, DURATION[s.kind]);
      // 船頭方向與右舷方向（畫面座標：y 向下）
      const rad = (s.heading * Math.PI) / 180;
      const fwd = { x: Math.sin(rad), y: -Math.cos(rad) };
      const right = { x: -fwd.y, y: fwd.x };
      const at = (f: number, r: number) => ({
        x: s.x + (fwd.x * f + right.x * r) * px,
        y: s.y + (fwd.y * f + right.y * r) * px,
      });
      switch (s.kind) {
        case 'dolphins':
          for (let i = 0; i < 3; i++) {
            const phase = age * 2.4 + i * 1.3;
            const leap = Math.sin(phase);
            const p = at(30 + age * 6 + i * 12, 22 + i * 9);
            if (leap > 0) {
              // 躍出水面的弧形身體與背鰭
              const lift = leap * 6 * px;
              const ang = rad - Math.PI / 2 + Math.cos(phase) * 0.6;
              const bx = Math.cos(ang) * 6 * px;
              const by = Math.sin(ang) * 6 * px;
              const top = p.y - lift - 3 * px;
              g.moveTo(p.x - bx, p.y - by - lift)
                .quadraticCurveTo(p.x, top, p.x + bx, p.y + by - lift)
                .stroke({ width: 4.2 * px, color: 0x55687a, alpha: a, cap: 'round' });
              // 背鰭
              g.poly(
                [
                  p.x - 1.5 * px,
                  top + 0.5 * px,
                  p.x + 1 * px,
                  top - 3 * px,
                  p.x + 1.8 * px,
                  top + 0.5 * px,
                ],
                true,
              ).fill({ color: 0x55687a, alpha: a });
              // 尾鰭
              const tx = p.x - bx;
              const ty = p.y - by - lift;
              g.poly([tx, ty, tx - 2.5 * px, ty - 2 * px, tx - 2.5 * px, ty + 2 * px], true).fill({
                color: 0x55687a,
                alpha: a,
              });
            } else {
              g.circle(p.x, p.y, (2 - leap * 3) * px).stroke({
                width: 1 * px,
                color: 0xffffff,
                alpha: a * 0.7,
              });
            }
          }
          break;
        case 'whale': {
          const p = at(10, 55);
          const rise = Math.sin(Math.min(1, age / 2) * Math.PI * 0.5);
          g.ellipse(p.x, p.y, 14 * px, 4.5 * px * rise + 0.5 * px).fill({
            color: 0x2e3a46,
            alpha: a * 0.9,
          });
          // 噴氣：一團往上散開的白霧
          if (age > 0.8 && age < 3.5) {
            const k = (age - 0.8) / 2.7;
            for (let i = 0; i < 9; i++) {
              const spread = (i - 4) * 1.4 * k;
              const h = (6 + 16 * k + (i % 3) * 2) * px;
              g.circle(p.x - 6 * px + spread * px, p.y - h, (1.5 + 2.5 * k) * px).fill({
                color: 0xffffff,
                alpha: a * 0.6 * (1 - k * 0.7),
              });
            }
          }
          break;
        }
        case 'flyingfish':
          for (let i = 0; i < 6; i++) {
            const t = (age * 1.6 + i * 0.17) % 1.4;
            const p = at(20 + i * 5 + t * 45, -30 + i * 7 + t * 30);
            const hop = Math.sin(Math.min(1, t) * Math.PI) * 5 * px;
            g.moveTo(p.x - 3 * px, p.y - hop)
              .lineTo(p.x + 3 * px, p.y - hop)
              .stroke({ width: 1.6 * px, color: 0xd8e4ec, alpha: a });
            g.moveTo(p.x - 1 * px, p.y - hop)
              .lineTo(p.x, p.y - hop - 2.5 * px)
              .lineTo(p.x + 1 * px, p.y - hop)
              .stroke({ width: 1 * px, color: 0xd8e4ec, alpha: a });
          }
          break;
        case 'waterspout': {
          const base = at(90, -70);
          for (let i = 0; i < 16; i++) {
            const k = i / 15;
            const wob = Math.sin(age * 2 + k * 4) * 4 * px * k;
            g.circle(base.x + wob, base.y - k * 70 * px, (2 + k * 6) * px).fill({
              color: 0x6f7c88,
              alpha: a * 0.35,
            });
          }
          g.ellipse(base.x, base.y, 9 * px, 3 * px).fill({ color: 0xffffff, alpha: a * 0.5 });
          break;
        }
        case 'albatross':
        case 'birds': {
          const n = s.kind === 'albatross' ? 1 : 4;
          const span = s.kind === 'albatross' ? 13 : 5;
          const color = s.kind === 'albatross' ? 0xf4f1ea : 0x3a3228;
          for (let i = 0; i < n; i++) {
            const ang = age * 0.5 + i * 0.5;
            const r = 45 + i * 8;
            const p = at(Math.cos(ang) * r, Math.sin(ang) * r);
            const flap = s.kind === 'albatross' ? 1 : 1 + Math.sin(age * 9 + i) * 0.6;
            g.moveTo(p.x - span * px, p.y - 2 * flap * px)
              .quadraticCurveTo(p.x - span * 0.4 * px, p.y - 3 * flap * px, p.x, p.y)
              .quadraticCurveTo(
                p.x + span * 0.4 * px,
                p.y - 3 * flap * px,
                p.x + span * px,
                p.y - 2 * flap * px,
              )
              .stroke({ width: (s.kind === 'albatross' ? 2.2 : 1.4) * px, color, alpha: a });
          }
          break;
        }
      }
    }
  }
}
