import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(rootDir, "public");
const docsDir = path.join(rootDir, "docs");
const baseUrl = process.env.EXPORT_API_BASE || "http://127.0.0.1:4173";
const limit = Number(process.env.EXPORT_LIMIT || "0");

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from)) {
    const source = path.join(from, entry);
    const target = path.join(to, entry);
    const info = await stat(source);
    if (info.isDirectory()) {
      if (entry === "data") continue;
      await copyDir(source, target);
    } else {
      await writeFile(target, await readFile(source));
    }
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${url} did not return JSON: ${text.slice(0, 120)}`);
  }
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  return data;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "lol-hex-assistant/1.0" }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return text;
}

function htmlLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAugmentCatalog(lines) {
  const summary = lines.find((line) => /全部\s+\d+\s+个强化符文/.test(line)) || "";
  const updated = lines.find((line) => /^数据更新\s+/.test(line))?.replace("数据更新", "").trim() || "";
  const total = Number(summary.match(/全部\s+(\d+)\s+个强化符文/)?.[1] || 0);
  const tierCount = (tier) => {
    const index = lines.findIndex((line) => line === tier);
    const value = Number(lines[index + 1] || 0);
    return Number.isFinite(value) ? value : 0;
  };
  const top = [];
  const start = lines.findIndex((line) => line === "排名");
  for (let i = Math.max(0, start); i < lines.length - 5 && top.length < 20; i += 1) {
    if (!/^\d+$/.test(lines[i])) continue;
    let name = lines[i + 1];
    let offset = 2;
    const isNew = lines[i + 2] === "新";
    if (isNew) offset = 3;
    const tier = lines[i + offset];
    const winRate = lines[i + offset + 1];
    const pickRate = lines[i + offset + 2];
    if (!["棱彩", "金色", "银色"].includes(tier) || !/%$/.test(winRate)) continue;
    top.push({ rank: Number(lines[i]), name, isNew, tier, winRate, pickRate });
  }
  return {
    total,
    updated,
    tiers: {
      prismatic: tierCount("棱彩"),
      gold: tierCount("金色"),
      silver: tierCount("银色")
    },
    top
  };
}

function parseItemCatalog(lines) {
  const summary = lines.find((line) => /全部\s+\d+\s+件装备/.test(line)) || "";
  const total = Number(summary.match(/全部\s+(\d+)\s+件装备/)?.[1] || 0);
  const adjusted = lines.filter((line) => line === "已调整").length;
  const top = [];
  const start = lines.findIndex((line) => line === "传说");
  for (let i = Math.max(0, start); i < lines.length - 2 && top.length < 30; i += 1) {
    const type = lines[i];
    if (!["传说", "起始", "消耗品"].includes(type)) continue;
    let name = lines[i + 1];
    let offset = 2;
    let isAdjusted = false;
    if (name === "已调整") {
      isAdjusted = true;
      name = lines[i + 2];
      offset = 3;
    }
    const price = lines[i + offset];
    if (!/^\d+g$/.test(price || "")) continue;
    top.push({ type, name, price, isAdjusted });
  }
  return { total, adjusted, top };
}

async function fetchGlobalMeta() {
  const [augmentHtml, itemHtml] = await Promise.all([
    fetchText("https://arammayhem.com/zh-cn/augments/"),
    fetchText("https://arammayhem.com/zh-cn/items/")
  ]);
  return {
    exportedAt: new Date().toISOString(),
    augments: parseAugmentCatalog(htmlLines(augmentHtml)),
    items: parseItemCatalog(htmlLines(itemHtml)),
    sources: [
      { name: "ARAM Mayhem 强化符文", url: "https://arammayhem.com/zh-cn/augments/" },
      { name: "ARAM Mayhem 装备", url: "https://arammayhem.com/zh-cn/items/" }
    ]
  };
}

async function recommend(champion) {
  return fetchJson(`${baseUrl}/api/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ champion: champion.title || champion.zhName || champion.enName })
  });
}

function placeholderRecommendation(champion, freshness, error) {
  const name = champion.title || champion.zhName || champion.enName;
  const patch = freshness?.patch || freshness?.statsPatch || "最新";
  return {
    champion,
    updatedAt: new Date().toISOString(),
    freshness: {
      patch,
      statsPatch: freshness?.statsPatch || patch,
      dataDate: freshness?.dataDate || "",
      sourceCount: 1,
      championDataCount: freshness?.championDataCount || 0,
      patchNotesUrl: freshness?.patchNotesUrl || "https://www.leagueoflegends.com/en-us/news/game-updates/"
    },
    verdict: `${name} 已进入当前英雄库，但 ARAM Mayhem 暂未收录该英雄的海克斯大乱斗统计页。不要套用旧英雄模板，等统计源上线后再刷新。`,
    summary: { tier: "待收录", winRate: "-", patch, statsPatch: freshness?.statsPatch || patch, source: "等待统计源" },
    skillOrders: [],
    build: { starting: [], boots: [], core: [], late: [] },
    augments: [],
    branches: [],
    caveats: [
      "该英雄已有客户端资料，但当前统计源暂未提供海克斯大乱斗数据。",
      "为了避免误导，这里不生成伪攻略；建议先按英雄常规定位出装，等样本量出现后再刷新。"
    ],
    sources: [
      {
        name: "ARAM Mayhem 暂未收录",
        url: `https://arammayhem.com/zh-cn/build/${champion.slug || champion.enName || champion.id}/`,
        ok: false,
        snippets: [error.message]
      }
    ],
    socialSearches: []
  };
}

await rm(docsDir, { recursive: true, force: true });
await copyDir(publicDir, docsDir);
await writeFile(path.join(docsDir, ".nojekyll"), "");
await mkdir(path.join(docsDir, "data", "recommendations"), { recursive: true });

const index = await fetchJson(`${baseUrl}/api/champions`);
const champions = limit > 0 ? index.items.slice(0, limit) : index.items;
await writeFile(
  path.join(docsDir, "data", "champions.json"),
  JSON.stringify({ ...index, exportedAt: new Date().toISOString(), items: index.items }, null, 2)
);

const globalMeta = await fetchGlobalMeta();
await writeFile(path.join(docsDir, "data", "meta.json"), JSON.stringify(globalMeta, null, 2));

let ok = 0;
let failed = 0;
let placeholder = 0;
let latestFreshness = null;
for (const champion of champions) {
  try {
    const data = await recommend(champion);
    latestFreshness = data.freshness || latestFreshness;
    await writeFile(
      path.join(docsDir, "data", "recommendations", `${champion.id}.json`),
      JSON.stringify(data, null, 2)
    );
    ok += 1;
    console.log(`[${ok}/${champions.length}] ${champion.title || champion.zhName || champion.enName}`);
  } catch (error) {
    const data = placeholderRecommendation(champion, latestFreshness, error);
    await writeFile(
      path.join(docsDir, "data", "recommendations", `${champion.id}.json`),
      JSON.stringify(data, null, 2)
    );
    placeholder += 1;
    ok += 1;
    console.warn(`[placeholder] ${champion.title || champion.zhName || champion.enName}: ${error.message}`);
  }
}

console.log(`Static export complete: ${ok} ok, ${placeholder} placeholder, ${failed} failed, output=${docsDir}`);
