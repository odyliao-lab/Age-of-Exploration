/**
 * 玩家自己寫在海圖上的註記（企畫書 v2 4.3：港口與島嶼由玩家命名、標註）。
 * 用紅墨水的手寫風格，和地圖本身的地名區分開來。點一下可以修改或刪除。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { lonLatToView, wrapX } from './projection';

export interface ChartNote {
  id: number;
  at: LonLat;
  text: string;
}

const RED_INK = 0x9a2a1a;

export class ChartNotes {
  readonly container = new Container();
  private items: Container[] = [];

  constructor(private onTap: (id: number) => void) {}

  set(list: ChartNote[]) {
    for (const it of this.items) it.destroy({ children: true });
    this.items = [];
    for (const n of list) {
      const root = new Container();
      const p = lonLatToView(n.at);
      root.position.set(p.x, p.y);
      const g = new Graphics();
      // 小小的叉號，像在紙上用筆點出位置
      g.moveTo(-3, -3)
        .lineTo(3, 3)
        .moveTo(3, -3)
        .lineTo(-3, 3)
        .stroke({ width: 1.6, color: RED_INK });
      g.circle(0, 0, 14).fill({ color: 0xffffff, alpha: 0.001 });
      const label = new Text({
        text: n.text,
        style: {
          fontFamily: 'Noto Serif TC, Noto Sans TC, PingFang TC, serif',
          fontSize: 13,
          fontStyle: 'italic',
          fontWeight: '600',
          fill: RED_INK,
          stroke: { color: 0xf6efdd, width: 3 },
        },
        resolution: 2,
      });
      label.anchor.set(0, 0.5);
      label.position.set(6, -6);
      label.rotation = -0.06;
      root.addChild(g, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', (e) => {
        e.stopPropagation();
        this.onTap(n.id);
      });
      this.container.addChild(root);
      this.items.push(root);
    }
  }

  setScale(scale: number) {
    for (const it of this.items) {
      it.x = wrapX(it.x);
      it.scale.set(1 / scale);
    }
  }
}
