// La file d'un projet sur le téléphone appairé (#1163) : ce qui attend le chef, le rail et les cooks en cours, en
// largeur de téléphone. La vue est celle du desktop, sur un écran étroit (#1186) : ce qu'elle montre d'une lecture est
// ce que le desktop montre de la même, au même instant — seule la mise en page change. Les colonnes de Rail
// s'empilent, TODO en tête, et rien ne défile de côté. La vue est jouée telle qu'elle est (aides/fausse-vue.ts) ; ce
// qu'aucun faux document ne mesure — la largeur — est dit par sa peau, que ce test lit, et vu sur les captures
// (`telephone-file*` de scripts/capture-ecran, docs/captures/1163/).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { FauxEcran, type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }];
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

// Le démarrage tel que le pont de l'app Android le rend (app/android/web/pont.js) : les constantes de l'app, le
// téléphone appairé, ni code ni stations lus — et, ici, le projet que sa station sert.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  telephone: { appaire: true as const, station: "box", adresse: "http://192.168.1.20:7010" },
});

type Station = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<Station> = {}): Station => ({
  station: nom,
  distante: false,
  plafond: 2,
  ordinaires: true,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...plus,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
// #12 attend ta décision ; #21 et #22 sont sur le rail ; #14 et #15 cuisent, l'un sur la box, l'autre sur le Mac ; #9
// est servi.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 2, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: issue(14), activite: null },
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: issue(15), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: issue(22), activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: issue(12), activite: null },
    { ticket: 9, etat: "servi", titre: "Le relevé des mesures", url: issue(9), activite: null },
  ],
  cooks: [COOK_14, COOK_15],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
  stations: [station("box/claude", { cooks: [COOK_14] }), station("mac/claude", { distante: true, cooks: [COOK_15] })],
};

const dessinable = (): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });

// L'espace de parade ouvert sur le téléphone — ou sur un écran large —, ses faits lus.
async function ouvrir({ etroit }: { etroit: boolean }): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [] }, { ecran: new FauxEcran(etroit) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

async function taper(vue: Jouee, titre: string): Promise<void> {
  (vue.element("onglets-du-projet").children.find((onglet) => onglet.textContent === titre) ?? assert.fail(`pas d'onglet « ${titre} »`)).click();
  await repos();
}

const sections = (vue: Jouee) => vue.element("rail").dessous("section").filter((pose) => pose.className === "colonne");
// Chaque colonne telle qu'elle se lit : son nom, son compte, et le texte de chacune de ses cartes.
const colonnes = (vue: Jouee) =>
  sections(vue).map((colonne) => ({
    nom: colonne.children[0]?.children[0]?.textContent,
    compte: colonne.children[0]?.children[1]?.textContent,
    cartes: colonne.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.textContent),
  }));
// Chaque station du projet telle qu'elle se lit : son nom, son état et ses cooks en cours.
const stations = (vue: Jouee) =>
  vue
    .element("rail")
    .dessous("li")
    .filter((li) => li.className === "station-de-cuisson")
    .map((li: Faux) => ({ station: li.dataset.station, etat: li.dessous("span").find((span) => span.className === "pilule")?.textContent, cooks: (li.dessous("ul")[0]?.children ?? []).map((cook) => cook.textContent) }));

describe("la file d'un projet sur le téléphone", () => {
  test("Rail : ce qui attend le chef, le rail, ce qui attend un tiers et ce qui est servi — TODO marquée, la seule", async () => {
    const vue = await ouvrir({ etroit: true });
    assert.deepEqual(
      colonnes(vue).map(({ nom, compte }) => [nom, compte]),
      [
        ["On the rail", "2"],
        ["Taken", "2"],
        ["Pass", "0"],
        ["TODO", "1"],
        ["WAITING", "0"],
        ["Served", "1"],
      ],
    );
    const [todo] = colonnes(vue).filter(({ nom }) => nom === "TODO");
    assert.match(todo?.cartes.join() ?? "", /#12.*Validation SIRET/);
    // La peau la met en tête d'après cette marque, et elle ne marque qu'elle.
    assert.deepEqual(
      sections(vue).filter((colonne) => "attend" in colonne.dataset).map((colonne) => colonne.children[0]?.children[0]?.textContent),
      ["TODO"],
    );
  });

  test("Cooks : les cooks en cours, station par station", async () => {
    const vue = await ouvrir({ etroit: true });
    await taper(vue, "Cooks");
    assert.deepEqual(stations(vue), [
      { station: "box/claude", etat: "cooking", cooks: ["#14Le journal en ajout seul"] },
      { station: "mac/claude", etat: "cooking", cooks: ["#15La carte des desserts"] },
    ]);
  });

  test("la même lecture dit la même chose qu'au desktop : les mêmes colonnes, les mêmes cartes, les mêmes cooks", async () => {
    const telephone = await ouvrir({ etroit: true });
    const desktop = await ouvrir({ etroit: false });
    assert.deepEqual(colonnes(telephone), colonnes(desktop));
    await taper(telephone, "Cooks");
    await taper(desktop, "Cooks");
    assert.deepEqual(stations(telephone), stations(desktop));
  });
});

// La peau d'un écran étroit : le bloc de sa requête, règle par règle — le seul `@media` de vue.css (peau.test.ts).
const PEAU = readFileSync(join(import.meta.dirname, "..", "..", "src", "vue", "vue.css"), "utf8").replaceAll(/\/\*[\s\S]*?\*\//g, "");
function blocEtroit(): Map<string, Map<string, string>> {
  const debut = PEAU.indexOf("{", PEAU.indexOf("@media (max-width: 720px)"));
  assert.ok(debut > 0, "vue.css n'a pas de bloc pour l'écran étroit");
  let profondeur = 0;
  let fin = debut;
  for (; fin < PEAU.length; fin++) {
    if (PEAU[fin] === "{") profondeur++;
    if (PEAU[fin] === "}" && --profondeur === 0) break;
  }
  const regles = new Map<string, Map<string, string>>();
  for (const [, tete = "", corps = ""] of PEAU.slice(debut + 1, fin).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map(corps.split(";").map((declaration) => declaration.trim()).filter(Boolean).map((declaration) => [declaration.slice(0, declaration.indexOf(":")).trim(), declaration.slice(declaration.indexOf(":") + 1).trim()] as const));
    for (const selecteur of tete.split(",")) regles.set(selecteur.trim().replace(/\s+/g, " "), declarations);
  }
  return regles;
}

describe("sur un écran étroit, rien ne défile de côté", () => {
  test("les colonnes de Rail s'empilent sur toute la largeur, TODO en tête : ni grille plus large que l'écran, ni défilement de côté", () => {
    const regles = blocEtroit();
    const grille = regles.get('#rail[data-onglet="rail"] .colonnes');
    assert.equal(grille?.get("grid-template-columns"), "minmax(0, 1fr)");
    assert.equal(grille?.has("scroll-snap-type"), false);
    assert.equal(regles.get('#rail[data-onglet="rail"] .colonne[data-attend]')?.get("order"), "-1");
    // Rien d'autre du bloc ne pose une largeur minimale qui passerait celle d'un téléphone.
    for (const [selecteur, declarations] of regles) assert.doesNotMatch([...declarations.values()].join(" "), /minmax\((?:[3-9]\d\d|\d{4,})px/, selecteur);
  });

  test("la confirmation d'un interrupteur s'ouvre sous la tête de l'espace, de toute sa largeur, et non à 440 px sous lui", () => {
    const regles = blocEtroit();
    assert.equal(regles.get("main > header")?.get("position"), "relative");
    assert.equal(regles.get(".interrupteur-de-tete")?.get("position"), "static");
    const confirmation = regles.get(".interrupteur-de-tete > .confirmation");
    assert.equal(confirmation?.get("width"), "auto");
    assert.ok(confirmation?.has("left") && confirmation.has("right"), "ancrée à gauche et à droite");
  });
});
