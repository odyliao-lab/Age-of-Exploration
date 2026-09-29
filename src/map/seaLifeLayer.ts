/**
 * 海上的動態物件（企畫書 v2 4.6、4.2）：其他船隻、風暴與霧，以及推算位置的不確定圈。
 * 世界座標；以畫面像素決定大小，縮放時看起來一樣大。
 */
import { Container, Graphics } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { DEG_PX, lonLatToWorld } from './projection';
import { ShipSprite } from './shipSprite';

export interface TrafficView {
  id: number;
  kind: 'pirate' | 'merchant' | 'envoy';
  position: LonLat;
  heading: number;
  chasing: boolean;
}

export interface WeatherView {
  id: number;
  kind: 'storm' | 'fog';
  center: LonLat;
  radiusKm: number;
}

const LOOKS = {
  pirate: { hull: 0x2b2118, sail: 0x6b2e22, flag: 0x111111 },
  merchant: { hull: 0x8a5a2b, sail: 0xe8dcc0, flag: 0x2f7d4a },
  envoy: { hull: 0x9b2d20, sail: 0xf2d27a, flag: 0xf2b134 },
};

const KM_PER_DEG = 111.2;

/** 地圖上 km 公里的橢圓半徑（等距圓柱投影：東西方向隨緯度拉長） */
function radii(center: LonLat, km: number) {
  const ry = (km / KM_PER_DEG) * DEG_PX;
  const rx = ry / Math.max(0.2, Math.cos((center[1] * Math.PI) / 180));
  return { rx, ry };
}

interface ShipNode {
  view: TrafficView;
  root: Container;
  sprite: ShipSprite;
}

export class SeaLifeLayer {
  /** 天氣：畫在迷霧上面，遠方的烏雲也看得見 */
  readonly weather = new Container();
  /** 船隻與不確定圈：畫在港口與玩家船之間 */
  readonly ships = new Container();
  private weatherGfx = new Graphics();
  private ringGfx = new Graphics();
  private uncertaintyGfx = new Graphics();
  private nodes = new Map<number, ShipNode>();
  private cells: WeatherView[] = [];
  private shipAt: LonLat | null = null;
  private errorKm = 0;
  private scale = 1;
  private time = 0;
  private windToward = 225;

  constructor() {
    this.weather.addChild(this.weatherGfx);
    this.ships.addChild(this.uncertaintyGfx, this.ringGfx);
  }

  setScale(scale: number) {
    this.scale = scale;
    const inv = 1 / scale;
    for (const n of this.nodes.values()) n.root.scale.set(inv * (scale >= 4 ? 1.5 : 1));
    this.drawUncertainty();
  }

  /** 風吹向的方位角：NPC 船的帆也順著風擺 */
  setWind(toward: number) {
    this.windToward = toward;
  }

  setTraffic(ships: TrafficView[]) {
    const keep = new Set(ships.map((s) => s.id));
    for (const [id, n] of this.nodes) {
      if (!keep.has(id)) {
        n.root.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
    for (const v of ships) {
      let n = this.nodes.get(v.id);
      if (!n) {
        const sprite = new ShipSprite(LOOKS[v.kind]);
        const root = new Container();
        root.addChild(sprite.root);
        this.ships.addChild(root);
        n = { view: v, root, sprite };
        this.nodes.set(v.id, n);
      }
      n.view = v;
      const p = lonLatToWorld(v.position);
      n.root.position.set(p.x, p.y);
      n.root.rotation = (v.heading * Math.PI) / 180;
      const rel = ((this.windToward - v.heading + 540) % 360) - 180;
      n.sprite.setTrim({ windRel: rel, angleOffWind: 180 - Math.abs(rel), sail: 2 });
    }
    this.setScale(this.scale);
  }

  setWeather(cells: WeatherView[]) {
    this.cells = cells;
  }

  /** 推算位置的不確定圈：船長以為自己在這個圈子裡的某處 */
  setUncertainty(ship: LonLat | null, errorKm: number) {
    this.shipAt = ship;
    this.errorKm = errorKm;
    this.drawUncertainty();
  }

  private drawUncertainty() {
    const g = this.uncertaintyGfx;
    g.clear();
    if (!this.shipAt || this.errorKm < 6) return;
    const c = lonLatToWorld(this.shipAt);
    const { rx, ry } = radii(this.shipAt, this.errorKm);
    const inv = 1 / this.scale;
    g.ellipse(c.x, c.y, rx, ry).fill({ color: 0x7a2e1b, alpha: 0.06 });
    // 虛線圓周
    const n = 48;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      g.moveTo(c.x + Math.cos(a0) * rx, c.y + Math.sin(a0) * ry).lineTo(
        c.x + Math.cos(a1) * rx,
        c.y + Math.sin(a1) * ry,
      );
    }
    g.stroke({ width: 1.6 * inv, color: 0x7a2e1b, alpha: 0.7 });
  }

  update(dt: number) {
    this.time += dt;
    const inv = 1 / this.scale;
    for (const n of this.nodes.values()) n.sprite.drawRig(this.time);

    // 追趕中的海盜：紅色脈動圈
    const rg = this.ringGfx;
    rg.clear();
    for (const n of this.nodes.values()) {
      if (!n.view.chasing) continue;
      const p = lonLatToWorld(n.view.position);
      const k = (Math.sin(this.time * 5) + 1) / 2;
      rg.circle(p.x, p.y, (26 + 8 * k) * inv).stroke({
        width: 2.5 * inv,
        color: 0xd0021b,
        alpha: 0.5 + 0.4 * k,
      });
    }

    // 天氣
    const g = this.weatherGfx;
    g.clear();
    for (const c of this.cells) {
      const p = lonLatToWorld(c.center);
      const { rx, ry } = radii(c.center, c.radiusKm);
      if (c.kind === 'fog') {
        // 幾團交疊的白霧，緩慢飄動
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.time * 0.08;
          const d = 0.45;
          g.ellipse(
            p.x + Math.cos(a) * rx * d,
            p.y + Math.sin(a) * ry * d,
            rx * 0.65,
            ry * 0.65,
          ).fill({ color: 0xf4f1ea, alpha: 0.22 });
        }
        g.ellipse(p.x, p.y, rx * 0.7, ry * 0.7).fill({ color: 0xffffff, alpha: 0.25 });
        continue;
      }
      // 風暴：深灰雲團＋逆時針旋轉的螺旋雲帶（北半球）
      g.ellipse(p.x, p.y, rx * 1.15, ry * 1.15).fill({ color: 0x3a4550, alpha: 0.18 });
      g.ellipse(p.x, p.y, rx, ry).fill({ color: 0x3a4550, alpha: 0.3 });
      const spin = c.center[1] >= 0 ? -1 : 1;
      for (let arm = 0; arm < 3; arm++) {
        const base = (arm / 3) * Math.PI * 2 + spin * this.time * 0.6;
        let first = true;
        for (let t = 0; t <= 1; t += 0.05) {
          const a = base + spin * t * Math.PI * 1.4;
          const r = 0.15 + t * 0.95;
          const x = p.x + Math.cos(a) * rx * r;
          const y = p.y + Math.sin(a) * ry * r;
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
          first = false;
        }
        g.stroke({ width: 5 * inv, color: 0xe8ecef, alpha: 0.55 });
      }
      // 風眼
      g.circle(p.x, p.y, 4 * inv).fill({ color: 0xa9c6cf, alpha: 0.9 });
    }
  }

  destroy() {
    for (const n of this.nodes.values()) n.root.destroy({ children: true });
    this.nodes.clear();
  }
}
