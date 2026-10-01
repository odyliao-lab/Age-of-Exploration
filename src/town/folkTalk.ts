/**
 * 城裡路人說的話：當地語言的問候（語言也是文化地理），以及和氣候、物產、生活有關的閒聊。
 * 點一下路人就會說一句。
 */
import type { Culture } from './layout';

interface Greeting {
  phrase: string;
  lang: string;
  meaning: string;
}

const MIN: Greeting = { phrase: '食飽未？', lang: '閩南話', meaning: '吃飽了沒？這是見面打招呼' };
const WU: Greeting = { phrase: '儂好！', lang: '吳語', meaning: '你好' };
const MALAY: Greeting = { phrase: 'Apa khabar?', lang: '馬來語', meaning: '你好嗎？' };
const ARABIC: Greeting = {
  phrase: 'As-salamu alaykum！',
  lang: '阿拉伯語',
  meaning: '願平安與你同在',
};
const SWAHILI: Greeting = { phrase: 'Jambo！', lang: '斯瓦希里語', meaning: '你好' };
const NORSE: Greeting = { phrase: 'Heill ok sæll！', lang: '古諾斯語', meaning: '祝你健康、幸福' };
const PORTUGUESE: Greeting = { phrase: 'Bom dia！', lang: '葡萄牙語', meaning: '早安、日安' };
const MALAYALAM: Greeting = {
  phrase: 'Namaskaram！',
  lang: '馬拉雅拉姆語',
  meaning: '雙手合十的問候',
};

/** 各港口當地人的問候語 */
const GREETINGS: Record<string, Greeting> = {
  quanzhou: MIN,
  fuzhou: { phrase: '食飽未？', lang: '福州話', meaning: '吃飽了沒？閩地的人都這樣打招呼' },
  guangzhou: { phrase: '食咗飯未呀？', lang: '粵語', meaning: '吃過飯了沒？' },
  ningbo: WU,
  taicang: WU,
  naha: { phrase: 'Haisai！', lang: '琉球語', meaning: '你好（男性常用）' },
  malacca: MALAY,
  singapore: MALAY,
  palembang: MALAY,
  brunei: MALAY,
  samudera: MALAY,
  semarang: { phrase: 'Sugeng rawuh！', lang: '爪哇語', meaning: '歡迎光臨' },
  calicut: MALAYALAM,
  cochin: MALAYALAM,
  quilon: MALAYALAM,
  galle: { phrase: 'Ayubowan！', lang: '僧伽羅語', meaning: '祝你長壽' },
  chittagong: { phrase: 'Nomoskar！', lang: '孟加拉語', meaning: '雙手合十的問候' },
  maldives: { phrase: 'Assalaamu alaikum！', lang: '迪維希語', meaning: '願你平安' },
  hormuz: { phrase: 'Salām！', lang: '波斯語', meaning: '平安、你好' },
  dhofar: ARABIC,
  aden: ARABIC,
  jeddah: ARABIC,
  mogadishu: ARABIC,
  brava: ARABIC,
  malindi: SWAHILI,
  kilwa: SWAHILI,
  lisbon: PORTUGUESE,
  palos: { phrase: '¡Buenos días!', lang: '西班牙語', meaning: '早安、日安' },
  'las-palmas': { phrase: '¡Buenos días!', lang: '西班牙語', meaning: '早安、日安' },
  nidaros: NORSE,
  torshavn: NORSE,
  reykjavik: NORSE,
  brattahlid: NORSE,
  orkney: NORSE,
  dublin: NORSE,
  lagos: PORTUGUESE,
  funchal: PORTUGUESE,
  santiago: PORTUGUESE,
  'sao-tome': PORTUGUESE,
  arguin: ARABIC,
  elmina: { phrase: 'Akwaaba！', lang: '芳蒂語（阿坎語）', meaning: '歡迎' },
  mpinda: { phrase: 'Mbote！', lang: '剛果語', meaning: '你好' },
  mozambique: SWAHILI,
};

const CULTURE_LINES: Record<Culture, string[]> = {
  iberia: [
    '葡萄牙和西班牙的國王都想找到通往印度的海路：葡萄牙人沿著非洲往南找，也有人說往西直接橫渡大海就到了。',
    '往南航行的船先順著北風走；回程一路頂風，得往西北繞一個大圈，才遇得到往東吹的西風。',
    '夏天幾乎不下雨，天空藍得發亮；雨都集中在冬天。',
    '製圖師把每一艘船帶回來的消息畫進海圖，海圖上的海岸線一年比一年長。',
    '水手出海前都會到教堂祈禱，一趟遠航常常一兩年才回得來。',
  ],
  norse: [
    '夏天太陽幾乎不下山，半夜天還是亮的；到了冬天，白天只有短短幾個小時。',
    '冬天的夜裡，天上會出現綠色的光帶，像簾子一樣飄動。',
    '我們的房子用石頭和草皮蓋牆和屋頂，又厚又保暖，屋頂上還長著草。',
    '往西航行時，只要讓北極星一直保持同樣的高度，就不會偏離航線。',
    '魚曬乾了可以放好幾年，是我們最好的商品，也是航海時的乾糧。',
  ],
  taino: [
    '我們用樹幹挖成獨木舟，大的可以坐幾十個人，在島和島之間划來划去。',
    '晚上睡在「哈瑪卡」上——用棉線編的吊床，掛在兩根柱子之間，涼快又不怕地上的蟲。',
    '我們種樹薯，把有毒的汁擠掉以後烤成薄薄的餅，可以放很久。',
    '夏末秋初要小心「胡拉坎」，那是會把房子和獨木舟都捲走的大風。',
    '村子中間的廣場可以玩球賽，也在那裡跳舞、祭祀祖先和精靈。',
  ],
  westafrica: [
    '我們用黃金砂換外國人的布、銅盆和鹽。黃金是從內陸的河邊淘出來的。',
    '雨季一來，雨下得又大又急；乾季時，從北方沙漠吹來的風帶著滿天的沙塵。',
    '海浪很大，港外沒有能停大船的地方，要靠獨木舟把貨一趟趟划上岸。',
    '森林裡有油棕、可樂果和各種藥草，市集上什麼都買得到。',
    '外國人的船從北方來，他們說要找通往印度的路，可是海岸好像永遠走不完。',
  ],
  minnan: [
    '冬天吹東北風，船往南洋去；夏天吹西南風，船就回來了。',
    '港裡停滿了福船，尖尖的船底最適合在深海乘風破浪。',
    '市集的瓷器又漲價了，聽說南洋那邊搶著要。',
    '出海前別忘了到天妃宮上個香，求媽祖保佑一路平安。',
    '夏天午後常有雷陣雨，秋天還要小心颱風。',
  ],
  ryukyu: [
    '琉球地方小，靠著和明朝、日本、南洋往來做生意過日子。',
    '颱風季節一到，船都要拉上岸綁好。',
    '房子外面圍著石牆，擋住從海上吹來的強風。',
    '島的四周是珊瑚礁，進港要跟著熟悉水路的人走。',
  ],
  nanyang: [
    '這裡一年四季都是夏天，只分雨多和雨少的季節。',
    '每天下午總會下一場大雨，下完就涼快了。',
    '我們的房子架在木樁上，漲潮淹水也不怕，底下還通風。',
    '各國商人都在這裡等季風轉向，一等就是好幾個月。',
    '森林裡有大象和老虎，河口的紅樹林裡有鱷魚，可別亂走。',
  ],
  southasia: [
    '西南季風來的時候，大雨一下就是好幾個月，海上浪大得不能開船。',
    '胡椒長在藤蔓上，果實曬乾了就變成黑色的。',
    '椰子全身都有用：果肉能吃，殼能做碗，纖維還能搓成繩子綁船。',
    '天氣熱，我們穿寬鬆的棉布衣服，這裡的棉布遠近馳名。',
  ],
  swahili: [
    '我們的房子用海裡的珊瑚石砌成，牆很厚，白天也很涼爽。',
    '客棧和市集的屋頂用椰子葉一片片編起來，下雨時雨水會順著斜屋頂流走。',
    '那棵肚子胖胖的大樹叫猴麵包樹，樹幹能存很多水，乾季也不怕。',
    '東北季風一吹，阿拉伯和印度的船就來了；等西南季風來了，他們再乘風回去。',
    '斯瓦希里話裡有很多阿拉伯來的詞，因為大家在這條海岸上做了好幾百年的生意。',
  ],
  arabia: [
    '白天太熱了，大家都趁早上和傍晚做生意。',
    '我們的船用椰子纖維繩把木板縫在一起，連一根鐵釘都沒有。',
    '駱駝商隊從沙漠運來乳香，再裝上船運到遠方。',
    '一天五次，喚拜的聲音會從清真寺的高塔上傳出來。',
    '這裡很少下雨，水要從井裡打，或是從很遠的地方運來。',
  ],
};

/** 某港口路人會說的話：先是當地語言的問候，再加上生活閒聊與港口的小知識 */
export function folkLines(
  portId: string,
  culture: Culture,
  gossip: string[],
  festival?: string,
): string[] {
  const g = GREETINGS[portId];
  const lines: string[] = [];
  if (g) lines.push(`${g.phrase}（${g.lang}：${g.meaning}）`);
  if (festival) lines.push(festival);
  lines.push(...CULTURE_LINES[culture], ...gossip.slice(0, 2));
  return lines;
}

export function greetingFor(portId: string): Greeting | null {
  return GREETINGS[portId] ?? null;
}
