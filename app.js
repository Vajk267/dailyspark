const DATA_URL = "/.netlify/functions/latest-news";
const STATIC_DATA_URL = "data/news.json";

const state = {
  data: null,
  editionIndex: 0,
  category: "All",
};

const els = {
  lastUpdated: document.querySelector("#lastUpdated"),
  editionTitle: document.querySelector("#editionTitle"),
  articleCount: document.querySelector("#articleCount"),
  engineMode: document.querySelector("#engineMode"),
  editionTabs: document.querySelector("#editionTabs"),
  categoryFilters: document.querySelector("#categoryFilters"),
  leadGrid: document.querySelector("#leadGrid"),
  articleGrid: document.querySelector("#articleGrid"),
  latestRail: document.querySelector("#latestRail"),
  moreGrid: document.querySelector("#moreGrid"),
  headlineTicker: document.querySelector("#headlineTicker"),
  sourceList: document.querySelector("#sourceList"),
  template: document.querySelector("#articleTemplate"),
  refreshView: document.querySelector("#refreshView"),
};

function refreshIcons() {
  window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fallbackImage(article) {
  const topic = article.topic || "DailySpark";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#050816"/><stop offset=".55" stop-color="#0ea5e9"/><stop offset="1" stop-color="#111827"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="45"/></filter></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="1220" cy="180" r="210" fill="rgba(56,189,248,.34)" filter="url(#blur)"/><circle cx="280" cy="840" r="260" fill="rgba(56,189,248,.16)" filter="url(#blur)"/><path d="M120 690 C420 460 620 840 930 560 C1130 380 1290 470 1500 300" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="18"/><text x="95" y="170" fill="white" font-family="Arial" font-size="92" font-weight="700">${topic}</text><text x="100" y="245" fill="rgba(255,255,255,.72)" font-family="Arial" font-size="34">DailySpark</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function articleImage(article) {
  return article.image || fallbackImage(article);
}

function articleUrl(article) {
  return `article.html?id=${encodeURIComponent(article.id)}`;
}

function currentEdition() {
  return state.data?.editions?.[state.editionIndex] || null;
}

function allCurrentArticles() {
  return currentEdition()?.articles || [];
}

function currentArticles() {
  const articles = allCurrentArticles();
  if (state.category === "All") return articles;
  return articles.filter((article) => article.topic === state.category);
}

function renderTabs() {
  els.editionTabs.replaceChildren();
  state.data.editions.forEach((edition, index) => {
    const button = document.createElement("button");
    button.className = "tab-button";
    button.type = "button";
    button.setAttribute("aria-selected", String(index === state.editionIndex));
    button.textContent = `${edition.label} | ${formatDate(edition.generatedAt)}`;
    button.addEventListener("click", () => {
      state.editionIndex = index;
      state.category = "All";
      render();
    });
    els.editionTabs.append(button);
  });
}

function renderFilters() {
  const topics = ["All", ...new Set(allCurrentArticles().map((item) => item.topic))];
  els.categoryFilters.replaceChildren();
  topics.forEach((topic) => {
    const button = document.createElement("button");
    button.className = "filter-button";
    button.type = "button";
    button.setAttribute("aria-pressed", String(topic === state.category));
    button.textContent = topic;
    button.addEventListener("click", () => {
      state.category = topic;
      render();
    });
    els.categoryFilters.append(button);
  });
}

function openArticleInNewTab(article) {
  window.open(articleUrl(article), "_blank", "noopener,noreferrer");
}

function renderArticle(article, variant = "") {
  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector(".article-card");
  const image = fragment.querySelector("img");
  const topic = fragment.querySelector(".topic-pill");
  const sourceCount = fragment.querySelector(".source-pill span");
  const meta = fragment.querySelector(".meta");
  const title = fragment.querySelector(".title-button");
  const summary = fragment.querySelector("p");
  const readTime = fragment.querySelector(".read-time");

  if (variant) card.classList.add(variant);
  card.dataset.href = articleUrl(article);
  card.setAttribute("aria-label", `Open article: ${article.title}`);
  card.addEventListener("click", () => openArticleInNewTab(article));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openArticleInNewTab(article);
    }
  });

  image.src = articleImage(article);
  image.addEventListener("error", () => {
    image.src = fallbackImage(article);
  }, { once: true });
  image.alt = `${article.topic} story image`;
  topic.textContent = article.topic;
  sourceCount.textContent = `${article.sourceCount || article.sources?.length || 1} sources`;
  meta.textContent = `${article.source || "DailySpark"} | ${formatDate(article.publishedAt)}`;
  title.textContent = article.title;
  summary.textContent = article.summary || "Summary unavailable.";
  readTime.textContent = `${article.readingMinutes || 2} min read`;

  return fragment;
}

function renderLatestItem(article) {
  const item = document.createElement("article");
  item.className = "latest-item";
  item.tabIndex = 0;
  item.setAttribute("role", "link");
  item.setAttribute("aria-label", `Open article: ${article.title}`);
  item.innerHTML = `
    <img alt="" loading="lazy">
    <div>
      <span></span>
      <strong></strong>
    </div>
  `;

  const image = item.querySelector("img");
  image.src = articleImage(article);
  image.alt = `${article.topic} story image`;
  image.addEventListener("error", () => {
    image.src = fallbackImage(article);
  }, { once: true });
  item.querySelector("span").textContent = article.topic;
  item.querySelector("strong").textContent = article.title;

  item.addEventListener("click", () => openArticleInNewTab(article));
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openArticleInNewTab(article);
    }
  });
  return item;
}

function renderArticles() {
  const articles = currentArticles();
  els.leadGrid.replaceChildren();
  els.articleGrid.replaceChildren();
  els.latestRail?.replaceChildren();
  els.moreGrid?.replaceChildren();

  if (!articles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No stories are available for this filter in the current edition.";
    els.leadGrid.append(empty);
    return;
  }

  articles.slice(0, 6).forEach((article) => els.latestRail?.append(renderLatestItem(article)));
  els.leadGrid.append(renderArticle(articles[0], "feature-card"));
  articles.slice(1, 3).forEach((article) => els.articleGrid.append(renderArticle(article, "front-card")));
  articles.slice(3).forEach((article) => els.moreGrid?.append(renderArticle(article, "more-tile")));
}

function renderSources() {
  const sources = state.data.sources || [];
  els.sourceList.replaceChildren();
  sources.forEach((source) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.name} (${source.topic})`;
    li.append(link);
    els.sourceList.append(li);
  });
}

function renderTicker() {
  if (!els.headlineTicker) return;
  const headlines = allCurrentArticles().slice(0, 8).map((article) => article.title);
  els.headlineTicker.replaceChildren();
  [...headlines, ...headlines].forEach((headline) => {
    const item = document.createElement("span");
    item.textContent = headline;
    els.headlineTicker.append(item);
  });
}

function render() {
  const edition = currentEdition();
  els.lastUpdated.textContent = formatDate(state.data.lastUpdated);
  els.editionTitle.textContent = edition ? edition.label : "-";
  els.articleCount.textContent = String(currentArticles().length);
  els.engineMode.textContent = "Editor overview";
  renderTabs();
  renderFilters();
  renderTicker();
  renderArticles();
  renderSources();
  refreshIcons();
}

async function loadData() {
  els.lastUpdated.textContent = "Loading...";
  let response = await fetch(`${DATA_URL}?t=${Date.now()}`);
  if (!response.ok) {
    response = await fetch(`${STATIC_DATA_URL}?t=${Date.now()}`);
  }
  if (!response.ok) throw new Error(`Could not load data: ${response.status}`);
  state.data = await response.json();
  state.editionIndex = 0;
  state.category = "All";
  render();
}

els.refreshView.addEventListener("click", () => {
  loadData().catch((error) => {
    els.lastUpdated.textContent = error.message;
  });
});

window.addEventListener("load", refreshIcons);

loadData().catch((error) => {
  els.lastUpdated.textContent = error.message;
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "Run scripts/fetch_news.py, then reload the page.";
  els.leadGrid.append(empty);
});
