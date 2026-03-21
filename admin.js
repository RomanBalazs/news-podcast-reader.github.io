const STORAGE_KEY = "unified_feed_admin_sources_v1";

const state = {
  categories: {},
  sources: [],
  selectedId: null,
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
  restoreDefaultsBtn: document.getElementById("restoreDefaultsBtn")
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

    const copy = JSON.parse(JSON.stringify(current));
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

  el.sourceForm.elements.type.addEventListener("change", updateTypeFieldVisibility);
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
    defaultCategory: "",
    scrape: {
      enabled: true,
      maxItems: 15
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
    channelId: item.channelId ? String(item.channelId) : "",
    showId: item.showId ? String(item.showId) : "",
    defaultCategory: item.defaultCategory ? String(item.defaultCategory) : "",
    scrape: {
      enabled: item.scrape?.enabled !== false,
      maxItems: Number(item.scrape?.maxItems || 15)
    },
    notes: item.notes ? String(item.notes) : ""
  }));
}

function render() {
  renderSourceList();
  fillForm(getSelectedSource());
  renderJsonPreview();
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
  el.sourceForm.elements.scrapeEnabled.value = String(source.scrape?.enabled !== false);
  el.sourceForm.elements.scrapeMaxItems.value = String(source.scrape?.maxItems || 15);
  el.sourceForm.elements.notes.value = source.notes || "";
  updateTypeFieldVisibility();
}

function updateTypeFieldVisibility() {
  const type = el.sourceForm.elements.type.value;
  document.querySelector(".field-url")?.classList.toggle("hidden", type === "youtube" || type === "spotify");
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
    notes: String(formData.get("notes") || "").trim()
  };

  if (type === "youtube") {
    return {
      ...base,
      channelId: String(formData.get("channelId") || "").trim(),
      scrape: {
        enabled: false,
        maxItems: 0
      }
    };
  }

  if (type === "spotify") {
    return {
      ...base,
      showId: String(formData.get("showId") || "").trim(),
      scrape: {
        enabled: false,
        maxItems: 0
      }
    };
  }

  return {
    ...base,
    url: String(formData.get("url") || "").trim(),
    scrape: {
      enabled: String(formData.get("scrapeEnabled")) === "true",
      maxItems: Number(formData.get("scrapeMaxItems") || 15)
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
