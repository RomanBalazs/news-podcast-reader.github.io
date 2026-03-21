# Unified Feed MVP

GitHub Pages-re szánt alap projekt, ami:
- híroldalakat kezel RSS autodiscovery + feed probing + scraping fallback módban,
- YouTube csatornákat Atom feedből húz be,
- Spotify podcast epizódokat a Spotify Web API-val olvas be,
- a frontendben külön kezeli az aktív / olvasott / meghallgatott elemeket.

## Projekt felépítése

- `index.html` – a statikus felület
- `style.css` – a UI stílus
- `app.js` – kliensoldali logika és státuszkezelés
- `public/data/sources.json` – a forráslista
- `public/data/categories.json` – kategóriák és kulcsszavak
- `public/data/feed.json` – a generált feed
- `scripts/fetch-all.mjs` – a háttér-fetcher
- `.github/workflows/fetch.yml` – ütemezett feed frissítés
- `.github/workflows/pages.yml` – GitHub Pages deploy

## Indítás GitHub Pages-en

1. Töltsd fel a teljes projektet egy GitHub repóba.
2. A repo Settings → Pages résznél válaszd a **GitHub Actions** módot.
3. Pusholj a `main` branchre.
4. A `pages.yml` kirakja a statikus oldalt.
5. A `fetch.yml` 6 óránként frissíti a `public/data/feed.json` fájlt.

## Spotify beállítás

A repo Secrets közé add hozzá:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Ha ezek nincsenek megadva, a Spotify források nem frissülnek, de a többi forrás működik.

## Források szerkesztése

A `public/data/sources.json` fájlban tudsz új forrást felvenni.

### Típusok

#### 1. Általános híroldal
```json
{
  "id": "prohardver-tech",
  "type": "site",
  "name": "Prohardver Tech",
  "url": "https://prohardver.hu/tema/tech/index.html",
  "defaultCategory": "tech",
  "scrape": {
    "enabled": true,
    "maxItems": 15
  }
}
```

#### 2. Direkt RSS feed
```json
{
  "id": "rss-example",
  "type": "rss",
  "name": "RSS példa",
  "url": "https://example.com/feed.xml",
  "defaultCategory": "egyeb"
}
```

#### 3. YouTube csatorna
```json
{
  "id": "yt-example",
  "type": "youtube",
  "name": "YouTube példa",
  "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
  "defaultCategory": "gaming"
}
```

#### 4. Spotify podcast
```json
{
  "id": "spotify-example",
  "type": "spotify",
  "name": "Spotify példa",
  "showId": "38bS44xjbVVZ3No3ByF1dJ",
  "defaultCategory": "tech"
}
```

## Fontos korlátok

- Az olvasott / meghallgatott státusz jelenleg **localStorage** alapú.
- Ez azt jelenti, hogy eszközök között még nem szinkronizál.
- A scraping fallback törékenyebb, mint az RSS vagy API alapú behúzás.
- A GitHub Pages csak statikus host, ezért a valódi háttérlogikát a GitHub Actions workflow végzi.

## Következő érdemi fejlesztési kör

- forrás-felvételi admin felület,
- OPML import,
- részletes site-specifikus scraping profilok,
- jobb Spotify/YouTube metaadatok,
- több eszközös státusz-szinkron.
