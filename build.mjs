import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const staticOutputRoot = join(projectRoot, "build");
const workerOutputRoot = join(projectRoot, "dist");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "data.js",
  "utils.js",
  "manifest.webmanifest",
  "service-worker.js",
];

async function copyClient(target) {
  await mkdir(join(target, "icons"), { recursive: true });
  await Promise.all(files.map((file) => cp(join(projectRoot, file), join(target, file))));
  await cp(join(projectRoot, "icons"), join(target, "icons"), { recursive: true });
}

await Promise.all([
  rm(staticOutputRoot, { recursive: true, force: true }),
  rm(workerOutputRoot, { recursive: true, force: true }),
]);
await Promise.all([
  copyClient(staticOutputRoot),
  copyClient(join(workerOutputRoot, "client")),
  mkdir(join(workerOutputRoot, "server"), { recursive: true }),
  mkdir(join(workerOutputRoot, ".openai"), { recursive: true }),
]);
await Promise.all([
  cp(join(projectRoot, "worker", "index.js"), join(workerOutputRoot, "server", "index.js")),
  cp(join(projectRoot, ".openai", "hosting.json"), join(workerOutputRoot, ".openai", "hosting.json")),
]);
console.log("Gotowa aplikacja: build/ (statyczna) i dist/ (z synchronizacją)");
