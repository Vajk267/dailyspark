import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

const files = [
  "index.html",
  "article.html",
  "article.js",
  "app.js",
  "overview.html",
  "overview.js",
  "styles.css",
  "theme.js",
  "data/news.json",
];

const dirs = ["assets"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of files) {
  const target = join(dist, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, file), target);
}

for (const dir of dirs) {
  await cp(join(root, dir), join(dist, dir), { recursive: true });
}
