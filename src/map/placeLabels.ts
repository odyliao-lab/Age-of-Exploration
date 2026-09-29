/**
 * 海圖上的地名註記：玩家已經發現、有位置的地方（島嶼、海峽、山、河口、傳聞中的地點）。
 * 像古地圖一樣，用小符號加上名字標在自己畫出的海圖上。點一下可以打開圖鑑。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { lonLatToWorld } from './projection';

export interface PlaceLabel {
  id: string;
  name: string;
  location: LonLat;
  category: string;
}

const INK = 0x5a3b20;

/** 依類別畫不同的小符號：山是三角、島是圓點、海峽與地標是十字、文化是方塊 */
function glyph(g: Graphics, category: string) {
  switch (category) {
    case 'mountain':
      g.poly([0, -5, 5, 4, -5, 4], true).fill({ color: 0x8a6a3a }).stroke({ width: 1, color: INK });
      break;
    case 'island':
      g.circle(0, 0, 3.5).fill({ color: 0xe6d09c }).stroke({ width: 1.2, color: INK });
      break;
    case 'river':
      g.moveTo(-5, -2).quadraticCurveTo(0, -5, 5, -2).stroke({ width: 1.5, color: 0x3f6f86 });
      g.moveTo(-5, 2).quadraticCurveTo(0, -1, 5, 2).stroke({ width: 1.5, color: 0x3f6f86 });
      break;
    case 'culture':
      g.rect(-3.5, -3.5, 7, 7).fill({ color: 0xb5482b }).stroke({ width: 1, color: INK });
      break;
    default:
      g.moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4).stroke({ width: 1.6, color: INK });
  }
}

export class PlaceLabels {
  readonly container = new Container();
  private items: { root: Container; label: Text }[] = [];

  constructor(private onTap: (id: string) => void) {}

  set(list: PlaceLabel[]) {
    for (const it of this.items) it.root.destroy({ children: true });
    this.items = [];
    for (const p of list) {
      const root = new Container();
      const pos = lonLatToWorld(p.location);
      root.position.set(pos.x, pos.y);
      const g = new Graphics();
      glyph(g, p.category);
      // 擴大觸控範圍
      g.circle(0, 0, 12).fill({ color: 0xffffff, alpha: 0.001 });
      const label = new Text({
        text: p.name,
        style: {
          fontFamily: 'Noto Serif TC, Noto Sans TC, PingFang TC, serif',
          fontSize: 12,
          fontStyle: 'italic',
          fill: INK,
          stroke: { color: 0xf2ecdd, width: 3 },
        },
        resolution: 2,
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 6);
      root.addChild(g, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', (e) => {
        e.stopPropagation();
        this.onTap(p.id);
      });
      this.container.addChild(root);
      this.items.push({ root, label });
    }
  }

  /** 縮放時維持固定大小；拉得太遠時隱藏文字 */
  setScale(scale: number) {
    const inv = 1 / scale;
    for (const it of this.items) {
      it.root.scale.set(inv);
      it.label.visible = scale >= 2.5;
    }
  }
}
