import * as cheerio from "cheerio";
import { cachedFetch } from "./http.mjs";

export function looksLikeFeedUrl(url) {
  const input = String(url || "").toLowerCase();
  return ["/feed", "/rss", ".xml", "/atom", "/index.xml"].some((token) => input.includes(token));
}

export async function discoverFeedCandidates(pageUrl, headersCache) {
  try {
    const { response } = await cachedFetch(pageUrl, headersCache);
    if (!response?.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const candidates = [];

    $('link[rel="alternate"]').each((_, element) => {
      const type = ($(element).attr("type") || "").toLowerCase();
      const title = ($(element).attr("title") || "").trim();
      const href = $(element).attr("href");
      if (!href) return;
      if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
        candidates.push({
          url: new URL(href, pageUrl).toString(),
          type: type || "application/rss+xml",
          title
        });
      }
    });

    return dedupeCandidates(candidates);
  } catch {
    return [];
  }
}

export async function discoverFeedUrl(pageUrl, headersCache) {
  const candidates = await discoverFeedCandidates(pageUrl, headersCache);
  return candidates[0]?.url || null;
}

export async function probeCommonFeedPaths(pageUrl, headersCache) {
  const candidates = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];
  const base = new URL(pageUrl);

  for (const path of candidates) {
    try {
      const url = new URL(path, `${base.origin}/`).toString();
      const { response } = await cachedFetch(url, headersCache);
      if (!response?.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();
      if (contentType.includes("xml") || body.includes("<rss") || body.includes("<feed")) {
        return url;
      }
    } catch {
      // ignore and continue
    }
  }

  return null;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
