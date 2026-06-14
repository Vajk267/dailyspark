const DATA_URL = "data/news.json";

const NETLIFY_DATA_URL = "/.netlify/functions/latest-news";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function hasArticleImage(article) {
  return Boolean(article.image && article.image.trim());
}

function renderSource(source) {
  const a = document.createElement("a");
  a.className = "source-item";
  a.href = source.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.innerHTML = "<strong></strong><span></span><small></small>";
  a.querySelector("strong").textContent = source.title;
  a.querySelector("span").textContent = source.excerpt || source.source;
  a.querySelector("small").textContent = `${source.source} | ${formatDate(source.publishedAt)}`;
  return a;
}

function renderMoreArticles(article, articles) {
  const container = document.querySelector("#moreArticles");
  container.replaceChildren();
  articles
    .filter((item) => item.id !== article.id)
    .slice(0, 6)
    .forEach((item) => {
      const link = document.createElement("a");
      link.className = "more-card";
      link.href = `article.html?id=${encodeURIComponent(item.id)}`;
      link.innerHTML = "<span></span><strong></strong><small></small>";
      link.querySelector("span").textContent = item.topic;
      link.querySelector("strong").textContent = item.title;
      link.querySelector("small").textContent = `${item.readingMinutes || 2} min read | ${item.sourceCount || item.sources?.length || 1} sources`;
      container.append(link);
    });
}

function renderArticle(article, articles) {
  document.title = `${article.title} | DailySpark`;
  const image = document.querySelector("#articleImage");
  const hero = document.querySelector(".reader-hero");
  if (hasArticleImage(article)) {
    image.src = article.image;
    image.alt = `${article.topic} story image`;
    image.addEventListener("error", () => {
      hero.classList.add("no-image");
      image.remove();
    }, { once: true });
  } else {
    hero.classList.add("no-image");
    image.remove();
  }

  document.querySelector("#articleTopic").textContent = article.topic;
  document.querySelector("#articleTitle").textContent = article.title;
  document.querySelector("#articleSubtitle").textContent = article.subtitle || article.summary;
  document.querySelector("#articleMeta").textContent =
    `${formatDate(article.updatedAt || article.publishedAt)} | ${article.readingMinutes || 3} min read`;

  const takeaways = document.querySelector("#articleTakeaways");
  takeaways.replaceChildren();
  (article.takeaways || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    takeaways.append(li);
  });

  const body = document.querySelector("#articleBody");
  body.replaceChildren();
  (article.body || [article.summary]).forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    body.append(p);
  });

  const sources = document.querySelector("#articleSources");
  sources.replaceChildren();
  (article.sources || []).forEach((source) => sources.append(renderSource(source)));
  renderMoreArticles(article, articles);
  window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
}

async function main() {
  const id = new URLSearchParams(window.location.search).get("id");
  let response = await fetch(`${NETLIFY_DATA_URL}?t=${Date.now()}`);
  if (!response.ok) {
    response = await fetch(`${DATA_URL}?t=${Date.now()}`);
  }
  const data = await response.json();
  const currentEdition = data.editions.find((edition) => edition.articles.some((item) => item.id === id)) || data.editions[0];
  const articles = currentEdition?.articles || [];
  const article = articles.find((item) => item.id === id) || articles[0];
  if (!article) throw new Error("No story is available.");
  renderArticle(article, articles);
}

main().catch((error) => {
  document.querySelector("#articleTitle").textContent = error.message;
});
window.addEventListener("load", () => window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } }));

