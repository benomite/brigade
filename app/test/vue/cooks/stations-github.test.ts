// L'onglet Cooks d'un projet sur GitHub seul (#2358) : ses stations telles que GitHub les dit — la station qui tient un
// ticket cuit, avec ce ticket ; une station fraîche sans ticket est atteinte et attend ; une station tue n'est pas
// atteinte, et dit son dernier signe de vie —, la box comme le Mac, par la même règle et dans la même ligne. Rien n'y vient
// des `facts` de l'ancien journal, ni des stations qu'il déclare ou que l'app lui connaît : le Mac qui cuit ne s'y lit
// plus « not reached · not signed in yet ». GitHub lu par l'app (vue/rail/github.ts, `avecLeRail`), puis la vue jouée
// telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../src/projets/projets.ts";
import { lireStations, type Guide, type StationsLues } from "../../../src/service.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import type { TableauLu } from "../../../src/tableau/lecture.ts";
import { ATTEINTE, AUCUNE, SIGNE_DE_VIE, SIGNES_ILLISIBLES } from "../../../src/vue/cooks/stations-github.js";
import { avecLeRail, type RailSurGithub, type SignesDeVie } from "../../../src/vue/rail/github.ts";
import { PAS_ANNONCEE } from "../../../src/vue/stations-de-cuisson.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-05T10:00:00.000Z";
const PARADE = "parade";
const DEPOT = "benomite/parade";
const issue = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;

// Les stations du compte que l'app connaît : la box, qui sert parade, et le MacBook du chef, que l'app lui a ajouté.
const appairee = (id: string, nom: string, projets: string[] = []) => ({ id, nom, machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets, max: null }) as const;
const BOX = appairee("gbox", "box", [PARADE]);
const MAC = appairee("gmac", "macbook");
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const SUR_LA_BOX: ProjetVu = {
  nom: PARADE,
  depot: DEPOT,
  base: "main",
  suiviPar: { id: "gbox", nom: "box" },
  stations: [
    { id: "gbox", nom: "box", etat: "servi", dit: "served by box", autoriser: [] },
    { id: "gmac", nom: "macbook", etat: "servi", dit: "served by macbook", autoriser: [] },
  ],
  servi: null,
  cuitSur: { id: "gbox", nom: "box", ici: false },
  demenagement: null,
};
const VU: VuDesProjets = { a: A, projets: [SUR_LA_BOX], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };

// Ce que la box déclare encore à l'ancien chemin : elle-même, et le Mac, jamais annoncé.
const DECLAREES =
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "macbook/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

// Le tableau que la box publie : le rail de l'ancien journal, figé, et ses stations — le Mac déclaré, jamais annoncé.
const FIGE = {
  lu: true,
  depot: DEPOT,
  numero: 99,
  adresse: null,
  genereLe: A,
  luLe: A,
  age: 0,
  projet: PARADE,
  file: [],
  pages: [],
  bilans: [],
  cuisine: { rubriques: [] },
  gestes: [],
  faits: {
    etat: "ouverte",
    lu: A,
    dernierTick: A,
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
    attend: [],
    stations: [
      { station: "box/claude", distante: false, plafond: 3, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", cooks: [] },
      { station: "macbook/claude", distante: true, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", presente: false, vueLe: null, cooks: [] },
    ],
  },
} as unknown as TableauLu;

// GitHub : le MacBook tient #16, la box rien ; le PC du salon s'est tu avant-hier.
const RAIL: RailSurGithub = {
  lu: A,
  tickets: [{ ticket: 16, titre: "Le menu du soir", url: issue(16), etat: "pris", priorite: null, creeLe: "2026-11-05T08:00:00.000Z", pr: null, prise: { station: "macbook/claude", le: "2026-11-05T09:31:00.000Z" } }],
};
const signe = (name: string, lastSeen: string) => ({ name, lastSeen, stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] });
const SIGNES: SignesDeVie = { lus: [signe("box", "2026-11-05T09:59:10.000Z"), signe("MacBook", "2026-11-05T09:58:40.000Z"), signe("pc", "2026-11-03T18:40:00.000Z")] };

const guide = (stations: StationsLues): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station runs with the app" },
  termine: true,
  controle: { a: A, stations },
});
const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade", depot: DEPOT, base: "main" };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  projetsDesStations: VU,
});

async function ouvrir(rail: RailSurGithub = RAIL, signes: SignesDeVie = SIGNES): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], service: () => guide(DECLAREES), defautsDeStation: () => ({ refus: "pas ici" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(avecLeRail(FIGE, rail, signes).faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  return vue;
}

const lignes = (vue: Jouee) => vue.element("rail").dessous("li").filter((li) => li.className === "station-de-cuisson");
const ligne = (vue: Jouee, nom: string) => lignes(vue).find((li) => li.dataset.station === nom) ?? assert.fail(`pas de ligne pour ${nom}`);
const pilules = (pose: Faux) => pose.dessous("span").filter(({ className }) => className === "pilule atteinte" || className === "pilule");
const dit = (pose: Faux) => pose.dessous("span").find(({ className }) => className === "etat")?.dessous("small")[0]?.textContent;

describe("l'onglet Cooks d'un projet sur GitHub seul : ses stations dites de GitHub (#2358)", () => {
  test("une qui cuit, avec son ticket ; une qui attend, atteinte ; une tue, pas atteinte, avec son dernier signe de vie", async () => {
    const vue = await ouvrir();
    assert.deepEqual(lignes(vue).map(({ dataset }) => dataset.station), ["box/claude", "macbook/claude", "pc/claude"]);
    assert.deepEqual(
      lignes(vue).map((pose) => pilules(pose).map(({ textContent, dataset }) => `${textContent} ${dataset.ton}`)),
      [[`${ATTEINTE.oui} vert`, "idle gris"], [`${ATTEINTE.oui} vert`, "cooking vert"], [`${ATTEINTE.non} gris`]],
    );
    // Le Mac cuit #16, et sa ligne ne dit plus qu'il ne s'est pas annoncé.
    assert.match(ligne(vue, "macbook/claude").textContent, /#16/);
    assert.equal(vue.element("rail").textContent.includes(PAS_ANNONCEE.pourquoi), false);
    // Le PC dit son dernier signe de vie, à l'écran ; le geste qui le ramène, au survol.
    assert.equal(dit(ligne(vue, "pc/claude")), SIGNE_DE_VIE("2026-11-03T18:40:00.000Z"));
    assert.match(pilules(ligne(vue, "pc/claude"))[0]?.title ?? "", /open Brigade on that computer/);
    // Celles qui sont atteintes disent leur signe de vie au survol.
    assert.equal(pilules(ligne(vue, "box/claude"))[0]?.title, SIGNE_DE_VIE("2026-11-05T09:59:10.000Z"));
  });

  test("la box et un ordinateur, la même ligne : ni principale, ni « move the kitchen », ni bouton d'arrêt", async () => {
    const vue = await ouvrir();
    const rail = vue.element("rail");
    for (const pose of lignes(vue)) {
      // Ses seuls boutons sont ceux des cartes de ses tickets.
      assert.equal(pose.children.filter(({ className }) => className !== "cartes").flatMap((enfant) => enfant.dessous("button")).length, 0, `${pose.dataset.station} porte un bouton`);
      assert.deepEqual(pose.children.map(({ className }) => className), ["nom", "etat", pose.dataset.station === "macbook/claude" ? "cartes" : "aucun-cook"]);
    }
    assert.equal(rail.textContent.includes("move the kitchen"), false);
  });

  test("la box qui prend un ticket se dit en cuisine à la lecture suivante, avec ce ticket", async () => {
    const prise = { ticket: 21, titre: "L'export du journal", url: issue(21), etat: "pris", priorite: null, creeLe: A, pr: null, prise: { station: "box/claude", le: "2026-11-05T09:59:50.000Z" } };
    const vue = await ouvrir({ ...RAIL, tickets: [...RAIL.tickets, prise] });
    assert.equal(pilules(ligne(vue, "box/claude"))[1]?.textContent, "cooking");
    assert.match(ligne(vue, "box/claude").textContent, /#21/);
  });

  test("signes de vie illisibles : une ligne le dit, la raison au survol ; les stations qui tiennent un ticket, sans rien dire de leur présence", async () => {
    const vue = await ouvrir(RAIL, { illisible: "GitHub did not answer" });
    const ligneDite = vue.element("rail").dessous("p").find(({ textContent }) => textContent === SIGNES_ILLISIBLES) ?? assert.fail("rien ne dit les signes de vie illisibles");
    assert.equal(ligneDite.title, "GitHub did not answer");
    assert.deepEqual(lignes(vue).map(({ dataset }) => dataset.station), ["macbook/claude"]);
    assert.equal(pilules(ligne(vue, "macbook/claude"))[0]?.textContent, ATTEINTE.inconnue);
  });

  test("aucune station : une ligne le dit", async () => {
    const vue = await ouvrir({ lu: A, tickets: [] }, { lus: [] });
    assert.equal(lignes(vue).length, 0);
    assert.ok(vue.element("rail").dessous("p").some(({ textContent }) => textContent === AUCUNE));
  });
});
