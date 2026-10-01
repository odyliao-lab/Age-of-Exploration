/**
 * 探索迷霧的繪製（地圖逐步繪出）：未探索處是空白羊皮紙，完全遮住陸地與海。
 *
 * 迷霧格網每格等於世界座標 1 像素（0.125°），全世界 2880×1440。
 * 分成 256×256 的圖塊，揭開時只重畫、上傳有變化的圖塊，
 * 航行中每秒揭開很多次也不會卡頓。邊緣稍微模糊，像墨水在紙上暈開。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { FOG_COLS, FOG_ROWS } from '@/game/fog';

const TILE = 256;
const MARGIN = 4;
const BLUR_PX = 1.4;
/** 未探索處的空白紙色：比陸地淡，一眼分得出「畫過」與「還沒畫」 */
const PAPER = [242, 236, 221] as const;

interface Tile {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: Texture;
  x0: number;
  y0: number;
}

export class FogLayer {
  readonly container = new Container();
  private tiles: Tile[] = [];
  private cols = Math.ceil(FOG_COLS / TILE);
  private rows = Math.ceil(FOG_ROWS / TILE);
  private fog: Uint8Array | null = null;
  private dirty = new Set<number>();
  private scratch: HTMLCanvasElement;
  private scratchCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor() {
    const size = TILE + MARGIN * 2;
    this.scratch = document.createElement('canvas');
    this.scratch.width = size;
    this.scratch.height = size;
    this.scratchCtx = this.scratch.getContext('2d')!;
    this.image = this.scratchCtx.createImageData(size, size);
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(TILE, FOG_COLS - tx * TILE);
        canvas.height = Math.min(TILE, FOG_ROWS - ty * TILE);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = `rgb(${PAPER.join(',')})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const texture = Texture.from(canvas);
        texture.source.scaleMode = 'linear';
        // 海圖在換日線接起來：左右各多畫一圈，共用同一張圖塊
        for (const wrap of [-1, 0, 1]) {
          const sprite = new Sprite(texture);
          sprite.position.set(tx * TILE + wrap * FOG_COLS, ty * TILE);
          sprite.cullable = true;
          this.container.addChild(sprite);
        }
        this.tiles.push({ canvas, ctx, texture, x0: tx * TILE, y0: ty * TILE });
      }
    }
  }

  /** 整張重畫（載入存檔時） */
  setFog(fog: Uint8Array) {
    this.fog = fog;
    for (let i = 0; i < this.tiles.length; i++) this.dirty.add(i);
    this.schedule(0);
  }

  /** 局部揭開 */
  reveal(indices: number[]) {
    if (!this.fog || !indices.length) return;
    for (const i of indices) {
      const x = i % FOG_COLS;
      const y = Math.floor(i / FOG_COLS);
      // 模糊會影響鄰近圖塊的邊緣，一併標記
      for (const dx of [-MARGIN, 0, MARGIN]) {
        for (const dy of [-MARGIN, 0, MARGIN]) {
          // 東西兩端在換日線接起來
          const tx = Math.floor(((((x + dx) % FOG_COLS) + FOG_COLS) % FOG_COLS) / TILE);
          const ty = Math.floor((y + dy) / TILE);
          if (tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows) {
            this.dirty.add(ty * this.cols + tx);
          }
        }
      }
    }
    this.schedule(150);
  }

  private schedule(ms: number) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.destroyed) this.flush();
    }, ms);
  }

  private flush() {
    const fog = this.fog;
    if (!fog) return;
    const size = TILE + MARGIN * 2;
    const d = this.image.data;
    for (const t of this.dirty) {
      const tile = this.tiles[t];
      // 讀取含邊界的格網到暫存影像（南北邊界外視為未探索；東西繞到另一端）
      for (let y = 0; y < size; y++) {
        const gy = tile.y0 + y - MARGIN;
        for (let x = 0; x < size; x++) {
          const gx = (tile.x0 + x - MARGIN + FOG_COLS) % FOG_COLS;
          const inside = gy >= 0 && gy < FOG_ROWS;
          const revealed = inside && fog[gy * FOG_COLS + gx] === 1;
          const o = (y * size + x) * 4;
          d[o] = PAPER[0];
          d[o + 1] = PAPER[1];
          d[o + 2] = PAPER[2];
          d[o + 3] = revealed ? 0 : 255;
        }
      }
      this.scratchCtx.putImageData(this.image, 0, 0);
      const ctx = tile.ctx;
      ctx.clearRect(0, 0, tile.canvas.width, tile.canvas.height);
      ctx.filter = `blur(${BLUR_PX}px)`;
      ctx.drawImage(this.scratch, -MARGIN, -MARGIN);
      ctx.filter = 'none';
      tile.texture.source.update();
    }
    this.dirty.clear();
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const t of this.tiles) t.texture.destroy(true);
  }
}
