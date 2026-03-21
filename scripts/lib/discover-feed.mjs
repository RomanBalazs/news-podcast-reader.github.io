import * as cheerio from "cheerio";
import { cachedFetch } from "./http.mjs";

export async function discoverFeedUrl(pageUrl, headersCache) {
  try {
    const { response } = await cachedFetch(pageUrl, headersCache);
    if (!response?.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    const candidates = [];

    $('link[rel="alternate"]').each((_, element) => {
      const type = ($(element).attr("type") || "").toLowerCase();
      const href = $(element).attr("href");
      if (!href) return;
      if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
        candidates.push(new URL(href, pageUrl).toString());
      }
    });

    return candidates[0] || null;
  } catch {
    return null;
  }
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
