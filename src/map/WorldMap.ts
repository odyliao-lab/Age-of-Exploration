/**
 * 世界海圖渲染器（PixiJS）。
 *
 * 只負責畫面：海洋、陸地、經緯線、港口標記，以及滑鼠／觸控的平移縮放。
 * 遊戲狀態由 React 端管理，透過回呼與 setter 溝通。
 */
import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { getLandRings } from './land';
import {
  DEG_PX,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  lonLatToWorld,
  worldToLonLat,
  type Point,
} from './projection';
import { centerOn, clampView, screenToWorld, zoomAt, type Size, type View } from './viewport';

export interface PortMarker {
  id: string;
  label: string;
  location: LonLat;
  kind: 'hub' | 'port' | 'landmark';
  home: boolean;
}

export interface WorldMapOptions {
  ports: PortMarker[];
  onSelectPort: (id: string | null) => void;
  onPointerLonLat: (lonLat: LonLat | null) => void;
}

const COLORS = {
  sea: 0xa9c6cf,
  land: 0xefe2c0,
  coast: 0x6b5a45,
  graticule: 0x5b7f8c,
  equator: 0xb5482b,
  marker: 0x2b2118,
  home: 0xb5482b,
  selected: 0xf2b134,
  label: 0x2b2118,
};

/** 拖曳超過這個像素距離就不視為點擊 */
const TAP_TOLERANCE = 6;
/** 縮放到這個倍率以上才顯示港口名稱 */
const LABEL_MIN_SCALE = 1.5;

interface MarkerView {
  data: PortMarker;
  root: Container;
  dot: Graphics;
  label: Text;
}

export class WorldMap {
  private app: Application;
  private world = new Container();
  private markers: MarkerView[] = [];
  private view: View = { x: 0, y: 0, scale: 1 };
  private selectedId: string | null = null;
  private drag: { start: Point; last: Point; moved: boolean } | null = null;
  private pinch: { distance: number } | null = null;
  private pointers = new Map<number, Point>();
  private opts: WorldMapOptions;
  private host: HTMLElement;
  private onWheel = (e: WheelEvent) => this.handleWheel(e);

  private constructor(app: Application, host: HTMLElement, opts: WorldMapOptions) {
    this.app = app;
    this.host = host;
    this.opts = opts;
  }

  static async create(host: HTMLElement, opts: WorldMapOptions): Promise<WorldMap> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: COLORS.sea,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    const map = new WorldMap(app, host, opts);
    map.build();
    host.appendChild(app.canvas);
    return map;
  }

  private get size(): Size {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  private build() {
    this.app.stage.addChild(this.world);
    this.world.addChild(this.drawGraticule(), this.drawLand(), this.drawMarkers());

    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e) => this.handlePointerDown(e));
    stage.on('globalpointermove', (e) => this.handlePointerMove(e));
    stage.on('pointerup', (e) => this.handlePointerUp(e));
    stage.on('pointerupoutside', (e) => this.handlePointerUp(e));
    stage.on('pointerleave', () => this.opts.onPointerLonLat(null));
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.app.renderer.on('resize', () => this.applyView(this.view));
    this.app.canvas.style.touchAction = 'none';

    this.applyView(centerOn({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }, 0, this.size));
  }

  private drawLand(): Graphics {
    const g = new Graphics();
    const rings = getLandRings();
    for (const r of rings) {
      if (r.outer) g.poly(r.points, true).fill({ color: COLORS.land });
      else g.poly(r.points, true).cut();
    }
    for (const r of rings) {
      g.poly(r.points, true).stroke({ width: 1, color: COLORS.coast, pixelLine: true });
    }
    return g;
  }

  /** 每 15 度一條經緯線；赤道與本初子午線加強顯示（學習領域 A） */
  private drawGraticule(): Graphics {
    const g = new Graphics();
    for (let lon = -180; lon <= 180; lon += 15) {
      const x = (lon + 180) * DEG_PX;
      g.moveTo(x, 0).lineTo(x, WORLD_HEIGHT);
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const y = (90 - lat) * DEG_PX;
      g.moveTo(0, y).lineTo(WORLD_WIDTH, y);
    }
    g.stroke({ width: 1, color: COLORS.graticule, alpha: 0.35, pixelLine: true });

    g.moveTo(0, WORLD_HEIGHT / 2).lineTo(WORLD_WIDTH, WORLD_HEIGHT / 2);
    g.moveTo(WORLD_WIDTH / 2, 0).lineTo(WORLD_WIDTH / 2, WORLD_HEIGHT);
    g.stroke({ width: 1, color: COLORS.equator, alpha: 0.6, pixelLine: true });
    return g;
  }

  private drawMarkers(): Container {
    const layer = new Container();
    for (const data of this.opts.ports) {
      const root = new Container();
      const p = lonLatToWorld(data.location);
      root.position.set(p.x, p.y);

      const dot = new Graphics();
      const label = new Text({
        text: data.label,
        style: {
          fontFamily: 'Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif',
          fontSize: 13,
          fontWeight: '600',
          fill: COLORS.label,
          stroke: { color: 0xfbf6ea, width: 3 },
        },
        resolution: 2,
      });
      label.anchor.set(0, 0.5);
      label.position.set(9, 0);

      root.addChild(dot, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', (e) => {
        if (this.drag?.moved) return;
        e.stopPropagation();
        this.opts.onSelectPort(data.id);
      });

      const marker = { data, root, dot, label };
      this.drawMarker(marker);
      this.markers.push(marker);
      layer.addChild(root);
    }
    return layer;
  }

  private drawMarker(m: MarkerView) {
    const r = m.data.kind === 'hub' ? 6 : 4.5;
    const selected = m.data.id === this.selectedId;
    m.dot.clear();
    if (selected) m.dot.circle(0, 0, r + 4).fill({ color: COLORS.selected, alpha: 0.9 });
    m.dot
      .circle(0, 0, r)
      .fill({ color: m.data.home ? COLORS.home : COLORS.marker })
      .stroke({ width: 1.5, color: 0xfbf6ea });
    // 擴大觸控範圍，平板上也點得到
    m.dot.circle(0, 0, 14).fill({ color: 0xffffff, alpha: 0.001 });
  }

  private applyView(next: View) {
    this.view = clampView(next, this.size);
    this.world.position.set(this.view.x, this.view.y);
    this.world.scale.set(this.view.scale);
    const inv = 1 / this.view.scale;
    const showLabels = this.view.scale >= LABEL_MIN_SCALE;
    for (const m of this.markers) {
      m.root.scale.set(inv);
      m.label.visible = showLabels || m.data.id === this.selectedId;
    }
  }

  // ---- 對外 API ----

  centerOn(lonLat: LonLat, scale: number) {
    this.applyView(centerOn(lonLatToWorld(lonLat), scale, this.size));
  }

  zoomBy(factor: number) {
    const s = this.size;
    this.applyView(zoomAt(this.view, factor, { x: s.width / 2, y: s.height / 2 }, s));
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    for (const m of this.markers) this.drawMarker(m);
    this.applyView(this.view);
  }

  destroy() {
    this.app.canvas.removeEventListener('wheel', this.onWheel);
    this.app.destroy({ removeView: true }, { children: true });
    this.host.replaceChildren();
  }

  // ---- 輸入處理 ----

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.applyView(
      zoomAt(this.view, factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }, this.size),
    );
  }

  private handlePointerDown(e: FederatedPointerEvent) {
    const p = { x: e.global.x, y: e.global.y };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      this.drag = null;
    } else {
      this.drag = { start: p, last: p, moved: false };
    }
  }

  private handlePointerMove(e: FederatedPointerEvent) {
    const p = { x: e.global.x, y: e.global.y };
    const s = this.size;
    if (p.x >= 0 && p.y >= 0 && p.x <= s.width && p.y <= s.height) {
      this.opts.onPointerLonLat(worldToLonLat(screenToWorld(p, this.view)));
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, p);

    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.applyView(zoomAt(this.view, distance / this.pinch.distance, mid, s));
      this.pinch.distance = distance;
      return;
    }
    if (!this.drag) return;
    const dx = p.x - this.drag.last.x;
    const dy = p.y - this.drag.last.y;
    this.drag.last = p;
    if (Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > TAP_TOLERANCE) {
      this.drag.moved = true;
    }
    this.applyView({ ...this.view, x: this.view.x + dx, y: this.view.y + dy });
  }

  private handlePointerUp(e: FederatedPointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const wasTap = this.drag && !this.drag.moved && e.target === this.app.stage;
    if (wasTap) this.opts.onSelectPort(null);
    // 延後清除，讓港口的 pointertap 能讀到 moved 狀態
    queueMicrotask(() => {
      if (this.pointers.size === 0) this.drag = null;
    });
  }
}
