const PROFILES = {
  auto: {
    id: "auto",
    label: "Automatikus",
    articleSelectors: ["article", "main article", "[data-testid='GridStoryCard']", "[class*='story']"],
    titleSelectors: ["h1 a", "h2 a", "h3 a", "a[title]", "a"],
    summarySelectors: ["p", "[class*='dek']", "[class*='description']"],
    imageSelectors: ["img"],
    timeSelectors: ["time"]
  },
  "generic-article-list": {
    id: "generic-article-list",
    label: "Generic article list",
    articleSelectors: ["article", "li", "section article", "div[class*='card']"],
    titleSelectors: ["h1 a", "h2 a", "h3 a", "a[title]", "a"],
    summarySelectors: ["p"],
    imageSelectors: ["img"],
    timeSelectors: ["time"]
  },
  theverge: {
    id: "theverge",
    label: "The Verge",
    articleSelectors: ["div[class*='duet--content-cards'] article", "article", "div[class*='c-entry-box']"],
    titleSelectors: ["h2 a", "h3 a", "a[data-chorus-optimize-field='hed']", "a"],
    summarySelectors: ["p", "div[class*='dek']"],
    imageSelectors: ["img"],
    timeSelectors: ["time"]
  },
  ign: {
    id: "ign",
    label: "IGN",
    articleSelectors: ["article", "div[class*='item-body']", "section article"],
    titleSelectors: ["h2 a", "h3 a", "a[data-testid='title-link']", "a"],
    summarySelectors: ["p", "div[class*='description']"],
    imageSelectors: ["img"],
    timeSelectors: ["time"]
  }
};

export function resolveScrapeProfile(source) {
  const explicitProfile = String(source?.scrape?.profile || "auto");
  if (PROFILES[explicitProfile]) return PROFILES[explicitProfile];

  const url = String(source?.url || "").toLowerCase();
  if (url.includes("theverge.com")) return PROFILES.theverge;
  if (url.includes("ign.com")) return PROFILES.ign;
  return PROFILES["generic-article-list"];
}

export function getScrapeProfiles() {
  return PROFILES;
}
