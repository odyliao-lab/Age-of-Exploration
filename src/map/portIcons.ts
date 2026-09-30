/**
 * 海圖拉近時，港口畫成小小的城鎮剪影，依文化圈換樣式：
 * 閩南的翹脊屋頂與寶塔、琉球的紅瓦矮屋、南洋的高腳茅屋、南亞的白牆與佛塔、阿拉伯的平頂白屋與圓頂。
 * 以畫面像素為單位，原點是港口位置（剪影的底部中央）。
 */
import type { Graphics } from 'pixi.js';

export type PortCulture =
  | 'minnan'
  | 'ryukyu'
  | 'nanyang'
  | 'southasia'
  | 'arabia'
  | 'swahili'
  | 'iberia'
  | 'westafrica'
  | 'taino'
  | 'norse';

const INK = 0x3a2414;

function house(g: Graphics, x: number, w: number, h: number, wall: number, roof: number) {
  g.rect(x, -h, w, h).fill({ color: wall }).stroke({ width: 1, color: INK });
  g.poly([x - 2, -h, x + w / 2, -h - w * 0.45, x + w + 2, -h], true)
    .fill({ color: roof })
    .stroke({ width: 1, color: INK });
}

function flatHouse(g: Graphics, x: number, w: number, h: number) {
  g.rect(x, -h, w, h).fill({ color: 0xf4ecd8 }).stroke({ width: 1, color: INK });
  g.rect(x + w / 2 - 1, -h + 3, 2, 3).fill({ color: INK });
}

export function drawPortIcon(g: Graphics, culture: PortCulture, hub: boolean) {
  switch (culture) {
    case 'minnan':
      house(g, -13, 8, 6, 0xf4ecd8, 0xb5482b);
      house(g, 5, 8, 6, 0xf4ecd8, 0x6b6f78);
      if (hub) {
        // 寶塔：一層層的塔身與屋簷
        for (let i = 0; i < 4; i++) {
          const w = 8 - i * 1.5;
          const y = -4 - i * 5;
          g.rect(-w / 2, y - 4, w, 4)
            .fill({ color: 0xe0cfa8 })
            .stroke({ width: 1, color: INK });
          g.rect(-w / 2 - 2, y - 5, w + 4, 1.6).fill({ color: 0xb5482b });
        }
        g.rect(-0.5, -28, 1, 4).fill({ color: INK });
      } else {
        house(g, -4, 8, 8, 0xf4ecd8, 0xb5482b);
      }
      break;
    case 'ryukyu':
      house(g, -12, 9, 5, 0xe9dcc0, 0xd0553a);
      house(g, 3, 9, 5, 0xe9dcc0, 0xd0553a);
      house(g, -4, 8, 7, 0xe9dcc0, 0xd0553a);
      break;
    case 'nanyang':
      // 高腳屋：木樁上的屋子與陡峭的茅草屋頂
      for (const x of [-12, 4]) {
        g.rect(x + 1, -4, 1, 4).fill({ color: INK });
        g.rect(x + 6, -4, 1, 4).fill({ color: INK });
        house(g, x, 8, 5, 0x8a5a33, 0xc9a86a);
      }
      g.rect(-3, -12, 1, 12).fill({ color: 0x6b4a2a });
      g.circle(-2.5, -13, 4).fill({ color: 0x3f7a3a });
      break;
    case 'southasia':
      house(g, -13, 8, 6, 0xf6f1e6, 0xb5482b);
      house(g, 5, 8, 6, 0xf6f1e6, 0xb5482b);
      if (hub) {
        // 佛塔：白色的覆缽與塔尖
        g.rect(-5, -4, 10, 4).fill({ color: 0xf6f1e6 }).stroke({ width: 1, color: INK });
        g.arc(0, -4, 5, Math.PI, 0).fill({ color: 0xf6f1e6 }).stroke({ width: 1, color: INK });
        g.rect(-0.8, -15, 1.6, 6).fill({ color: 0xc9a032 });
      } else {
        // 神廟的塔門：往上收窄的高塔
        g.poly([-4, 0, 4, 0, 2.5, -14, -2.5, -14], true)
          .fill({ color: 0xd9b27a })
          .stroke({ width: 1, color: INK });
      }
      break;
    case 'swahili':
      flatHouse(g, -13, 8, 6);
      // 椰葉屋頂的小屋
      house(g, 5, 8, 5, 0xe7e0cf, 0xa07a45);
      // 猴麵包樹
      g.rect(-4, -9, 5, 9).fill({ color: 0x9a7a58 }).stroke({ width: 1, color: INK });
      g.ellipse(-1.5, -12, 6, 3).fill({ color: 0x4f6d2a });
      break;
    case 'iberia':
      // 白牆紅瓦的房子，中間是有十字架的教堂鐘樓
      house(g, -13, 8, 6, 0xf6f2ea, 0xc0603a);
      house(g, 5, 8, 6, 0xf6f2ea, 0xc0603a);
      g.rect(-3, -14, 6, 14).fill({ color: 0xf6f2ea }).stroke({ width: 1, color: INK });
      g.poly([-4, -14, 0, -18, 4, -14], true)
        .fill({ color: 0xc0603a })
        .stroke({ width: 1, color: INK });
      g.rect(-0.5, -23, 1, 5).fill({ color: INK });
      g.rect(-2, -21.5, 4, 1).fill({ color: INK });
      break;
    case 'westafrica':
    case 'taino':
      // 圓形土屋（泰諾人的「波伊歐」）與尖尖的茅草屋頂
      for (const x of [-12, -3, 6]) {
        g.rect(x, -5, 7, 5).fill({ color: 0xb9794a }).stroke({ width: 1, color: INK });
        g.poly([x - 1.5, -5, x + 3.5, -11, x + 8.5, -5], true)
          .fill({ color: 0xc9a86a })
          .stroke({ width: 1, color: INK });
      }
      break;
    case 'norse':
      // 長屋：低矮的木屋，屋頂長著青草
      for (const [x, w] of [
        [-14, 12],
        [2, 11],
      ] as const) {
        g.rect(x, -5, w, 5).fill({ color: 0x7a5a3a }).stroke({ width: 1, color: INK });
        g.poly([x - 1.5, -5, x + w / 2, -10, x + w + 1.5, -5], true)
          .fill({ color: 0x6f8f4a })
          .stroke({ width: 1, color: INK });
      }
      break;
    case 'arabia':
      flatHouse(g, -13, 8, 6);
      flatHouse(g, 5, 8, 7);
      // 清真寺：圓頂與宣禮塔
      g.rect(-5, -6, 10, 6).fill({ color: 0xf4ecd8 }).stroke({ width: 1, color: INK });
      g.arc(0, -6, 4, Math.PI, 0)
        .fill({ color: hub ? 0xc9a032 : 0xe9dcc0 })
        .stroke({
          width: 1,
          color: INK,
        });
      g.rect(6.5, -17, 2.5, 10).fill({ color: 0xf4ecd8 }).stroke({ width: 1, color: INK });
      break;
  }
}
