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
};

const CULTURE_LINES: Record<Culture, string[]> = {
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
  arabia: [
    '白天太熱了，大家都趁早上和傍晚做生意。',
    '我們的船用椰子纖維繩把木板縫在一起，連一根鐵釘都沒有。',
    '駱駝商隊從沙漠運來乳香，再裝上船運到遠方。',
    '一天五次，喚拜的聲音會從清真寺的高塔上傳出來。',
    '這裡很少下雨，水要從井裡打，或是從很遠的地方運來。',
  ],
};

/** 某港口路人會說的話：先是當地語言的問候，再加上生活閒聊與港口的小知識 */
export function folkLines(portId: string, culture: Culture, gossip: string[]): string[] {
  const g = GREETINGS[portId];
  const lines: string[] = [];
  if (g) lines.push(`${g.phrase}（${g.lang}：${g.meaning}）`);
  lines.push(...CULTURE_LINES[culture], ...gossip.slice(0, 2));
  return lines;
}

export function greetingFor(portId: string): Greeting | null {
  return GREETINGS[portId] ?? null;
}
