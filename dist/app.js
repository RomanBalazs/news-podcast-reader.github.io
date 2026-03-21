const STATUS_KEY = "unified_feed_status_v2";

const state = {
  feed: { generatedAt: null, items: [] },
  categories: {},
  filters: {
    tab: "active",
    category: "all",
    type: "all",
    query: ""
  },
  status: loadStatus()
};

const el = {
  generatedAt: document.getElementById("generatedAt"),
  categoryFilter: document.getElementById("categoryFilter"),
  typeFilter: document.getElementById("typeFilter"),
  searchInput: document.getElementById("searchInput"),
  feedList: document.getElementById("feedList"),
  emptyState: document.getElementById("emptyState"),
  activeCount: document.getElementById("activeCount"),
  readCount: document.getElementById("readCount"),
  listenedCount: document.getElementById("listenedCount"),
  tabs: document.getElementById("tabs"),
  itemTemplate: document.getElementById("itemTemplate")
};

init().catch((error) => {
  console.error(error);
  el.emptyState.classList.remove("hidden");
  el.emptyState.textContent = "Nem sikerült betölteni a feedet.";
});

async function init() {
  bindEvents();

  const [feed, categories] = await Promise.all([
    fetchJson("./public/data/feed.json"),
    fetchJson("./public/data/categories.json")
  ]);

  state.feed = normalizeFeed(feed);
  state.categories = categories || {};

  populateCategoryFilter();
  render();
}

function normalizeFeed(feed) {
  return {
    generatedAt: feed?.generatedAt || null,
    items: Array.isArray(feed?.items) ? feed.items : []
  };
}

function bindEvents() {
  el.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (!button) return;
    state.filters.tab = button.dataset.tab;
    for (const btn of el.tabs.querySelectorAll("button")) {
      btn.classList.toggle("active", btn === button);
    }
    render();
  });

  el.categoryFilter.addEventListener("change", () => {
    state.filters.category = el.categoryFilter.value;
    render();
  });

  el.typeFilter.addEventListener("change", () => {
    state.filters.type = el.typeFilter.value;
    render();
  });

  el.searchInput.addEventListener("input", () => {
    state.filters.query = el.searchInput.value.trim().toLowerCase();
    render();
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`);
  }
  return response.json();
}

function populateCategoryFilter() {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createOption("all", "Összes"));

  for (const [id, cfg] of Object.entries(state.categories)) {
    fragment.appendChild(createOption(id, cfg.label || id));
  }

  el.categoryFilter.innerHTML = "";
  el.categoryFilter.appendChild(fragment);
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function render() {
  renderHeader();
  renderStats();
  renderList();
}

function renderHeader() {
  el.generatedAt.textContent = formatDateTime(state.feed.generatedAt);
}

function renderStats() {
  const stats = state.feed.items.reduce(
    (acc, item) => {
      const status = getItemStatus(item);
      if (status === "active") acc.active += 1;
      if (status === "read") acc.read += 1;
      if (status === "listened") acc.listened += 1;
      return acc;
    },
    { active: 0, read: 0, listened: 0 }
  );

  el.activeCount.textContent = String(stats.active);
  el.readCount.textContent = String(stats.read);
  el.listenedCount.textContent = String(stats.listened);
}

function renderList() {
  const items = getFilteredItems();
  el.feedList.innerHTML = "";

  if (!items.length) {
    el.emptyState.classList.remove("hidden");
    return;
  }

  el.emptyState.classList.add("hidden");

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    fragment.appendChild(renderItem(item));
  }
  el.feedList.appendChild(fragment);
}

function getFilteredItems() {
  return [...state.feed.items]
    .filter((item) => {
      const status = getItemStatus(item);
      if (status !== state.filters.tab) return false;
      if (state.filters.category !== "all" && (item.category || "egyeb") !== state.filters.category) return false;
      if (state.filters.type !== "all" && item.type !== state.filters.type) return false;

      if (state.filters.query) {
        const haystack = `${item.title} ${item.sourceName} ${item.category || ""}`.toLowerCase();
        if (!haystack.includes(state.filters.query)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return timeB - timeA;
    });
}

function renderItem(item) {
  const node = el.itemTemplate.content.firstElementChild.cloneNode(true);
  const meta = node.querySelector(".feed-item__meta");
  const title = node.querySelector(".feed-item__title");
  const summary = node.querySelector(".feed-item__summary");
  const actions = node.querySelector(".feed-item__actions");
  const player = node.querySelector(".feed-item__player");
  const image = node.querySelector(".feed-item__image");

  const itemStatus = getItemStatus(item);
  const categoryLabel = state.categories[item.category]?.label || item.category || "egyéb";

  meta.innerHTML = [
    badgeLabel(item.type),
    `<span class="badge badge--source">${escapeHtml(item.sourceName)}</span>`,
    `<span class="badge badge--source">${escapeHtml(categoryLabel)}</span>`,
    `<span>${escapeHtml(formatDateTime(item.publishedAt))}</span>`,
    itemStatus !== "active" ? badgeDone(itemStatus) : ""
  ]
    .filter(Boolean)
    .join(" ");

  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = item.title || "(nincs cím)";
  title.appendChild(link);

  if (item.summary) {
    summary.textContent = item.summary;
    summary.classList.remove("hidden");
  }

  if (item.imageUrl) {
    image.src = item.imageUrl;
    image.alt = item.title || "borítókép";
    image.classList.remove("hidden");
  }

  const openButton = document.createElement("a");
  openButton.href = item.url;
  openButton.target = "_blank";
  openButton.rel = "noreferrer";
  openButton.className = "button-link ghost";
  openButton.textContent = "Megnyitás";
  actions.appendChild(openButton);

  actions.appendChild(createStatusButton(item));

  if (hasPlayableEmbed(item)) {
    actions.appendChild(createPlayerButton(item, player));
  }

  return node;
}

function createStatusButton(item) {
  const button = document.createElement("button");
  const status = getItemStatus(item);

  if (item.type === "article") {
    button.textContent = status === "read" ? "Vissza aktívba" : "Olvasottnak jelöl";
    button.addEventListener("click", () => {
      if (getItemStatus(item) === "read") {
        delete state.status.read[item.id];
      } else {
        state.status.read[item.id] = new Date().toISOString();
      }
      persistStatus();
      render();
    });
    return button;
  }

  button.textContent = status === "listened" ? "Vissza aktívba" : "Meghallgatottnak jelöl";
  button.addEventListener("click", () => {
    if (getItemStatus(item) === "listened") {
      delete state.status.listened[item.id];
    } else {
      state.status.listened[item.id] = new Date().toISOString();
    }
    persistStatus();
    render();
  });

  return button;
}

function createPlayerButton(item, playerContainer) {
  const button = document.createElement("button");
  button.textContent = "Lejátszás";

  let visible = false;
  button.addEventListener("click", () => {
    visible = !visible;
    button.textContent = visible ? "Lejátszó elrejt" : "Lejátszás";

    if (!visible) {
      playerContainer.classList.add("hidden");
      playerContainer.innerHTML = "";
      return;
    }

    playerContainer.innerHTML = "";
    playerContainer.classList.remove("hidden");
    playerContainer.appendChild(buildPlayer(item));
  });

  return button;
}

function buildPlayer(item) {
  if (item.type === "video" && item.youtubeVideoId) {
    const wrap = document.createElement("div");
    wrap.className = "embed-wrap";

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${item.youtubeVideoId}`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.title = item.title || "YouTube videó";
    wrap.appendChild(iframe);
    return wrap;
  }

  if (item.type === "podcast" && item.spotifyEpisodeId) {
    const iframe = document.createElement("iframe");
    iframe.className = "spotify-embed";
    iframe.src = `https://open.spotify.com/embed/episode/${item.spotifyEpisodeId}`;
    iframe.title = item.title || "Spotify epizód";
    iframe.loading = "lazy";
    iframe.allow = "encrypted-media";
    return iframe;
  }

  const fallback = document.createElement("a");
  fallback.href = item.url;
  fallback.target = "_blank";
  fallback.rel = "noreferrer";
  fallback.textContent = "Megnyitás új lapon";
  return fallback;
}

function hasPlayableEmbed(item) {
  return (item.type === "video" && item.youtubeVideoId) || (item.type === "podcast" && item.spotifyEpisodeId);
}

function getItemStatus(item) {
  if (item.type === "article") {
    return state.status.read[item.id] ? "read" : "active";
  }
  return state.status.listened[item.id] ? "listened" : "active";
}

function loadStatus() {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return { read: {}, listened: {} };
    const parsed = JSON.parse(raw);
    return {
      read: parsed.read || {},
      listened: parsed.listened || {}
    };
  } catch {
    return { read: {}, listened: {} };
  }
}

function persistStatus() {
  localStorage.setItem(STATUS_KEY, JSON.stringify(state.status));
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function badgeLabel(type) {
  if (type === "article") return '<span class="badge badge--article">Cikk</span>';
  if (type === "video") return '<span class="badge badge--video">Videó</span>';
  return '<span class="badge badge--podcast">Podcast</span>';
}

function badgeDone(status) {
  const text = status === "read" ? "Olvasott" : "Meghallgatott";
  return `<span class="badge badge--done">${text}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
