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

async function recommend(champion) {
  return fetchJson(`${baseUrl}/api/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ champion: champion.title || champion.zhName || champion.enName })
  });
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

let ok = 0;
let failed = 0;
for (const champion of champions) {
  try {
    const data = await recommend(champion);
    await writeFile(
      path.join(docsDir, "data", "recommendations", `${champion.id}.json`),
      JSON.stringify(data, null, 2)
    );
    ok += 1;
    console.log(`[${ok}/${champions.length}] ${champion.title || champion.zhName || champion.enName}`);
  } catch (error) {
    failed += 1;
    console.warn(`[failed] ${champion.title || champion.zhName || champion.enName}: ${error.message}`);
  }
}

console.log(`Static export complete: ${ok} ok, ${failed} failed, output=${docsDir}`);
