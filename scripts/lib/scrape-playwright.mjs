import { chromium } from "playwright";

export async function scrapeListWithPlaywright({ pageUrl, maxItems = 15 }) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent: "UnifiedFeedBot/0.2 (+GitHub Actions)",
      viewport: { width: 1440, height: 1400 }
    });

    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(1800);

    const items = await page.evaluate((limit) => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const results = [];
      const seen = new Set();

      for (const anchor of anchors) {
        const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
        const href = anchor.href;
        if (!text || text.length < 20 || !href) continue;
        if (seen.has(href)) continue;

        const parent = anchor.closest("article, li, div, section") || anchor.parentElement;
        const image = parent?.querySelector("img")?.src || null;
        const summary = parent?.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() || null;
        const timeValue = parent?.querySelector("time")?.getAttribute("datetime") || null;

        seen.add(href);
        results.push({
          title: text,
          url: href,
          imageUrl: image,
          summary,
          publishedAt: timeValue
        });

        if (results.length >= limit) break;
      }

      return results;
    }, maxItems);

    return items;
  } finally {
    await browser.close();
  }
}
