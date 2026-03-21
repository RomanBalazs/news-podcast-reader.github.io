import fs from "node:fs/promises";

const CACHE_FILE = ".cache/headers.json";

export async function loadHeadersCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveHeadersCache(cache) {
  await fs.mkdir(".cache", { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

export async function cachedFetch(url, headersCache) {
  const cacheEntry = headersCache[url] || {};
  const headers = {
    "user-agent": "UnifiedFeedBot/0.2 (+GitHub Actions)",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };

  if (cacheEntry.etag) headers["if-none-match"] = cacheEntry.etag;
  if (cacheEntry.lastModified) headers["if-modified-since"] = cacheEntry.lastModified;

  const response = await fetch(url, {
    headers,
    redirect: "follow"
  });

  if (response.status === 304) {
    return { kind: "not_modified", response };
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");

  headersCache[url] = {
    etag: etag || cacheEntry.etag || null,
    lastModified: lastModified || cacheEntry.lastModified || null,
    checkedAt: new Date().toISOString()
  };

  return { kind: "ok", response };
}
