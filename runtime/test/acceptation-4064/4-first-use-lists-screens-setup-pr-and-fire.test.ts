// #4064, critère 4 : la première utilisation, sur le site, suit les écrans de l'app dans l'ordre et cite la PR de mise en place et le label `fire` existant.
// Test d'acceptation gelé (#3725) : lecture de la section d'installation de site/index.html.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const SITE = join(RACINE, "site");
const fichiers = readdirSync(SITE, { recursive: true, encoding: "utf8" }).filter((f) => /\.(html|txt|xml|js)$/.test(f));
const lire = (f: string) => readFileSync(join(SITE, f), "utf8");
const urlsDepot = (texte: string) => [...texte.matchAll(/https:\/\/github\.com\/benomite\/brigade[^\s"'<>)\]]*/g)].map((m) => m[0]);

const index = lire("index.html");
const debut = index.search(/<h2>Install Brigade/);
const section = index.slice(debut, index.indexOf("</section>", debut)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the first-use steps follow the app's screens in order", () => {
  const ordre = [/GitHub/, /Claude/, /owner\/repo|repository/i, /station/i, /Start the kitchen/, /setup (pull request|PR)/i];
  let depuis = 0;
  for (const motif of ordre) {
    const reste = section.slice(depuis);
    const trouve = reste.search(motif);
    assert.ok(trouve >= 0, `${motif} comes after the previous screen`);
    depuis += trouve + 1;
  }
});

test("the setup PR comes before the newcomer's own issue, and the existing fire label is named", () => {
  const miseEnPlace = section.search(/setup (pull request|PR)/i);
  const sonTicket = section.search(/your (own )?(issue|ticket)|open an issue/i);
  assert.ok(miseEnPlace >= 0 && sonTicket > miseEnPlace);
  assert.match(section, /`?\bfire\b`?/);
  assert.match(section, /already exists|existing/i);
});
