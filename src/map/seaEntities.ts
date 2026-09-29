/**
 * 海上看得見的東西：其他船隊、風暴雲團、船的位置誤差圈。
 * 放在世界座標裡（跟著地圖移動）。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { DEG_PX, lonLatToWorld } from './projection';
import { ShipSprite } from './shipSprite';
import type { View } from './viewport';

export interface FleetView {
  id: number;
  kind: 'pirate' | 'merchant';
  position: LonLat;
  heading: number;
  chasing: boolean;
}

export interface StormView {
  id: number;
  center: LonLat;
  radiusKm: number;
  name: string;
}

const KM_PER_DEG = 111.32;

const LOOKS = {
  pirate: { hull: 0x2b2118, sail: 0x7a2a1c, flag: 0x111111 },
  merchant: { hull: 0x8a5a33, sail: 0xe8d9b5, flag: 0x2f7d6a },
};

interface FleetSprite {
  ship: ShipSprite;
  root: Container;
  label: Text;
}

export class SeaEntities {
  readonly container = new Container();
  private stormGfx = new Graphics();
  private stormLabels = new Container();
  private errorGfx = new Graphics();
  private fleetLayer = new Container();
  private fleets = new Map<number, FleetSprite>();
  private storms: StormView[] = [];
  private view: View = { x: 0, y: 0, scale: 1 };
  private time = 0;
  private error: { center: LonLat; km: number } | null = null;

  constructor() {
    this.container.addChild(this.errorGfx, this.stormGfx, this.stormLabels, this.fleetLayer);
  }

  setView(view: View) {
    this.view = view;
    const inv = 1 / view.scale;
    for (const f of this.fleets.values()) {
      f.root.scale.set(inv * (view.scale >= 4 ? 1.5 : 1));
      f.label.visible = view.scale >= 4;
    }
    for (const l of this.stormLabels.children) l.scale.set(inv);
    this.drawError();
  }

  setFleets(list: FleetView[]) {
    const seen = new Set<number>();
    for (const f of list) {
      seen.add(f.id);
      let s = this.fleets.get(f.id);
      if (!s) {
        const ship = new ShipSprite(LOOKS[f.kind]);
        const root = new Container();
        const label = new Text({
          text: f.kind === 'pirate' ? '海盜快船' : '商船',
          style: {
            fontFamily: 'Noto Sans TC, PingFang TC, sans-serif',
            fontSize: 12,
            fontWeight: '700',
            fill: f.kind === 'pirate' ? 0x7a2a1c : 0x2b2118,
            stroke: { color: 0xfbf6ea, width: 3 },
          },
          resolution: 2,
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, 24);
        root.addChild(ship.root, label);
        this.fleetLayer.addChild(root);
        s = { ship, root, label };
        this.fleets.set(f.id, s);
      }
      const p = lonLatToWorld(f.position);
      s.root.position.set(p.x, p.y);
      s.ship.root.rotation = (f.heading * Math.PI) / 180;
      s.label.text =
        f.kind === 'pirate' ? (f.chasing ? '海盜快船（追來了！）' : '海盜快船') : '商船';
    }
    for (const [id, s] of this.fleets) {
      if (seen.has(id)) continue;
      s.root.destroy({ children: true });
      this.fleets.delete(id);
    }
    this.setView(this.view);
  }

  setStorms(list: StormView[]) {
    this.storms = list;
    this.stormLabels.removeChildren().forEach((c) => c.destroy());
    for (const s of list) {
      const t = new Text({
        text: `⚠ ${s.name}`,
        style: {
          fontFamily: 'Noto Sans TC, PingFang TC, sans-serif',
          fontSize: 13,
          fontWeight: '700',
          fill: 0xfbf6ea,
          stroke: { color: 0x2b2118, width: 3 },
        },
        resolution: 2,
      });
      t.anchor.set(0.5);
      const p = lonLatToWorld(s.center);
      t.position.set(p.x, p.y);
      this.stormLabels.addChild(t);
    }
    this.setView(this.view);
  }

  /** 位置誤差圈：船「大概」在這個範圍內 */
  setError(center: LonLat | null, km: number) {
    this.error = center && km > 8 ? { center, km } : null;
    this.drawError();
  }

  private drawError() {
    const g = this.errorGfx;
    g.clear();
    if (!this.error) return;
    const p = lonLatToWorld(this.error.center);
    const r = (this.error.km / KM_PER_DEG) * DEG_PX;
    const inv = 1 / this.view.scale;
    const n = 48;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      g.moveTo(p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r).lineTo(
        p.x + Math.cos(a1) * r,
        p.y + Math.sin(a1) * r,
      );
    }
    g.stroke({ width: 2 * inv, color: 0x7a2e1b, alpha: 0.55 });
  }

  update(dt: number) {
    this.time += dt;
    for (const f of this.fleets.values()) f.ship.drawRig(this.time);
    // 風暴：旋轉的雲帶
    const g = this.stormGfx;
    g.clear();
    for (const s of this.storms) {
      const p = lonLatToWorld(s.center);
      const r = (s.radiusKm / KM_PER_DEG) * DEG_PX;
      g.circle(p.x, p.y, r).fill({ color: 0x3a3f4a, alpha: 0.35 });
      g.circle(p.x, p.y, r * 0.55).fill({ color: 0x2b2f38, alpha: 0.3 });
      for (let arm = 0; arm < 4; arm++) {
        const base = this.time * 0.8 + (arm * Math.PI) / 2;
        for (let k = 0; k < 14; k++) {
          const t = k / 14;
          const a = base + t * 2.6;
          const rr = r * (0.15 + 0.85 * t);
          g.circle(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, r * (0.1 + 0.06 * (1 - t))).fill(
            {
              color: 0xdfe3e8,
              alpha: 0.18 * (1 - t * 0.6),
            },
          );
        }
      }
    }
  }
}
