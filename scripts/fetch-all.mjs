import fs from "node:fs/promises";
import crypto from "node:crypto";
import Parser from "rss-parser";
import pLimit from "p-limit";

import { autoCategory } from "./lib/categorizer.mjs";
import { discoverFeedCandidates, discoverFeedUrl, probeCommonFeedPaths, looksLikeFeedUrl } from "./lib/discover-feed.mjs";
import { loadHeadersCache, saveHeadersCache, cachedFetch } from "./lib/http.mjs";
import { resolveScrapeProfile } from "./lib/scrape-profiles.mjs";
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

function normalizeSource(source, index) {
  const type = ["site", "rss", "youtube", "spotify"].includes(source?.type) ? source.type : "site";
  return {
    id: String(source?.id || `forras-${index + 1}`),
    type,
    name: String(source?.name || source?.id || `Forrás ${index + 1}`),
    url: String(source?.url || ""),
    feedUrl: String(source?.feedUrl || ""),
    channelId: String(source?.channelId || ""),
    showId: String(source?.showId || ""),
    defaultCategory: String(source?.defaultCategory || ""),
    fetchStrategy: ["auto", "feed-first", "scrape-only"].includes(source?.fetchStrategy) ? source.fetchStrategy : "auto",
    scrape: {
      enabled: source?.scrape?.enabled !== false,
      maxItems: Math.max(1, Number(source?.scrape?.maxItems || 15)),
      profile: String(source?.scrape?.profile || "auto")
    },
    notes: String(source?.notes || ""),
    detected: source?.detected || null
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
    const link = item.link || item.guid || source.url || feedUrl || "";
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

async function resolveSiteFeedUrl(source, headersCache) {
  if (source.feedUrl && looksLikeFeedUrl(source.feedUrl)) {
    return { feedUrl: source.feedUrl, discovered: [{ url: source.feedUrl, type: "stored", title: "stored feedUrl" }] };
  }

  const discovered = await discoverFeedCandidates(source.url, headersCache);
  if (discovered.length) {
    return { feedUrl: discovered[0].url, discovered };
  }

  const probed = await probeCommonFeedPaths(source.url, headersCache);
  if (probed) {
    return { feedUrl: probed, discovered: [{ url: probed, type: "probed", title: "common path" }] };
  }

  return { feedUrl: null, discovered: [] };
}

async function fetchSiteSource({ source, headersCache, categories, previousItemsBySource }) {
  const strategy = source.fetchStrategy || "auto";
  const shouldTryFeed = strategy !== "scrape-only";
  const shouldTryScrape = source.scrape?.enabled !== false;

  if (shouldTryFeed) {
    const { feedUrl } = await resolveSiteFeedUrl(source, headersCache);
    if (feedUrl) {
      const items = await fetchRssSource({ source, feedUrl, headersCache, categories, previousItemsBySource });
      if (items.length || strategy === "feed-first") {
        return items;
      }
    }
  }

  if (!shouldTryScrape) {
    return previousItemsBySource[source.id] || [];
  }

  const profile = resolveScrapeProfile(source);
  const scrapedItems = await scrapeListWithPlaywright({
    pageUrl: source.url,
    maxItems: source.scrape.maxItems || 15,
    profile
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

  if (!clientId || !clientSecret || !source.showId) {
    console.warn(`[spotify:${source.id}] Spotify secret vagy showId hiányzik, korábbi elemek maradnak.`);
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
  const [rawSources, categories, previousFeed] = await Promise.all([
    readJson(SOURCES_FILE, []),
    readJson(CATEGORIES_FILE, {}),
    readJson(FEED_FILE, { generatedAt: null, items: [] })
  ]);

  const sources = rawSources.map(normalizeSource);
  const previousItemsBySource = groupPreviousItemsBySource(previousFeed.items);
  const headersCache = await loadHeadersCache();
  const limit = pLimit(3);

  const results = await Promise.all(
    sources.map((source) =>
      limit(async () => {
        try {
          if (source.type === "rss") {
            const feedUrl = source.feedUrl || source.url;
            return await fetchRssSource({ source, feedUrl, headersCache, categories, previousItemsBySource });
          }

          if (source.type === "youtube") {
            if (!source.channelId) return previousItemsBySource[source.id] || [];
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

  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2), "utf8");
  await saveHeadersCache(headersCache);
  console.log(`Feed generálva: ${deduped.length} elem.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
