/**
 * 世界海圖渲染器（PixiJS）。
 *
 * 只負責畫面：海洋、陸地、迷霧、經緯線、航線、港口與船隻，以及平移縮放。
 * 遊戲狀態由 React 端管理，透過 setter 更新畫面、透過回呼回報玩家操作。
 *
 * 圖層順序（下到上）：波紋 → 陸地 → 水痕與風 → 迷霧 → 經緯線 → 航線 → 港口 → 船
 */
import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import type { SailSetting } from '@/game/sailing';
import { FogLayer } from './fogLayer';
import { getDetailedLand, getLandRings } from './land';
import { SeaFx } from './seaFx';
import { ShipSprite } from './shipSprite';
import { NightSky } from './nightSky';
import { SeaLife } from './seaLife';
import type { SeaSight } from '@/game/crewTalk';
import { SeaEntities, type FleetView, type MistView, type StormView } from './seaEntities';
import { PlaceLabels, type PlaceLabel } from './placeLabels';
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
  /** 點海圖上的地名註記（打開圖鑑） */
  onPlaceTap?: (id: string) => void;
  onMapTap: (lonLat: LonLat) => void;
  onPointerLonLat: (lonLat: LonLat | null) => void;
  /** 玩家手動拖曳地圖（用來停止自動跟隨船隻） */
  onUserPan?: () => void;
}

const COLORS = {
  sea: 0xa9c6cf,
  land: 0xe6d09c,
  coast: 0x5a4632,
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

/** 親手駕船時，畫面需要的風與帆資訊 */
export interface SailingView {
  windToward: number;
  windStrength: number;
  /** 風吹向相對於船頭的角度 */
  windRel: number;
  angleOffWind: number;
  sail: SailSetting;
  moving: boolean;
  /** 玩家設定的航向 */
  course: number;
}

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
  private places = new PlaceLabels((id) => this.opts.onPlaceTap?.(id));
  private marks: { lonLat: LonLat; kind: 'guess' | 'answer' }[] = [];
  private ship = new Container();
  private shipSprite = new ShipSprite({ hull: COLORS.hull, sail: COLORS.sail, flag: 0xb5482b });
  private fog = new FogLayer();
  private fx = new SeaFx();
  private courseGfx = new Graphics();
  private entities = new SeaEntities();
  private seaLife = new SeaLife();
  private sky = new NightSky();
  private sailing: SailingView | null = null;
  private shipWorld: Point | null = null;
  private shipHeading = 0;
  /** 鏡頭跟著船（平滑移動） */
  private follow = false;
  private time = 0;
  private destroyed = false;
  /** 容器大小改變（例如手機版港口面板開關）時重新調整畫布 */
  private resizeObserver: ResizeObserver | null = null;
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
    this.ship.addChild(this.shipSprite.root);
    this.ship.visible = false;
    this.app.stage.addChild(this.world);
    this.world.addChild(
      this.fx.under,
      this.drawLand(),
      this.fx.over,
      this.fog.container,
      this.entities.container,
      this.seaLife.container,
      this.drawGraticule(),
      this.routeGfx,
      this.courseGfx,
      this.marksGfx,
      this.places.container,
      this.portLayer,
      this.ship,
    );
    this.app.stage.addChild(this.sky.container);
    this.app.ticker.add((t) => this.frame(Math.min(0.1, t.deltaMS / 1000)));

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
    // 近距離航行需要細緻的海岸線：遊戲載入時已預先讀取 1:50m 資料
    const rings = getDetailedLand() ?? getLandRings();
    // 沿岸淺海的淡色帶，像古地圖沿海岸暈染的顏色
    for (const r of rings) {
      g.poly(r.points, true).stroke({ width: 0.9, color: 0xc9dde0, alpha: 0.9 });
    }
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

  /** 套用玩家選的船身、帆與旗色 */
  setShipStyle(style: ShipStyle) {
    if (!this.destroyed) this.shipSprite.setLook(style);
  }

  /** 每一幀：鏡頭跟隨、船隨浪搖晃、帆與旗、海面效果 */
  private frame(dt: number) {
    if (this.destroyed) return;
    this.time += dt;
    if (this.follow && this.shipWorld) {
      const s = this.size;
      const target = centerOn(this.shipWorld, this.view.scale, s);
      const k = Math.min(1, dt * 4);
      const dx = target.x - this.view.x;
      const dy = target.y - this.view.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.applyView({ ...this.view, x: this.view.x + dx * k, y: this.view.y + dy * k });
      }
    }
    const sway = this.sailing?.moving ? 1 : 0.4;
    this.ship.rotation =
      (this.shipHeading * Math.PI) / 180 + Math.sin(this.time * 1.9) * 0.035 * sway;
    this.shipSprite.drawRig(this.time);
    this.fx.update(dt);
    this.entities.update(dt);
    this.seaLife.update(dt);
    this.sky.setSize(this.size.width, this.size.height);
    this.sky.setShipScreen(
      this.shipWorld && this.ship.visible
        ? {
            x: this.shipWorld.x * this.view.scale + this.view.x,
            y: this.shipWorld.y * this.view.scale + this.view.y,
          }
        : null,
    );
    this.sky.update(dt);
  }

  /** 海上看得見的其他船隊 */
  setFleets(list: FleetView[]) {
    this.entities.setFleets(list);
  }

  /** 船員看到的海洋生物與景象，畫在船邊 */
  showSight(kind: SeaSight) {
    if (this.shipWorld) this.seaLife.show(kind, this.shipWorld, this.shipHeading);
  }

  /** 發現新地方時的金色光圈 */
  celebrate(at: LonLat) {
    this.entities.celebrate(at);
  }

  /** 看得見的海霧 */
  setMists(list: MistView[]) {
    this.entities.setMists(list);
  }

  /** 看得見的風暴雲團 */
  setStorms(list: StormView[]) {
    this.entities.setStorms(list);
  }

  /** 位置誤差圈（公里）；null 表示不顯示 */
  setPositionError(center: LonLat | null, km: number) {
    this.entities.setError(center, km);
  }

  /** 日夜：0 白天到 1 深夜；rain 為船在風暴雲團裡，mist 為船在霧裡 */
  setSky(darkness: number, rain: boolean, mist = false) {
    this.sky.setDarkness(darkness);
    this.sky.setRain(rain);
    this.sky.setMist(mist);
  }

  /** 親手駕船的風與帆狀態；null 表示停在港口或自動航行 */
  setSailing(v: SailingView | null) {
    const changed = !!v !== !!this.sailing;
    this.sailing = v;
    if (changed) this.applyView(this.view);
    if (v) {
      this.fx.setWind(v.windToward, v.windStrength);
      this.shipSprite.setTrim({ windRel: v.windRel, angleOffWind: v.angleOffWind, sail: v.sail });
    } else {
      this.fx.clearWake();
      this.shipSprite.setTrim({ windRel: 0, angleOffWind: 180, sail: 0 });
    }
    this.drawCourse();
  }

  /** 船頭前方的虛線：玩家設定的航向 */
  private drawCourse() {
    const g = this.courseGfx;
    g.clear();
    const v = this.sailing;
    if (!v || !this.shipWorld) return;
    const inv = 1 / this.view.scale;
    const rad = (v.course * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const start = 26 * inv;
    const end = 110 * inv;
    const dash = 7 * inv;
    for (let d = start; d < end; d += dash * 2) {
      g.moveTo(this.shipWorld.x + dx * d, this.shipWorld.y + dy * d).lineTo(
        this.shipWorld.x + dx * Math.min(end, d + dash),
        this.shipWorld.y + dy * Math.min(end, d + dash),
      );
    }
    g.stroke({ width: 2.2 * inv, color: COLORS.route, alpha: 0.8 });
    const tip = { x: this.shipWorld.x + dx * end, y: this.shipWorld.y + dy * end };
    const side = 6 * inv;
    g.poly([
      tip.x + dx * side * 1.6,
      tip.y + dy * side * 1.6,
      tip.x - dy * side,
      tip.y + dx * side,
      tip.x + dy * side,
      tip.y - dx * side,
    ]).fill({ color: COLORS.route, alpha: 0.85 });
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
    // 拉近航行時船畫大一點，看得到帆的角度
    this.ship.scale.set(inv * (this.view.scale >= 4 && this.sailing ? 1.7 : 1));
    this.fx.setView(this.view, this.size);
    this.entities.setView(this.view);
    this.seaLife.setScale(this.view.scale);
    this.places.setScale(this.view.scale);
    this.drawRoute();
    this.drawMarks();
    this.drawCourse();
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

  /** 已發現地點的地名註記 */
  setPlaces(list: PlaceLabel[]) {
    this.places.set(list);
    this.places.setScale(this.view.scale);
  }

  setMarks(marks: { lonLat: LonLat; kind: 'guess' | 'answer' }[]) {
    this.marks = marks;
    this.drawMarks();
  }

  setShip(position: LonLat, heading: number, follow = false) {
    const p = lonLatToWorld(position);
    this.ship.visible = true;
    this.ship.position.set(p.x, p.y);
    this.shipWorld = p;
    this.shipHeading = heading;
    this.follow = follow;
    this.fx.trackShip(position, !!this.sailing?.moving);
    this.drawCourse();
  }

  /** 整張迷霧重畫（載入存檔時） */
  setFog(fog: Uint8Array) {
    this.fog.setFog(fog);
  }

  /** 局部揭開迷霧 */
  revealFog(indices: number[]) {
    this.fog.reveal(indices);
  }

  setPlanning(on: boolean) {
    this.app.canvas.style.cursor = on ? 'crosshair' : '';
  }

  destroy() {
    this.destroyed = true;
    this.fog.destroy();
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
