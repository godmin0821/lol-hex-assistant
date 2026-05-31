import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const CACHE_MS = 1000 * 60 * 20;
const LIVE_MAYHEM_PATCH = "26.11";
const LIVE_MAYHEM_PATCH_NOTES =
  "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-11-notes/";
const pageCache = new Map();
let championCache = null;
let itemNameCache = null;

const fallbackChampions = {
  ahri: { id: "Ahri", key: "103", enName: "Ahri", zhName: "阿狸", slug: "ahri" },
  yasuo: { id: "Yasuo", key: "157", enName: "Yasuo", zhName: "亚索", slug: "yasuo" },
  yone: { id: "Yone", key: "777", enName: "Yone", zhName: "永恩", slug: "yone" },
  jinx: { id: "Jinx", key: "222", enName: "Jinx", zhName: "金克丝", slug: "jinx" },
  lux: { id: "Lux", key: "99", enName: "Lux", zhName: "拉克丝", slug: "lux" },
  ezreal: { id: "Ezreal", key: "81", enName: "Ezreal", zhName: "伊泽瑞尔", slug: "ezreal" },
  kaisa: { id: "Kaisa", key: "145", enName: "Kai'Sa", zhName: "卡莎", slug: "kaisa" },
  leesin: { id: "LeeSin", key: "64", enName: "Lee Sin", zhName: "李青", slug: "lee-sin" },
  vayne: { id: "Vayne", key: "67", enName: "Vayne", zhName: "薇恩", slug: "vayne" },
  zed: { id: "Zed", key: "238", enName: "Zed", zhName: "劫", slug: "zed" }
};

const fixedAliases = {
  剑魔: "aatrox",
  亚托克斯: "aatrox",
  牛头: "alistar",
  冰鸟: "anivia",
  沙皇: "azir",
  机器人: "blitzcrank",
  火男: "brand",
  女警: "caitlyn",
  蛇女: "cassiopeia",
  大虫子: "chogath",
  飞机: "corki",
  诺手: "darius",
  皎月: "diana",
  蒙多: "drmundo",
  寡妇: "evelynn",
  小鱼人: "fizz",
  船长: "gangplank",
  男枪: "graves",
  人马: "hecarim",
  大头: "heimerdinger",
  俄洛伊: "illaoi",
  刀妹: "irelia",
  风女: "janna",
  皇子: "jarvaniv",
  武器: "jax",
  烬: "jhin",
  卡莎: "kaisa",
  卡萨丁: "kassadin",
  螳螂: "khazix",
  克烈: "kled",
  大嘴: "kogmaw",
  妖姬: "leblanc",
  盲僧: "leesin",
  冰女: "lissandra",
  卢锡安: "lucian",
  露露: "lulu",
  光辉: "lux",
  石头人: "malphite",
  蚂蚱: "malzahar",
  大树: "maokai",
  女枪: "missfortune",
  铁男: "mordekaiser",
  莫甘娜: "morgana",
  狗头: "nasus",
  豹女: "nidalee",
  梦魇: "nocturne",
  雪人: "nunu",
  发条: "orianna",
  潘森: "pantheon",
  波比: "poppy",
  奎因: "quinn",
  洛: "rakan",
  龙龟: "rammus",
  鳄鱼: "renekton",
  狮子狗: "rengar",
  瑞文: "riven",
  兰博: "rumble",
  瑞兹: "ryze",
  猪妹: "sejuani",
  赛娜: "senna",
  腕豪: "sett",
  小丑: "shaco",
  炼金: "singed",
  轮子妈: "sivir",
  琴女: "sona",
  奶妈: "soraka",
  乌鸦: "swain",
  河流之王: "tahmkench",
  男刀: "talon",
  宝石: "taric",
  提莫: "teemo",
  锤石: "thresh",
  小炮: "tristana",
  蛮王: "tryndamere",
  卡牌: "twistedfate",
  老鼠: "twitch",
  螃蟹: "urgot",
  厄加特: "urgot",
  韦鲁斯: "varus",
  薇恩: "vayne",
  小法: "veigar",
  维克托: "viktor",
  吸血鬼: "vladimir",
  狗熊: "volibear",
  猴子: "monkeyking",
  泽拉斯: "xerath",
  赵信: "xinzhao",
  掘墓: "yorick",
  猫咪: "yuumi",
  时光: "zilean",
  婕拉: "zyra",
  狐狸: "ahri",
  九尾妖狐: "ahri",
  阿狸: "ahri",
  托儿索: "yasuo",
  亚索: "yasuo",
  永恩: "yone",
  金克丝: "jinx",
  暴走萝莉: "jinx",
  拉克丝: "lux",
  光辉: "lux",
  光辉女郎: "lux",
  伊泽瑞尔: "ezreal",
  ez: "ezreal",
  李青: "leesin",
  vn: "vayne",
  劫: "zed"
};

const sourceTemplates = [
  {
    name: "ARAM Mayhem",
    url: (c) => `https://arammayhem.com/zh-cn/champions/${c.slug}`,
    weight: 6
  },
  {
    name: "ARAM Mayhem 出装页",
    url: (c) => `https://arammayhem.com/zh-cn/build/${c.slug}`,
    weight: 4
  },
  {
    name: "ARAM Mayhem 组合库",
    url: (c) => `https://arammayhem.com/zh-cn/combo/?q=${encodeURIComponent(c.zhName || c.enName)}`,
    weight: 3
  }
];

const knownAugments = [
  "ADAPt",
  "Apex Inventor",
  "Back To Basics",
  "Big Brain",
  "Bread And Butter",
  "Bread And Cheese",
  "Bread And Jam",
  "Combo Master",
  "Contract Killer",
  "Dashing",
  "Dawnbringer's Resolve",
  "Erosion",
  "Eureka",
  "Executioner",
  "Fey Magic",
  "Flashy",
  "From Beginning to End",
  "Giant Slayer",
  "Goliath",
  "Infernal Conduit",
  "It's Critical",
  "Jeweled Gauntlet",
  "Laser Eyes",
  "Light 'em Up!",
  "Magic Missile",
  "Marksmage",
  "Master of Duality",
  "Minionmancer",
  "Mystic Punch",
  "Phenomenal Evil",
  "Quest: Wooglet's Witchcap",
  "Raid Boss",
  "Scopier Weapons",
  "Skilled Sniper",
  "Spellwake",
  "Spin To Win",
  "Symphony of War",
  "Thread the Needle",
  "Transmute: Prismatic",
  "Vulnerability",
  "Witchful Thinking",
  "Wisdom of Ages",
  "With Haste"
];

const augmentZhNames = {
  ADAPt: "适应之力",
  "Apex Inventor": "顶尖发明家",
  "Back To Basics": "返璞归真",
  "Big Brain": "大脑袋",
  "Bread And Butter": "主技能强化",
  "Bread And Cheese": "副技能强化",
  "Bread And Jam": "三技能强化",
  "Combo Master": "连招大师",
  "Contract Killer": "契约杀手",
  Dashing: "冲刺",
  "Dawnbringer's Resolve": "黎明使者的决心",
  Erosion: "侵蚀",
  Eureka: "灵光乍现",
  Executioner: "处决者",
  "Fey Magic": "仙灵魔法",
  Flashy: "闪亮登场",
  "From Beginning to End": "有始有终",
  "Giant Slayer": "巨人杀手",
  Goliath: "巨像",
  "Infernal Conduit": "炼狱导管",
  "It's Critical": "致命节奏",
  "Jeweled Gauntlet": "珠光护手",
  "Laser Eyes": "激光眼",
  "Light 'em Up!": "点燃他们",
  "Magic Missile": "魔法飞弹",
  Marksmage: "法术射手",
  "Master of Duality": "双修大师",
  Minionmancer: "小兵术士",
  "Mystic Punch": "秘术重拳",
  "Phenomenal Evil": "现象级邪恶",
  "Quest: Wooglet's Witchcap": "任务：伍格莱特的巫师帽",
  "Raid Boss": "团队首领",
  "Scopier Weapons": "加长武器",
  "Scopiest Weapons": "超长武器",
  "Skilled Sniper": "熟练狙击手",
  Spellwake: "法术尾迹",
  "Spin To Win": "旋转制胜",
  "Symphony of War": "战争交响曲",
  "Thread the Needle": "穿针引线",
  "Transmute: Prismatic": "转化：棱彩",
  "Trueshot Prodigy": "精准弹幕奇才",
  Vulnerability: "弱点暴露",
  "Witchful Thinking": "巫术思维",
  "Wisdom of Ages": "岁月智慧",
  "With Haste": "极速前进",
  "Accelerating Sorcery": "加速巫术",
  "Banner of Command": "号令之旗",
  "Blade Waltz": "利刃华尔兹",
  "Blunt Force": "钝击之力",
  "Buff Buddies": "增益伙伴",
  "Cannon Fodder": "炮灰",
  "Can't Touch This": "碰不到我",
  Castle: "城堡",
  "Celestial Body": "天界之躯",
  Chauffeur: "专属司机",
  "Circle of Death": "死亡之环",
  "Courage of the Colossus": "巨像勇气",
  "Critical Healing": "暴击治疗",
  "Draw Your Sword": "拔剑",
  "Don't Blink": "别眨眼",
  "Don't Chase": "别追",
  "Firebrand": "纵火者",
  "Goredrink": "渴血",
  "Homeguard": "家园卫士",
  "Impassable": "不可逾越",
  "It's Killing Time": "杀戮时刻",
  "Juice Box": "果汁盒",
  "Ocean Soul": "海洋龙魂",
  "Oathsworn": "誓约",
  "Omni Soul": "全能龙魂",
  "Quantum Computing": "量子计算",
  "Quest: Steel Your Heart": "任务：钢铁之心",
  "Quest: Urf's Champion": "任务：无限火力冠军",
  "Serve Beyond Death": "死后效命",
  "Self Destruct": "自毁",
  "Summoner's Roulette": "召唤师轮盘",
  "Twice Thrice": "二连三连",
  "Ultimate Revolution": "终极革命",
  "Ultimate Unstoppable": "终极不可阻挡"
};

const ddg = (query) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchJson(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "lol-hex-assistant/1.0" }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadChampions() {
  if (championCache) return championCache;

  const byAlias = new Map();
  const byId = new Map();
  const addChampion = (champ) => {
    byId.set(champ.id, champ);
    [
      champ.id,
      champ.enName,
      champ.zhName,
      champ.title,
      champ.slug,
      normalize(champ.enName),
      normalize(champ.zhName),
      normalize(champ.title)
    ].forEach((alias) => alias && byAlias.set(normalize(alias), champ));
  };

  try {
    const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
    const latest = versions[0];
    const [en, zh] = await Promise.all([
      fetchJson(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`),
      fetchJson(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/zh_CN/champion.json`)
    ]);
    for (const [id, data] of Object.entries(en.data)) {
      const zhData = zh.data[id] || {};
      addChampion({
        id,
        key: data.key,
        enName: data.name,
        zhName: zhData.name || data.name,
        title: zhData.title || data.title,
        slug: slugify(data.name),
        patch: latest
      });
    }
  } catch {
    Object.values(fallbackChampions).forEach(addChampion);
  }

  for (const [alias, target] of Object.entries(fixedAliases)) {
    const champ = byAlias.get(normalize(target)) || byAlias.get(normalize(fallbackChampions[target]?.id));
    if (champ) byAlias.set(normalize(alias), champ);
  }

  championCache = { byAlias, byId, count: byId.size };
  return championCache;
}

async function loadItemNames() {
  if (itemNameCache) return itemNameCache;

  const byId = new Map();
  try {
    const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
    const latest = versions[0];
    const zhItems = await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/zh_CN/item.json`);
    for (const [id, item] of Object.entries(zhItems.data || {})) {
      if (item?.name) byId.set(String(id), item.name);
    }
  } catch {
    // The static fallback below covers common Arena items when Data Dragon is unreachable.
  }

  Object.entries({
    223020: "法师之靴",
    223111: "水银之靴",
    223115: "纳什之牙",
    223135: "中娅沙漏",
    223089: "灭世者的死亡之帽",
    223087: "影焰",
    224628: "视界专注",
    224633: "峡谷制造者",
    224636: "暗夜收割者",
    224637: "恶魔之拥",
    224645: "破碎王后之冕",
    224665: "卢登的回声",
    224640: "永霜",
    222510: "昼与夜",
    222065: "舒瑞娅的战歌",
    223003: "大天使之杖",
    223089: "灭世者的死亡之帽",
    223091: "巫妖之祸",
    223135: "中娅沙漏",
    223161: "朔极之矛",
    223165: "莫雷洛秘典",
    223188: "破碎王后之冕",
    223190: "钢铁烈阳之匣",
    223193: "石像鬼石板甲",
    223194: "狂徒铠甲",
    223195: "骑士之誓",
    223300: "明朗之靴",
    223302: "狂战士胫甲",
    223303: "铁板靴",
    223350: "无尽之刃",
    223504: "夺萃之镰",
    223508: "巨型九头蛇",
    223089: "灭世者的死亡之帽",
    224636: "暗夜收割者",
    443060: "神圣之剑",
    447100: "卢登的暴风雨",
    447102: "现实裂隙",
    447104: "激发之匣",
    447109: "残忍",
    447112: "血肉吞噬者"
  }).forEach(([id, name]) => {
    if (!byId.has(id)) byId.set(id, name);
  });

  itemNameCache = byId;
  return itemNameCache;
}

async function resolveChampion(input) {
  const champions = await loadChampions();
  const key = normalize(input);
  if (!key) return null;
  if (champions.byAlias.has(key)) return champions.byAlias.get(key);

  for (const [alias, champion] of champions.byAlias) {
    if (alias.includes(key) || key.includes(alias)) return champion;
  }
  return null;
}

function compactChampion(champion) {
  return {
    id: champion.id,
    enName: champion.enName,
    zhName: champion.zhName,
    title: champion.title,
    slug: champion.slug
  };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : Math.min(prev[j - 1] + 1, prev[j] + 1, curr[j - 1] + 1);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function championFields(champion) {
  return [
    champion.id,
    champion.enName,
    champion.zhName,
    champion.title,
    champion.slug
  ]
    .filter(Boolean)
    .map((field) => normalize(field));
}

async function suggestChampions(input, limit = 8) {
  const champions = await loadChampions();
  const key = normalize(input);
  if (!key) return [];

  const scored = Array.from(champions.byId.values()).map((champion) => {
    const fields = championFields(champion);
    let score = 1000;
    for (const field of fields) {
      if (field === key) score = Math.min(score, 0);
      else if (field.startsWith(key) || key.startsWith(field)) score = Math.min(score, 1);
      else if (field.includes(key) || key.includes(field)) score = Math.min(score, 2);
      else if (/^[a-z0-9]+$/.test(key) && /^[a-z0-9]+$/.test(field)) {
        score = Math.min(score, 4 + levenshtein(key, field));
      } else {
        const shared = Array.from(key).filter((char) => field.includes(char)).length;
        if (shared) score = Math.min(score, 20 - shared);
      }
    }
    return { champion, score };
  });

  return scored
    .filter((entry) => entry.score < 20)
    .sort((a, b) => a.score - b.score || a.champion.zhName.localeCompare(b.champion.zhName, "zh-CN"))
    .slice(0, limit)
    .map((entry) => compactChampion(entry.champion));
}

async function fetchText(url, ms = 9000) {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.text;

  const direct = await fetchDirectText(url, ms).catch((error) => ({ error }));
  if (typeof direct === "string" && direct.length > 200) {
    pageCache.set(url, { time: Date.now(), text: direct });
    return direct;
  }

  const reader = await fetchDirectText(`https://r.jina.ai/${url}`, Math.min(ms, 7000)).catch((error) => ({ error }));
  if (typeof reader === "string" && reader.length > 200) {
    pageCache.set(url, { time: Date.now(), text: reader });
    return reader;
  }

  throw direct.error || reader.error || new Error("No readable page content");
}

async function fetchDirectText(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        accept: "text/html,text/plain,*/*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
      }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    if (/Just a moment|Enable JavaScript and cookies|x-amzn-waf-action/i.test(text)) {
      throw new Error("Site challenge blocked direct fetch");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function htmlToText(html) {
  const picked = [];
  for (const match of html.matchAll(/<(?:meta|title|img)[^>]*(?:content|alt)?=["']([^"']+)["'][^>]*>/gi)) {
    picked.push(decodeHtml(match[1]));
  }
  for (const match of html.matchAll(/alt=["']([^"']+)["']/gi)) {
    picked.push(decodeHtml(match[1]));
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n");
  return `${picked.join("\n")}\n${decodeHtml(body)}`;
}

function htmlLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(?:h[1-6]|p|div|section|article|li|span|a|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/Playbook|astro|data-astro|TOC|render|previously|terminal page/i.test(line));
}

function readMeta(html) {
  const title = decodeHtml(html.match(/<title>(.*?)<\/title>/i)?.[1] || "");
  const desc = decodeHtml(html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || "");
  return { title, desc };
}

function groupRows(lines, startTitle, stopTitles, maxRows = 6) {
  const start = lines.findIndex((line) => line === startTitle);
  if (start < 0) return [];
  const out = [];
  let names = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (stopTitles.includes(line)) break;
    const pick = line.match(/^登场率:\s*(.+)$/);
    const win = line.match(/^胜率:\s*(.+)$/);
    if (pick) {
      out.push({ items: [...names], pickRate: pick[1], winRate: "" });
      names = [];
    } else if (win && out.length) {
      out[out.length - 1].winRate = win[1];
      if (out.length >= maxRows) break;
    } else if (!/^数据日期|^评级|^棱彩|^金色|^银色/.test(line)) {
      names.push(line);
    }
  }
  return out.filter((row) => row.items.length);
}

function parseSkillOrders(lines) {
  const start = lines.findIndex((line) => line === "技能主升顺序");
  const stop = lines.findIndex((line, index) => index > start && line === "出门装");
  if (start < 0 || stop < 0) return [];
  const rows = [];
  for (let i = start; i < stop; i += 1) {
    const order = lines[i].match(/^[QWER]>(?:[QWER]>?)+$/)?.[0];
    if (order) {
      rows.push({
        order,
        pickRate: lines[i + 1]?.replace("登场率: ", "") || "",
        winRate: lines[i + 2]?.replace("胜率: ", "") || ""
      });
    }
  }
  return rows.slice(0, 3);
}

function parseAugments(lines, championName) {
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line === `${championName} 最佳强化符文`)
    .map((entry) => entry.index);
  const start = starts[1] ?? starts[0];
  if (start == null) return [];
  const stop = lines.findIndex((line, index) => index > start && line.startsWith(`为 ${championName} 提交组合`));
  const end = stop > 0 ? stop : Math.min(lines.length, start + 140);
  const augments = [];
  let tier = "";
  const skip = new Set(["评级 + 登场率"]);
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i];
    if (["棱彩", "金色", "银色"].includes(line)) {
      tier = line;
      continue;
    }
    if (skip.has(line) || line.startsWith("胜率:")) continue;
    if (i + 1 < end && lines[i + 1]?.startsWith("胜率:")) {
      const description = [];
      for (let j = i + 2; j < end; j += 1) {
        const next = lines[j];
        if (["棱彩", "金色", "银色"].includes(next)) break;
        if (lines[j + 1]?.startsWith("胜率:")) break;
        if (!next.startsWith("胜率:")) description.push(next);
      }
      augments.push({
        name: line,
        tier,
        winRate: lines[i + 1].replace("胜率: ", ""),
        description: description.slice(0, 6).join("")
      });
    }
  }
  return augments.slice(0, 24);
}

function classifyAugment(augment) {
  const text = `${augment.name} ${augment.description}`;
  if (/尤里卡|巫师|超凡邪恶|沃格勒特|法术强度|物理转魔法|法术/.test(text)) return "法强成长流";
  if (/珠光|裁决|暴击|额外伤害|斩杀/.test(text)) return "爆发收割流";
  if (/魔法飞弹|虚空裂隙|炼狱导管|双生火焰|灼烧|飞弹|裂痕|老练狙神|命中/.test(text)) return "技能命中/消耗流";
  if (/吸血|歌利亚|生命|护盾|治疗|全能吸血|变小|移动速度/.test(text)) return "生存拉扯流";
  if (/攻击|普攻|攻速|双刀|亮出你的剑/.test(text)) return "普攻特效流";
  return "通用强化流";
}

function detectBuildProfile(build) {
  const items = [...(build.starting || []), ...(build.core || []), ...(build.late || [])]
    .flatMap((row) => row.items || [])
    .join(" ");
  if (/卢登|兰德里|影焰|法师之靴|灭世者|中娅|虚空之杖|视界专注|大天使|巫妖|纳什之牙|女妖面纱/.test(items)) {
    return "mage";
  }
  if (/心之钢|狂徒|霸王血铠|荆棘之甲|振奋盔甲|日炎|石像鬼|巨型九头蛇/.test(items)) {
    return "bruiser";
  }
  if (/无尽之刃|夺萃之镰|收集者|破败王者之刃|卢安娜|饮血剑|轻语|幽梦|岚切|电刀/.test(items)) {
    return "physical";
  }
  return "default";
}

function situationalItems(profile, label) {
  if (profile === "mage") {
    if (label === "生存拉扯流") return ["中娅沙漏", "女妖面纱", "星界驱驰"];
    if (label === "普攻特效流") return ["纳什之牙", "巫妖之祸", "中娅沙漏"];
    if (label === "技能命中/消耗流") return ["兰德里的苦楚", "虚空之杖", "中娅沙漏"];
    return ["灭世者的死亡之帽", "虚空之杖", "中娅沙漏"];
  }
  if (profile === "bruiser") {
    if (label === "爆发收割流") return ["黑色切割者", "斯特拉克的挑战护手", "死亡之舞"];
    if (label === "普攻特效流") return ["黑色切割者", "斯特拉克的挑战护手", "破败王者之刃"];
    return ["狂徒铠甲", "荆棘之甲", "振奋盔甲"];
  }
  if (profile === "physical") {
    if (label === "生存拉扯流") return ["饮血剑", "斯特拉克的挑战护手", "死亡之舞"];
    if (label === "普攻特效流") return ["破败王者之刃", "卢安娜的飓风", "无尽之刃"];
    return ["无尽之刃", "收集者", "凡性的提醒"];
  }
  return [];
}

function buildBranchAdvice(augment, build) {
  const core = build.core[0]?.items || [];
  const fallbackCore = core.length ? core : [...(build.starting[0]?.items || []), ...(build.boots[0]?.items || [])];
  const label = classifyAugment(augment);
  const profile = detectBuildProfile(build);
  const path = fallbackCore.slice(0, 4);
  const add = (items) => [...new Set([...path, ...items])].slice(0, 5);
  const items = situationalItems(profile, label);
  const reasons = {
    "技能命中/消耗流": "强化靠技能命中或持续触发打收益。保持英雄原本的装备体系，优先选择能稳定触发、提高持续作战的补装。",
    法强成长流: "强化直接放大技能收益。保持基础核心，补充同体系的法强、穿透或保命装备。",
    爆发收割流: "强化提高斩杀或爆发收益。保持基础核心，补充同体系的伤害或穿透装备。",
    生存拉扯流: "强化给生存或移速收益。沿用基础核心并补容错，利用长线团战反复进出场。",
    普攻特效流: "强化把普攻价值拉高。保持英雄原本的伤害类型，补充同体系的攻速、特效或近身容错。"
  };
  return {
    label,
    items: add(items),
    reason: reasons[label] || "没有明显改玩法时，沿用最高胜率核心出装，再根据敌方阵容补穿透或保命。"
  };
}

function parseMayhemPage(html, champion, sourceSlug = champion.slug) {
  const lines = htmlLines(html);
  const meta = readMeta(html);
  const championName = champion.zhName || champion.enName;
  const pageChampionName = lines.find((line) => line.includes("海克斯大乱斗出装"))?.split(" ")[0] || championName;
  const desc = meta.desc || lines.find((line) => line.includes("胜率") && line.includes("版本")) || "";
  const patch = desc.match(/(\d{2}\.\d{1,2})版本/)?.[1] || meta.title.match(/（(\d{2}\.\d{1,2})）/)?.[1] || "最新";
  const dataDate = lines.find((line) => line.startsWith("数据日期:"))?.replace("数据日期:", "").trim() || "";
  const tier = desc.match(/([SABC][+]?|D)级强度/)?.[1] || lines.find((line) => /^[SABC][+]?|D$/.test(line)) || "";
  const winRate = desc.match(/胜率\s*([0-9.]+%)/)?.[1] || "";

  const build = {
    starting: groupRows(lines, "出门装", ["鞋子", "核心出装", "后期出装", `${pageChampionName} 最佳强化符文`], 5),
    boots: groupRows(lines, "鞋子", ["核心出装", "后期出装", `${pageChampionName} 最佳强化符文`], 4),
    core: groupRows(lines, "核心出装", ["后期出装", `${pageChampionName} 最佳强化符文`], 5),
    late: groupRows(lines, "后期出装", [`${pageChampionName} 最佳强化符文`], 5)
  };
  const augments = parseAugments(lines, pageChampionName);
  const branches = augments.map((augment) => ({
    ...augment,
    ...buildBranchAdvice(augment, build)
  }));

  return {
    champion: {
      ...champion,
      displayName: pageChampionName,
      mayhemUrl: `https://arammayhem.com/zh-cn/build/${sourceSlug}/`
    },
    updatedAt: new Date().toISOString(),
    freshness: {
      patch: LIVE_MAYHEM_PATCH,
      statsPatch: patch,
      dataDate,
      sourceCount: 2,
      championDataCount: championCache?.count || 0,
      patchNotesUrl: LIVE_MAYHEM_PATCH_NOTES
    },
    verdict: `${pageChampionName} 当前统计快照为 ${patch}：${tier || "未知"} 级，胜率 ${winRate || "暂无"}。下方按强化品质给出同职业装备路线。`,
    summary: { tier, winRate, patch: LIVE_MAYHEM_PATCH, statsPatch: patch, source: "ARAM Mayhem" },
    skillOrders: parseSkillOrders(lines),
    build,
    augments,
    branches,
    caveats: [
      "海克斯大乱斗是 5v5 单线团战，强化优先服务英雄机制，而不是照搬斗魂竞技场。",
      "开局和 7/11/15 级抽到的强化会改变出装方向；同一英雄不要死套一条装备线。",
      "如果抽到的强化没有改变核心玩法，就优先采用最高登场率核心出装，再按敌方阵容补穿透或保命。"
    ],
    sources: [
      {
        name: "ARAM Mayhem",
        url: `https://arammayhem.com/zh-cn/build/${sourceSlug}/`,
        ok: true,
        snippets: [
          desc,
          ...augments.slice(0, 3).map((augment) => `${augment.name} · ${augment.tier} · 胜率 ${augment.winRate}`)
        ].filter(Boolean)
      },
      {
        name: "Riot 26.11 官方公告",
        url: LIVE_MAYHEM_PATCH_NOTES,
        ok: true,
        snippets: ["国服当前线上版本：26.11", "强化推荐使用 ARAM Mayhem 当前统计快照"]
      }
    ],
    socialSearches: [
      { name: "抖音", url: ddg(`${pageChampionName} 海克斯大乱斗 出装 强化符文 site:douyin.com`) },
      { name: "小红书", url: ddg(`${pageChampionName} 海克斯大乱斗 出装 强化符文 site:xiaohongshu.com`) },
      { name: "B站", url: ddg(`${pageChampionName} 海克斯大乱斗 出装 强化符文 site:bilibili.com`) }
    ]
  };
}

function getQwikData(html) {
  const match = html.match(/<script type="qwik\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const get = (id) => data.objs?.[parseInt(id, 36)];
    return { data, get };
  } catch {
    return null;
  }
}

function extractLolalyticsAugments(html) {
  const qwik = getQwikData(html);
  if (!qwik) return [];

  const augmentSets = qwik.data.objs.find(
    (item) => item && typeof item === "object" && item.augment0 && item.augment1
  );
  const rows = qwik.get(augmentSets.augment0) || [];
  const firstRow = qwik.get(rows[0]);
  const firstAugmentId = Array.isArray(firstRow) ? qwik.get(firstRow[0]) : null;
  const augmentNames = qwik.data.objs.find((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || firstAugmentId == null) return false;
    const entry = qwik.get(item[String(firstAugmentId)]);
    return Array.isArray(entry) && typeof qwik.get(entry[0]) === "string";
  });

  if (!augmentNames) return [];

  return rows
    .map((rowRef) => {
      const row = qwik.get(rowRef);
      if (!Array.isArray(row) || row.length < 4) return null;
      const [idRef, winRef, pickRef, gamesRef] = row;
      const augmentId = qwik.get(idRef);
      const nameEntry = augmentNames[String(augmentId)] && qwik.get(augmentNames[String(augmentId)]);
      const name = Array.isArray(nameEntry) ? qwik.get(nameEntry[0]) : null;
      if (!name || /Null Augment|Augment slot|Level Augments|Stat Anvil/i.test(name)) return null;
      return {
        name,
        win: qwik.get(winRef),
        pick: qwik.get(pickRef),
        games: qwik.get(gamesRef)
      };
    })
    .filter(Boolean)
    .slice(0, 8)
    .map((item) => `推荐强化：${localizeAugment(item.name)} · 胜率 ${item.win}% · 登场 ${item.pick}% · ${item.games} 场`);
}

function uniq(items) {
  return [...new Set(items.map((x) => x.trim()).filter(Boolean))];
}

function localizeAugment(name) {
  return augmentZhNames[name] || "未收录强化";
}

function localizeItem(id, fallbackName, itemNames) {
  return itemNames?.get(String(id)) || decodeHtml(fallbackName) || "未收录装备";
}

function extractCandidates(text, champion, itemNames) {
  const clean = htmlToText(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  const lines = clean
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && line.length <= 180);

  const around = (keywords) =>
    lines.filter((line) => keywords.some((kw) => line.toLowerCase().includes(kw)));

  const parsedAugments = extractLolalyticsAugments(text);
  const foundAugments = knownAugments
    .map((name) => ({ name, index: Math.min(...[text.indexOf(name), clean.indexOf(name)].filter((i) => i >= 0)) }))
    .filter((item) => Number.isFinite(item.index))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.name);

  const augments = [
    ...(parsedAugments.length ? parsedAugments : foundAugments.map((name) => `推荐强化：${localizeAugment(name)}`)),
    ...around(["augment", "prismatic", "silver", "gold", "海克斯", "强化", "符文"])
  ]
    .filter((line) => !/cookie|privacy|subscribe|guide|counter|common augments|^gold$|^silver$|^prismatic item$/i.test(line))
    .slice(0, 10);

  const itemAlts = [...text.matchAll(/alt=["']([^"']+)["'][^>]*data-id=["']((?:22|44|30|66)\d+)["']/gi)]
    .filter((match) => !/skill|stat bonus|prismatic item|legendary|all|emerald|lolalytics/i.test(decodeHtml(match[1])))
    .map((match) => ({
      id: match[2],
      name: localizeItem(match[2], match[1], itemNames)
    }))
    .filter((item) => !/属性加成|装备类型|棱彩装备|传说级/.test(item.name));

  const items = [
    ...uniq(itemAlts.map((item) => item.name)).slice(0, 12).map((name) => `装备候选：${name}`),
    ...around(["item", "boots", "starter", "build", "装备", "出装", "鞋"])
  ]
    .filter((line) => !/cookie|privacy|advert/i.test(line))
    .slice(0, 10);

  const patch =
    clean.match(/Patch\s*(\d{2}\.\d+)/i)?.[1] ||
    clean.match(/version\s*(\d{2}\.\d+)/i)?.[1] ||
    champion.patch ||
    "latest";

  const winRate = clean.match(/(\d{1,2}\.\d{1,2}%|\d{1,2}%)[^\n]{0,24}(win|胜率)/i)?.[0] || "";
  const pickRate = clean.match(/(\d{1,2}\.\d{1,2}%|\d{1,2}%)[^\n]{0,24}(pick|登场|选取)/i)?.[0] || "";

  return {
    patch,
    winRate: winRate.replace(/win(?: rate)?/i, "胜率").replace(/pick(?: rate)?/i, "登场率"),
    pickRate: pickRate.replace(/win(?: rate)?/i, "胜率").replace(/pick(?: rate)?/i, "登场率"),
    augments: uniq(augments),
    items: uniq(items),
    snippets: uniq([...augments.slice(0, 3), ...items.slice(0, 3)])
  };
}

function fallbackAdvice(champion) {
  return {
    primaryPlan: [
      "先按主流胜率站点确认核心装备，再用短视频/社区只验证细节，不反过来被单个黑科技带偏。",
      "海克斯优先级遵循：能直接放大英雄主要伤害/生存机制 > 泛用数值 > 需要特定装备才启动的玩法。",
      "前两件装备决定玩法方向；如果队友缺前排，第三件优先补生存或持续作战。"
    ],
    augments: [
      "优先选和英雄核心机制同频的强化：普攻型找攻速/攻击特效/追击，技能型找技能急速/法强/穿透，战士找吸血/韧性/护盾。",
      "棱彩强化只拿能改变上限的，不要为了稀有度拿和英雄机制无关的选项。",
      "黑科技只在同时满足“强化 + 装备 + 队友配合”三个条件时采用。"
    ],
    items: [
      "开局装按对线压力选：能安全输出选伤害，容易被秒选生存。",
      "中期两件套围绕伤害转化效率，不要同时走两套互相稀释的路线。",
      "后期根据对面最肥的人补抗性、重伤、穿透或水银。"
    ],
    caveats: [
      `${champion.zhName || champion.enName} 的站点数据可能会随热补丁变化，页面右侧来源链接建议再点开核对一次。`
    ]
  };
}

function synthesize(champion, sourceResults) {
  const useful = sourceResults.filter((s) => s.ok && (s.data.augments.length || s.data.items.length));
  const base = fallbackAdvice(champion);
  const patches = uniq(useful.map((s) => s.data.patch).filter(Boolean));

  const sourceAugments = uniq(useful.flatMap((s) => s.data.augments)).slice(0, 8);
  const sourceItems = uniq(useful.flatMap((s) => s.data.items)).slice(0, 8);
  const signals = uniq(useful.flatMap((s) => [s.data.winRate, s.data.pickRate].filter(Boolean))).slice(0, 4);

  return {
    champion,
    updatedAt: new Date().toISOString(),
    freshness: {
      patch: patches[0] || champion.patch || "latest",
      sourceCount: useful.length,
      championDataCount: championCache?.count || 0
    },
    verdict: useful.length
      ? `已从 ${useful.length} 个实时攻略源抓到可用信息，下面是聚合后的优先级。`
      : "当前攻略源没有返回可稳定解析的数据，先给你一套按英雄机制推导的保守方案，并附上可继续查证的入口。",
    primaryPlan: useful.length
      ? [
          "先采用多个统计站都出现的主流路线；这是胜率样本和版本适应性最强的起点。",
          "海克斯选择不要只看单个视频标题，优先拿能直接放大核心输出/生存循环的强化。",
          "黑科技只作为第二套：当对面阵容给你足够输出空间，且第一个棱彩强化已经指向该玩法时再切。"
        ]
      : base.primaryPlan,
    augments: sourceAugments.length ? sourceAugments : base.augments,
    items: sourceItems.length ? sourceItems : base.items,
    signals,
    caveats: [
      "竞技场/海克斯玩法版本波动很快，推荐以页面标注版本和样本量为准。",
      "抖音、小红书内容更适合找黑科技灵感，但单条视频缺少样本量，不能直接覆盖统计站结论。",
      ...(!useful.length ? base.caveats : [])
    ],
    sources: sourceResults.map(({ data, ...rest }) => ({
      ...rest,
      snippets: data?.snippets || []
    })),
    socialSearches: [
      { name: "抖音", url: ddg(`${champion.zhName} 海克斯大乱斗 出装 site:douyin.com`) },
      { name: "小红书", url: ddg(`${champion.zhName} 海克斯大乱斗 出装 site:xiaohongshu.com`) },
      { name: "B站", url: ddg(`${champion.zhName} 斗魂竞技场 海克斯 出装 site:bilibili.com`) }
    ]
  };
}

async function recommend(input) {
  const champion = await resolveChampion(input);
  if (!champion) {
    const suggestions = await suggestChampions(input);
    return {
      error: suggestions.length
        ? "没精确识别到这个英雄，可以点下面的相近英雄。"
        : "没识别到这个英雄。可以输入中文名、英文名、称号或常见简称，比如 阿狸 / Ahri / 光辉 / EZ。",
      suggestions
    };
  }

  let lastError = null;
  for (const slug of championSlugCandidates(champion)) {
    try {
      const url = `https://arammayhem.com/zh-cn/build/${slug}/`;
      const html = await fetchText(url);
      return parseMayhemPage(html, champion, slug);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("没有找到该英雄的海克斯大乱斗页面。");
}

function championSlugCandidates(champion) {
  const special = {
    Nunu: ["nunu"],
    MonkeyKing: ["wukong"]
  };
  return [
    champion.slug,
    normalize(champion.id),
    slugify(champion.id),
    normalize(champion.enName),
    ...(special[champion.id] || [])
  ].filter((slug, index, list) => slug && list.indexOf(slug) === index);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(body);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(path.join(publicDir, pathname));
  if (!safePath.startsWith(publicDir)) return send(res, 403, "Forbidden", "text/plain");

  try {
    const file = await readFile(safePath);
    const ext = path.extname(safePath);
    const type =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
    send(res, 200, file, type);
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url.startsWith("/api/champions")) {
      const champions = await loadChampions();
      const url = new URL(req.url, `http://${req.headers.host}`);
      const q = url.searchParams.get("q") || "";
      const items = q
        ? await suggestChampions(q, 12)
        : Array.from(champions.byId.values())
            .sort((a, b) => (a.zhName || a.enName).localeCompare(b.zhName || b.enName, "zh-CN"))
            .map(compactChampion);
      send(
        res,
        200,
        JSON.stringify(
          {
            count: champions.count,
            query: q,
            items
          },
          null,
          2
        )
      );
      return;
    }

    if (req.method === "POST" && req.url === "/api/recommend") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 4096) req.destroy();
      });
      req.on("end", async () => {
        try {
          const body = JSON.parse(raw || "{}");
          const result = await recommend(body.champion);
          send(res, result.error ? 422 : 200, JSON.stringify(result, null, 2));
        } catch (error) {
          send(res, 500, JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`LoL Hex Assistant running at http://${host}:${port}`);
});
