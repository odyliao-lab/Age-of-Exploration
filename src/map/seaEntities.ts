/**
 * 海上看得見的東西：其他船隊、風暴雲團、船的位置誤差圈。
 * 放在世界座標裡（跟著地圖移動）。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { DEG_PX, lonLatToView, wrapX } from './projection';
import { ShipSprite } from './shipSprite';
import type { View } from './viewport';

export interface FleetView {
  id: number;
  kind: 'pirate' | 'merchant' | 'envoy' | 'armada' | 'rival';
  position: LonLat;
  heading: number;
  chasing: boolean;
}

export interface MistView {
  id: number;
  center: LonLat;
  radiusKm: number;
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
  envoy: { hull: 0x6b2f1f, sail: 0xd9a93a, flag: 0xb5482b },
  armada: { hull: 0x5a2a18, sail: 0xb5482b, flag: 0xe0b94a },
  rival: { hull: 0x2c3f6b, sail: 0xf4ecd8, flag: 0xe0b94a },
};

const FLEET_NAMES = {
  pirate: '海盜快船',
  merchant: '商船',
  envoy: '使節船',
  armada: '鄭和的寶船艦隊',
  rival: '對手船長的船',
};

/** 寶船艦隊的隊形：旗艦在前，後面的船排成兩列（船頭朝上的座標） */
const ARMADA_FORMATION: [number, number, number][] = [
  [0, 0, 1.35],
  [-26, 26, 0.9],
  [26, 26, 0.9],
  [-50, 52, 0.8],
  [50, 52, 0.8],
  [0, 60, 0.8],
];

interface FleetSprite {
  ships: ShipSprite[];
  /** 跟著航向旋轉的船隻群組 */
  group: Container;
  root: Container;
  label: Text;
}

export class SeaEntities {
  readonly container = new Container();
  private stormGfx = new Graphics();
  private mistGfx = new Graphics();
  private mistLabels = new Container();
  private mists: MistView[] = [];
  private stormLabels = new Container();
  private errorGfx = new Graphics();
  private burstGfx = new Graphics();
  private bursts: { center: LonLat; t0: number }[] = [];
  private fleetLayer = new Container();
  private fleets = new Map<number, FleetSprite>();
  private storms: StormView[] = [];
  private view: View = { x: 0, y: 0, scale: 1 };
  private time = 0;
  private error: { center: LonLat; km: number } | null = null;

  constructor() {
    this.container.addChild(
      this.errorGfx,
      this.stormGfx,
      this.stormLabels,
      this.fleetLayer,
      this.mistGfx,
      this.mistLabels,
      this.burstGfx,
    );
  }

  setView(view: View) {
    this.view = view;
    const inv = 1 / view.scale;
    for (const f of this.fleets.values()) {
      f.root.x = wrapX(f.root.x);
      f.root.scale.set(inv * (view.scale >= 4 ? 1.5 : 1));
      f.label.visible = view.scale >= 4;
    }
    for (const l of [...this.stormLabels.children, ...this.mistLabels.children]) {
      l.x = wrapX(l.x);
      l.scale.set(inv);
    }
    this.drawError();
  }

  setFleets(list: FleetView[]) {
    const seen = new Set<number>();
    for (const f of list) {
      seen.add(f.id);
      let s = this.fleets.get(f.id);
      if (!s) {
        const group = new Container();
        const formation: [number, number, number][] =
          f.kind === 'armada' ? ARMADA_FORMATION : [[0, 0, 1]];
        const ships = formation.map(([x, y, k]) => {
          // 印度洋西側的海盜船與商船是三角帆船（dhow），東側是中式帆船
          const lateen = (f.kind === 'pirate' || f.kind === 'merchant') && f.position[0] < 80;
          const ship = new ShipSprite({ ...LOOKS[f.kind], rig: lateen ? 'lateen' : 'junk' });
          ship.root.position.set(x, y);
          ship.root.scale.set(k);
          group.addChild(ship.root);
          return ship;
        });
        const root = new Container();
        const label = new Text({
          text: FLEET_NAMES[f.kind],
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
        label.position.set(0, f.kind === 'armada' ? 70 : 24);
        root.addChild(group, label);
        this.fleetLayer.addChild(root);
        s = { ships, group, root, label };
        this.fleets.set(f.id, s);
      }
      const p = lonLatToView(f.position);
      s.root.position.set(p.x, p.y);
      s.group.rotation = (f.heading * Math.PI) / 180;
      s.label.text =
        f.kind === 'pirate' && f.chasing ? '海盜快船（追來了！）' : FLEET_NAMES[f.kind];
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
      const p = lonLatToView(s.center);
      t.position.set(p.x, p.y);
      this.stormLabels.addChild(t);
    }
    this.setView(this.view);
  }

  setMists(list: MistView[]) {
    this.mists = list;
    this.mistLabels.removeChildren().forEach((c) => c.destroy());
    for (const m of list) {
      const t = new Text({
        text: '海霧',
        style: {
          fontFamily: 'Noto Sans TC, PingFang TC, sans-serif',
          fontSize: 13,
          fontWeight: '700',
          fill: 0x4a5560,
          stroke: { color: 0xfbf6ea, width: 3 },
        },
        resolution: 2,
      });
      t.anchor.set(0.5);
      const p = lonLatToView(m.center);
      t.position.set(p.x, p.y);
      this.mistLabels.addChild(t);
    }
    this.setView(this.view);
  }

  /** 發現新地方：金色的光圈從那裡擴散出去 */
  celebrate(center: LonLat) {
    this.bursts.push({ center, t0: this.time });
  }

  private drawBursts() {
    const g = this.burstGfx;
    g.clear();
    this.bursts = this.bursts.filter((b) => this.time - b.t0 < 2.8);
    const inv = 1 / this.view.scale;
    for (const b of this.bursts) {
      const age = this.time - b.t0;
      const p = lonLatToView(b.center);
      for (let k = 0; k < 3; k++) {
        const t = age - k * 0.35;
        if (t < 0 || t > 1.8) continue;
        const r = (10 + t * 60) * inv;
        g.circle(p.x, p.y, r).stroke({ width: 3 * inv, color: 0xe0b94a, alpha: 1 - t / 1.8 });
      }
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + age * 0.6;
        const d = (12 + age * 45) * inv;
        const alpha = Math.max(0, 1 - age / 2.8);
        g.circle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2.2 * inv).fill({
          color: 0xfff1b8,
          alpha,
        });
      }
    }
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
    const p = lonLatToView(this.error.center);
    const r = (this.error.km / KM_PER_DEG) * DEG_PX;
    const inv = 1 / this.view.scale;
    // 虛線的段數跟著圈在畫面上的大小，放大時才不會變成一道道長刮痕
    const screenLen = 2 * Math.PI * r * this.view.scale;
    const n = 2 * Math.max(24, Math.min(360, Math.round(screenLen / 24)));
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
    for (const f of this.fleets.values()) for (const ship of f.ships) ship.drawRig(this.time);
    this.drawBursts();
    // 海霧：一團團慢慢起伏的白霧，蓋在船隊上面
    const mg = this.mistGfx;
    mg.clear();
    for (const m of this.mists) {
      const p = lonLatToView(m.center);
      const r = (m.radiusKm / KM_PER_DEG) * DEG_PX;
      mg.circle(p.x, p.y, r).fill({ color: 0xeef1f3, alpha: 0.35 });
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + Math.sin(this.time * 0.3 + k) * 0.15;
        const rr = r * (0.35 + (0.5 * ((k * 7) % 5)) / 5);
        const puff = r * (0.28 + 0.06 * Math.sin(this.time * 0.7 + k * 1.3));
        mg.circle(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, puff).fill({
          color: 0xf7f8f8,
          alpha: 0.16,
        });
      }
    }
    // 風暴：旋轉的雲帶
    const g = this.stormGfx;
    g.clear();
    for (const s of this.storms) {
      const p = lonLatToView(s.center);
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
