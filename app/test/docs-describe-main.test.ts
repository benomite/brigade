// Les dossiers marketing, maquettes, tutoriels et logo de docs/ ne décrivent que ce qui existe sur main (ticket 4585) :
// ni l'ancien rail, ni l'arrêt de la cuisine, ni les garde-fous de l'ancien runtime, ni le label `sensitive`.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const FOLDERS = ["docs/marketing", "docs/maquettes", "docs/tutoriels", "docs/logo"];

function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)]));
}
const texts = FOLDERS.flatMap((folder) => files(join(ROOT, folder))).filter((path) => /\.(md|html|svg|json)$/.test(path));

// Ce qui n'existe plus : l'arrêt et l'état ouvert de la cuisine (#4509), les colonnes de l'ancien rail, l'onglet Cooks,
// les plafonds, le disjoncteur et le second juge de l'ancien runtime, le label `sensitive` (#4505), `/brigade:init`.
const GONE: RegExp[] = [
  /Stop the kitchen/,
  /\bkitchen open\b/,
  /Run the closing pass/,
  /'On the rail'|\*\*On the rail\*\*/,
  /\*\*Taken\*\*|'Taken'/,
  /\*\*Cooks\*\* shows/,
  /blocked-on-human/,
  /sensitive-tickets\.md/,
  /label `sensitive`/,
  /\bidle stop\b/,
  /\ba breaker\b/,
  /second judge/,
  /halts every cook/,
  /garde-fous\.md/,
  /\/brigade:init/,
];

test("the pages left in these folders name nothing removed from main", () => {
  const found = texts.flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return GONE.filter((gone) => gone.test(text)).map((gone) => `${relative(ROOT, path)}: ${gone}`);
  });
  assert.deepEqual(found, []);
});

test("the demo video and the demo captures of the old rail are deleted", () => {
  for (const gone of ["docs/demo", "docs/marketing/demo"]) assert.equal(existsSync(join(ROOT, gone)), false, gone);
});
