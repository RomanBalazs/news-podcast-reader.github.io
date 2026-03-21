import fs from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = ".cache";
const HEADERS_CACHE_PATH = path.join(CACHE_DIR, "headers.json");

export async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function loadHeadersCache() {
  await ensureCacheDir();
  try {
    const raw = await fs.readFile(HEADERS_CACHE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveHeadersCache(cache) {
  await ensureCacheDir();
  await fs.writeFile(HEADERS_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

export async function cachedFetch(url, headersCache, init = {}) {
  const cacheEntry = headersCache[url] || {};
  const headers = new Headers(init.headers || {});

  headers.set("User-Agent", init.userAgent || "unified-feed-mvp/0.1 (+github-pages)");

  if (cacheEntry.etag) {
    headers.set("If-None-Match", cacheEntry.etag);
  } else if (cacheEntry.lastModified) {
    headers.set("If-Modified-Since", cacheEntry.lastModified);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: init.redirect || "follow"
  });

  if (response.status === 304) {
    return { kind: "not_modified", response };
  }

  headersCache[url] = {
    etag: response.headers.get("etag") || cacheEntry.etag || null,
    lastModified: response.headers.get("last-modified") || cacheEntry.lastModified || null,
    updatedAt: new Date().toISOString()
  };

  return { kind: "ok", response };
}
