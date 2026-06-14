import { isBudapestTime, jsonResponse, runNewsRefresh } from "./lib/news-refresh.mjs";

export default async (request) => {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    if (!force && !isBudapestTime(4, 25)) {
      return jsonResponse({ ok: true, skipped: true, reason: "Not 04:25 in Europe/Budapest." });
    }

    const result = await runNewsRefresh({ slot: "morning" });
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
  schedule: "25 2,3 * * *",
};
