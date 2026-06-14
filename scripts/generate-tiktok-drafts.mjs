import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

const NEWS_URL = "https://dailyspark-vajk.netlify.app/.netlify/functions/latest-news";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = path.join(ROOT, "tiktok-drafts");
const FONT_REGULAR = "C:/Windows/Fonts/arial.ttf";
const FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function wrapText(value, maxChars, maxLines = 5) {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.join("\n");
}

function filterPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
}

function filterTextFile(filePath) {
  return `textfile='${filterPath(filePath).replace(/'/g, "\\'")}'`;
}

function articleKey(article) {
  const sourceUrl = article.sources?.[0]?.url || "";
  return sourceUrl ? sourceUrl.replace(/[?#].*$/, "").toLowerCase() : cleanText(article.title).toLowerCase();
}

async function latestArticles(limit) {
  const response = await fetch(`${NEWS_URL}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Could not fetch news: ${response.status}`);
  const data = await response.json();
  const seen = new Set();
  const articles = [];
  for (const edition of data.editions || []) {
    for (const article of edition.articles || []) {
      const key = articleKey(article);
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push(article);
      if (articles.length >= limit) return articles;
    }
  }
  return articles;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg.path, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with ${code}`));
    });
  });
}

async function writeTextFiles(dir, article, index) {
  const title = wrapText(article.title, 23, 6);
  const summary = wrapText(article.summary || article.subtitle || "", 36, 7);
  const topic = cleanText(article.topic || "News").toUpperCase();
  const source = cleanText(article.sources?.[0]?.source || "DailySpark");
  const files = {
    number: path.join(dir, `clip-${index + 1}-number.txt`),
    topic: path.join(dir, `clip-${index + 1}-topic.txt`),
    title: path.join(dir, `clip-${index + 1}-title.txt`),
    summary: path.join(dir, `clip-${index + 1}-summary.txt`),
    source: path.join(dir, `clip-${index + 1}-source.txt`),
    cta: path.join(dir, `clip-${index + 1}-cta.txt`),
  };
  await fs.writeFile(files.number, `0${index + 1}`, "utf8");
  await fs.writeFile(files.topic, topic, "utf8");
  await fs.writeFile(files.title, title, "utf8");
  await fs.writeFile(files.summary, summary, "utf8");
  await fs.writeFile(files.source, `Source linked: ${source}`, "utf8");
  await fs.writeFile(files.cta, "DailySpark brief - read the sources on the site", "utf8");
  return files;
}

async function renderVideo(dir, article, index) {
  const files = await writeTextFiles(dir, article, index);
  const output = path.join(dir, `dailyspark-${String(index + 1).padStart(2, "0")}.mp4`);
  const vf = [
    "format=yuv420p",
    "drawbox=x=0:y=0:w=1080:h=1920:color=0x070a12:t=fill",
    "drawbox=x=0:y=0:w=1080:h=1920:color=0x0d1b2d@0.62:t=fill",
    "drawbox=x=70:y=132:w=8:h=1540:color=0x38bdf8:t=fill",
    "drawbox=x=92:y=132:w=820:h=1:color=0x26445c:t=fill",
    `drawtext=fontfile='${filterPath(FONT_BOLD)}':${filterTextFile(files.number)}:x=820:y=112:fontsize=88:fontcolor=0x38bdf8`,
    `drawtext=fontfile='${filterPath(FONT_BOLD)}':${filterTextFile(files.topic)}:x=112:y=160:fontsize=42:fontcolor=0x38bdf8`,
    `drawtext=fontfile='${filterPath(FONT_BOLD)}':${filterTextFile(files.title)}:x=112:y=315:fontsize=74:line_spacing=16:fontcolor=0xf8fafc`,
    `drawtext=fontfile='${filterPath(FONT_REGULAR)}':${filterTextFile(files.summary)}:x=112:y=1010:fontsize=39:line_spacing=14:fontcolor=0xc7d5e5`,
    `drawtext=fontfile='${filterPath(FONT_BOLD)}':${filterTextFile(files.source)}:x=112:y=1515:fontsize=31:fontcolor=0x9eddf8`,
    `drawtext=fontfile='${filterPath(FONT_REGULAR)}':${filterTextFile(files.cta)}:x=112:y=1600:fontsize=31:fontcolor=0xf8fafc`,
    "drawbox=x=112:y=1730:w='min(856,856*t/16)':h=10:color=0x38bdf8:t=fill",
  ].join(",");

  await runFfmpeg([
    "-y",
    "-f", "lavfi",
    "-i", "color=c=0x070a12:s=1080x1920:d=16:r=30",
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-vf", vf,
    "-map", "0:v",
    "-map", "1:a",
    "-shortest",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-movflags", "+faststart",
    output,
  ]);
  return output;
}

function captionFor(article) {
  const topic = cleanText(article.topic || "News");
  const title = cleanText(article.title);
  return {
    title,
    caption: `${title}\n\nFast source-linked brief on DailySpark.\n\n#DailySpark #News #${topic.replace(/\s+/g, "")} #WorldNews #NewsTok`,
  };
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(OUT_ROOT, stamp);
  await fs.mkdir(dir, { recursive: true });
  const articles = await latestArticles(5);
  if (!articles.length) throw new Error("No articles available.");

  const captions = [];
  for (let index = 0; index < articles.length; index += 1) {
    const video = await renderVideo(dir, articles[index], index);
    captions.push({ video: path.basename(video), ...captionFor(articles[index]) });
  }

  await fs.writeFile(path.join(dir, "captions.json"), JSON.stringify(captions, null, 2), "utf8");
  console.log(`Created ${captions.length} TikTok draft videos in ${dir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
