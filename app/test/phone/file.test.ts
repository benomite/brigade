// La file d'un projet sur le téléphone appairé (#1163) : ce qui attend le chef, le rail et les cooks en cours, en
// largeur de téléphone. La vue est celle du desktop, sur un écran étroit (#1186) : ce qu'elle montre d'une lecture est
// ce que le desktop montre de la même, au même instant — seule la mise en page change. Les colonnes de Rail
// restent sur une rangée qui défile de côté (#1556), et la page, elle, ne défile pas de côté. La vue est jouée telle qu'elle est (helpers/false-vue.ts) ; ce
// qu'aucun faux document ne mesure — la largeur — est dit par sa peau, que ce test lit, et vu sur les captures
// (`telephone-file*` de scripts/capture-ecran, docs/captures/1163/).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Facts as FactsOfRuntime } from "../../src/facts.ts"; // the app's own Facts (the old runtime's etat.ts is gone)
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { holdFacts, type Drawable, type Facts } from "../../src/facts.ts";
import { HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { red } from "../helpers/red.ts";
import { FakeScreen, type Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

// Le démarrage tel que le pont de l'app Android le rend (app/android/web/pont.js) : les constantes de l'app, le
// téléphone appairé, ni code ni stations lus — et, ici, le projet que sa station sert.
const startup = () => ({
  configuration: forTheBar({ chemin: "no projects file on this phone", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  telephone: { github: { compte: "chef" } },
});

type Station = NonNullable<FactsOfRuntime["stations"]>[number];
const station = (name: string, more: Partial<Station> = {}): Station => ({
  station: name,
  distante: false,
  plafond: 2,
  ordinaires: true,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  ...more,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
// #12 attend ta décision ; #21 et #22 sont sur le rail ; #14 et #15 cuisent, l'un sur la box, l'autre sur le Mac ; #9
// est servi.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  compteurs: { rail: 2, auTravail: 2, aLaPass: 1, attend: 1, livres24h: 1 },
  
  
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
  
};

const drawable = (): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });

// L'espace de parade ouvert sur le téléphone — ou sur un écran large —, ses faits lus.
async function open({ etroit: narrow }: { etroit: boolean }): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [] }, { ecran: new FakeScreen(narrow) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...drawable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

async function type(vue: Played, title: string): Promise<void> {
  await openTab(vue, title as "Rail" | "Stations");
}

const sections = (vue: Played) => vue.element("rail").dessous("section").filter((pose) => pose.className === "colonne");
// Chaque colonne telle qu'elle se lit : son nom, son compte, et le texte de chacune de ses cartes.
const columns = (vue: Played) =>
  sections(vue).map((column) => ({
    nom: column.children[0]?.children[0]?.textContent,
    compte: column.children[0]?.children[1]?.textContent,
    cartes: column.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.textContent),
  }));
// Les cooks en cours d'une station, leur numéro et leur titre : une ligne chacun sur le téléphone, la carte de son
// ticket au desktop (#1270).
const cooksOf = (li: Fake) => {
  const cards = li.dessous("li").filter((slip) => slip.className === "bon");
  if (cards.length > 0) return cards.map((slip) => `${slip.children[0]?.children[0]?.textContent}${slip.children[1]?.textContent}`);
  return (li.dessous("ul")[0]?.children ?? []).map((cook) => cook.textContent);
};
// Chaque station du projet telle qu'elle se lit : son nom, son état et ses cooks en cours.
const stations = (vue: Played) =>
  vue
    .element("rail")
    .dessous("section")
    .filter((card) => card.className === "carte-de-station")
    .map((card: Fake) => ({ station: card.dataset.station, etat: card.dessous("span").find((span) => span.className === "pilule etat")?.textContent, cooks: cooksOf(card) }));

describe("la file d'un projet sur le téléphone", () => {
  test("Rail : le plan de la cuisine, du backlog à ce qui est servi — pas de colonne TODO : ce qui attend le chef est rouge dans son étape, et le compte de l'accueil le dit (#3458, #4238)", async () => {
    const vue = await open({ etroit: true });
    assert.deepEqual(
      columns(vue).map(({ nom: name, compte: account }) => [name, account]),
      [
        ["Backlog", "2"],
        ["Manager", "0"],
        ["Cooks", "2"],
        ["Pass", "1"],
        ["Served", "1"],
      ],
    );
    const [pass] = columns(vue).filter(({ nom: name }) => name === "Pass");
    assert.match(pass?.cartes.join() ?? "", /#12.*Validation SIRET/);
    // Seule la colonne où une carte rouge attend le chef est marquée.
    assert.deepEqual(
      sections(vue).filter((column) => "attend" in column.dataset).map((column) => column.children[0]?.children[0]?.textContent),
      ["Pass"],
    );
    assert.deepEqual(red(vue.element("rail")), ["#12"]);
    assert.equal(vue.element("rail").dessous("button").some(({ className }) => className === "entree-todo"), false);
  });

  test("Stations : les cooks en cours, station par station", async () => {
    const vue = await open({ etroit: true });
    await type(vue, "Stations");
    assert.deepEqual(stations(vue), [
      { station: "box/claude", etat: "online", cooks: ["#14Le journal en ajout seul"] },
      { station: "mac/claude", etat: "online", cooks: ["#15La carte des desserts"] },
    ]);
  });

  test("la même lecture dit la même chose qu'au desktop : les mêmes colonnes, les mêmes cartes, les mêmes cooks", async () => {
    const phone = await open({ etroit: true });
    const desktop = await open({ etroit: false });
    assert.deepEqual(columns(phone), columns(desktop));
    await type(phone, "Stations");
    await type(desktop, "Stations");
    assert.deepEqual(stations(phone), stations(desktop));
  });
});

// La peau d'un écran étroit : le bloc de sa requête, règle par règle — le seul `@media` de vue.css (skin.test.ts).
const SKIN = readFileSync(join(import.meta.dirname, "..", "..", "src", "vue", "vue.css"), "utf8").replaceAll(/\/\*[\s\S]*?\*\//g, "");
function blockNarrow(): Map<string, Map<string, string>> {
  const start = SKIN.indexOf("{", SKIN.indexOf("@media (max-width: 720px)"));
  assert.ok(start > 0, "vue.css n'a pas de bloc pour l'écran étroit");
  let depth = 0;
  let end = start;
  for (; end < SKIN.length; end++) {
    if (SKIN[end] === "{") depth++;
    if (SKIN[end] === "}" && --depth === 0) break;
  }
  const rules = new Map<string, Map<string, string>>();
  for (const [, head = "", body = ""] of SKIN.slice(start + 1, end).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map(body.split(";").map((declaration) => declaration.trim()).filter(Boolean).map((declaration) => [declaration.slice(0, declaration.indexOf(":")).trim(), declaration.slice(declaration.indexOf(":") + 1).trim()] as const));
    for (const selector of head.split(",")) rules.set(selector.trim().replace(/\s+/g, " "), declarations);
  }
  return rules;
}

describe("sur un écran étroit, la page ne défile pas de côté (les colonnes de Rail, elles, défilent dans leur rangée)", () => {
  test("les colonnes de Rail restent sur une rangée, même étroite : le bloc étroit ne les empile pas et ne réordonne pas TODO (ticket 1556)", () => {
    const rules = blockNarrow();
    assert.equal(rules.has('#rail[data-onglet="rail"] .colonnes'), false);
    assert.equal(rules.has('#rail[data-onglet="rail"] .colonne[data-attend]'), false);
    // Rien d'autre du bloc ne pose une largeur minimale qui passerait celle d'un téléphone.
    for (const [selector, declarations] of rules) assert.doesNotMatch([...declarations.values()].join(" "), /minmax\((?:[3-9]\d\d|\d{4,})px/, selector);
  });
});
