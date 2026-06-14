import { getStore } from "@netlify/blobs";

const DATA_PATH = "data/news.json";
const BLOB_STORE = "dailyspark-news";
const BLOB_KEY = "news.json";
const STORIES_PER_EDITION = 10;
const SOURCE_LIMIT_PER_STORY = 3;

const TOPIC_COLORS = {
  World: "#38bdf8",
  Business: "#38bdf8",
  Technology: "#38bdf8",
  Science: "#38bdf8",
  Sport: "#38bdf8",
  Culture: "#38bdf8",
  Lifestyle: "#38bdf8",
};

const FEEDS = [
  { name: "BBC World", topic: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC Business", topic: "Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "BBC Technology", topic: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "BBC Science", topic: "Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { name: "BBC Sport", topic: "Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  { name: "The Guardian World", topic: "World", url: "https://www.theguardian.com/world/rss" },
  { name: "The Guardian Culture", topic: "Culture", url: "https://www.theguardian.com/culture/rss" },
  { name: "The Guardian Technology", topic: "Technology", url: "https://www.theguardian.com/technology/rss" },
  { name: "The Guardian Business", topic: "Business", url: "https://www.theguardian.com/business/rss" },
  { name: "The Guardian Sport", topic: "Sport", url: "https://www.theguardian.com/sport/rss" },
];

const STOP_WORDS = new Set([
  "and", "are", "for", "from", "into", "live", "news",
  "over", "says", "that", "the", "this", "with", "world", "would", "will",
]);

const INTEREST_TERMS = new Set([
  "ai", "artificial", "attack", "bank", "ceasefire", "climate", "court", "crisis",
  "deal", "election", "energy", "eu", "economy", "government", "inflation",
  "israel", "minister", "nato", "police", "president", "russia", "security",
  "strike", "technology", "trump", "ukraine", "war",
]);

const NOISE_PHRASES = [
  "advertisement", "all rights reserved", "browser notifications", "click here",
  "close dialogue", "cookie", "email link", "follow live", "jump to content",
  "key events", "live coverage", "newsletter", "prefer the guardian on google",
  "print subscriptions", "privacy notice", "share on", "sign in", "sign up",
  "skip to key events", "terms and conditions", "toggle caption",
];

function iso(date = new Date()) {
  return date.toISOString();
}

function decodeEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(value = "", limit = 420) {
  const text = decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).replace(/\s+\S*$/, "")}...`;
}

function tagText(xml, tagNames) {
  for (const tagName of tagNames) {
    const pattern = new RegExp(`<((?:[\\w-]+:)?${tagName})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
    const match = xml.match(pattern);
    if (match?.[2]) return cleanText(match[2], 900);
  }
  return "";
}

function tagAttr(xml, tagNames, attrName) {
  for (const tagName of tagNames) {
    const pattern = new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, "i");
    const match = xml.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return "";
}

function itemBlocks(xml) {
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  if (rssItems.length) return rssItems;
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
}

function parseDate(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return new Date();
  return new Date(time);
}

function upgradeImageUrl(url) {
  if (!url) return "";
  return decodeEntities(url)
    .replace(/width=140/g, "width=1200")
    .replace(/quality=45/g, "quality=85")
    .replace(/standard\/240\//g, "standard/1024/")
    .replace(/\/240\//g, (match, offset, value) => (value.includes("ichef.bbci.co.uk") ? "/1024/" : match));
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "DailySparkBot/0.3 (+https://netlify.app)",
        accept: "application/rss+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeedXml(feed, xml) {
  return itemBlocks(xml).slice(0, 24).flatMap((item) => {
    const title = tagText(item, ["title"]);
    const atomLink = tagAttr(item, ["link"], "href");
    const link = tagText(item, ["link"]) || atomLink;
    if (!title || !link) return [];

    const publishedAt = iso(parseDate(tagText(item, ["pubDate", "published", "updated"])));
    const summary = cleanText(tagText(item, ["description", "summary", "content"]), 360);
    const image = upgradeImageUrl(
      tagAttr(item, ["thumbnail", "content", "enclosure"], "url") ||
      tagAttr(item, ["image"], "href")
    );

    return [{
      title,
      url: link,
      source: feed.name,
      topic: feed.topic,
      publishedAt,
      summary,
      image,
      color: TOPIC_COLORS[feed.topic] || "#38bdf8",
    }];
  });
}

async function collectArticles() {
  const settled = await Promise.allSettled(
    FEEDS.map(async (feed) => parseFeedXml(feed, await fetchText(feed.url)))
  );

  const errors = [];
  const articles = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    } else {
      errors.push(`${FEEDS[index].name}: ${result.reason?.message || result.reason}`);
    }
  });

  return { articles: dedupeArticles(articles), errors };
}

function extractArticleBody(html) {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1], 900))
    .filter((paragraph) => paragraph.length > 55)
    .filter((paragraph) => !NOISE_PHRASES.some((term) => paragraph.toLowerCase().includes(term)));
  return cleanText(paragraphs.slice(0, 8).join(" "), 2600);
}

async function enrichArticle(article) {
  try {
    const html = await fetchText(article.url, 9000);
    const body = extractArticleBody(html);
    if (!body) return article;
    return { ...article, body };
  } catch {
    return article;
  }
}

function keywords(text) {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9]{4,}/gi)
      ?.map((word) => word.toLowerCase())
      .filter((word) => !STOP_WORDS.has(word)) || []
  );
}

function dedupeArticles(articles) {
  const seenUrls = new Set();
  const seenTitles = [];
  const unique = [];

  for (const article of articles) {
    const normalizedUrl = article.url.replace(/[?#].*$/, "").toLowerCase();
    const titleWords = keywords(article.title);
    const duplicateTitle = seenTitles.some((existing) => overlap(existing, titleWords) >= 0.72);
    if (seenUrls.has(normalizedUrl) || duplicateTitle) continue;
    seenUrls.add(normalizedUrl);
    seenTitles.push(titleWords);
    unique.push(article);
  }
  return unique;
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let matches = 0;
  a.forEach((word) => {
    if (b.has(word)) matches += 1;
  });
  return matches / Math.min(a.size, b.size);
}

function interestScore(article) {
  const textWords = keywords(`${article.title} ${article.summary}`);
  const published = Date.parse(article.publishedAt);
  const ageHours = Number.isNaN(published) ? 24 : Math.max(0, (Date.now() - published) / 36e5);
  const recency = Math.max(0, 48 - ageHours);
  const interest = [...textWords].filter((word) => INTEREST_TERMS.has(word)).length * 10;
  const sourceWeight = article.source.includes("BBC") || article.source.includes("Guardian") ? 8 : 6;
  const livePenalty = /\blive\b/i.test(article.title) ? -16 : 0;
  const summaryWeight = article.summary.length > 80 ? 8 : 0;
  return recency + interest + sourceWeight + summaryWeight + livePenalty;
}

function chooseSeeds(articles) {
  const sorted = [...articles].sort((a, b) => interestScore(b) - interestScore(a));
  const selected = [];
  const topicCounts = new Map();

  for (const article of sorted) {
    if (selected.length >= STORIES_PER_EDITION) break;
    const count = topicCounts.get(article.topic) || 0;
    if (count >= 2 && selected.length < 7) continue;
    selected.push(article);
    topicCounts.set(article.topic, count + 1);
  }

  for (const article of sorted) {
    if (selected.length >= STORIES_PER_EDITION) break;
    if (!selected.includes(article)) selected.push(article);
  }

  return selected.slice(0, STORIES_PER_EDITION);
}

function clusterFor(seed, articles) {
  const seedWords = keywords(`${seed.title} ${seed.summary}`);
  return [
    seed,
    ...articles
      .filter((article) => article.url !== seed.url && article.topic === seed.topic)
      .map((article) => ({ article, score: overlap(seedWords, keywords(`${article.title} ${article.summary}`)) }))
      .filter((item) => item.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, SOURCE_LIMIT_PER_STORY - 1)
      .map((item) => item.article),
  ];
}

function sentencePool(article, limit = 6) {
  const text = cleanText(`${article.summary || ""} ${article.body || ""}`, 3200);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const useful = [];

  for (const rawSentence of sentences) {
    const sentence = cleanText(rawSentence, 360);
    const lowered = sentence.toLowerCase();
    if (sentence.length < 45) continue;
    if (NOISE_PHRASES.some((term) => lowered.includes(term))) continue;
    if (/^\d+[hm]\s+ago\b/i.test(sentence)) continue;
    if (/\b(mail us|comment btl|view image in fullscreen)\b/i.test(sentence)) continue;
    if (!useful.includes(sentence)) useful.push(sentence);
    if (useful.length >= limit) break;
  }

  return useful;
}

function readableSources(cluster) {
  const names = [...new Set(cluster.map((article) => article.source))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function slotLabel(slot) {
  if (slot === "morning") return "Morning edition";
  if (slot === "evening") return "Evening edition";
  return "Latest edition";
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 46);
}

function storyId(slot, article, index, generatedAt) {
  const date = generatedAt.toISOString().slice(0, 10);
  const time = generatedAt.toISOString().slice(11, 19).replace(/:/g, "");
  const hash = Array.from(`${slot}|${article.url}|${index}`)
    .reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) >>> 0, 0)
    .toString(16);
  return `${date}-${slot}-${time}-${index + 1}-${slugify(article.title)}-${hash}`;
}

function headlineCore(article) {
  return article.title
    .replace(/\s+-\s+live\b.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+from multiple sources$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function whyInteresting(article, sourceCount = 1) {
  const sourceNote = sourceCount > 1 ? " Several outlets are now circling the same development, which makes the follow-up more useful than a single alert." : "";
  const byTopic = {
    World: "The important part is not only what happened, but who reacts next: governments, negotiators, courts, or people directly affected.",
    Business: "The story is worth watching because the first report can quickly turn into a market, consumer, jobs, or regulatory issue.",
    Technology: "The practical question is whether this changes how companies, users, regulators, or developers behave after the first announcement.",
    Science: "The useful follow-up is evidence: whether the finding is confirmed, challenged, or translated into decisions people can actually see.",
    Sport: "The result matters most if it changes the next fixture, selection, injury picture, or the shape of the wider competition.",
    Culture: "The cultural angle is usually in the reaction: audiences, institutions, critics, and the people whose work is being discussed.",
  };
  return `${byTopic[article.topic] || "The topic may bring further reaction, confirmation, and practical consequences."}${sourceNote}`;
}

function makeSummary(seed) {
  const fact = sentencePool(seed, 1)[0];
  if (fact) return cleanText(fact, 300);
  return cleanText(`${headlineCore(seed)} is developing, with source links preserved below for readers who want the original reporting.`, 300);
}

function detailParagraphs(seed, cluster) {
  const facts = [];
  for (const article of cluster) {
    for (const sentence of sentencePool(article, 5)) {
      if (!facts.includes(sentence)) facts.push(sentence);
    }
  }

  const lead = facts[0] || makeSummary(seed);
  const paragraphs = [
    lead,
  ];

  if (facts.length >= 3) {
    paragraphs.push(`${facts[1]} ${facts[2]}`);
  } else if (facts.length === 2) {
    paragraphs.push(`${facts[1]} For now, the strongest version of the story is still the first reported account, so later updates matter.`);
  } else {
    paragraphs.push("The available detail is still limited, so the useful thing is to separate the confirmed facts from the parts that may change as more reporting arrives.");
  }

  if (facts.length >= 5) {
    paragraphs.push(`${facts[3]} ${facts[4]}`);
  } else {
    paragraphs.push(`The broader context is the ${seed.topic.toLowerCase()} desk: this kind of story often changes once officials, companies, teams, or institutions respond.`);
  }

  paragraphs.push(whyInteresting(seed, cluster.length));
  paragraphs.push("What to watch next: confirmation from the people directly involved, any correction to the first account, and the practical consequences that follow once the headline moves on.");

  return paragraphs.map((paragraph) => cleanText(paragraph, 520));
}

function makeTakeaways(seed, cluster) {
  const facts = [];
  for (const article of cluster) {
    for (const sentence of sentencePool(article, 3)) {
      if (!facts.includes(sentence)) facts.push(sentence);
    }
  }

  const fallbacks = [
    headlineCore(seed),
    "The strongest next update would add confirmation or a named response.",
    "The source links below are kept so the original reporting can be checked directly.",
  ];

  return [0, 1, 2].map((index) => cleanText(facts[index] || fallbacks[index], 180));
}

function composeStory(seed, cluster, generatedAt, slot, index) {
  const id = storyId(slot, seed, index, generatedAt);
  const summary = makeSummary(seed);
  const body = detailParagraphs(seed, cluster);

  return {
    id,
    title: headlineCore(seed),
    subtitle: "What is known so far, and what still needs confirmation.",
    url: `article.html?id=${id}`,
    source: "DailySpark newsroom",
    topic: seed.topic,
    publishedAt: iso(generatedAt),
    updatedAt: iso(generatedAt),
    summary,
    body,
    takeaways: makeTakeaways(seed, cluster),
    image: cluster.find((article) => article.image)?.image || "",
    color: seed.color,
    readingMinutes: Math.max(3, Math.round(body.join(" ").split(/\s+/).length / 180)),
    sourceCount: cluster.length,
    sources: cluster.map((article) => ({
      title: article.title,
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt,
      excerpt: article.summary || article.source,
    })),
  };
}

function buildOverview(stories, generatedAt) {
  const topics = [...new Set(stories.map((story) => story.topic))];
  return {
    title: "Editor overview",
    subtitle: "A guided snapshot of the current edition.",
    generatedAt: iso(generatedAt),
    summary: `This edition selected ${stories.length} leading stories. Main areas: ${topics.join(", ")}.`,
    steps: [
      "Collecting fresh RSS signals from trusted publishers.",
      "Removing duplicate or weak story candidates.",
      "Ranking the strongest stories by recency and public interest.",
      "Writing source-led story briefs with links preserved.",
    ],
    highlights: stories.slice(0, 4).map((story) => story.title),
    url: "overview.html",
  };
}

function buildData(existingData, edition) {
  const data = existingData && typeof existingData === "object" ? existingData : {};
  const editions = (data.editions || []).filter((item) => item.id !== edition.id);
  editions.unshift(edition);
  return {
    site: "DailySpark",
    lastUpdated: edition.generatedAt,
    sources: FEEDS,
    editions,
    engine: {
      mode: "netlify-scheduled-source-synthesis",
      note: "English story briefs generated by Netlify Scheduled Functions from RSS feeds. Older editions are retained as an archive.",
    },
  };
}

async function readBlobData() {
  const store = getStore({ name: BLOB_STORE, consistency: "strong" });
  const data = await store.get(BLOB_KEY, { consistency: "strong", type: "json" });
  return data || null;
}

async function writeBlobData(data) {
  const store = getStore({ name: BLOB_STORE, consistency: "strong" });
  await store.setJSON(BLOB_KEY, data, {
    metadata: { lastUpdated: data.lastUpdated },
  });
}

async function buildEdition(slot) {
  const generatedAt = new Date();
  const { articles, errors } = await collectArticles();
  if (!articles.length) {
    throw new Error(`Could not download stories. Errors: ${errors.join("; ")}`);
  }

  const seeds = chooseSeeds(articles);
  const stories = await Promise.all(
    seeds.map(async (seed, index) => {
      const cluster = await Promise.all(clusterFor(seed, articles).map((article) => enrichArticle(article)));
      return composeStory(cluster[0], cluster, generatedAt, slot, index);
    })
  );
  return {
    id: `${generatedAt.toISOString().slice(0, 10)}-${slot}-${generatedAt.toISOString().slice(11, 19).replace(/:/g, "")}`,
    slot,
    label: slotLabel(slot),
    generatedAt: iso(generatedAt),
    articleTarget: STORIES_PER_EDITION,
    articles: stories,
    overview: buildOverview(stories, generatedAt),
    errors,
    mode: "netlify-scheduled-source-synthesis",
  };
}

function githubConfig() {
  const repo = process.env.NEWS_GITHUB_REPO || process.env.GITHUB_REPOSITORY;
  const token = process.env.NEWS_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const branch = process.env.NEWS_GITHUB_BRANCH || "main";
  const path = process.env.NEWS_DATA_PATH || DATA_PATH;
  if (!repo || !token) {
    throw new Error("Missing NEWS_GITHUB_REPO and/or NEWS_GITHUB_TOKEN Netlify environment variable.");
  }
  return { repo, token, branch, path };
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${config.repo}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API hiba (${response.status}): ${detail}`);
  }
  return response.json();
}

function encodeGitHubPath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function readExistingData(config) {
  const file = await githubRequest(config, `/contents/${encodeGitHubPath(config.path)}?ref=${encodeURIComponent(config.branch)}`);
  const decoded = Buffer.from(file.content || "", "base64").toString("utf8");
  return { data: JSON.parse(decoded), sha: file.sha };
}

async function commitData(config, data, sha) {
  const content = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64");
  return githubRequest(config, `/contents/${encodeGitHubPath(config.path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `chore(news): refresh DailySpark edition ${data.lastUpdated}`,
      content,
      sha,
      branch: config.branch,
    }),
  });
}

export async function runNewsRefresh({ slot = "morning", persist = true } = {}) {
  const edition = await buildEdition(slot);

  if (!persist) {
    return { edition, persisted: false };
  }

  if (process.env.NEWS_STORAGE === "github") {
    const config = githubConfig();
    const existing = await readExistingData(config);
    const data = buildData(existing.data, edition);
    const commit = await commitData(config, data, existing.sha);

    return {
      edition,
      persisted: true,
      storage: "github",
      commit: commit.commit?.html_url || commit.content?.html_url || null,
    };
  }

  const existingData = await readBlobData();
  const data = buildData(existingData, edition);
  await writeBlobData(data);

  return {
    edition,
    persisted: true,
    storage: "blob",
    lastUpdated: data.lastUpdated,
  };
}

export async function readLatestNews(fallbackUrl) {
  const blobData = await readBlobData();
  if (blobData) return { data: blobData, source: "blob" };

  if (fallbackUrl) {
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      return { data: await response.json(), source: "static" };
    }
  }

  return {
    source: "empty",
    data: {
      site: "DailySpark",
      lastUpdated: null,
      sources: FEEDS,
      editions: [],
      engine: {
        mode: "netlify-scheduled-source-synthesis",
        note: "No generated edition is available yet.",
      },
    },
  };
}

export function budapestClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value),
    minute: Number(parts.find((part) => part.type === "minute")?.value),
  };
}

export function isBudapestTime(hour, minute, date = new Date()) {
  const clock = budapestClock(date);
  return clock.hour === hour && clock.minute === minute;
}

export function isAnyBudapestTime(times, date = new Date()) {
  return times.some(([hour, minute]) => isBudapestTime(hour, minute, date));
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}
