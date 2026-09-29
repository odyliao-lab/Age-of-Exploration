/**
 * 世界海圖渲染器（PixiJS）。
 *
 * 只負責畫面：海洋、陸地、迷霧、經緯線、航線、港口與船隻，以及平移縮放。
 * 遊戲狀態由 React 端管理，透過 setter 更新畫面、透過回呼回報玩家操作。
 *
 * 圖層順序（下到上）：陸地 → 迷霧 → 經緯線 → 航線 → 港口 → 船
 */
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { FOG_COLS, FOG_ROWS } from '@/game/fog';
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

/** 船隻配色（Pixi 色碼） */
export interface ShipStyle {
  hull: number;
  sail: number;
  flag: number;
}

export interface PortMarker {
  id: string;
  /** 名稱未知時顯示「？」 */
  label: string;
  location: LonLat;
  kind: 'hub' | 'port' | 'landmark';
  home: boolean;
  /** 進行中任務的目的地（提示等級 1 時加強標示） */
  target: boolean;
}

export interface RouteView {
  /** 已航行的部分（實線） */
  done: LonLat[];
  /** 尚未航行或規劃中的部分（虛線） */
  ahead: LonLat[];
  /** 規劃中的航線：顯示航點 */
  planning: boolean;
  /** 規劃中的最後一段無效（穿越陸地） */
  invalidAt?: LonLat;
}

export interface WorldMapOptions {
  onPortTap: (id: string) => void;
  onMapTap: (lonLat: LonLat) => void;
  onPointerLonLat: (lonLat: LonLat | null) => void;
  /** 玩家手動拖曳地圖（用來停止自動跟隨船隻） */
  onUserPan?: () => void;
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
  target: 0x2f7d4a,
  label: 0x2b2118,
  route: 0x7a2e1b,
  invalid: 0xd0021b,
  hull: 0x6b3f1f,
  sail: 0xfbf6ea,
};

/** 迷霧顏色（羊皮紙）與不透明度 */
const FOG_RGBA = [233, 220, 188, 236] as const;

const TAP_TOLERANCE = 6;
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
  private portLayer = new Container();
  private routeGfx = new Graphics();
  private marksGfx = new Graphics();
  private marks: { lonLat: LonLat; kind: 'guess' | 'answer' }[] = [];
  private ship = new Container();
  private shipStyle: ShipStyle = { hull: COLORS.hull, sail: COLORS.sail, flag: 0xb5482b };
  /** 原始迷霧格網（每格一像素） */
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  /** 放大兩倍並模糊後的顯示用畫布，讓迷霧邊緣柔和 */
  private fogDisplay: HTMLCanvasElement;
  private fogDisplayCtx: CanvasRenderingContext2D;
  private fogFlushPending = false;
  private destroyed = false;
  /** 容器大小改變（例如手機版港口面板開關）時重新調整畫布 */
  private resizeObserver: ResizeObserver | null = null;
  private fogImage: ImageData;
  private fogTexture: Texture;
  private markers: MarkerView[] = [];
  private view: View = { x: 0, y: 0, scale: 1 };
  private selectedId: string | null = null;
  private drag: { start: Point; last: Point; moved: boolean } | null = null;
  private pinch: { distance: number } | null = null;
  private pointers = new Map<number, Point>();
  private opts: WorldMapOptions;
  private host: HTMLElement;
  private route: RouteView | null = null;
  private onWheel = (e: WheelEvent) => this.handleWheel(e);

  private constructor(app: Application, host: HTMLElement, opts: WorldMapOptions) {
    this.app = app;
    this.host = host;
    this.opts = opts;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = FOG_COLS;
    this.fogCanvas.height = FOG_ROWS;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    this.fogImage = this.fogCtx.createImageData(FOG_COLS, FOG_ROWS);
    this.fogDisplay = document.createElement('canvas');
    this.fogDisplay.width = FOG_COLS * 2;
    this.fogDisplay.height = FOG_ROWS * 2;
    this.fogDisplayCtx = this.fogDisplay.getContext('2d')!;
    this.fogTexture = Texture.from(this.fogDisplay);
    this.fogTexture.source.scaleMode = 'linear';
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
    const fog = new Sprite(this.fogTexture);
    fog.width = WORLD_WIDTH;
    fog.height = WORLD_HEIGHT;
    this.drawShip();
    this.ship.visible = false;
    this.app.stage.addChild(this.world);
    this.world.addChild(
      this.drawLand(),
      fog,
      this.drawGraticule(),
      this.routeGfx,
      this.marksGfx,
      this.portLayer,
      this.ship,
    );

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
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.destroyed) this.app.resize();
      });
      this.resizeObserver.observe(this.host);
    }
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

    // 南北回歸線（±23.44°）與南北極圈（±66.56°）以虛線表示
    for (const lat of [23.44, -23.44, 66.56, -66.56]) {
      const y = (90 - lat) * DEG_PX;
      for (let x = 0; x < WORLD_WIDTH; x += 12) g.moveTo(x, y).lineTo(x + 6, y);
    }
    g.stroke({ width: 1, color: 0xc07a1f, alpha: 0.7, pixelLine: true });
    return g;
  }

  /** 簡化的中式帆船：船身、兩面帆、船尾旗 */
  private drawShip() {
    const st = this.shipStyle;
    this.ship.removeChildren().forEach((c) => c.destroy());
    const g = new Graphics();
    g.poly([0, -13, 6, -4, 6, 10, 0, 13, -6, 10, -6, -4], true)
      .fill({ color: st.hull })
      .stroke({ width: 1.5, color: 0x2b2118 });
    g.rect(-5, -7, 10, 5).fill({ color: st.sail }).stroke({ width: 1, color: 0x2b2118 });
    g.rect(-5, 1, 10, 5).fill({ color: st.sail }).stroke({ width: 1, color: 0x2b2118 });
    g.moveTo(0, 9).lineTo(0, 17).stroke({ width: 1, color: 0x2b2118 });
    g.rect(0, 13, 7, 5).fill({ color: st.flag }).stroke({ width: 0.8, color: 0x2b2118 });
    this.ship.addChild(g);
  }

  /** 套用玩家選的船身、帆與旗色 */
  setShipStyle(style: ShipStyle) {
    this.shipStyle = style;
    if (!this.destroyed) this.drawShip();
  }

  private drawMarker(m: MarkerView) {
    const r = m.data.kind === 'hub' ? 6 : 4.5;
    const selected = m.data.id === this.selectedId;
    m.dot.clear();
    if (m.data.target) m.dot.circle(0, 0, r + 7).stroke({ width: 2.5, color: COLORS.target });
    if (selected) m.dot.circle(0, 0, r + 4).fill({ color: COLORS.selected, alpha: 0.9 });
    m.dot
      .circle(0, 0, r)
      .fill({ color: m.data.home ? COLORS.home : COLORS.marker })
      .stroke({ width: 1.5, color: 0xfbf6ea });
    // 擴大觸控範圍，平板上也點得到
    m.dot.circle(0, 0, 14).fill({ color: 0xffffff, alpha: 0.001 });
  }

  private drawRoute() {
    const g = this.routeGfx;
    g.clear();
    const r = this.route;
    if (!r) return;
    const inv = 1 / this.view.scale;
    const toXY = (p: LonLat) => lonLatToWorld(p);

    if (r.done.length >= 2) {
      const pts = r.done.map(toXY);
      g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: 3 * inv, color: COLORS.route, alpha: 0.9 });
    }
    if (r.ahead.length >= 2) {
      const pts = r.ahead.map(toXY);
      const dash = 8 * inv;
      const gap = 6 * inv;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / (len || 1);
        const uy = (b.y - a.y) / (len || 1);
        for (let d = 0; d < len; d += dash + gap) {
          const e = Math.min(len, d + dash);
          g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * e, a.y + uy * e);
        }
      }
      g.stroke({ width: 2.5 * inv, color: COLORS.route, alpha: 0.85 });
      if (r.planning) {
        for (const p of pts.slice(1)) {
          g.circle(p.x, p.y, 4 * inv)
            .fill({ color: 0xfbf6ea })
            .stroke({ width: 2 * inv, color: COLORS.route });
        }
      }
    }
    if (r.invalidAt) {
      const p = toXY(r.invalidAt);
      const s = 7 * inv;
      g.moveTo(p.x - s, p.y - s).lineTo(p.x + s, p.y + s);
      g.moveTo(p.x + s, p.y - s).lineTo(p.x - s, p.y + s);
      g.stroke({ width: 3 * inv, color: COLORS.invalid });
    }
  }

  private drawMarks() {
    const g = this.marksGfx;
    g.clear();
    const inv = 1 / this.view.scale;
    for (const m of this.marks) {
      const p = lonLatToWorld(m.lonLat);
      if (m.kind === 'answer') {
        g.circle(p.x, p.y, 12 * inv).stroke({ width: 3 * inv, color: COLORS.target });
        g.circle(p.x, p.y, 3 * inv).fill({ color: COLORS.target });
      } else {
        const s = 6 * inv;
        g.moveTo(p.x - s, p.y - s).lineTo(p.x + s, p.y + s);
        g.moveTo(p.x + s, p.y - s).lineTo(p.x - s, p.y + s);
        g.stroke({ width: 3 * inv, color: COLORS.invalid });
      }
    }
  }

  private applyView(next: View) {
    this.view = clampView(next, this.size);
    this.world.position.set(this.view.x, this.view.y);
    this.world.scale.set(this.view.scale);
    const inv = 1 / this.view.scale;
    const showLabels = this.view.scale >= LABEL_MIN_SCALE;
    for (const m of this.markers) {
      m.root.scale.set(inv);
      m.label.visible = showLabels || m.data.id === this.selectedId || m.data.target;
    }
    this.ship.scale.set(inv * 1.2);
    this.drawRoute();
    this.drawMarks();
  }

  // ---- 對外 API ----

  /** 經緯度 → 畫布內的畫面座標（自動化測試用） */
  lonLatToScreen(lonLat: LonLat): Point {
    const p = lonLatToWorld(lonLat);
    return { x: p.x * this.view.scale + this.view.x, y: p.y * this.view.scale + this.view.y };
  }

  centerOn(lonLat: LonLat, scale?: number) {
    this.applyView(centerOn(lonLatToWorld(lonLat), scale ?? this.view.scale, this.size));
  }

  zoomBy(factor: number) {
    const s = this.size;
    this.applyView(zoomAt(this.view, factor, { x: s.width / 2, y: s.height / 2 }, s));
  }

  setPorts(ports: PortMarker[]) {
    for (const m of this.markers) m.root.destroy({ children: true });
    this.markers = [];
    for (const data of ports) {
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
          fill: data.target ? COLORS.target : COLORS.label,
          stroke: { color: 0xfbf6ea, width: 3 },
        },
        resolution: 2,
      });
      label.anchor.set(0, 0.5);
      label.position.set(10, 0);
      root.addChild(dot, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', (e) => {
        if (this.drag?.moved) return;
        e.stopPropagation();
        this.opts.onPortTap(data.id);
      });
      const marker = { data, root, dot, label };
      this.drawMarker(marker);
      this.markers.push(marker);
      this.portLayer.addChild(root);
    }
    this.applyView(this.view);
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    for (const m of this.markers) this.drawMarker(m);
    this.applyView(this.view);
  }

  setRoute(route: RouteView | null) {
    this.route = route;
    this.drawRoute();
  }

  setMarks(marks: { lonLat: LonLat; kind: 'guess' | 'answer' }[]) {
    this.marks = marks;
    this.drawMarks();
  }

  setShip(position: LonLat, heading: number, follow = false) {
    const p = lonLatToWorld(position);
    this.ship.visible = true;
    this.ship.position.set(p.x, p.y);
    this.ship.rotation = (heading * Math.PI) / 180;
    if (follow) {
      const s = this.size;
      const sx = p.x * this.view.scale + this.view.x;
      const sy = p.y * this.view.scale + this.view.y;
      // 船接近畫面邊緣時才移動鏡頭，避免持續晃動
      const margin = Math.min(s.width, s.height) * 0.25;
      if (sx < margin || sy < margin || sx > s.width - margin || sy > s.height - margin) {
        this.centerOn(position);
      }
    }
  }

  /** 整張迷霧重畫（載入存檔時） */
  setFog(fog: Uint8Array) {
    const d = this.fogImage.data;
    for (let i = 0; i < fog.length; i++) this.writeFogPixel(d, i, fog[i] === 1);
    this.flushFog();
  }

  /** 局部揭開迷霧 */
  revealFog(indices: number[]) {
    if (!indices.length) return;
    const d = this.fogImage.data;
    for (const i of indices) this.writeFogPixel(d, i, true);
    this.flushFog();
  }

  private writeFogPixel(d: Uint8ClampedArray, i: number, revealed: boolean) {
    const o = i * 4;
    d[o] = FOG_RGBA[0];
    d[o + 1] = FOG_RGBA[1];
    d[o + 2] = FOG_RGBA[2];
    d[o + 3] = revealed ? 0 : FOG_RGBA[3];
  }

  /** 合併同一段時間內的多次更新，最多每 120 毫秒重畫一次 */
  private flushFog() {
    if (this.fogFlushPending) return;
    this.fogFlushPending = true;
    setTimeout(() => {
      this.fogFlushPending = false;
      if (this.destroyed) return;
      this.fogCtx.putImageData(this.fogImage, 0, 0);
      const ctx = this.fogDisplayCtx;
      ctx.clearRect(0, 0, this.fogDisplay.width, this.fogDisplay.height);
      ctx.filter = 'blur(3px)';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogCanvas, 0, 0, this.fogDisplay.width, this.fogDisplay.height);
      ctx.filter = 'none';
      this.fogTexture.source.update();
    }, 120);
  }

  setPlanning(on: boolean) {
    this.app.canvas.style.cursor = on ? 'crosshair' : '';
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.app.canvas.removeEventListener('wheel', this.onWheel);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
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
    if (
      !this.drag.moved &&
      Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > TAP_TOLERANCE
    ) {
      this.drag.moved = true;
      this.opts.onUserPan?.();
    }
    if (this.drag.moved) {
      this.applyView({ ...this.view, x: this.view.x + dx, y: this.view.y + dy });
    }
  }

  private handlePointerUp(e: FederatedPointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const wasTap = this.drag && !this.drag.moved && e.target === this.app.stage;
    if (wasTap) {
      const p = { x: e.global.x, y: e.global.y };
      this.opts.onMapTap(worldToLonLat(screenToWorld(p, this.view)));
    }
    // 延後清除，讓港口的 pointertap 能讀到 moved 狀態
    queueMicrotask(() => {
      if (this.pointers.size === 0) this.drag = null;
    });
  }
}
