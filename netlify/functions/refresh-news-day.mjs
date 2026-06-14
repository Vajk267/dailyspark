import { isAnyBudapestTime, jsonResponse, runNewsRefresh } from "./lib/news-refresh.mjs";

function slotForCurrentBudapestHour() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
  if (hour < 12) return "morning";
  if (hour < 18) return "evening";
  return "late";
}

const RUN_TIMES = [[8, 0], [14, 0], [20, 0]];

export default async (request) => {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    if (!force && !isAnyBudapestTime(RUN_TIMES)) {
      return jsonResponse({ ok: true, skipped: true, reason: "Not a scheduled Europe/Budapest run time." });
    }

    const result = await runNewsRefresh({ slot: slotForCurrentBudapestHour() });
    return jsonResponse({
      ok: true,
      slot: result.edition.slot,
      articles: result.edition.articles.length,
      commit: result.commit,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
};

export const config = {
  schedule: "0 6,7,12,13,18,19 * * *",
};
