const form = document.querySelector("#search-form");
const input = document.querySelector("#champion-input");
const result = document.querySelector("#result");
const statusEl = document.querySelector("#status");

const sampleNames = ["阿狸", "亚索", "卡莎", "永恩", "光辉", "盲僧", "薇恩"];
let sampleIndex = 0;
let staticIndexPromise = null;
let globalMeta = null;
let currentData = null;
const plannerSelections = new Map();

const commonAliases = {
  狐狸: "ahri",
  光辉: "lux",
  光辉女郎: "lux",
  ez: "ezreal",
  盲僧: "leesin",
  李青: "leesin",
  vn: "vayne",
  螃蟹: "urgot",
  厄加特: "urgot",
  男枪: "graves",
  女枪: "missfortune",
  石头人: "malphite",
  狗头: "nasus",
  小法: "veigar",
  发条: "orianna",
  卡牌: "twistedfate",
  猫咪: "yuumi",
  剑魔: "aatrox",
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
  人马: "hecarim",
  大头: "heimerdinger",
  刀妹: "irelia",
  风女: "janna",
  皇子: "jarvaniv",
  武器: "jax",
  妖姬: "leblanc",
  冰女: "lissandra",
  大树: "maokai",
  铁男: "mordekaiser",
  狗熊: "volibear",
  猴子: "monkeyking"
};

setInterval(() => {
  if (document.activeElement !== input && !input.value) {
    input.placeholder = `输入英雄名：${sampleNames[sampleIndex % sampleNames.length]}`;
    sampleIndex += 1;
  }
}, 1800);

loadGlobalMeta();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const champion = input.value.trim();
  if (!champion) return;

  setLoading(champion);
  try {
    const data = await getRecommendation(champion);
    if (data.error) {
      renderError(data.error || "查询失败", data.suggestions || []);
      return;
    }
    render(data);
  } catch (error) {
    renderError(error.message, []);
  }
});

result.addEventListener("click", (event) => {
  const plannerButton = event.target.closest("[data-planner-action]");
  if (plannerButton) {
    handlePlannerAction(plannerButton);
    return;
  }

  const button = event.target.closest("[data-champion]");
  if (!button) return;
  input.value = button.dataset.champion;
  form.requestSubmit();
});

function setLoading(champion) {
  statusEl.textContent = "检索中";
  result.className = "result";
  result.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>
        <strong>正在查 ${escapeHtml(champion)} 的海克斯大乱斗出装分支</strong>
        <span>会读取英雄评级、基础出装、强化符文和不同强化下的转装思路。</span>
      </div>
    </div>
  `;
}

async function getRecommendation(champion) {
  if (!location.hostname.endsWith("github.io")) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch("api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ champion }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const data = await response.json();
      if (response.ok || data.error) return data;
    } catch {
      // GitHub Pages has no API. Fall through to static data.
    }
  }

  return getStaticRecommendation(champion);
}

async function getStaticRecommendation(inputValue) {
  const index = await loadStaticIndex();
  const champion = findChampion(inputValue, index.items || []);
  if (!champion) {
    const suggestions = suggestChampions(inputValue, index.items || []);
    return {
      error: suggestions.length
        ? "没精确识别到这个英雄，可以点下面的相近英雄。"
        : "没识别到这个英雄。可以输入中文名、英文名、称号或常见简称，比如 阿狸 / Ahri / 光辉 / EZ。",
      suggestions
    };
  }

  const response = await fetch(`data/recommendations/${encodeURIComponent(champion.id)}.json`);
  if (!response.ok) {
    return {
      error: `静态数据里暂时没有 ${champion.title || champion.zhName || champion.enName} 的攻略。`,
      suggestions: [champion]
    };
  }
  return response.json();
}

async function loadStaticIndex() {
  if (!staticIndexPromise) {
    staticIndexPromise = fetch("data/champions.json").then((response) => {
      if (!response.ok) throw new Error("静态英雄库还没有生成，请先运行导出脚本。");
      return response.json();
    });
  }
  return staticIndexPromise;
}

async function loadGlobalMeta() {
  try {
    const response = await fetch("data/meta.json");
    if (response.ok) globalMeta = await response.json();
  } catch {
    globalMeta = null;
  }
}

function findChampion(inputValue, champions) {
  const key = normalize(inputValue);
  const aliasTarget = commonAliases[key];
  if (aliasTarget) {
    const target = normalize(aliasTarget);
    const match = champions.find((champion) => championFields(champion).includes(target));
    if (match) return match;
  }

  return (
    champions.find((champion) => championFields(champion).includes(key)) ||
    champions.find((champion) => championFields(champion).some((field) => field.includes(key) || key.includes(field)))
  );
}

function suggestChampions(inputValue, champions, limit = 8) {
  const key = normalize(inputValue);
  if (!key) return [];
  return champions
    .map((champion) => {
      const fields = championFields(champion);
      const score = fields.reduce((best, field) => {
        if (field === key) return Math.min(best, 0);
        if (field.startsWith(key) || key.startsWith(field)) return Math.min(best, 1);
        if (field.includes(key) || key.includes(field)) return Math.min(best, 2);
        if (/^[a-z0-9]+$/.test(key) && /^[a-z0-9]+$/.test(field)) return Math.min(best, 4 + levenshtein(key, field));
        const shared = Array.from(key).filter((char) => field.includes(char)).length;
        return shared ? Math.min(best, 20 - shared) : best;
      }, 1000);
      return { champion, score };
    })
    .filter((entry) => entry.score < 20)
    .sort((a, b) => a.score - b.score || (a.champion.zhName || "").localeCompare(b.champion.zhName || "", "zh-CN"))
    .slice(0, limit)
    .map((entry) => entry.champion);
}

function championFields(champion) {
  return [champion.id, champion.enName, champion.zhName, champion.title, champion.slug]
    .filter(Boolean)
    .map(normalize);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
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
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : Math.min(prev[j - 1] + 1, prev[j] + 1, curr[j - 1] + 1);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function renderError(message, suggestions = []) {
  statusEl.textContent = "查询失败";
  result.className = "result";
  result.innerHTML = `
    <div class="notice error">
      <strong>没跑通。</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    ${
      suggestions.length
        ? `<section class="suggestions">
            <h3>你是不是想找</h3>
            <div>
              ${suggestions
                .map(
                  (champion) => `
                    <button type="button" data-champion="${escapeHtml(champion.title || champion.zhName || champion.enName)}">
                      <strong>${escapeHtml(champion.title || champion.zhName || champion.enName)}</strong>
                      <span>${escapeHtml(champion.zhName || champion.enName)} · ${escapeHtml(champion.enName)}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </section>`
        : ""
    }
  `;
}

function render(data) {
  currentData = data;
  statusEl.textContent = `${data.freshness.patch} 线上 · ${data.freshness.statsPatch || data.freshness.patch} 数据`;
  result.className = "result";
  result.innerHTML = `
    ${resultHero(data)}
    ${livePlannerSection(data)}
    ${compactReferenceSection(data)}
    ${skillSection(data)}
    ${sourceReferenceSection(data)}
  `;
}

function handlePlannerAction(button) {
  if (!currentData) return;
  const key = plannerKey(currentData);
  const selected = plannerSelections.get(key) || [];
  const action = button.dataset.plannerAction;

  if (action === "add") {
    const field = result.querySelector("#planner-augment-input");
    const value = resolveAugmentInput(field?.value || "", currentData);
    if (value && selected.length < 4 && !selected.some((item) => normalize(item) === normalize(value))) {
      plannerSelections.set(key, [...selected, value]);
    }
    if (field) field.value = "";
  }

  if (action === "pick") {
    const value = button.dataset.augmentName;
    if (value && selected.length < 4 && !selected.some((item) => normalize(item) === normalize(value))) {
      plannerSelections.set(key, [...selected, value]);
    }
  }

  if (action === "remove") {
    const index = Number(button.dataset.index);
    plannerSelections.set(key, selected.filter((_, currentIndex) => currentIndex !== index));
  }

  if (action === "reset") plannerSelections.set(key, []);
  refreshPlanner(currentData);
}

function refreshPlanner(data) {
  const planner = result.querySelector("#live-planner");
  if (!planner) return;
  planner.outerHTML = livePlannerSection(data);
}

function resultHero(data) {
  const champion = data.champion || {};
  const splash = championSplash(champion);
  const statsPatch = data.freshness.statsPatch || data.freshness.patch || "-";
  const dataLabel = statsPatch === data.freshness.patch ? "当前统计" : `${statsPatch} 统计`;
  const poolLabel = globalMeta?.augments?.total && globalMeta?.items?.total
    ? `全局池 ${globalMeta.augments.total} 强化 / ${globalMeta.items.total} 装备`
    : "强化池按国服线上版本整理";
  return `
    <section class="result-hero">
      <img src="${splash}" alt="" />
      <div class="result-hero-shade"></div>
      <div class="result-hero-content">
        <div>
          <p class="eyebrow">当前英雄</p>
          <h2>${escapeHtml(champion.title || champion.displayName || champion.zhName || champion.enName)}</h2>
          <span>${escapeHtml(champion.displayName || champion.zhName || champion.enName || "")}</span>
        </div>
        <div class="hero-metrics">
          <span><b>${escapeHtml(data.summary?.tier || "-")}</b>评级</span>
          <span><b>${escapeHtml(data.summary?.winRate || "-")}</b>胜率</span>
          <span><b>${escapeHtml(data.freshness.patch || "-")}</b>线上版本</span>
        </div>
        <small class="data-scope">${escapeHtml(dataLabel)} · ${escapeHtml(data.freshness.dataDate || "最近抓取")} · ${escapeHtml(poolLabel)}</small>
        <p>${escapeHtml(data.verdict)}</p>
      </div>
    </section>
  `;
}

function livePlannerSection(data) {
  const selected = plannerSelections.get(plannerKey(data)) || [];
  const pool = augmentPool(data);
  const routes = buildPlannerRoutes(data, selected);
  const candidates = recommendNextAugments(data, selected, 6);
  const step = Math.min(selected.length + 1, 4);
  const isComplete = selected.length >= 4;
  const defaultCore = bestPath(data.build?.core);
  const stepText = isComplete
    ? "4 个强化已录完，按下方更契合的一条路线执行。"
    : selected.length
      ? `你已经拿到 ${selected.length} 个强化，现在重点判断第 ${step} 个强化。`
      : "开局拿到第一个强化后先录入，出装路线会立刻收敛。";

  return `
    <section id="live-planner" class="live-planner" aria-label="强化实时规划器">
      <div class="planner-command">
        <div>
          <p class="eyebrow">实战规划器</p>
          <h3>${isComplete ? "本局路线已成型" : `第 ${step} 手怎么选`}</h3>
          <p>${escapeHtml(stepText)}</p>
        </div>
        <div class="planner-progress" aria-label="当前强化进度">
          <strong>${selected.length}/4</strong>
          <span>已锁定强化</span>
        </div>
      </div>

      <div class="planner-board">
        <div class="planner-left">
          <div class="planner-slots">
            ${[0, 1, 2, 3]
              .map((index) => {
                const value = selected[index];
                const active = !value && index === selected.length && selected.length < 4;
                return `
                  <button
                    type="button"
                    class="planner-slot ${value ? "filled" : ""} ${active ? "active" : ""}"
                    data-planner-action="${value ? "remove" : "noop"}"
                    data-index="${index}"
                    aria-label="${value ? `移除第 ${index + 1} 个强化 ${value}` : `第 ${index + 1} 个强化未选择`}"
                  >
                    <small>第 ${index + 1} 个符文</small>
                    <strong>${escapeHtml(value || (active ? "现在录入" : "待选择"))}</strong>
                  </button>
                `;
              })
              .join("")}
          </div>

          <div class="planner-input-row">
            <input id="planner-augment-input" list="planner-augment-options" placeholder="输入刚拿到的强化符文" />
            <datalist id="planner-augment-options">
              ${pool.map((augment) => `<option value="${escapeHtml(augment.name)}"></option>`).join("")}
            </datalist>
            <button type="button" data-planner-action="add">确认</button>
            ${selected.length ? `<button type="button" class="secondary-action" data-planner-action="reset">重开本局</button>` : ""}
          </div>

          <div class="planner-next">
            <span>${isComplete ? "本局已成型" : `第 ${step} 手优先拿这些`}</span>
            <div>
              ${candidates
                .map(
                  (augment, index) => `
                    <button type="button" data-planner-action="pick" data-augment-name="${escapeHtml(augment.name)}">
                      <em>${index + 1}</em>
                      <strong>${escapeHtml(augment.name)}</strong>
                      <small>${escapeHtml(augment.tier || "强化")} · ${escapeHtml(augment.winRate || augment.reason || "可选")}</small>
                    </button>
                  `
                )
                .join("") || `<i>该英雄暂无可继续推荐的强化</i>`}
            </div>
          </div>
        </div>

        <div class="planner-routes">
          ${routes.map((route) => plannerRouteCard(route, defaultCore)).join("")}
        </div>
      </div>
    </section>
  `;
}

function plannerRouteCard(route, defaultCore = "") {
  return `
    <article class="planner-route ${escapeHtml(route.kind)}">
      <div class="planner-route-head">
        <span>${escapeHtml(route.badge)}</span>
        <strong>${escapeHtml(route.title)}</strong>
      </div>
      <p>${escapeHtml(route.reason)}</p>
      <div class="planner-route-block">
        <small>现在怎么出装</small>
        <div class="item-path">${escapeHtml(route.items.join(" → ") || defaultCore || "按默认核心出装")}</div>
      </div>
      <div class="planner-route-block">
        <small>后续优先拿</small>
        <div class="planner-mini-tags">
          ${route.nextAugments.map((augment) => `<b>${escapeHtml(augment)}</b>`).join("") || `<b>按高胜率补强</b>`}
        </div>
      </div>
      <div class="planner-route-block">
        <small>什么时候走</small>
        <div class="route-condition">${escapeHtml(route.condition)}</div>
      </div>
    </article>
  `;
}

function plannerKey(data) {
  return data.champion?.id || data.champion?.displayName || "unknown";
}

function resolveAugmentInput(value, data) {
  const key = normalize(value);
  if (!key) return "";
  const pool = augmentPool(data);
  const exact = pool.find((augment) => normalize(augment.name) === key);
  if (exact) return exact.name;
  const fuzzy = pool.find((augment) => normalize(augment.name).includes(key) || key.includes(normalize(augment.name)));
  return fuzzy?.name || value.trim();
}

function augmentPool(data) {
  const map = new Map();
  const add = (augment) => {
    const name = typeof augment === "string" ? augment : augment?.name;
    if (!name) return;
    const key = normalize(name);
    if (!map.has(key)) map.set(key, typeof augment === "string" ? { name, reason: "创作者套路" } : augment);
  };
  (data.augments || []).forEach(add);
  (data.branches || []).forEach(add);
  (data.creatorTricks || []).forEach((trick) => (trick.augments || []).forEach(add));
  return Array.from(map.values());
}

function selectedMatches(selected, text) {
  const target = normalize(text);
  return selected.some((item) => {
    const key = normalize(item);
    return key && target && (target.includes(key) || key.includes(target));
  });
}

function matchingBranches(data, selected) {
  const branches = data.branches || [];
  if (!selected.length) return branches;
  const direct = branches.filter((branch) =>
    selected.some((name) => normalize(branch.name) === normalize(name) || selectedMatches([name], `${branch.name} ${branch.label} ${branch.description}`))
  );
  if (direct.length) return direct;
  return branches.filter((branch) => selected.some((name) => selectedMatches([name], `${branch.label} ${branch.reason}`)));
}

function matchingTricks(data, selected) {
  const tricks = data.creatorTricks || [];
  if (!selected.length) return tricks;
  return tricks.filter((trick) =>
    selected.some((name) => selectedMatches([name], `${trick.title} ${trick.idea} ${trick.condition} ${(trick.augments || []).join(" ")}`))
  );
}

function buildPlannerRoutes(data, selected) {
  const branches = matchingBranches(data, selected);
  const tricks = matchingTricks(data, selected);
  const stableBranch = branches[0] || (data.branches || [])[0];
  const secondBranch =
    branches.find((branch) => branch.label !== stableBranch?.label) ||
    (data.branches || []).find((branch) => branch.label !== stableBranch?.label) ||
    stableBranch;
  const trick = tricks[0] || (data.creatorTricks || [])[0];
  const stableNext = recommendNextAugments(data, selected, 4, stableBranch?.label).map((augment) => augment.name);
  const creativeNext = trick
    ? (trick.augments || []).filter((name) => !selected.some((item) => normalize(item) === normalize(name))).slice(0, 4)
    : recommendNextAugments(data, selected, 4, secondBranch?.label).map((augment) => augment.name);

  const stableItems = stableBranch?.items?.length ? stableBranch.items : bestRow(data.build?.core)?.items || [];
  const creativeItems = trick?.items?.length
    ? trick.items
    : secondBranch?.items?.length
      ? secondBranch.items
      : stableItems;

  return [
    {
      kind: "stable",
      badge: "路线 A",
      title: selected.length ? "稳健收敛线" : "先拿高胜率通用线",
      reason: stableBranch?.reason || "先围绕该英雄最高胜率核心出装，后续强化优先补稳定触发。",
      nextAugments: stableNext,
      items: stableItems,
      condition: selected.length ? "适合想稳住胜率、阵容不确定时继续走。" : "还没锁强化时，优先按默认核心和高胜率强化走。"
    },
    {
      kind: "creative",
      badge: "路线 B",
      title: trick?.title || secondBranch?.label || "高上限转装线",
      reason: trick?.idea || secondBranch?.reason || "如果后续强化继续指向同一机制，可以切到更高上限的转装。",
      nextAugments: creativeNext,
      items: creativeItems,
      condition: trick?.condition || "需要后续强化和阵容环境配合；没有成型条件时回到路线 A。"
    }
  ];
}

function recommendNextAugments(data, selected, limit = 6, preferredLabel = "") {
  const used = new Set(selected.map(normalize));
  const branches = (data.branches || []).filter((branch) => !used.has(normalize(branch.name)));
  const preferred = preferredLabel ? branches.filter((branch) => branch.label === preferredLabel) : [];
  const rest = branches.filter((branch) => !preferred.includes(branch));
  const ranked = [...preferred, ...rest].sort((a, b) => augmentScore(b, selected, preferredLabel) - augmentScore(a, selected, preferredLabel));
  const items = ranked.slice(0, limit).map((branch) => ({
    name: branch.name,
    tier: branch.tier,
    winRate: branch.winRate,
    reason: branch.label
  }));

  if (items.length >= limit) return items;
  for (const trick of data.creatorTricks || []) {
    for (const name of trick.augments || []) {
      if (items.length >= limit) return items;
      if (!used.has(normalize(name)) && !items.some((item) => normalize(item.name) === normalize(name))) {
        items.push({ name, tier: "套路", reason: trick.title });
      }
    }
  }
  return items;
}

function augmentScore(branch, selected, preferredLabel = "") {
  let score = Number.parseFloat(branch.winRate) || 0;
  if (branch.label === preferredLabel) score += 8;
  if (selected.length && selected.some((name) => selectedMatches([name], `${branch.label} ${branch.reason} ${branch.description}`))) score += 6;
  const tier = normalizeTier(branch.tier);
  if (tier === "金色") score += 3;
  if (tier === "棱彩") score += 2;
  if (tier === "银色") score += 1;
  return score;
}

function championSplash(champion = {}) {
  const id = champion.id || champion.enName || champion.slug || "Aatrox";
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(id)}_0.jpg`;
}

function loadoutOverview(data) {
  const core = bestRow(data.build?.core);
  const boots = bestRow(data.build?.boots);
  const start = bestRow(data.build?.starting);
  const skill = data.skillOrders?.[0];
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString("zh-CN") : "未知";
  const tiers = groupBranchesByTier(data.branches || []);

  return `
    <section class="loadout-overview" aria-label="对局速查">
      <div class="overview-head">
        <div>
          <p class="eyebrow">对局速查</p>
          <h3>先按你拿到的强化品质选路线</h3>
        </div>
        <span>更新 ${escapeHtml(updatedAt)}</span>
      </div>

      <div class="core-summary">
        ${summaryCard("默认核心", core?.items?.join(" → ") || "看下方分支", core)}
        ${summaryCard("优先鞋子", boots?.items?.join(" → ") || "按阵容选择", boots)}
        ${summaryCard("出门倾向", start?.items?.join(" → ") || "暂无数据", start)}
        ${skill ? summaryCard("技能主升", skill.order, skill) : ""}
      </div>

      <div class="tier-route-grid">
        ${tiers.map(tierRouteCard).join("")}
      </div>
    </section>
  `;
}

function compactReferenceSection(data) {
  const core = bestRow(data.build?.core);
  const boots = bestRow(data.build?.boots);
  const start = bestRow(data.build?.starting);
  const groups = groupAugmentsByTier(data.augments || []);
  const tricks = data.creatorTricks || [];
  return `
    <section class="compact-reference" aria-label="赛中备用参考">
      <div class="reference-head">
        <div>
          <p class="eyebrow">备用参考</p>
          <h3>只在犹豫时看这里</h3>
        </div>
        <span>${escapeHtml(data.freshness?.patch || "-")} 数据</span>
      </div>

      <div class="reference-cards">
        ${summaryCard("默认核心", core?.items?.join(" → ") || "看规划器路线", core)}
        ${summaryCard("鞋子优先", boots?.items?.join(" → ") || "按阵容选择", boots)}
        ${summaryCard("开局倾向", start?.items?.join(" → ") || "暂无数据", start)}
      </div>

      <div class="reference-augments">
        ${groups
          .map(
            (group) => `
              <article>
                <strong>${escapeHtml(group.title)}</strong>
                <div>
                  ${group.augments
                    .slice(0, 4)
                    .map((augment) => `<span>${escapeHtml(augment.name)}<small>${escapeHtml(augment.winRate || "-")}</small></span>`)
                    .join("") || `<span>暂无</span>`}
                </div>
              </article>
            `
          )
          .join("")}
      </div>

      ${
        tricks.length
          ? `<details class="reference-details">
              <summary>黑科技路线和完整分支</summary>
              ${creatorTricksSection(data)}
              ${branchSection(data)}
            </details>`
          : `<details class="reference-details">
              <summary>完整强化分支</summary>
              ${branchSection(data)}
            </details>`
      }
    </section>
  `;
}

function sourceReferenceSection(data) {
  return `
    <details class="source-collapsible">
      <summary>数据来源和继续检索</summary>
      <div class="source-list">
        ${(data.sources || []).map(sourceCard).join("")}
        ${(data.socialSearches || []).map(socialCard).join("")}
      </div>
    </details>
  `;
}

function bestRow(rows = []) {
  return rows?.find((item) => item.items?.length) || rows?.[0];
}

function summaryCard(title, value, row = {}) {
  const meta = [row.pickRate ? `登场 ${row.pickRate}` : "", row.winRate ? `胜率 ${row.winRate}` : ""].filter(Boolean).join(" · ");
  return `
    <article class="summary-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    </article>
  `;
}

function tierRouteCard(tier) {
  const firstBranch = tier.branches[0];
  const augments = tier.branches.flatMap((branch) => branch.augments).slice(0, 4);
  return `
    <article class="tier-route-card ${escapeHtml(tier.className)}">
      <div class="tier-route-title">
        <strong>${escapeHtml(tier.title.replace("强化", ""))}</strong>
        <span>${escapeHtml(firstBranch?.label || "按基础核心")}</span>
      </div>
      <div class="route-augments">
        ${
          augments
            .map((augment) => `<span>${escapeHtml(augment.name)}<small>${escapeHtml(augment.winRate || "-")}</small></span>`)
            .join("") || `<span>暂无数据</span>`
        }
      </div>
      <div class="item-path">${escapeHtml(firstBranch?.itemPath || "按基础核心出装")}</div>
      <p>${escapeHtml(firstBranch?.reason || tier.hint)}</p>
    </article>
  `;
}

function mobileTierNav(data) {
  const groups = groupBranchesByTier(data.branches || []);
  return `
    <nav class="mobile-tier-nav" aria-label="手机端强化品质导航">
      ${groups
        .map(
          (group) => `
            <a href="#tier-${escapeHtml(group.className)}">
              <strong>${escapeHtml(group.title.replace("强化", ""))}</strong>
              <span>${group.branches.reduce((total, branch) => total + branch.augments.length, 0)} 个</span>
            </a>
          `
        )
        .join("")}
    </nav>
  `;
}

function mindMapSection(data) {
  const champion = data.champion || {};
  const tierGroups = groupBranchesByTier(data.branches || []);
  const corePath = bestPath(data.build?.core);
  const bootPath = bestPath(data.build?.boots);
  const quick = tierGroups.flatMap((tier) => tier.branches.slice(0, 2)).slice(0, 6);

  return `
    <section class="mindmap" aria-label="游戏内速查思维导图">
      <div class="mindmap-head">
        <div>
          <p class="eyebrow">游戏内速查</p>
          <h3>先看强化品质，再选对应出装分支</h3>
        </div>
        <span>${escapeHtml(data.summary?.tier || "-")} 级 · ${escapeHtml(data.summary?.winRate || "暂无胜率")}</span>
      </div>

      <div class="quick-strip">
        ${quick
          .map(
            (branch) => `
              <div class="quick-chip">
                <strong>${escapeHtml(branch.tierLabel)}：${escapeHtml(branch.augments.slice(0, 2).map((augment) => augment.name).join(" / "))}</strong>
                <span>${escapeHtml(branch.label)} → ${escapeHtml(branch.itemPath)}</span>
              </div>
            `
          )
          .join("")}
      </div>

      <div class="map-board">
        <div class="map-center">
          <span>中心英雄</span>
          <strong>${escapeHtml(champion.displayName || champion.zhName || champion.enName)}</strong>
          <em>${escapeHtml(data.freshness.patch)} 版本</em>
          <div class="center-path">
            <small>默认核心</small>
            <b>${escapeHtml(corePath || "按下方强化分支选择")}</b>
          </div>
          ${bootPath ? `<div class="center-path"><small>鞋子</small><b>${escapeHtml(bootPath)}</b></div>` : ""}
        </div>

        <div class="tier-lanes">
          ${
            tierGroups
              .map(
                (tier) => `
                  <section id="tier-${escapeHtml(tier.className)}" class="tier-lane ${escapeHtml(tier.className)}">
                    <div class="tier-title">
                      <strong>${escapeHtml(tier.title)}</strong>
                      <span>${escapeHtml(tier.hint)}</span>
                    </div>
                    <div class="map-branches">
                      ${tier.branches.map(mapBranch).join("") || `<div class="map-empty">这一档暂无可解析强化</div>`}
                    </div>
                  </section>
                `
              )
              .join("") || `<div class="map-empty">暂无强化分支数据</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function groupBranchesByTier(branches) {
  const tiers = [
    { key: "棱彩", title: "棱彩强化", hint: "上限最高，拿到后可以围绕它改整套出装。", className: "prismatic" },
    { key: "金色", title: "金色强化", hint: "实战最常见，优先找稳定触发和高胜率分支。", className: "gold" },
    { key: "银色", title: "白银强化", hint: "更多是补强，不强行改玩法，按基础核心小幅调整。", className: "silver" }
  ];

  return tiers.map((tier) => ({
    ...tier,
    branches: groupBranches(branches.filter((branch) => normalizeTier(branch.tier) === tier.key)).map((branch) => ({
      ...branch,
      tierLabel: tier.title
    }))
  }));
}

function groupBranches(branches) {
  const grouped = new Map();
  branches.forEach((branch) => {
    const key = branch.label || "通用强化流";
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: key,
        augments: [],
        itemPath: (branch.items || []).join(" → "),
        reasons: []
      });
    }
    const group = grouped.get(key);
    group.augments.push(branch);
    if (!group.itemPath && branch.items?.length) group.itemPath = branch.items.join(" → ");
    if (branch.reason) group.reasons.push(branch.reason);
  });

  return Array.from(grouped.values()).map((group) => ({
    ...group,
    augments: group.augments.slice(0, 4),
    reason: group.reasons[0] || "优先围绕该强化的收益方向出装。"
  }));
}

function normalizeTier(tier = "") {
  if (tier.includes("棱彩")) return "棱彩";
  if (tier.includes("金")) return "金色";
  if (tier.includes("银") || tier.includes("白")) return "银色";
  return tier;
}

function mapBranch(branch) {
  return `
    <article class="map-branch">
      <div class="map-line"></div>
      <div class="map-card">
        <div class="map-card-head">
          <strong>${escapeHtml(branch.label)}</strong>
          <span>${escapeHtml(branch.augments[0]?.tier || "强化分支")}</span>
        </div>
        <div class="augment-pills">
          ${branch.augments
            .map((augment) => `<span><b>${escapeHtml(augment.name)}</b><small>${escapeHtml(augment.winRate || "-")}</small></span>`)
            .join("")}
        </div>
        <div class="item-path">${escapeHtml(branch.itemPath || "按基础核心出装")}</div>
        <p>${escapeHtml(branch.reason)}</p>
      </div>
    </article>
  `;
}

function bestPath(rows = []) {
  const row = rows?.find((item) => item.items?.length) || rows?.[0];
  return row?.items?.join(" → ") || "";
}

function buildSection(data) {
  const build = data.build || {};
  return `
    <section class="sources build-section">
      <h3>基础出装</h3>
      <div class="build-grid">
        ${buildGroup("出门装", build.starting)}
        ${buildGroup("鞋子", build.boots)}
        ${buildGroup("核心出装", build.core)}
        ${buildGroup("补装/组件倾向", build.late)}
      </div>
    </section>
  `;
}

function creatorTricksSection(data) {
  const tricks = data.creatorTricks || [];
  if (!tricks.length) return "";
  return `
    <section class="creator-tricks" aria-label="创作者黑科技套路">
      <div class="creator-head">
        <div>
          <p class="eyebrow">创作者套路</p>
          <h3>有特定强化时，可以切这些黑科技</h3>
        </div>
        <span>来自抖音公开视频标题提炼，实战先看触发条件</span>
      </div>
      <div class="trick-list">
        ${tricks.map(creatorTrickCard).join("")}
      </div>
    </section>
  `;
}

function creatorTrickCard(trick) {
  return `
    <article class="trick-card">
      <div class="trick-top">
        <span>${escapeHtml(trick.creator || "创作者")}</span>
        <strong>${escapeHtml(trick.title || "黑科技路线")}</strong>
      </div>
      <p>${escapeHtml(trick.idea || "")}</p>
      <div class="trick-tags">
        ${(trick.augments || []).slice(0, 5).map((augment) => `<b>${escapeHtml(augment)}</b>`).join("")}
      </div>
      <div class="item-path">${escapeHtml((trick.items || []).join(" → "))}</div>
      <small>${escapeHtml(trick.condition || "")}</small>
      ${trick.sourceUrl ? `<a href="${escapeHtml(trick.sourceUrl)}" target="_blank" rel="noreferrer">看来源灵感</a>` : ""}
    </article>
  `;
}

function buildGroup(title, rows = []) {
  return `
    <article class="panel compact">
      <h3>${escapeHtml(title)}</h3>
      <div class="rows">
        ${rows
          .slice(0, 4)
          .map(
            (row) => `
              <div class="row">
                <strong>${escapeHtml(row.items.join(" → "))}</strong>
                <span>登场 ${escapeHtml(row.pickRate || "-")} · 胜率 ${escapeHtml(row.winRate || "-")}</span>
              </div>
            `
          )
          .join("") || `<span class="muted">暂无数据</span>`}
      </div>
    </article>
  `;
}

function augmentSection(data) {
  const groups = groupAugmentsByTier(data.augments || []);
  return `
    <section class="sources augment-section">
      <h3>按品质看推荐强化</h3>
      <div class="tier-augment-list">
        ${groups
          .map(
            (group) => `
              <section class="augment-tier">
                <div class="tier-title">
                  <strong>${escapeHtml(group.title)}</strong>
                  <span>${escapeHtml(group.hint)}</span>
                </div>
                <div class="augment-list">
                  ${group.augments.map(augmentCard).join("") || `<span class="muted">暂无数据</span>`}
                </div>
              </section>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function groupAugmentsByTier(augments) {
  return [
    { key: "棱彩", title: "棱彩", hint: "决定上限，能改出装方向。", augments: augments.filter((augment) => normalizeTier(augment.tier) === "棱彩").slice(0, 6) },
    { key: "金色", title: "金色", hint: "最常遇到，优先稳定收益。", augments: augments.filter((augment) => normalizeTier(augment.tier) === "金色").slice(0, 6) },
    { key: "银色", title: "白银", hint: "偏补强，通常不推翻基础出装。", augments: augments.filter((augment) => normalizeTier(augment.tier) === "银色").slice(0, 6) }
  ];
}

function augmentCard(augment) {
  return `
    <article class="augment-card">
      <div>
        <strong>${escapeHtml(augment.name)}</strong>
        <span>${escapeHtml(augment.tier || "未知")} · 胜率 ${escapeHtml(augment.winRate || "-")}</span>
      </div>
      <p>${escapeHtml(augment.description || "")}</p>
    </article>
  `;
}

function branchSection(data) {
  return `
    <section class="sources branch-section">
      <h3>详细分支说明</h3>
      <div class="branch-list">
        ${(data.branches || [])
          .map(
            (branch) => `
              <article class="branch-card">
                <div class="branch-head">
                  <strong>${escapeHtml(branch.name)}</strong>
                  <span>${escapeHtml(branch.label)} · ${escapeHtml(branch.tier || "未知")} · 胜率 ${escapeHtml(branch.winRate || "-")}</span>
                </div>
                <div class="item-path">${escapeHtml((branch.items || []).join(" → "))}</div>
                <p>${escapeHtml(branch.reason || "")}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function skillSection(data) {
  if (!data.skillOrders?.length) return "";
  return `
    <section class="signals">
      <h3>技能主升</h3>
      ${data.skillOrders
        .map((skill) => `<span>${escapeHtml(skill.order)} · 登场 ${escapeHtml(skill.pickRate)} · 胜率 ${escapeHtml(skill.winRate)}</span>`)
        .join("")}
    </section>
  `;
}

function panel(title, items = []) {
  return `
    <article class="panel">
      <h3>${escapeHtml(title)}</h3>
      <ol>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ol>
    </article>
  `;
}

function sourceCard(source) {
  const state = source.ok ? "已读取" : "未解析";
  const snippets = source.snippets?.slice(0, 2) || [];
  return `
    <a class="source-card" href="${source.url}" target="_blank" rel="noreferrer">
      <strong>${escapeHtml(source.name)}</strong>
      <span>${state}</span>
      ${snippets.map((snippet) => `<small>${escapeHtml(snippet)}</small>`).join("")}
    </a>
  `;
}

function socialCard(source) {
  return `
    <a class="source-card social" href="${source.url}" target="_blank" rel="noreferrer">
      <strong>${escapeHtml(source.name)}</strong>
      <span>继续查黑科技</span>
    </a>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
