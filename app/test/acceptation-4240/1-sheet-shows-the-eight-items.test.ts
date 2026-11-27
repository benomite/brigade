import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Fake } from "../helpers/false-vue.ts";
// @ts-ignore — the screen does not exist yet
import { openCardProject } from "../../src/vue/card-project/card-project.js";

// Contract used by the four acceptance tests of #4240: `ouvrirFicheProjet(doc, { lire, ecrire })` resolves to the root element of
// the screen. `lire(path)` and `ecrire(path, text)` read and write a file of the project, the path relative to its folder. Each of
// the eight items is a field with `dataset.item` = its key and a `value` (or text); the save button has `dataset.geste = "enregistrer"`.
const CARD = ".brigade/fiche-projet.json";
const KEYS = ["work", "stages", "tools", "rules", "risks", "served", "recurring", "humans"];
const doc = { createElement: (balise: string) => new Fake(balise) };

function project(card?: unknown) {
  const folder = mkdtempSync(join(tmpdir(), "fiche-projet-4240-"));
  if (card !== undefined) {
    mkdirSync(join(folder, ".brigade"), { recursive: true });
    writeFileSync(join(folder, CARD), JSON.stringify(card));
  }
  const writes: string[] = [];
  const read = (path: string) => readFile(join(folder, path), "utf8");
  const write = async (path: string, text: string) => {
    writes.push(path);
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  };
  return { dossier: folder, ecritures: writes, ouvrir: () => openCardProject(doc, { lire: read, ecrire: write }) as Promise<Fake>, nettoyer: () => rmSync(folder, { recursive: true, force: true }) };
}

// All the text a screen shows: text of every element and value of every field.
function said(element: Fake): string {
  return [element.textContent, element.value, ...element.children.map(said)].join("\n");
}
const find = (element: Fake, accepts: (e: Fake) => boolean): Fake | undefined => (accepts(element) ? element : element.children.map((e) => find(e, accepts)).find((e) => e !== undefined));
const field = (screen: Fake, key: string) => find(screen, (e) => e.dataset.item === key);
const record = (screen: Fake) => find(screen, (e) => e.dataset.geste === "enregistrer");
const repos = () => new Promise<void>((done) => setImmediate(done));

const CARD_FULL = {
  work: "an episode",
  stages: ["script", "storyboard", "voice", "render"],
  tools: ["the Labo Pop engine"],
  rules: ["every claim cites a source"],
  risks: ["publishing"],
  served: "the published episode",
  recurring: ["one episode a week"],
  humans: ["the chef, the voice-over"],
};

test("a project with a sheet: the screen shows the eight items with their values", async () => {
  const p = project(CARD_FULL);
  try {
    const screen = await p.ouvrir();
    for (const key of KEYS) assert.ok(field(screen, key), `item ${key} is shown`);
    const text = said(screen);
    for (const value of ["an episode", "script", "render", "the Labo Pop engine", "every claim cites a source", "publishing", "the published episode", "one episode a week", "the chef, the voice-over"]) {
      assert.ok(text.includes(value), `value "${value}" is shown`);
    }
  } finally {
    p.nettoyer();
  }
});
