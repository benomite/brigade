import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Faux } from "../aides/fausse-vue.ts";
// @ts-ignore — the screen does not exist yet
import { ouvrirFicheProjet } from "../../src/vue/fiche-projet/fiche-projet.js";

// Contract used by the four acceptance tests of #4240: `ouvrirFicheProjet(doc, { lire, ecrire })` resolves to the root element of
// the screen. `lire(path)` and `ecrire(path, text)` read and write a file of the project, the path relative to its folder. Each of
// the eight items is a field with `dataset.item` = its key and a `value` (or text); the save button has `dataset.geste = "enregistrer"`.
const FICHE = ".brigade/fiche-projet.json";
const CLES = ["work", "stages", "tools", "rules", "risks", "served", "recurring", "humans"];
const doc = { createElement: (balise: string) => new Faux(balise) };

function projet(fiche?: unknown) {
  const dossier = mkdtempSync(join(tmpdir(), "fiche-projet-4240-"));
  if (fiche !== undefined) {
    mkdirSync(join(dossier, ".brigade"), { recursive: true });
    writeFileSync(join(dossier, FICHE), JSON.stringify(fiche));
  }
  const ecritures: string[] = [];
  const lire = (chemin: string) => readFile(join(dossier, chemin), "utf8");
  const ecrire = async (chemin: string, texte: string) => {
    ecritures.push(chemin);
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    await writeFile(join(dossier, chemin), texte);
  };
  return { dossier, ecritures, ouvrir: () => ouvrirFicheProjet(doc, { lire, ecrire }) as Promise<Faux>, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) };
}

// All the text a screen shows: text of every element and value of every field.
function dit(element: Faux): string {
  return [element.textContent, element.value, ...element.children.map(dit)].join("\n");
}
const trouver = (element: Faux, accepte: (e: Faux) => boolean): Faux | undefined => (accepte(element) ? element : element.children.map((e) => trouver(e, accepte)).find((e) => e !== undefined));
const champ = (ecran: Faux, cle: string) => trouver(ecran, (e) => e.dataset.item === cle);
const enregistrer = (ecran: Faux) => trouver(ecran, (e) => e.dataset.geste === "enregistrer");
const repos = () => new Promise<void>((fait) => setImmediate(fait));

const FICHE_PLEINE = {
  work: "an episode",
  stages: ["script", "storyboard", "voice", "render"],
  tools: ["the Labo Pop engine"],
  rules: ["every claim cites a source"],
  risks: ["publishing"],
  served: "the published episode",
  recurring: ["one episode a week"],
  humans: ["the chef, the voice-over"],
};

test("edit one item and save: the file holds the new value, and the screen shows it after a reload", async () => {
  const p = projet(FICHE_PLEINE);
  try {
    const ecran = await p.ouvrir();
    champ(ecran, "work")!.value = "a podcast";
    enregistrer(ecran)!.click();
    // The save is disabled while the file is written: wait for it to come back rather than a fixed number of turns,
    // which a loaded CI runner can outlast (#4309 send-back).
    for (let tours = 0; enregistrer(ecran)!.disabled && tours < 1000; tours++) await repos();
    assert.equal(enregistrer(ecran)!.disabled, false, "the save ends");
    const fichier = JSON.parse(readFileSync(join(p.dossier, FICHE), "utf8"));
    assert.equal(fichier.work, "a podcast");
    assert.equal(fichier.served, FICHE_PLEINE.served);
    assert.deepEqual(Object.keys(fichier).sort(), [...CLES].sort());
    const rouvert = await p.ouvrir();
    assert.ok(dit(rouvert).includes("a podcast"));
    assert.ok(!dit(rouvert).includes("an episode"));
  } finally {
    p.nettoyer();
  }
});
