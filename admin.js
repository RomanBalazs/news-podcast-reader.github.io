const STORAGE_KEY = "unified_feed_admin_sources_v2";

const state = {
  categories: {},
  sources: [],
  selectedId: null,
  detection: null,
  filters: {
    query: "",
    type: "all"
  }
};

const el = {
  sourceList: document.getElementById("sourceList"),
  sourceForm: document.getElementById("sourceForm"),
  jsonPreview: document.getElementById("jsonPreview"),
  sourceSearch: document.getElementById("sourceSearch"),
  sourceTypeFilter: document.getElementById("sourceTypeFilter"),
  newSourceBtn: document.getElementById("newSourceBtn"),
  deleteSourceBtn: document.getElementById("deleteSourceBtn"),
  duplicateSourceBtn: document.getElementById("duplicateSourceBtn"),
  resetFormBtn: document.getElementById("resetFormBtn"),
  downloadSourcesBtn: document.getElementById("downloadSourcesBtn"),
  importFileInput: document.getElementById("importFileInput"),
  loadProjectSourcesBtn: document.getElementById("loadProjectSourcesBtn"),
  restoreDefaultsBtn: document.getElementById("restoreDefaultsBtn"),
  detectUrlInput: document.getElementById("detectUrlInput"),
  analyzeUrlBtn: document.getElementById("analyzeUrlBtn"),
  applyDetectionBtn: document.getElementById("applyDetectionBtn"),
  detectionStatus: document.getElementById("detectionStatus"),
  detectionSummary: document.getElementById("detectionSummary"),
  detectionPreview: document.getElementById("detectionPreview")
};

init().catch((error) => {
  console.error(error);
  alert("Nem sikerült betölteni a forráskezelőt.");
});

async function init() {
  bindEvents();

  const [categories, projectSources] = await Promise.all([
    fetchJson("./public/data/categories.json"),
    fetchJson("./public/data/sources.json")
  ]);

  state.categories = categories || {};
  populateCategorySelect();

  const localSources = loadLocalSources();
  state.sources = normalizeSources(localSources.length ? localSources : projectSources);
  state.selectedId = state.sources[0]?.id || null;

  render();
}

function bindEvents() {
  el.sourceSearch.addEventListener("input", () => {
    state.filters.query = el.sourceSearch.value.trim().toLowerCase();
    renderSourceList();
  });

  el.sourceTypeFilter.addEventListener("change", () => {
    state.filters.type = el.sourceTypeFilter.value;
    renderSourceList();
  });

  el.newSourceBtn.addEventListener("click", () => {
    const fresh = createEmptySource();
    state.sources.unshift(fresh);
    state.selectedId = fresh.id;
    persistLocalSources();
    render();
  });

  el.deleteSourceBtn.addEventListener("click", () => {
    if (!state.selectedId) return;
    state.sources = state.sources.filter((source) => source.id !== state.selectedId);
    state.selectedId = state.sources[0]?.id || null;
    persistLocalSources();
    render();
  });

  el.duplicateSourceBtn.addEventListener("click", () => {
    const current = getSelectedSource();
    if (!current) return;

    const copy = structuredClone(current);
    copy.id = `${copy.id}-copy`;
    copy.name = `${copy.name} másolat`;
    state.sources.unshift(copy);
    state.selectedId = copy.id;
    persistLocalSources();
    render();
  });

  el.resetFormBtn.addEventListener("click", () => {
    fillForm(getSelectedSource());
  });

  el.sourceForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(el.sourceForm);
    const previousId = state.selectedId;
    const source = mapFormToSource(formData);

    if (!source.id || !source.name) {
      alert("Az azonosító és a név kötelező.");
      return;
    }

    const index = state.sources.findIndex((entry) => entry.id === previousId);
    if (index >= 0) {
      state.sources[index] = source;
    } else {
      state.sources.unshift(source);
    }

    state.selectedId = source.id;
    state.sources = normalizeSources(state.sources);
    persistLocalSources();
    render();
  });

  el.downloadSourcesBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.sources, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sources.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  el.importFileInput.addEventListener("change", async () => {
    const file = el.importFileInput.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      state.sources = normalizeSources(parsed);
      state.selectedId = state.sources[0]?.id || null;
      persistLocalSources();
      render();
      el.importFileInput.value = "";
    } catch (error) {
      console.error(error);
      alert("Hibás JSON fájl.");
    }
  });

  el.loadProjectSourcesBtn.addEventListener("click", async () => {
    const projectSources = await fetchJson("./public/data/sources.json");
    state.sources = normalizeSources(projectSources);
    state.selectedId = state.sources[0]?.id || null;
    persistLocalSources();
    render();
  });

  el.restoreDefaultsBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  el.analyzeUrlBtn.addEventListener("click", analyzeCurrentUrl);
  el.detectUrlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      analyzeCurrentUrl();
    }
  });

  el.applyDetectionBtn.addEventListener("click", () => {
    if (!state.detection?.source) {
      alert("Nincs alkalmazható elemzési eredmény.");
      return;
    }
    applyDetectedSourceToForm(state.detection.source);
  });

  el.sourceForm.elements.type.addEventListener("change", updateTypeFieldVisibility);
}

async function analyzeCurrentUrl() {
  const raw = el.detectUrlInput.value.trim();
  if (!raw) {
    alert("Adj meg egy URL-t.");
    return;
  }

  setDetectionState({
    status: "Elemzés folyamatban",
    summary: "A link felismerése fut...",
    preview: []
  });

  try {
    const detection = await analyzeSourceUrl(raw);
    state.detection = detection;
    renderDetection();
  } catch (error) {
    console.error(error);
    setDetectionState({
      status: "Hiba",
      summary: "Nem sikerült elemezni a megadott URL-t.",
      preview: [{ label: "Hiba", value: error.message || "ismeretlen hiba" }]
    });
  }
}

async function analyzeSourceUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const parsed = new URL(url);

  const youtube = detectYouTubeSource(parsed);
  if (youtube) {
    return {
      kind: "youtube",
      source: youtube,
      status: "YouTube felismerve",
      summary: "A link YouTube forrásnak tűnik. A csatorna feedje lesz használva.",
      preview: [
        { label: "Típus", value: "youtube" },
        { label: "Channel ID", value: youtube.channelId || "nem kinyerhető" },
        { label: "Forrásnév", value: youtube.name }
      ]
    };
  }

  const spotify = detectSpotifySource(parsed);
  if (spotify) {
    return {
      kind: "spotify",
      source: spotify,
      status: "Spotify felismerve",
      summary: "A link Spotify show / episode forrásnak tűnik. A show epizódlistája lesz használva.",
      preview: [
        { label: "Típus", value: "spotify" },
        { label: "Show ID", value: spotify.showId || "nem kinyerhető" },
        { label: "Forrásnév", value: spotify.name }
      ]
    };
  }

  const generic = detectGenericUrl(parsed);
  const source = {
    id: slugify(parsed.hostname.replace(/^www\./, "")),
    type: generic.isFeed ? "rss" : "site",
    name: prettifyHost(parsed.hostname),
    url,
    feedUrl: generic.isFeed ? url : "",
    defaultCategory: generic.categoryHint,
    fetchStrategy: generic.isFeed ? "feed-first" : "auto",
    scrape: {
      enabled: !generic.isFeed,
      maxItems: 15,
      profile: suggestScrapeProfile(parsed.hostname)
    },
    notes: generic.note
  };

  const preview = [
    { label: "Típus", value: source.type },
    { label: "Host", value: parsed.hostname },
    { label: "Kategória tipp", value: source.defaultCategory || "nincs" },
    { label: "Scrape profil", value: source.scrape?.profile || "auto" },
    { label: "Megjegyzés", value: source.notes || "—" }
  ];

  const result = {
    kind: source.type,
    source,
    status: source.type === "rss" ? "Feed gyanús URL" : "Általános oldal",
    summary:
      source.type === "rss"
        ? "A link feed URL-nek tűnik. GitHub Pages alatt a részletes feed-előnézet csak akkor működik, ha a céloldal engedi a böngészős lekérést."
        : "A link általános oldalnak tűnik. Feed-first vagy scrape fallback módban lesz használva.",
    preview
  };

  if (source.type === "rss") {
    const feedPreview = await tryFeedPreview(url);
    if (feedPreview) {
      result.preview.push(...feedPreview);
      result.summary = "A link feed URL-nek tűnik, és sikerült belőle mintaelemeket is kiolvasni.";
      if (feedPreview.some((entry) => entry.label === "Feed cím")) {
        source.name = feedPreview.find((entry) => entry.label === "Feed cím")?.value || source.name;
      }
    }
  }

  return result;
}

function setDetectionState({ status, summary, preview }) {
  state.detection = {
    status,
    summary,
    preview,
    source: null
  };
  renderDetection();
}

function renderDetection() {
  const detection = state.detection;
  el.detectionPreview.innerHTML = "";

  if (!detection) {
    el.detectionStatus.textContent = "Nincs elemzés";
    el.detectionSummary.textContent = "Adj meg egy URL-t, majd futtasd az elemzést.";
    return;
  }

  el.detectionStatus.textContent = detection.status || "Kész";
  el.detectionSummary.textContent = detection.summary || "";

  for (const item of detection.preview || []) {
    const row = document.createElement("div");
    row.className = "preview-row";
    row.innerHTML = `
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.value)}</span>
    `;
    el.detectionPreview.appendChild(row);
  }
}

function applyDetectedSourceToForm(source) {
  const normalized = normalizeSources([source])[0];
  fillForm(normalized);
  state.selectedId = normalized.id;
}

async function tryFeedPreview(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) return null;

    const title = doc.querySelector("channel > title, feed > title")?.textContent?.trim() || "";
    const firstItemTitle = doc.querySelector("item > title, entry > title")?.textContent?.trim() || "";
    const firstItemLink = doc.querySelector("item > link, entry > link")?.textContent?.trim() || doc.querySelector("entry > link")?.getAttribute("href") || "";

    return [
      title ? { label: "Feed cím", value: title } : null,
      firstItemTitle ? { label: "Első elem", value: firstItemTitle } : null,
      firstItemLink ? { label: "Első elem link", value: firstItemLink } : null
    ].filter(Boolean);
  } catch {
    return null;
  }
}

function detectYouTubeSource(parsed) {
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!host.includes("youtube.com") && host !== "youtu.be") return null;

  let channelId = "";
  let name = "YouTube forrás";
  let url = parsed.toString();

  if (parsed.searchParams.get("channel_id")) {
    channelId = parsed.searchParams.get("channel_id") || "";
  }

  if (!channelId) {
    const match = parsed.pathname.match(/\/channel\/([^/]+)/i);
    if (match) channelId = match[1];
  }

  if (!channelId && parsed.pathname.startsWith("/feeds/videos.xml")) {
    channelId = parsed.searchParams.get("channel_id") || "";
  }

  if (parsed.pathname.startsWith("/@")) {
    name = parsed.pathname.replace(/^\//, "");
  } else if (parsed.pathname.startsWith("/c/") || parsed.pathname.startsWith("/user/")) {
    name = parsed.pathname.split("/").filter(Boolean).slice(1).join(" ") || name;
  } else if (channelId) {
    name = `YouTube ${channelId}`;
  }

  if (!channelId) {
    return {
      id: slugify(name || "youtube-forras"),
      type: "youtube",
      name,
      channelId: "",
      notes: "YouTube link felismerve, de channel ID kézi megadása kellhet."
    };
  }

  return {
    id: slugify(name || channelId),
    type: "youtube",
    name,
    channelId,
    notes: `YouTube forrás: ${url}`
  };
}

function detectSpotifySource(parsed) {
  const host = parsed.hostname.replace(/^open\./, "").replace(/^www\./, "").toLowerCase();
  if (!host.includes("spotify.com")) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  const type = parts[0] || "";
  const id = parts[1] || "";

  if (type === "show" && id) {
    return {
      id: slugify(`spotify-${id}`),
      type: "spotify",
      name: `Spotify show ${id}`,
      showId: id,
      notes: `Spotify show: ${parsed.toString()}`
    };
  }

  if (type === "episode" && id) {
    return {
      id: slugify(`spotify-${id}`),
      type: "spotify",
      name: `Spotify episode ${id}`,
      showId: "",
      notes: "Spotify episode link felismerve. Ha lehet, inkább a show linket add meg az epizódlista miatt."
    };
  }

  return {
    id: "spotify-forras",
    type: "spotify",
    name: "Spotify forrás",
    showId: "",
    notes: "Spotify link felismerve, de a show ID kézi megadása kellhet."
  };
}

function detectGenericUrl(parsed) {
  const pathname = parsed.pathname.toLowerCase();
  const isFeed = looksLikeFeedUrl(pathname);
  const categoryHint = guessCategoryFromUrl(parsed.toString());
  return {
    isFeed,
    categoryHint,
    note: isFeed
      ? "Valószínű közvetlen feed URL."
      : "Általános weboldal. A fetcher feed autodiscovery + scrape fallback módban fogja kezelni."
  };
}

function looksLikeFeedUrl(pathname) {
  return ["/feed", "/rss", ".xml", "/atom", "/index.xml"].some((token) => pathname.includes(token));
}

function guessCategoryFromUrl(value) {
  const input = value.toLowerCase();
  if (["game", "gaming", "xbox", "playstation", "nintendo", "steam"].some((keyword) => input.includes(keyword))) return "gaming";
  if (["tech", "ai", "android", "apple", "chip", "gpu", "cpu"].some((keyword) => input.includes(keyword))) return "tech";
  if (["politika", "parlament", "election", "government", "politics"].some((keyword) => input.includes(keyword))) return "politika";
  if (["anime", "manga", "otaku"].some((keyword) => input.includes(keyword))) return "anime";
  return "";
}

function suggestScrapeProfile(hostname) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  if (host.includes("theverge.com")) return "theverge";
  if (host.includes("ign.com")) return "ign";
  return "generic-article-list";
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}

function populateCategorySelect() {
  const select = el.sourceForm.elements.defaultCategory;
  for (const [id, cfg] of Object.entries(state.categories)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = cfg.label || id;
    select.appendChild(option);
  }
}

function createEmptySource() {
  const stamp = Date.now();
  return {
    id: `uj-forras-${stamp}`,
    type: "site",
    name: "Új forrás",
    url: "",
    feedUrl: "",
    defaultCategory: "",
    fetchStrategy: "auto",
    scrape: {
      enabled: true,
      maxItems: 15,
      profile: "auto"
    },
    notes: ""
  };
}

function normalizeSources(input) {
  const array = Array.isArray(input) ? input : [];
  return array.map((item, index) => ({
    id: String(item.id || `forras-${index + 1}`),
    type: ["site", "rss", "youtube", "spotify"].includes(item.type) ? item.type : "site",
    name: String(item.name || item.id || `Forrás ${index + 1}`),
    url: item.url ? String(item.url) : "",
    feedUrl: item.feedUrl ? String(item.feedUrl) : "",
    channelId: item.channelId ? String(item.channelId) : "",
    showId: item.showId ? String(item.showId) : "",
    defaultCategory: item.defaultCategory ? String(item.defaultCategory) : "",
    fetchStrategy: ["auto", "feed-first", "scrape-only"].includes(item.fetchStrategy) ? item.fetchStrategy : "auto",
    scrape: {
      enabled: item.scrape?.enabled !== false,
      maxItems: Math.max(1, Number(item.scrape?.maxItems || 15)),
      profile: String(item.scrape?.profile || "auto")
    },
    notes: item.notes ? String(item.notes) : ""
  }));
}

function render() {
  renderSourceList();
  fillForm(getSelectedSource());
  renderJsonPreview();
  renderDetection();
}

function renderSourceList() {
  el.sourceList.innerHTML = "";

  const filtered = state.sources.filter((source) => {
    if (state.filters.type !== "all" && source.type !== state.filters.type) return false;
    if (state.filters.query) {
      const haystack = `${source.name} ${source.id} ${source.type} ${source.defaultCategory}`.toLowerCase();
      if (!haystack.includes(state.filters.query)) return false;
    }
    return true;
  });

  for (const source of filtered) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `source-list-item ${source.id === state.selectedId ? "active" : ""}`;
    item.innerHTML = `
      <h3>${escapeHtml(source.name)}</h3>
      <div class="muted">${escapeHtml(source.id)}</div>
      <div class="muted">${escapeHtml(source.type)} · ${escapeHtml(source.defaultCategory || "nincs kategória")}</div>
      <div class="muted small-text">${escapeHtml(source.feedUrl || source.url || source.channelId || source.showId || "")}</div>
    `;
    item.addEventListener("click", () => {
      state.selectedId = source.id;
      render();
    });
    el.sourceList.appendChild(item);
  }
}

function getSelectedSource() {
  return state.sources.find((source) => source.id === state.selectedId) || createEmptySource();
}

function fillForm(source) {
  el.sourceForm.elements.id.value = source.id || "";
  el.sourceForm.elements.name.value = source.name || "";
  el.sourceForm.elements.type.value = source.type || "site";
  el.sourceForm.elements.defaultCategory.value = source.defaultCategory || "";
  el.sourceForm.elements.url.value = source.url || "";
  el.sourceForm.elements.channelId.value = source.channelId || "";
  el.sourceForm.elements.showId.value = source.showId || "";
  el.sourceForm.elements.feedUrl.value = source.feedUrl || "";
  el.sourceForm.elements.scrapeEnabled.value = String(source.scrape?.enabled !== false);
  el.sourceForm.elements.scrapeMaxItems.value = String(source.scrape?.maxItems || 15);
  el.sourceForm.elements.scrapeProfile.value = source.scrape?.profile || "auto";
  el.sourceForm.elements.fetchStrategy.value = source.fetchStrategy || "auto";
  el.sourceForm.elements.notes.value = source.notes || "";
  updateTypeFieldVisibility();
}

function updateTypeFieldVisibility() {
  const type = el.sourceForm.elements.type.value;
  document.querySelector(".field-url")?.classList.toggle("hidden", type === "youtube" || type === "spotify");
  document.querySelector(".field-feedUrl")?.classList.toggle("hidden", type === "youtube" || type === "spotify");
  document.querySelector(".field-channel")?.classList.toggle("hidden", type !== "youtube");
  document.querySelector(".field-show")?.classList.toggle("hidden", type !== "spotify");
}

function mapFormToSource(formData) {
  const type = String(formData.get("type") || "site");
  const base = {
    id: String(formData.get("id") || "").trim(),
    type,
    name: String(formData.get("name") || "").trim(),
    defaultCategory: String(formData.get("defaultCategory") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    fetchStrategy: String(formData.get("fetchStrategy") || "auto").trim()
  };

  if (type === "youtube") {
    return {
      ...base,
      channelId: String(formData.get("channelId") || "").trim(),
      scrape: {
        enabled: false,
        maxItems: 0,
        profile: "auto"
      }
    };
  }

  if (type === "spotify") {
    return {
      ...base,
      showId: String(formData.get("showId") || "").trim(),
      scrape: {
        enabled: false,
        maxItems: 0,
        profile: "auto"
      }
    };
  }

  return {
    ...base,
    url: String(formData.get("url") || "").trim(),
    feedUrl: String(formData.get("feedUrl") || "").trim(),
    scrape: {
      enabled: String(formData.get("scrapeEnabled")) === "true",
      maxItems: Number(formData.get("scrapeMaxItems") || 15),
      profile: String(formData.get("scrapeProfile") || "auto")
    }
  };
}

function renderJsonPreview() {
  el.jsonPreview.textContent = JSON.stringify(state.sources, null, 2);
}

function persistLocalSources() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sources));
}

function loadLocalSources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function normalizeUrl(value) {
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}

function slugify(value) {
  return String(value || "forras")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "forras";
}

function prettifyHost(hostname) {
  return hostname.replace(/^www\./, "").replace(/\.[a-z]{2,}$/i, "").replace(/[.-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
