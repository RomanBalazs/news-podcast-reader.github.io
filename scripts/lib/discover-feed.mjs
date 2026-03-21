import * as cheerio from "cheerio";
import { cachedFetch } from "./http.mjs";

function toAbsoluteUrl(baseUrl, value) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function discoverFeedUrl(pageUrl, headersCache) {
  const { response } = await cachedFetch(pageUrl, headersCache);
  if (!response.ok) return null;

  const html = await response.text();
  const $ = cheerio.load(html);
  const links = $("head link[rel='alternate']").toArray();

  for (const link of links) {
    const type = ($(link).attr("type") || "").toLowerCase();
    const href = $(link).attr("href");
    if (!href) continue;

    const isFeed = type.includes("application/rss+xml") || type.includes("application/atom+xml") || type.includes("application/xml");
    if (!isFeed) continue;

    const absoluteUrl = toAbsoluteUrl(pageUrl, href);
    if (absoluteUrl) return absoluteUrl;
  }

  return null;
}

export async function probeCommonFeedPaths(pageUrl, headersCache) {
  const url = new URL(pageUrl);
  const base = url.origin;
  const candidates = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];

  for (const candidatePath of candidates) {
    const candidateUrl = `${base}${candidatePath}`;
    try {
      const { kind, response } = await cachedFetch(candidateUrl, headersCache);
      if (kind === "not_modified") return candidateUrl;
      if (!response.ok) continue;

      const text = await response.text();
      const head = text.slice(0, 250).toLowerCase();
      if (head.includes("<rss") || head.includes("<feed")) {
        return candidateUrl;
      }
    } catch {
      // ignore candidate
    }
  }

  return null;
}
