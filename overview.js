const DATA_URL = "/.netlify/functions/latest-news";
const STATIC_DATA_URL = "data/news.json";

function renderOverview(overview) {
  document.querySelector("#overviewTitle").textContent = overview.title || "AI overview";
  document.querySelector("#overviewSummary").textContent = overview.summary || overview.subtitle || "";

  const steps = document.querySelector("#overviewSteps");
  steps.replaceChildren();
  (overview.steps || []).forEach((step, index) => {
    const node = document.createElement("div");
    node.className = "overview-node";
    node.innerHTML = "<span></span><p></p>";
    node.querySelector("span").textContent = `Step ${index + 1}`;
    node.querySelector("p").textContent = step;
    steps.append(node);
  });

  const highlights = document.querySelector("#overviewHighlights");
  highlights.replaceChildren();
  (overview.highlights || []).forEach((highlight) => {
    const item = document.createElement("div");
    item.textContent = highlight;
    highlights.append(item);
  });

  window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
}

async function main() {
  let response = await fetch(`${DATA_URL}?t=${Date.now()}`);
  if (!response.ok) {
    response = await fetch(`${STATIC_DATA_URL}?t=${Date.now()}`);
  }
  const data = await response.json();
  const overview = data.editions?.[0]?.overview || {
    title: "AI overview",
    summary: "No overview is available yet.",
    steps: [],
    highlights: [],
  };
  renderOverview(overview);
}

main().catch((error) => {
  document.querySelector("#overviewSummary").textContent = error.message;
});
window.addEventListener("load", () => window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } }));
