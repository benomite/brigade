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
// Le résumé de la mesure (`resume` de temps-tickets.json) et les quatre chiffres (`chiffres`), tels que la station les publie :
// la vue les lit, elle ne les recalcule pas. Le temps total n'a pas de plafond (#2670, #2672) : seuls les quatre chiffres ont un seuil.
const RESUME_NORMAL = { n: 10, medianMin: 11, p75Min: 13, phaseLaPlusLongue: { nom: "review", medianMin: 2, partPct: 18 }, perteLaPlusLourde: null };
const RESUME_LENT = { n: 10, medianMin: 14, p75Min: 47, phaseLaPlusLongue: { nom: "review", medianMin: 9, partPct: 64 }, perteLaPlusLourde: { nom: "failed cooks", medianMin: 4, partPct: 80 } };
const CHIFFRES_NORMAL = [
  { cle: "perdu", nom: "lost time", valeur: "1 min median, 1.5 min p75", seuil: "2 min", depasse: false, pesent: ["#2335 lost 1.5 min"] },
  { cle: "estimation", nom: "vs estimate", valeur: "×1.20 median", seuil: "×1.5", depasse: false, pesent: ["#2333 ×1.40 (14 min against 10)"] },
  { cle: "premier-coup", nom: "first try", valeur: "80%", seuil: "70%", depasse: false, pesent: ["red CI (2)"] },
  { cle: "reparations", nom: "main repairs", valeur: "0.050 per merge", seuil: "0.1 per merge", depasse: false, pesent: [] },
];
const CHIFFRES_ROUGES = [
  { cle: "perdu", nom: "lost time", valeur: "5 min median, 9 min p75", seuil: "2 min", depasse: true, pesent: ["#2338 lost 9 min", "#2333 lost 6 min"] },
  { cle: "estimation", nom: "vs estimate", valeur: "×2.10 median", seuil: "×1.5", depasse: true, pesent: ["#2338 ×3.00 (30 min against 10)"] },
  { cle: "premier-coup", nom: "first try", valeur: "50%", seuil: "70%", depasse: true, pesent: ["tests failed (3)", "review (1)"] },
  { cle: "reparations", nom: "main repairs", valeur: "0.200 per merge", seuil: "0.1 per merge", depasse: true, pesent: ["typecheck (2)"] },
];
const NORMAL = { enregistrements: [9, 11, 8, 12, 10, 14, 9, 13, 11, 18].map((m, i) => ticket(2331 + i, m)), lostTimeMaxMin: 2, resume: RESUME_NORMAL, chiffres: CHIFFRES_NORMAL };
const LENT = { enregistrements: [19, 22, 17, 25, 21, 30, 18, 24, 20, 28].map((m, i) => ticket(2331 + i, m)), lostTimeMaxMin: 2, resume: RESUME_LENT, chiffres: CHIFFRES_ROUGES };
// Ce que la bande dit des quatre chiffres : « · », le nom, la valeur, « / » et le seuil.
const DIT_NORMAL = "·" + "lost time" + "1 min median, 1.5 min p75" + "/ 2 min" + "·" + "vs estimate" + "×1.20 median" + "/ ×1.5" + "·" + "first try" + "80%" + "/ 70%" + "·" + "main repairs" + "0.050 per merge" + "/ 0.1 per merge";
const DIT_ROUGE = "·" + "lost time" + "5 min median, 9 min p75" + "/ 2 min" + "·" + "vs estimate" + "×2.10 median" + "/ ×1.5" + "·" + "first try" + "50%" + "/ 70%" + "·" + "main repairs" + "0.200 per merge" + "/ 0.1 per merge";

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
  test("sous les seuils : la médiane, le p75 et les quatre chiffres contre leur seuil, sans rouge ; ce qui pèse le plus au survol de chacun", () => {
    const pose = tempsDeLaBande(doc, NORMAL);
    assert.equal(laPart(pose).className, "bande-part bande-temps");
    assert.equal(laPart(pose).dataset.temps, "normal");
    assert.equal(pose.textContent, "Ticket time" + "median" + "11 min" + "/" + "p75" + "13 min" + DIT_NORMAL);
    assert.equal(laPart(pose).dessous("span").some(({ dataset }) => dataset.depasse === "oui"), false);
    const chiffres = laPart(pose).dessous("span").filter(({ dataset }) => dataset.chiffre !== undefined);
    assert.deepEqual(chiffres.map(({ dataset }) => dataset.chiffre), ["perdu", "estimation", "premier-coup", "reparations"]);
    assert.deepEqual(chiffres.map((c) => c.ariaLabel), ["Weighs most: #2335 lost 1.5 min", "Weighs most: #2333 ×1.40 (14 min against 10)", "Weighs most: red CI (2)", "Nothing weighs on main repairs yet."]);
    // Le détail du temps n'est écrit nulle part hors survol ; la part prend le clavier pour le dire.
    assert.equal(Reflect.get(laPart(pose), "tabIndex"), 0);
    assert.equal(auSurvol(pose).startsWith("Median and p75 of the last 10 measured tickets, from filing to merge."), true);
    assert.doesNotMatch(pose.textContent, /max/);
  });

  test("les quatre au-dessus de leur seuil : chacun en rouge, la médiane et le p75 jamais", () => {
    const pose = tempsDeLaBande(doc, LENT);
    assert.equal(laPart(pose).dataset.temps, "depasse");
    assert.equal(pose.textContent, "Ticket time" + "median" + "14 min" + "/" + "p75" + "47 min" + DIT_ROUGE);
    const rouges = laPart(pose).dessous("span").filter(({ dataset }) => dataset.depasse === "oui");
    assert.deepEqual(rouges.map(({ dataset }) => dataset.chiffre), ["perdu", "estimation", "premier-coup", "reparations"]);
    assert.match(auSurvol(pose), /Heaviest loss: failed cooks, median 4 min\. Slowest phase: review, median 9 min\.$/);
  });

  test("un seul chiffre au-dessus de son seuil : lui seul en rouge", () => {
    const un = CHIFFRES_NORMAL.map((c) => (c.cle === "premier-coup" ? { ...c, valeur: "60%", depasse: true } : c));
    const pose = tempsDeLaBande(doc, { ...NORMAL, chiffres: un });
    assert.equal(laPart(pose).dataset.temps, "depasse");
    assert.deepEqual(laPart(pose).dessous("span").filter(({ dataset }) => dataset.depasse === "oui").map(({ dataset }) => dataset.chiffre), ["premier-coup"]);
  });

  test("un long ticket n'est pas rouge : sa taille varie", () => {
    const pose = tempsDeLaBande(doc, { enregistrements: [], resume: { ...RESUME_NORMAL, medianMin: 90, p75Min: 160 }, chiffres: CHIFFRES_NORMAL });
    assert.equal(laPart(pose).dataset.temps, "normal");
    assert.equal(laPart(pose).dessous("span").some(({ dataset }) => dataset.depasse === "oui"), false);
  });

  test("les chiffres sont ceux de la station, jamais recalculés des enregistrements", () => {
    const pose = tempsDeLaBande(doc, { ...LENT, resume: { ...RESUME_LENT, medianMin: 3, p75Min: 4 } });
    assert.equal(pose.textContent, "Ticket time" + "median" + "3 min" + "/" + "p75" + "4 min" + DIT_ROUGE);
  });

  test("sans mesure : « no measure yet », neutre — ni blanc ni zéro, qu'il manque le temps, les chiffres ou qu'ils soient illisibles", () => {
    for (const temps of [undefined, { enregistrements: [] }, { enregistrements: LENT.enregistrements }, { enregistrements: [], resume: { n: 0, medianMin: 0, p75Min: 0 } }, { enregistrements: [], resume: "x", chiffres: [{ cle: "perdu" }] }]) {
      const pose = tempsDeLaBande(doc, temps);
      assert.equal(laPart(pose).dataset.temps, "vide");
      assert.equal(pose.textContent, "Ticket time" + "no measure yet");
      assert.match(auSurvol(pose), /not a count of zero tickets$/);
    }
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
    assert.equal(temps?.textContent, "Ticket time" + "median" + "11 min" + "/" + "p75" + "13 min" + DIT_NORMAL);
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
    assert.equal(parts(vue)[0]?.textContent, "Ticket time" + "no measure yet");
    vue.dire("surProjetsDesStations", projets(LENT));
    await repos();
    assert.equal(parts(vue)[0]?.textContent, "Ticket time" + "median" + "14 min" + "/" + "p75" + "47 min" + DIT_ROUGE);
  });
});
