// Ce que fait le cook d'un ticket, sur sa fiche (#1846) : à la place de son terminal, ce que sa station publie sur le
// tableau de la cuisine. Le tableau est écrit par le runtime lui-même (rendreLeTableau), lu de GitHub par une doublure
// de l'API — aucun `ssh`, aucune box jointe —, rangé par lecture.ts comme le process principal le range, puis la vue
// jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts). Tant qu'il tourne, la fiche suit son cook à
// chaque lecture ; fini, elle le dit et ouvre sa PR. Aucune page de worktree ne s'y ouvre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ActiviteDuCook, EtapeDuCook } from "../../../runtime/src/tableau/rendu/bloc.ts";
import { rendreLeTableau } from "../../../runtime/src/tableau/rendu/rendre.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { activitesPubliees, lireLeTableauDuDepot, type ActivitesPubliees } from "../../src/tableau/lecture.ts";
import { EN_COURS, INDISPONIBLE, SANS_PR, TITRE } from "../../src/vue/activite-du-cook.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";
import { GENERE_LE, ISSUE, TABLEAU } from "../tableau/fixture.ts";

const PARADE = "parade";
const A = "2026-10-23T10:04:30.000Z";
const PR = "https://github.com/chef/parade/pull/40";

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/chef/parade/issues/14", activite: null }],
  cooks: [COOK_14],
  attend: [],
};
// La station de #14, telle que le runtime la rend dans `facts` (runtime/src/etat.ts) : sa carte se pose dans son bloc,
// sur l'onglet Cooks.
const STATIONS = [
  { station: "box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [COOK_14] },
];

const etape = (faitEn: string, cible: string | null, depuis: string): EtapeDuCook => ({ fait: faitEn, faitEn, cible, depuis });
const LIT = etape("reading", "runtime/src/etat.ts", "2026-10-23T09:55:00.000Z");
const ECRIT = etape("writing", "app/src/bon.ts", "2026-10-23T10:02:30.000Z");
const TESTE = etape("running the tests", null, "2026-10-23T10:04:00.000Z");
const EN_COURS_14: ActiviteDuCook = {
  ticket: 14,
  titre: COOK_14.titre,
  run: "14-aa",
  station: "box/claude",
  lanceLe: "2026-10-23T09:52:30.000Z",
  finiLe: null,
  fin: null,
  maintenant: ECRIT,
  etapes: [LIT, ECRIT],
  tours: 12,
  tokens: 48_210,
  pr: null,
};

// Ce que l'app lit du tableau que la box a publié avec ces activités — par GitHub seul, comme main.ts : une doublure de
// l'API rend l'issue du tableau, écrite par le runtime ; rien d'autre n'est joint.
async function lu(activites: ActiviteDuCook[] | undefined): Promise<ActivitesPubliees> {
  const corps = rendreLeTableau({ ...TABLEAU, ...(activites === undefined ? {} : { activites }) }, GENERE_LE);
  const chemins: string[] = [];
  const lecture = await lireLeTableauDuDepot({ depot: "chef/parade", appeler: async (chemin) => (chemins.push(chemin), { status: 200, data: [{ ...ISSUE, body: corps }] }) });
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  assert.ok(chemins.every((chemin) => chemin.startsWith("/repos/chef/parade/")));
  return activitesPubliees(PARADE, lecture);
}

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], ouvrirPrDuCook: () => true });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: STATIONS }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
// La fiche de #14, ouverte comme le chef l'ouvre : sa carte, sous sa station, sur l'onglet Cooks.
async function ouvrirLaFiche(vue: Jouee): Promise<void> {
  await ouvrirOnglet(vue, "Cooks");
  const carte = vue.element("rail").dessous("li").find((li) => li.className === "bon" && li.textContent.includes("#14")) ?? assert.fail("pas de carte #14 sur Cooks");
  carte.click();
  await repos();
  assert.equal(vue.element("fiche").hidden, false);
}
const section = (vue: Jouee): Faux | undefined => vue.element("fiche").dessous("section").find((pose) => pose.className === "activite-du-cook");
const dite = (vue: Jouee) => section(vue) ?? assert.fail("la fiche ne dit pas ce que fait son cook");
const maintenant = (vue: Jouee) => dite(vue).dessous("p").find((p) => p.className === "maintenant")?.textContent;
const etapes = (vue: Jouee) => dite(vue).dessous("li").map((li) => li.children[0]?.textContent);
// Le bouton qui ouvre sa PR — le seul geste de la section, hors de l'icône d'aide de sa source.
const boutonPr = (vue: Jouee) => dite(vue).dessous("button").find((bouton) => bouton.className === "pr");

describe("la fiche d'un ticket suit son cook, tel que sa station le publie", () => {
  test("ouverte sur un cook qui tourne : ce qu'il fait, ses derniers gestes ; la lecture suivante la fait avancer", async () => {
    const vue = await ouvrir();
    await ouvrirLaFiche(vue);
    // Avant toute lecture du tableau, aucune section : rien n'est inventé.
    assert.equal(section(vue), undefined);

    vue.dire("surActivites", await lu([EN_COURS_14]));
    await repos();
    assert.equal(dite(vue).dessous("h4")[0]?.textContent, TITRE);
    assert.match(dite(vue).textContent, new RegExp(EN_COURS));
    assert.match(dite(vue).textContent, /on box\/claude · 12 turns · 48,210 tokens/);
    assert.equal(maintenant(vue), "nowwriting app/src/bon.tsfor 2 min");
    assert.deepEqual(etapes(vue), ["reading runtime/src/etat.ts"]);
    // Pas encore de PR : aucun bouton qui l'ouvre, et rien ne dit qu'il n'en a pas — il tourne.
    assert.equal(boutonPr(vue), undefined);
    assert.doesNotMatch(dite(vue).textContent, new RegExp(SANS_PR));

    // La station publie l'étape suivante : la fiche ouverte la montre, sans un geste du chef.
    vue.dire("surActivites", await lu([{ ...EN_COURS_14, maintenant: TESTE, etapes: [LIT, ECRIT, TESTE], tours: 15 }]));
    await repos();
    assert.equal(maintenant(vue), "nowrunning the testsfor 30 s");
    assert.deepEqual(etapes(vue), ["reading runtime/src/etat.ts", "writing app/src/bon.ts"]);
    assert.match(dite(vue).textContent, /15 turns/);
  });

  test("fini : la fiche le dit, et ouvre sa PR d'un bouton ; fini sans PR, une ligne le dit", async () => {
    const vue = await ouvrir();
    await ouvrirLaFiche(vue);
    const fini: ActiviteDuCook = { ...EN_COURS_14, finiLe: "2026-10-23T10:04:10.000Z", fin: "ok", maintenant: null, etapes: [LIT, ECRIT, TESTE], pr: { numero: 40, url: PR } };
    vue.dire("surActivites", await lu([fini]));
    await repos();
    assert.match(dite(vue).textContent, /finished/);
    assert.doesNotMatch(dite(vue).textContent, new RegExp(EN_COURS));
    assert.equal(maintenant(vue), undefined);
    assert.deepEqual(etapes(vue), ["reading runtime/src/etat.ts", "writing app/src/bon.ts", "running the tests"]);
    const pr = boutonPr(vue) ?? assert.fail("pas de bouton vers sa PR");
    assert.equal(pr.textContent, "open PR #40");
    pr.click();
    await repos();
    // La vue nomme le projet et le ticket : l'adresse reste au process principal, lue du même tableau.
    assert.deepEqual(vue.dernier("ouvrirPrDuCook"), [PARADE, 14]);

    vue.dire("surActivites", await lu([{ ...fini, fin: "failed", pr: null }]));
    await repos();
    assert.match(dite(vue).textContent, /failed/);
    assert.match(dite(vue).textContent, new RegExp(SANS_PR));
    assert.equal(boutonPr(vue), undefined);
  });

  test("un tableau d'une box qui ne publie pas encore l'activité de ses cooks : une ligne, pourquoi au survol", async () => {
    const vue = await ouvrir();
    await ouvrirLaFiche(vue);
    const publiees = await lu(undefined);
    assert.ok("sans" in publiees);
    vue.dire("surActivites", publiees);
    await repos();
    assert.match(dite(vue).textContent, new RegExp(INDISPONIBLE));
    assert.doesNotMatch(dite(vue).textContent, /ssh|exit code/);
  });

  test("un ticket dont aucun cook n'est publié n'a pas de section ; aucune page de worktree ne s'ouvre de la fiche", async () => {
    const vue = await ouvrir();
    await ouvrirLaFiche(vue);
    vue.dire("surActivites", await lu([{ ...EN_COURS_14, ticket: 99 }]));
    await repos();
    assert.equal(section(vue), undefined);
    vue.dire("surActivites", await lu([EN_COURS_14]));
    await repos();
    assert.ok(!vue.element("fiche").dessous("button").some((bouton) => /browser|page/.test(bouton.textContent)));
    assert.doesNotMatch(vue.element("fiche").textContent, /port \d/);
    assert.ok(!vue.appels.some(({ geste }) => geste === "ouvrirPage"));
  });
});
