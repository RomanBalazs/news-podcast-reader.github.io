# Unified Feed MVP

Ez a projekt egy GitHub Pages-re szánt, statikus hírolvasó / podcast / YouTube aggregátor alap.

## Mit tud most

- híroldalak kezelése `site` vagy direkt `rss` forrásként,
- RSS autodiscovery és tipikus feed URL próbálgatás,
- scraping fallback Playwrighttal, ha nincs feed,
- YouTube csatorna feed beolvasás channel ID alapján,
- Spotify podcast epizódok beolvasása show ID alapján,
- kategóriázott feed,
- aktív / olvasott / meghallgatott nézet,
- külön `admin.html` oldal a forráslista szerkesztéséhez,
- GitHub Actions alapú feed frissítés és Pages deploy.

## Fontos működési modell

Mivel a GitHub Pages statikus tárhely:

- az oldal **nem futtat szerveroldali kódot**,
- a forrásbeolvasást a GitHub Actions végzi,
- a generált eredmény a `public/data/feed.json` fájlba kerül,
- az admin felület **helyben** segít szerkeszteni a `sources.json` tartalmát, amit le kell tölteni és visszatenni a repóba.

## Fájlstruktúra

- `index.html` – fő feed felület
- `admin.html` – forráskezelő UI
- `style.css` – közös UI stílus
- `app.js` – feed logika és státuszkezelés
- `admin.js` – forráskezelő logika
- `public/data/sources.json` – források
- `public/data/categories.json` – kategóriák + kulcsszavak
- `public/data/feed.json` – generált feed állomány
- `scripts/fetch-all.mjs` – feed generátor
- `scripts/lib/*` – segédmodulok
- `.github/workflows/fetch.yml` – időzített adatfrissítés
- `.github/workflows/pages.yml` – Pages deploy

## Telepítés

```bash
npm install
npm run validate
npm run fetch
```

## GitHub Pages beállítás

1. töltsd fel a teljes projektet GitHub repóba,
2. Settings → Pages alatt válaszd a **GitHub Actions** módot,
3. pusholj a `main` branchre,
4. a `pages.yml` automatikusan publikálja,
5. a `fetch.yml` időzítve frissíti a `public/data/feed.json` fájlt.

## Spotify secret-ek

A repo Secrets / Variables → Actions résznél add hozzá:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Ha ezek hiányoznak, a Spotify források egyszerűen kimaradnak a frissítésből.

## Forrás típusok

### site
Általános híroldal. Először feedet keres, utána scrape fallback.

### rss
Fix feed URL.

### youtube
YouTube channel ID kell hozzá.

### spotify
Spotify show ID kell hozzá.

## Következő logikus fejlesztési kör

- több site-specifikus scraper profil,
- OPML / feed lista import,
- feed elemek kép- és metaadat kezelésének bővítése,
- státuszok szinkronizálása GitHub Gist vagy külső backend felé,
- olvasási nézet és beépített reader mód.
