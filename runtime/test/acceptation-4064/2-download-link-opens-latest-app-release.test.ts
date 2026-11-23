// #4064, critère 2 : le lien de téléchargement ouvre la dernière release de l'app, pas une release de la station.
// Test d'acceptation gelé (#3725) : lecture de site/index.html et des workflows de publication (lecture seule).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const SITE = join(RACINE, "site");
const fichiers = readdirSync(SITE, { recursive: true, encoding: "utf8" }).filter((f) => /\.(html|txt|xml|js)$/.test(f));
const lire = (f: string) => readFileSync(join(SITE, f), "utf8");
const urlsDepot = (texte: string) => [...texte.matchAll(/https:\/\/github\.com\/benomite\/brigade[^\s"'<>)\]]*/g)].map((m) => m[0]);

// A URL that opens the latest app release: `releases/latest` (the station is never « latest ») or an app-v tag.
const VERS_L_APP = /^https:\/\/github\.com\/benomite\/brigade\/releases\/(?:latest|tag\/app-v\d+\.\d+\.\d+)$/;

test("every download link of the page and its downloadUrl open the latest app release", () => {
  const index = lire("index.html");
  const liens = [...index.matchAll(/<a[^>]*id="download-[^"]*"[^>]*href="([^"]*)"/g)].map((m) => m[1] ?? "");
  const structure = [...index.matchAll(/"downloadUrl":\s*"([^"]*)"/g)].map((m) => m[1] ?? "");
  assert.ok(liens.length >= 2);
  assert.ok(structure.length >= 1);
  for (const url of [...liens, ...structure]) assert.match(url, VERS_L_APP);
});

test("`releases/latest` really is the app: the station release is published as not latest", () => {
  const station = readFileSync(join(RACINE, ".github/workflows/publier-station.yml"), "utf8");
  assert.match(station, /--latest=false/);
  assert.doesNotMatch(lire("index.html"), /releases\/tag\/station/);
});
