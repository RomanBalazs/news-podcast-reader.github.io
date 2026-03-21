import fs from "node:fs/promises";
import crypto from "node:crypto";
import Parser from "rss-parser";
import pLimit from "p-limit";

import { autoCategory } from "./lib/categorizer.mjs";
import { discoverFeedUrl, probeCommonFeedPaths } from "./lib/discover-feed.mjs";
import { loadHeadersCache, saveHeadersCache, cachedFetch } from "./lib/http.mjs";
import { scrapeListWithPlaywright } from "./lib/scrape-playwright.mjs";
import { spotifyClientCredentialsToken, spotifyGetShowEpisodes } from "./lib/spotify.mjs";
import { youtubeFeedUrlFromChannelId, extractYouTubeVideoId } from "./lib/youtube.mjs";

const FEED_FILE = "public/data/feed.json";
const SOURCES_FILE = "public/data/sources.json";
const CATEGORIES_FILE = "public/data/categories.json";

const parser = new Parser({ timeout: 15000 });

function hashId(input) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

async function readJson(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function canonicalizeUrl(url) {
  try {
    const parsed = new URL(url);
    for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeItem({ source, type, title, url, publishedAt, summary, imageUrl = null, youtubeVideoId = null, spotifyEpisodeId = null, category = null }) {
  const finalUrl = canonicalizeUrl(url);
  return {
    id: hashId(`${source.id}|${finalUrl}`),
    sourceId: source.id,
    sourceName: source.name,
    type,
    title: title || "(nincs cím)",
    url: finalUrl,
    publishedAt: publishedAt || null,
    summary: summary || null,
    imageUrl,
    category: category || source.defaultCategory || "egyeb",
    youtubeVideoId,
    spotifyEpisodeId
  };
}

function groupPreviousItemsBySource(items) {
  return (items || []).reduce((acc, item) => {
    if (!acc[item.sourceId]) acc[item.sourceId] = [];
    acc[item.sourceId].push(item);
    return acc;
  }, {});
}

async function fetchRssSource({ source, feedUrl, headersCache, categories, previousItemsBySource }) {
  const { kind, response } = await cachedFetch(feedUrl, headersCache);

  if (kind === "not_modified") {
    return previousItemsBySource[source.id] || [];
  }

  if (!response?.ok) {
    return previousItemsBySource[source.id] || [];
  }

  const xml = await response.text();
  const parsed = await parser.parseString(xml);

  return (parsed.items || []).slice(0, 40).map((item) => {
    const link = item.link || item.guid || source.url || "";
    const title = item.title || "";
    const publishedAt = item.isoDate || item.pubDate || null;
    const summary = item.contentSnippet || item.content || item.summary || null;
    const imageUrl = item.enclosure?.url || item.thumbnail || null;
    const category = source.defaultCategory || autoCategory(title, categories);

    return normalizeItem({
      source,
      type: source.type === "youtube" ? "video" : "article",
      title,
      url: link,
      publishedAt,
      summary,
      imageUrl,
      youtubeVideoId: source.type === "youtube" ? extractYouTubeVideoId(link) : null,
      category
    });
  });
}

async function fetchSiteSource({ source, headersCache, categories, previousItemsBySource }) {
  let feedUrl = await discoverFeedUrl(source.url, headersCache);

  if (!feedUrl) {
    feedUrl = await probeCommonFeedPaths(source.url, headersCache);
  }

  if (feedUrl) {
    return fetchRssSource({ source, feedUrl, headersCache, categories, previousItemsBySource });
  }

  if (!source.scrape?.enabled) {
    return previousItemsBySource[source.id] || [];
  }

  const scrapedItems = await scrapeListWithPlaywright({
    pageUrl: source.url,
    maxItems: source.scrape.maxItems || 15
  });

  return scrapedItems.map((item) => {
    const category = source.defaultCategory || autoCategory(item.title, categories);
    return normalizeItem({
      source,
      type: "article",
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt || null,
      summary: item.summary || null,
      imageUrl: item.imageUrl || null,
      category
    });
  });
}

async function fetchSpotifySource({ source, categories, previousItemsBySource }) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(`[spotify:${source.id}] Spotify secret hiányzik, korábbi elemek maradnak.`);
    return previousItemsBySource[source.id] || [];
  }

  const token = await spotifyClientCredentialsToken({ clientId, clientSecret });
  const episodes = await spotifyGetShowEpisodes({ token, showId: source.showId, limit: 50 });

  return episodes.slice(0, 50).map((episode) => {
    const category = source.defaultCategory || autoCategory(episode.name, categories);
    return normalizeItem({
      source,
      type: "podcast",
      title: episode.name,
      url: episode.external_urls?.spotify || `https://open.spotify.com/episode/${episode.id}`,
      publishedAt: episode.release_date ? new Date(episode.release_date).toISOString() : null,
      summary: episode.description || null,
      imageUrl: episode.images?.[0]?.url || null,
      spotifyEpisodeId: episode.id,
      category
    });
  });
}

async function main() {
  const [sources, categories, previousFeed] = await Promise.all([
    readJson(SOURCES_FILE, []),
    readJson(CATEGORIES_FILE, {}),
    readJson(FEED_FILE, { generatedAt: null, items: [] })
  ]);

  const previousItemsBySource = groupPreviousItemsBySource(previousFeed.items);
  const headersCache = await loadHeadersCache();
  const limit = pLimit(3);

  const results = await Promise.all(
    sources.map((source) =>
      limit(async () => {
        try {
          if (source.type === "rss") {
            return await fetchRssSource({ source, feedUrl: source.url, headersCache, categories, previousItemsBySource });
          }

          if (source.type === "youtube") {
            return await fetchRssSource({
              source,
              feedUrl: youtubeFeedUrlFromChannelId(source.channelId),
              headersCache,
              categories,
              previousItemsBySource
            });
          }

          if (source.type === "spotify") {
            return await fetchSpotifySource({ source, categories, previousItemsBySource });
          }

          if (source.type === "site") {
            return await fetchSiteSource({ source, headersCache, categories, previousItemsBySource });
          }

          return [];
        } catch (error) {
          console.error(`[source:${source.id}]`, error);
          return previousItemsBySource[source.id] || [];
        }
      })
    )
  );

  const deduped = [];
  const seenIds = new Set();

  for (const item of results.flat()) {
    if (!item.url || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  await fs.writeFile(
    FEED_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        items: deduped
      },
      null,
      2
    ),
    "utf8"
  );

  await saveHeadersCache(headersCache);
  console.log(`Feed generálva: ${deduped.length} elem.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
