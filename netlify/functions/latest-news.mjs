import { jsonResponse, readLatestNews } from "./lib/news-refresh.mjs";

export default async (request) => {
  try {
    const fallbackUrl = new URL("/data/news.json", request.url).toString();
    const result = await readLatestNews(fallbackUrl);

    return jsonResponse(result.data, 200, {
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "x-dailyspark-source": result.source,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
};
