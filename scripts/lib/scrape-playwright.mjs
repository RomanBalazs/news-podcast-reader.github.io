import { chromium } from "playwright";

export async function scrapeListWithPlaywright({ pageUrl, maxItems = 15, profile }) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent: "UnifiedFeedBot/0.3 (+GitHub Actions)",
      viewport: { width: 1440, height: 1400 }
    });

    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(1800);

    const items = await page.evaluate(
      ({ limit, profileConfig }) => {
        function textOf(element) {
          return (element?.textContent || "").replace(/\s+/g, " ").trim();
        }

        function pick(root, selectors) {
          for (const selector of selectors || []) {
            const found = root.querySelector(selector);
            if (found) return found;
          }
          return null;
        }

        function absoluteUrl(value) {
          try {
            return new URL(value, location.href).toString();
          } catch {
            return "";
          }
        }

        const containers = [];
        const seenContainers = new Set();
        for (const selector of profileConfig.articleSelectors || []) {
          for (const node of document.querySelectorAll(selector)) {
            if (seenContainers.has(node)) continue;
            seenContainers.add(node);
            containers.push(node);
          }
        }

        const results = [];
        const seenLinks = new Set();

        for (const container of containers) {
          const titleNode = pick(container, profileConfig.titleSelectors);
          const linkNode = titleNode?.closest("a[href]") || container.querySelector("a[href]");
          const title = textOf(titleNode) || textOf(linkNode);
          const href = absoluteUrl(linkNode?.getAttribute("href") || "");

          if (!title || title.length < 10 || !href || seenLinks.has(href)) continue;

          const summaryNode = pick(container, profileConfig.summarySelectors);
          const imageNode = pick(container, profileConfig.imageSelectors);
          const timeNode = pick(container, profileConfig.timeSelectors);

          seenLinks.add(href);
          results.push({
            title,
            url: href,
            imageUrl: imageNode?.src || imageNode?.getAttribute("src") || imageNode?.getAttribute("data-src") || null,
            summary: textOf(summaryNode) || null,
            publishedAt: timeNode?.getAttribute("datetime") || textOf(timeNode) || null
          });

          if (results.length >= limit) break;
        }

        if (results.length) return results;

        const fallbackAnchors = Array.from(document.querySelectorAll("a[href]"));
        for (const anchor of fallbackAnchors) {
          const text = textOf(anchor);
          const href = absoluteUrl(anchor.getAttribute("href") || "");
          if (!text || text.length < 20 || !href || seenLinks.has(href)) continue;

          const parent = anchor.closest("article, li, div, section") || anchor.parentElement;
          const summaryNode = parent?.querySelector("p");
          const imageNode = parent?.querySelector("img");
          const timeNode = parent?.querySelector("time");

          seenLinks.add(href);
          results.push({
            title: text,
            url: href,
            imageUrl: imageNode?.src || imageNode?.getAttribute("src") || null,
            summary: textOf(summaryNode) || null,
            publishedAt: timeNode?.getAttribute("datetime") || null
          });

          if (results.length >= limit) break;
        }

        return results;
      },
      { limit: maxItems, profileConfig: profile }
    );

    return items;
  } finally {
    await browser.close();
  }
}
