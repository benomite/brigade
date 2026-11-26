import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Faux } from "../aides/fausse-vue.ts";
// @ts-ignore — the screen does not exist yet
import { ouvrirCardProject } from "../../src/vue/card-project/card-project.js";

// Contract used by the four acceptance tests of #4240: `ouvrirFicheProjet(doc, { lire, ecrire })` resolves to the root element of
// the screen. `lire(path)` and `ecrire(path, text)` read and write a file of the project, the path relative to its folder. Each of
// the eight items is a field with `dataset.item` = its key and a `value` (or text); the save button has `dataset.geste = "enregistrer"`.
const CARD = ".brigade/fiche-projet.json";
const CLES = ["work", "stages", "tools", "rules", "risks", "served", "recurring", "humans"];
const doc = { createElement: (balise: string) => new Faux(balise) };

function project(card?: unknown) {
  const dossier = mkdtempSync(join(tmpdir(), "fiche-projet-4240-"));
  if (card !== undefined) {
    mkdirSync(join(dossier, ".brigade"), { recursive: true });
    writeFileSync(join(dossier, CARD), JSON.stringify(card));
  }
  const ecritures: string[] = [];
  const lire = (chemin: string) => readFile(join(dossier, chemin), "utf8");
  const ecrire = async (chemin: string, texte: string) => {
    ecritures.push(chemin);
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    await writeFile(join(dossier, chemin), texte);
  };
  return { dossier, ecritures, ouvrir: () => ouvrirCardProject(doc, { lire, ecrire }) as Promise<Faux>, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) };
}

// All the text a screen shows: text of every element and value of every field.
function dit(element: Faux): string {
  return [element.textContent, element.value, ...element.children.map(dit)].join("\n");
}
const trouver = (element: Faux, accepte: (e: Faux) => boolean): Faux | undefined => (accepte(element) ? element : element.children.map((e) => trouver(e, accepte)).find((e) => e !== undefined));
const champ = (screen: Faux, cle: string) => trouver(screen, (e) => e.dataset.item === cle);
const enregistrer = (screen: Faux) => trouver(screen, (e) => e.dataset.geste === "enregistrer");
const repos = () => new Promise<void>((fait) => setImmediate(fait));

const CARD_PLEINE = {
  work: "an episode",
  stages: ["script", "storyboard", "voice", "render"],
  tools: ["the Labo Pop engine"],
  rules: ["every claim cites a source"],
  risks: ["publishing"],
  served: "the published episode",
  recurring: ["one episode a week"],
  humans: ["the chef, the voice-over"],
};

test("a project with no sheet: an empty state with a message, no error, nothing created", async () => {
  const p = project();
  try {
    const screen = await p.ouvrir();
    const texte = dit(screen).trim();
    assert.notEqual(texte, "", "the empty state says something");
    assert.doesNotMatch(texte, /error|failed|cannot|undefined|ENOENT/i);
    assert.deepEqual(p.ecritures, []);
    assert.throws(() => readFileSync(join(p.dossier, CARD)), { code: "ENOENT" });
  } finally {
    p.nettoyer();
  }
});
