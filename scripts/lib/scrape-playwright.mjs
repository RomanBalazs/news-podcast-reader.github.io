import { chromium } from "playwright";

function toSameOriginAbsolute(baseUrl, href) {
  try {
    const absolute = new URL(href, baseUrl);
    const base = new URL(baseUrl);
    if (absolute.origin !== base.origin) return null;
    return absolute.toString();
  } catch {
    return null;
  }
}

export async function scrapeListWithPlaywright({ pageUrl, maxItems = 15 }) {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: "unified-feed-mvp/0.1 (+github-actions)"
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const rawItems = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));

      return anchors
        .map((anchor) => {
          const href = (anchor.getAttribute("href") || "").trim();
          const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
          const score =
            (anchor.closest("article") ? 3 : 0) +
            (/\/\d{4}\/\d{2}\//.test(href) ? 1 : 0) +
            (text.length >= 20 && text.length <= 180 ? 1 : 0);

          return { href, title: text, score };
        })
        .filter((item) => item.href && item.title && item.score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 60);
    });

    const unique = [];
    const seen = new Set();

    for (const item of rawItems) {
      const absoluteUrl = toSameOriginAbsolute(pageUrl, item.href);
      if (!absoluteUrl) continue;
      if (seen.has(absoluteUrl)) continue;
      seen.add(absoluteUrl);
      unique.push({ url: absoluteUrl, title: item.title });
      if (unique.length >= maxItems) break;
    }

    return unique;
  } finally {
    await browser.close();
  }
}
