#!/usr/bin/env python3
"""Build DailySpark editions from RSS feeds and source pages."""

from __future__ import annotations

import argparse
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import textwrap
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "news.json"
MAX_EDITIONS = 14
STORIES_PER_EDITION = 10
SOURCE_LIMIT_PER_STORY = 3

TOPIC_COLORS = {
    "Hungary": "#38bdf8",
    "World": "#38bdf8",
    "Business": "#38bdf8",
    "Technology": "#38bdf8",
    "Science": "#38bdf8",
    "Sport": "#38bdf8",
    "Culture": "#38bdf8",
    "Lifestyle": "#38bdf8",
}

FEEDS = [
    {"name": "BBC World", "topic": "World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},
    {"name": "BBC Business", "topic": "Business", "url": "https://feeds.bbci.co.uk/news/business/rss.xml"},
    {"name": "BBC Technology", "topic": "Technology", "url": "https://feeds.bbci.co.uk/news/technology/rss.xml"},
    {"name": "BBC Science", "topic": "Science", "url": "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"},
    {"name": "BBC Sport", "topic": "Sport", "url": "https://feeds.bbci.co.uk/sport/rss.xml"},
    {"name": "The Guardian World", "topic": "World", "url": "https://www.theguardian.com/world/rss"},
    {"name": "The Guardian Culture", "topic": "Culture", "url": "https://www.theguardian.com/culture/rss"},
    {"name": "The Guardian Technology", "topic": "Technology", "url": "https://www.theguardian.com/technology/rss"},
    {"name": "The Guardian Business", "topic": "Business", "url": "https://www.theguardian.com/business/rss"},
    {"name": "The Guardian Sport", "topic": "Sport", "url": "https://www.theguardian.com/sport/rss"},
]

STOP_WORDS = {
    "the", "and", "for", "with", "from", "this", "that", "into", "over", "after", "before",
    "live", "latest", "news", "video", "photos", "world", "could", "would", "their", "about",
    "follow", "updates", "final", "game", "report", "says", "will", "amid", "first", "last",
}

MOJIBAKE_MARKERS = ("\u0102", "\u0139", "\u00e2\u20ac", "\u00e2\u20ac\u201c", "\u00e2\u20ac\u2122", "\u00e2\u20ac\u0153", "\u00e2\u20ac\u0165")
NAVIGATION_NOISE = (
    "cimlap cikkek",
    "print subscriptions search jobs sign in",
    "toggle caption skip to key events",
    "close dialogue next image previous image",
)

TEXT_TRANSLATION = str.maketrans({
    "\u2019": "'",
    "\u2018": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2026": "...",
    "\u00a0": " ",
})


@dataclass(frozen=True)
class SourceArticle:
    title: str
    url: str
    source: str
    topic: str
    published_at: str
    summary: str
    image: str
    color: str
    body: str = ""


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def clean_text(value: str | None, limit: int = 420) -> str:
    if not value:
        return ""
    value = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    if any(marker in value for marker in MOJIBAKE_MARKERS):
        try:
            value = value.encode("latin1").decode("utf-8")
        except UnicodeError:
            pass
    value = value.translate(TEXT_TRANSLATION)
    value = unicodedata.normalize("NFKD", value).encode("ascii", errors="ignore").decode("ascii")
    value = value.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value
    return textwrap.shorten(value, width=limit, placeholder="...")


def parse_date(value: str | None) -> datetime:
    if not value:
        return now_utc()
    parsed = email.utils.parsedate_to_datetime(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def node_text(item: ET.Element, names: Iterable[str]) -> str:
    for name in names:
        found = item.find(name)
        if found is not None and found.text:
            return found.text.strip()
    return ""


def node_attr(item: ET.Element, names: Iterable[str], attr: str) -> str:
    for name in names:
        found = item.find(name)
        if found is not None and found.attrib.get(attr):
            return found.attrib[attr].strip()
    return ""


def fetch_url(url: str, timeout: int = 18) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "DailySparkBot/0.2 (+https://localhost)",
            "Accept": "text/html,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def parse_feed(feed: dict[str, str]) -> list[SourceArticle]:
    raw = fetch_url(feed["url"])
    root = ET.fromstring(raw)
    items = root.findall(".//item")
    if not items:
        items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

    articles: list[SourceArticle] = []
    for item in items[:24]:
        title = clean_text(node_text(item, ["title", "{http://www.w3.org/2005/Atom}title"]), 170)
        link = node_text(item, ["link"])
        atom_link = item.find("{http://www.w3.org/2005/Atom}link")
        if not link and atom_link is not None:
            link = atom_link.attrib.get("href", "")
        if not title or not link:
            continue

        published_raw = node_text(
            item,
            ["pubDate", "published", "updated", "{http://www.w3.org/2005/Atom}published", "{http://www.w3.org/2005/Atom}updated"],
        )
        summary = clean_text(node_text(item, ["description", "summary", "{http://www.w3.org/2005/Atom}summary"]), 360)
        image = node_attr(item, ["media:thumbnail", "media:content"], "url")
        if not image:
            image = node_attr(item, ["{http://search.yahoo.com/mrss/}thumbnail", "{http://search.yahoo.com/mrss/}content"], "url")
        if not image:
            image = node_attr(item, ["enclosure"], "url")

        articles.append(
            SourceArticle(
                title=title,
                url=link.strip(),
                source=feed["name"],
                topic=feed["topic"],
                published_at=iso(parse_date(published_raw)),
                summary=summary,
                image=upgrade_image_url(image),
                color=TOPIC_COLORS.get(feed["topic"], "#38bdf8"),
            )
        )

    return articles


def extract_meta_image(raw_html: str) -> str:
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_html, flags=re.I)
        if match:
            return html.unescape(match.group(1))
    return ""


def extract_body(raw_html: str) -> str:
    paragraphs = re.findall(r"(?is)<p[^>]*>(.*?)</p>", raw_html)
    cleaned = [clean_text(paragraph, 900) for paragraph in paragraphs]
    cleaned = [paragraph for paragraph in cleaned if len(paragraph) > 55]
    return " ".join(cleaned[:8])


def enrich_article(article: SourceArticle, cache: dict[str, SourceArticle]) -> SourceArticle:
    if article.url in cache:
        return cache[article.url]
    try:
        raw = fetch_url(article.url, timeout=12).decode("utf-8", errors="ignore")
        body = clean_text(extract_body(raw), 1800)
        image = upgrade_image_url(extract_meta_image(raw) or article.image)
        enriched = replace(article, body=body, image=image)
    except Exception:
        enriched = article
    cache[article.url] = enriched
    return enriched


def upgrade_image_url(url: str) -> str:
    if not url:
        return ""
    url = html.unescape(url.strip())
    url = url.replace("width=140", "width=1200").replace("quality=45", "quality=85")
    url = url.replace("standard/240/", "standard/1024/")
    url = url.replace("/240/", "/1024/") if "ichef.bbci.co.uk" in url else url
    return url


def article_key(article: SourceArticle) -> str:
    normalized_title = re.sub(r"[^a-z0-9]+", "", article.title.lower())
    normalized_url = re.sub(r"[?#].*$", "", article.url.lower())
    return f"{normalized_title}|{normalized_url}"


def keywords(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z0-9]{4,}", text.lower())
    return {word for word in words if word not in STOP_WORDS}


def related_score(seed: SourceArticle, candidate: SourceArticle) -> int:
    seed_words = keywords(seed.title + " " + seed.summary)
    candidate_words = keywords(candidate.title + " " + candidate.summary)
    return len(seed_words & candidate_words)


def title_overlap(seed: SourceArticle, candidate: SourceArticle) -> int:
    return len(keywords(seed.title) & keywords(candidate.title))


def balanced_seeds(articles: list[SourceArticle], limit: int) -> list[SourceArticle]:
    sorted_articles = sorted(articles, key=lambda item: item.published_at, reverse=True)
    selected: list[SourceArticle] = []
    per_topic: dict[str, int] = {}

    for article in sorted_articles:
        if len(selected) >= limit:
            break
        if per_topic.get(article.topic, 0) >= 2:
            continue
        selected.append(article)
        per_topic[article.topic] = per_topic.get(article.topic, 0) + 1

    for article in sorted_articles:
        if len(selected) >= limit:
            break
        if article not in selected:
            selected.append(article)
    return selected[:limit]


def cluster_articles(seed: SourceArticle, articles: list[SourceArticle]) -> list[SourceArticle]:
    candidates = [
        item for item in articles
        if (
            item.url != seed.url
            and item.topic == seed.topic
            and related_score(seed, item) >= 3
            and title_overlap(seed, item) >= 2
        )
    ]
    candidates.sort(key=lambda item: (related_score(seed, item), item.published_at), reverse=True)
    return [seed, *candidates[: SOURCE_LIMIT_PER_STORY - 1]]


def first_sentences(text: str, limit: int = 2) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", clean_text(text, 1200))
    return [sentence for sentence in sentences if len(sentence) > 30][:limit]


def sentence_pool(article: SourceArticle, limit: int = 5) -> list[str]:
    text = clean_text(" ".join([article.summary, article.body]), 2600)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    useful: list[str] = []
    blocked = (
        "cookie", "newsletter", "subscribe", "sign up", "all rights", "advertisement",
        "privacy", "terms", "browser", "javascript", "click here",
        "close dialogue", "toggle caption", "skip to key events", "print subscriptions",
        "search jobs", "sign in eur", "show more hide", "back to home",
        "british broadcasting corporation home news", "bbc verify football",
        "home news football 2026 sport business technology",
    )
    for sentence in sentences:
        sentence = clean_text(sentence, 360)
        if len(sentence) < 45:
            continue
        if any(term in sentence.lower() for term in blocked):
            continue
        if sentence not in useful:
            useful.append(sentence)
        if len(useful) >= limit:
            break
    return useful


def readable_sources(cluster: list[SourceArticle]) -> str:
    names: list[str] = []
    for article in cluster:
        if article.source not in names:
            names.append(article.source)
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def make_summary(title: str, seed: SourceArticle) -> str:
    facts = sentence_pool(seed, 2)
    if facts:
        return clean_text(facts[0], 300)
    return (
        f"The latest {seed.topic.lower()} story centers on {headline_core(seed).lower()}, "
        "with the original reporting linked below for readers who want the full trail."
    )


def topic_context(topic: str) -> str:
    contexts = {
        "Business": (
            "For readers following markets and companies, the important question is whether the first report turns into "
            "a broader financial, regulatory, or consumer story."
        ),
        "Technology": (
            "For readers following technology, the important question is whether the first report changes how companies, "
            "users, regulators, or developers behave next."
        ),
        "Sport": (
            "For readers following sport, the important question is how the result, selection, injury news, or performance "
            "changes the next fixture and the wider competition picture."
        ),
        "Science": (
            "For readers following science, the important question is whether the finding, warning, or field report is "
            "confirmed by more evidence and translated into practical decisions."
        ),
        "Culture": (
            "For readers following culture, the important question is how the story changes public attention, audience "
            "reaction, and the next stage of the work or event."
        ),
        "Hungary": (
            "For readers following Hungary, the important question is whether the first details lead to a public response, "
            "a political consequence, or a practical change for the people affected."
        ),
    }
    return contexts.get(
        topic,
        "The wider context matters because the first report may be followed by reaction, confirmation, and clearer consequences.",
    )


def detail_paragraphs(seed: SourceArticle, cluster: list[SourceArticle], title: str) -> list[str]:
    lead_fact = make_summary(title, seed)
    paragraphs = [
        (
            f"The story centers on {headline_core(seed).lower()}. "
            f"The central point from the latest reporting is this: {lead_fact}"
        )
    ]

    collected: list[str] = []
    for article in cluster:
        for sentence in sentence_pool(article, 4):
            if sentence not in collected:
                collected.append(sentence)

    if collected:
        paragraphs.append(
            "The immediate detail is more concrete. "
            + " ".join(collected[:3])
        )
    else:
        paragraphs.append(
            f"The available detail is still thin, but the item is current enough to lead the {seed.topic.lower()} desk. "
            "Later updates should clarify the sequence, the people involved, and the practical effect."
        )

    if len(collected) > 3:
        paragraphs.append(
            "The surrounding context matters because it shows where the story may move next. "
            + " ".join(collected[3:6])
        )
    else:
        paragraphs.append(
            "The next thing to watch is whether later updates add confirmation, reaction, or practical consequences."
        )

    paragraphs.append(topic_context(seed.topic))

    paragraphs.append(
        "What remains open is the follow-up: whether officials, companies, teams, or other people named in the story "
        "respond, and whether the first details hold once the next round of reporting arrives."
    )
    return paragraphs


def make_takeaways(seed: SourceArticle, cluster: list[SourceArticle]) -> list[str]:
    facts = sentence_pool(seed, 3)
    points = [clean_text(sentence, 180) for sentence in facts[:3]]
    while len(points) < 3:
        fallback = [
            f"The story is part of the {seed.topic} desk.",
            "The central facts may develop as publishers update their reporting.",
            "Further updates may add reaction, confirmation, or practical consequences.",
        ][len(points)]
        points.append(fallback)
    return points[:3]


def source_excerpt(article: SourceArticle) -> str:
    base = article.body or article.summary or article.title
    return clean_text(base, 260)


def make_story_id(slot: str, seed: SourceArticle, generated: datetime, index: int) -> str:
    digest = hashlib.sha1(f"{slot}|{generated.date()}|{index}|{seed.url}".encode("utf-8")).hexdigest()[:10]
    slug = re.sub(r"[^a-z0-9]+", "-", seed.title.lower())[:42].strip("-")
    return f"{generated.date().isoformat()}-{slot}-{index + 1}-{slug}-{digest}"


def mostly_english(value: str) -> bool:
    letters = re.findall(r"[A-Za-z]", value)
    non_ascii_letters = re.findall(r"[^\x00-\x7F]", value)
    return len(letters) >= 12 and len(non_ascii_letters) <= max(2, len(letters) // 12)


def usable_source_article(article: SourceArticle) -> bool:
    combined = clean_text(" ".join([article.title, article.summary, article.body]), 900).lower()
    if any(phrase in combined for phrase in NAVIGATION_NOISE):
        return False
    return mostly_english(" ".join([article.title, article.summary]))


def headline_core(seed: SourceArticle) -> str:
    primary = re.split(r"\s+[–-]\s+|;|:", seed.title, maxsplit=1)[0]
    primary = re.sub(r"\b(news live|live updates|latest|breaking news|follow live)\b", "", primary, flags=re.I)
    primary = clean_text(primary.strip(" :-–"), 86)
    if len(primary) < 8 or not mostly_english(primary):
        fallback = clean_text(seed.title.strip(" :-–"), 86)
        if fallback and mostly_english(fallback):
            return fallback
        return f"{seed.topic} development from {seed.source}"
    return primary


def editorial_title(seed: SourceArticle, cluster: list[SourceArticle]) -> str:
    core = headline_core(seed)
    if len(cluster) > 1:
        return f"{seed.topic}: {core} from multiple sources"
    return f"{seed.topic}: {core}"


def english_source_note(article: SourceArticle) -> str:
    excerpt = sentence_pool(article, 1)
    if excerpt:
        return clean_text(excerpt[0], 220)
    return f"{article.source}, published {article.published_at[:10]}."


def build_overview(stories: list[dict], generated: datetime) -> dict:
    topics = []
    for story in stories:
        if story["topic"] not in topics:
            topics.append(story["topic"])
    source_count = sum(story.get("sourceCount", 0) for story in stories)
    lead_topics = ", ".join(topics[:5])
    return {
        "title": "AI overview",
        "subtitle": "A guided snapshot of how today's edition was assembled.",
        "generatedAt": iso(generated),
        "summary": (
            f"This edition turns {source_count} source signals into {len(stories)} readable stories. "
            f"The main coverage areas are {lead_topics}."
        ),
        "steps": [
            "Collecting fresh RSS signals from the configured publishers.",
            "Grouping related items by topic, keywords, timing and source overlap.",
            "Extracting usable article context and high quality preview images where available.",
            "Writing concise English story briefs with source transparency preserved.",
        ],
        "highlights": [
            story["title"] for story in stories[:4]
        ],
        "url": "overview.html",
    }


def compose_story(seed: SourceArticle, cluster: list[SourceArticle], generated: datetime, slot: str, index: int) -> dict:
    title = editorial_title(seed, cluster)
    subtitle = "What happened, why it matters, and what to watch next."
    summary = make_summary(title, seed)
    body = detail_paragraphs(seed, cluster, title)
    takeaways = make_takeaways(seed, cluster)

    image = next((article.image for article in cluster if article.image), "")
    return {
        "id": make_story_id(slot, seed, generated, index),
        "title": title,
        "subtitle": subtitle,
        "url": f"article.html?id={make_story_id(slot, seed, generated, index)}",
        "source": "DailySpark newsroom",
        "topic": seed.topic,
        "publishedAt": iso(generated),
        "updatedAt": iso(generated),
        "summary": summary,
        "body": body,
        "takeaways": takeaways,
        "image": image,
        "color": seed.color,
        "readingMinutes": max(2, round(sum(len(paragraph.split()) for paragraph in body) / 180)),
        "sourceCount": len(cluster),
        "sources": [
            {
                "title": article.title,
                "url": article.url,
                "source": article.source,
                "publishedAt": article.published_at,
                "excerpt": english_source_note(article),
            }
            for article in cluster
        ],
    }


def load_existing() -> dict:
    if not DATA_PATH.exists():
        return {"site": "DailySpark", "lastUpdated": None, "sources": FEEDS, "editions": []}
    with DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def edition_label(slot: str) -> str:
    if slot == "morning":
        return "Morning edition"
    if slot == "evening":
        return "Evening edition"
    return "Latest edition"


def current_slot() -> str:
    hour = datetime.now().hour
    if hour < 12:
        return "morning"
    if hour < 21:
        return "evening"
    return "late"


def build_edition(slot: str, allow_fallback: bool) -> tuple[dict, list[str]]:
    all_articles: list[SourceArticle] = []
    errors: list[str] = []

    for feed in FEEDS:
        try:
            all_articles.extend(parse_feed(feed))
        except (urllib.error.URLError, TimeoutError, ET.ParseError, ValueError) as exc:
            errors.append(f"{feed['name']}: {exc}")

    seen: set[str] = set()
    unique_articles: list[SourceArticle] = []
    for article in all_articles:
        key = article_key(article)
        if key in seen:
            continue
        seen.add(key)
        if not usable_source_article(article):
            continue
        unique_articles.append(article)

    seeds = balanced_seeds(unique_articles, STORIES_PER_EDITION)
    if not seeds and not allow_fallback:
        raise RuntimeError("Could not download stories from any RSS source.")

    generated = now_utc()
    enrich_cache: dict[str, SourceArticle] = {}
    stories: list[dict] = []
    for index, seed in enumerate(seeds):
        cluster = cluster_articles(seed, unique_articles)
        enriched_cluster = [enrich_article(article, enrich_cache) for article in cluster]
        stories.append(compose_story(enriched_cluster[0], enriched_cluster, generated, slot, index))
    overview = build_overview(stories, generated)

    edition_id = f"{generated.date().isoformat()}-{slot}"
    return (
        {
            "id": edition_id,
            "slot": slot,
            "label": edition_label(slot),
            "generatedAt": iso(generated),
            "articleTarget": STORIES_PER_EDITION,
            "articles": stories,
            "overview": overview,
            "errors": errors,
            "mode": "source-synthesis",
        },
        errors,
    )


def save_edition(edition: dict) -> dict:
    data = load_existing()
    data["site"] = "DailySpark"
    data["lastUpdated"] = edition["generatedAt"]
    data["sources"] = FEEDS
    data["engine"] = {
        "mode": "source-synthesis",
        "note": "English stories assembled from RSS feeds and available source-page context.",
    }

    editions = [item for item in data.get("editions", []) if item.get("id") != edition["id"]]
    editions.insert(0, edition)
    data["editions"] = editions[:MAX_EDITIONS]

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate DailySpark stories from RSS sources.")
    parser.add_argument("--slot", choices=["morning", "evening", "late"], default=current_slot())
    parser.add_argument("--allow-fallback", action="store_true", help="Do not fail when every feed is unavailable.")
    args = parser.parse_args()

    try:
        edition, errors = build_edition(args.slot, args.allow_fallback)
        data = save_edition(edition)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Generated: {edition['label']} | DailySpark stories: {len(edition['articles'])} | "
        f"stored editions: {len(data['editions'])}"
    )
    if errors:
        print("Source warnings:")
        for error in errors:
            print(f"- {error}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
