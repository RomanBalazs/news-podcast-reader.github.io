import fs from "node:fs/promises";

const mustExist = [
  "index.html",
  "admin.html",
  "style.css",
  "app.js",
  "admin.js",
  "public/data/feed.json",
  "public/data/sources.json",
  "public/data/categories.json",
  "scripts/fetch-all.mjs",
  ".github/workflows/fetch.yml",
  ".github/workflows/pages.yml"
];

for (const file of mustExist) {
  await fs.access(file);
}

JSON.parse(await fs.readFile("public/data/feed.json", "utf8"));
JSON.parse(await fs.readFile("public/data/sources.json", "utf8"));
JSON.parse(await fs.readFile("public/data/categories.json", "utf8"));

console.log("Projekt szerkezete rendben van.");
