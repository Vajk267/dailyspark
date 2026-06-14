import { jsonResponse, runNewsRefresh } from "./lib/news-refresh.mjs";

export default async () => {
  try {
    const result = await runNewsRefresh({ slot: "preview", persist: false });
    return jsonResponse({
      ok: true,
      edition: result.edition,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
};
