// La bande du haut de l'onglet Rail (#2486, épique #2484) : sur une ligne mince, le temps d'un ticket, les cooks en
// cours et le backlog, à la place de leurs blocs séparés. Le module est joué avec le faux élément de l'app ; la vue,
// contre le faux pont (aides/fausse-vue.ts) — la bande en tête du rail, et le bloc des temps laissé à l'onglet Cooks.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../../../src/accueil.ts";
import { ALLUMAGE } from "../../../../src/allumage.ts";
import { pourLaBarre } from "../../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../../src/config.ts";
import { PALETTE } from "../../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../../src/onglets.ts";
import type { Panne } from "../../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../../src/projets/projets.ts";
import type { VuDesStations } from "../../../../src/stations/stations.ts";
import { cooksDeLaBande, poserBandeRail, tempsDeLaBande } from "../../../../src/vue/projet/rail/bande-rail.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MIN = 60;

// Un ticket mesuré, en secondes, partagé comme le fait la station : 40 % de cuisson, 10 % de tests, etc.
const ticket = (n: number, minutes: number) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt: `2026-10-${String(n - 2330).padStart(2, "0")}T10:00:00.000Z`,
  cuisson: minutes * MIN * 0.4,
  cuissonTests: minutes * MIN * 0.1,
  attentePasse: minutes * MIN * 0.1,
  revue: minutes * MIN * 0.2,
  ci: minutes * MIN * 0.1,
  merge: minutes * MIN * 0.1,
});
const NORMAL = { enregistrements: [9, 11, 8, 12, 10, 14, 9, 13, 11, 18].map((m, i) => ticket(2331 + i, m)), tempsMaxTicketMin: 15 };
const LENT = { enregistrements: [19, 22, 17, 25, 21, 30, 18, 24, 20, 28].map((m, i) => ticket(2331 + i, m)), tempsMaxTicketMin: 15 };

// La part elle-même, sous l'enveloppe de son survol quand elle en a une.
const laPart = (pose: Faux): Faux => (pose.className === "survol" ? (pose.children[0] ?? assert.fail("survol sans part")) : pose);
// Ce qu'une part dit au survol : la bulle posée, puis retirée.
function auSurvol(pose: Faux): string {
  const part = laPart(pose);
  const avant = pose.textContent;
  part.declencher("mouseenter");
  const dit = pose.textContent.slice(avant.length);
  part.declencher("mouseleave");
  assert.equal(pose.textContent, avant, "la bulle part avec le pointeur");
  return dit;
}

describe("le temps d'un ticket, dans la bande", () => {
  test("sous le plafond : la médiane en clair et le plafond ; le plus lent et les cinq phases au survol", () => {
    const pose = tempsDeLaBande(doc, NORMAL);
    assert.equal(laPart(pose).className, "bande-part bande-temps");
    assert.equal(laPart(pose).dataset.temps, "normal");
    assert.equal(pose.textContent, "Ticket time" + "11 min" + "median · max 15 min");
    // Le détail n'est écrit nulle part hors survol ; la part prend le clavier pour le dire.
    assert.equal(Reflect.get(laPart(pose), "tabIndex"), 0);
    assert.equal(
      auSurvol(pose),
      "Median of the last 10 tickets, from claim to merge. Slowest: #2340 — 18 min. Cooking 6 min (its tests 1 min) · Waiting for the pass 1 min · Review 2 min · CI 1 min · Merge 1 min",
    );
    assert.equal(laPart(pose).ariaLabel, auSurvol(pose));
  });

  test("passé le plafond : il le dit en toutes lettres, pas seulement par la couleur", () => {
    const pose = tempsDeLaBande(doc, LENT);
    assert.equal(laPart(pose).dataset.temps, "depasse");
    assert.equal(pose.textContent, "Ticket time" + "22 min" + "over the max of 15 min");
    assert.equal(laPart(pose).dessous("span").find(({ className }) => className === "bande-depasse")?.textContent, "over the max of 15 min");
  });

  test("ni blanc ni zéro : une station qui ne publie pas ses temps le dit, comme un projet sans ticket mesuré", () => {
    const nonPublie = tempsDeLaBande(doc, undefined);
    assert.equal(laPart(nonPublie).dataset.temps, "vide");
    assert.equal(nonPublie.textContent, "Ticket time" + "not available yet");
    assert.match(auSurvol(nonPublie), /does not publish its ticket times yet: this is not a count of zero tickets$/);

    const aucun = tempsDeLaBande(doc, { enregistrements: [] });
    assert.equal(aucun.textContent, "Ticket time" + "no ticket measured yet");
    assert.match(auSurvol(aucun), /^The time appears once a ticket is merged/);
  });
});

describe("les cooks en cours, dans la bande", () => {
  test("leur nombre ; leurs tickets au survol, quand la lecture les nomme", () => {
    const pose = cooksDeLaBande(doc, { nombre: 2, tickets: ["#14 Le journal — box/claude", "#16 Le menu — mac/claude"] });
    assert.equal(laPart(pose).className, "bande-part bande-cooks");
    assert.equal(pose.textContent, "Cooks" + "2" + "running");
    assert.equal(auSurvol(pose), "#14 Le journal — box/claude · #16 Le menu — mac/claude");
  });

  test("lus de GitHub sans leurs tickets : un cook par ticket de Taken, et le survol le dit", () => {
    assert.equal(auSurvol(cooksDeLaBande(doc, { nombre: 3, tickets: [] })), "one cook per ticket in Taken");
    assert.equal(auSurvol(cooksDeLaBande(doc, { nombre: 1, tickets: [] })), "one cook, on the ticket in Taken");
  });

  test("aucun : « none running », sans survol ni zéro", () => {
    const pose = cooksDeLaBande(doc, { nombre: 0, tickets: [] });
    assert.equal(pose.className, "bande-part bande-cooks");
    assert.equal(pose.textContent, "Cooks" + "none running");
    assert.equal(Reflect.get(pose, "tabIndex"), undefined);
  });
});

describe("la bande entière", () => {
  test("une seule ligne : le temps d'un ticket, les cooks, le backlog, puis ce qui va au bout", () => {
    const backlog = new Faux("div");
    backlog.className = "amont";
    backlog.textContent = "Backlog12 issues";
    const age = new Faux("p");
    age.className = "age-du-rail";
    const bande = poserBandeRail(doc, { temps: NORMAL, cooks: { nombre: 1, tickets: [] }, backlog, apres: [age] });
    assert.equal(bande.className, "bande-rail");
    assert.equal(bande.role, "group");
    assert.equal(bande.ariaLabel, "Ticket time, cooks running and backlog");
    assert.deepEqual(
      bande.children.map((pose: Faux) => laPart(pose).className),
      ["bande-part bande-temps", "bande-part bande-cooks", "amont", "age-du-rail"],
    );
  });

  test("sans rail lu : le temps d'un ticket seul — ni cooks, ni backlog inventés", () => {
    const bande = poserBandeRail(doc, { temps: NORMAL });
    assert.deepEqual(bande.children.map((pose: Faux) => laPart(pose).className), ["bande-part bande-temps"]);
  });
});

describe("sur l'onglet Rail", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
  const projets = (temps: object | undefined): VuDesProjets => {
    const projet = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      stations: [{ id: "g1", nom: "box", principale: true, etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(temps === undefined ? {} : { temps }),
    } as ProjetVu;
    return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
  };
  const demarrage = (temps: object | undefined) => () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX] } satisfies VuDesStations,
    accueil: ACCUEIL,
    projetsDesStations: projets(temps),
  });
  // Deux tickets pris, chacun par son cook, un en pass, un sur le rail.
  const FAITS: Faits = {
    etat: "ouverte",
    lu: A,
    dernierTick: A,
    compteurs: { rail: 1, auTravail: 2, aLaPass: 1, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [
      { ticket: 10, etat: "en attente", titre: "Sur le rail", url: "https://github.com/benomite/parade/issues/10", activite: null },
      { ticket: 14, etat: "pris", titre: "Le journal", url: "https://github.com/benomite/parade/issues/14", activite: null },
      { ticket: 16, etat: "pris", titre: "Le menu", url: "https://github.com/benomite/parade/issues/16", activite: null },
      { ticket: 15, etat: "en pass", titre: "La pass", url: "https://github.com/benomite/parade/issues/15", activite: null },
    ],
    cooks: [
      { ticket: 14, titre: "Le journal", station: "box/claude" },
      { ticket: 16, titre: "Le menu", station: "box/claude" },
    ],
    attend: [],
  };

  async function ouvrir(temps: object | undefined): Promise<Jouee> {
    const vue = await jouerLaVue({ demarrage: demarrage(temps), espace: () => [], autoriserSurGitHub: () => true });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    const recue = tenirFaits().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await ouvrirOnglet(vue, "Rail");
    return vue;
  }
  const bande = (vue: Jouee) => vue.element("rail").children.find((pose) => pose.className === "bande-rail");
  const parts = (vue: Jouee) => (bande(vue) ?? assert.fail("pas de bande en tête du rail")).children.map(laPart);

  test("une bande en tête du rail dit le temps d'un ticket et les cooks en cours ; le bloc des temps n'est plus sur Rail", async () => {
    const vue = await ouvrir(NORMAL);
    const [temps, cooks] = parts(vue);
    assert.equal(temps?.textContent, "Ticket time" + "11 min" + "median · max 15 min");
    assert.equal(cooks?.textContent, "Cooks" + "2" + "running");
    // Avant les colonnes, et aucun bloc séparé des temps ni des cooks sur Rail.
    const enfants = vue.element("rail").children.map(({ className }) => className);
    assert.ok(enfants.indexOf("bande-rail") < enfants.indexOf("colonnes"), enfants.join(", "));
    assert.equal(vue.element("temps-ticket-du-projet").hidden, true);
    assert.equal(vue.element("rail").dessous("div").some(({ className }) => className === "temps-ticket"), false);
  });

  test("sur Cooks, le bloc des temps reste entier, et la bande n'y est pas", async () => {
    const vue = await ouvrir(NORMAL);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(vue.element("temps-ticket-du-projet").hidden, false);
    assert.equal(bande(vue), undefined);
    await ouvrirOnglet(vue, "Rail");
    assert.equal(vue.element("temps-ticket-du-projet").hidden, true);
    assert.notEqual(bande(vue), undefined);
  });

  test("des temps publiés après le rail : la bande les dit sans attendre la lecture suivante du rail", async () => {
    const vue = await ouvrir(undefined);
    assert.equal(parts(vue)[0]?.textContent, "Ticket time" + "not available yet");
    vue.dire("surProjetsDesStations", projets(LENT));
    await repos();
    assert.equal(parts(vue)[0]?.textContent, "Ticket time" + "22 min" + "over the max of 15 min");
  });
});
