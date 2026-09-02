import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("dokument nie zawiera powtórzonych identyfikatorów", async () => {
  const html = await readFile(join(projectRoot, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("wszystkie elementy pobierane przez aplikację istnieją w dokumencie", async () => {
  const [html, app] = await Promise.all([
    readFile(join(projectRoot, "index.html"), "utf8"),
    readFile(join(projectRoot, "app.js"), "utf8"),
  ]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const queriedIds = [...app.matchAll(/querySelector\("#([^"]+)"\)/g)].map((match) => match[1]);
  for (const id of queriedIds) assert.equal(ids.has(id), true, `Brak elementu #${id}`);
});

test("manifest i pliki trybu offline wskazują istniejące zasoby", async () => {
  const manifest = JSON.parse(await readFile(join(projectRoot, "manifest.webmanifest"), "utf8"));
  const serviceWorker = await readFile(join(projectRoot, "service-worker.js"), "utf8");
  const offlineAssets = [...serviceWorker.matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1]);
  const referencedAssets = ["index.html", "styles.css", "app.js", ...manifest.icons.map((icon) => icon.src)];

  for (const asset of new Set([...offlineAssets, ...referencedAssets])) {
    if (!asset) continue;
    await assert.doesNotReject(access(join(projectRoot, asset)));
  }
  assert.equal(manifest.orientation, "any");
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
});

test("wersja z synchronizacją ma Worker i migrację bazy", async () => {
  await assert.doesNotReject(access(join(projectRoot, "worker", "index.js")));
  const [migration, worker, cloudflareConfig] = await Promise.all([
    readFile(join(projectRoot, "drizzle", "0000_sync_state.sql"), "utf8"),
    readFile(join(projectRoot, "worker", "index.js"), "utf8"),
    readFile(join(projectRoot, "wrangler.example.jsonc"), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE `plan_state`/);
  assert.match(worker, /SYNC_SECRET_HASH/);
  assert.match(worker, /crypto\.subtle\.digest/);
  assert.match(cloudflareConfig, /"binding": "DB"/);
  assert.match(cloudflareConfig, /"run_worker_first": \["\/api\/\*"\]/);
});
