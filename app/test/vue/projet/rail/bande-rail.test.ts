// La bande du haut de l'onglet Rail (#2486, #3013 ; maquette Project.dc.html) : une seule ligne de chiffres — le temps d'un
// ticket, le premier coup, les cooks en cours, le dernier merge —, chacun posé seulement s'il a une valeur. Le
// module est joué avec le faux élément de l'app ; la vue, contre le faux pont (aides/fausse-vue.ts) : la bande en tête du
// rail, seule ligne de chiffres entre les onglets et le rail.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../../../src/accueil.ts";
import { ALLUMAGE } from "../../../../src/allumage.ts";
import { pourLaBarre } from "../../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../../src/config.ts";
import { PALETTE } from "../../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../../src/onglets.ts";
import type { Panne } from "../../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../../src/projets/projets.ts";
import type { VuDesStations } from "../../../../src/stations/stations.ts";
import { cooksDeLaBande, dernierMergeDeLaBande, poserBandeRail, premierCoupDeLaBande, tempsDeLaBande } from "../../../../src/vue/projet/rail/bande-rail.js";
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
// Le dernier ticket mesuré, #2340, est mergé le 10 octobre à 10 h : quatre minutes plus tard, la bande dit « 4 min ago ».
const MAINTENANT = "2026-10-10T10:04:00.000Z";
// Ce que la bande dit de chaque chiffre : son nom, sa valeur, ce qu'elle est — comme la maquette Project.dc.html.
const TEMPS_NORMAL = "Ticket time" + "11 min" + "median";
const PREMIER_COUP = "First try" + "80%" + "· goal 70%";
const DERNIER_MERGE = "Last merge" + "4 min" + "ago";

// Le chiffre lui-même, sous l'enveloppe de son survol quand il en a un.
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
const classes = (bande: Faux) => bande.children.map((pose: Faux) => laPart(pose).className);
const textes = (bande: Faux) => bande.children.map((pose: Faux) => laPart(pose).textContent);

describe("le temps d'un ticket, dans la bande", () => {
  test("sa médiane, sans plafond ; le p75, la perte la plus lourde, la phase la plus longue et les autres chiffres de la station au survol", () => {
    const pose = tempsDeLaBande(doc, LENT) ?? assert.fail("pas de temps");
    assert.equal(laPart(pose).className, "bande-part bande-temps");
    assert.equal(pose.textContent, "Ticket time" + "14 min" + "median");
    assert.equal(Reflect.get(laPart(pose), "tabIndex"), 0);
    assert.equal(
      auSurvol(pose),
      "Median 14 min and p75 47 min of the last 10 measured tickets, from filing to merge. Heaviest loss: failed cooks, median 4 min. Slowest phase: review, median 9 min." +
        " Lost time: 5 min median, 9 min p75, threshold 2 min — over it. Vs estimate: ×2.10 median, threshold ×1.5 — over it. Main repairs: 0.200 per merge, threshold 0.1 per merge — over it.",
    );
  });

  test("les chiffres sont ceux de la station, jamais recalculés des enregistrements", () => {
    const pose = tempsDeLaBande(doc, { ...LENT, resume: { ...RESUME_LENT, medianMin: 3, p75Min: 4 } }) ?? assert.fail("pas de temps");
    assert.equal(pose.textContent, "Ticket time" + "3 min" + "median");
  });

  test("sans résumé lisible : rien — ni « no measure yet », ni aide", () => {
    for (const temps of [undefined, { enregistrements: [] }, { enregistrements: LENT.enregistrements, chiffres: CHIFFRES_NORMAL }, { enregistrements: [], resume: { n: 0, medianMin: 0, p75Min: 0 } }, { enregistrements: [], resume: "x" }]) {
      assert.equal(tempsDeLaBande(doc, temps), null);
    }
  });
});

// Le temps de la pass sur 7 jours (#3512), tel que la station le publie (`passe`, runtime/src/temps-ticket/passe.ts).
const part = (cle: string, nom: string, livraisons: number, medianeS: number | null, p75S: number | null, totalS: number) => ({ cle, nom, livraisons, medianeS, p75S, totalS, partPct: null });
const PASSE = {
  jours: 7,
  livraisons: 12,
  parts: [
    part("attente", "waiting for the pass", 12, 120, 300, 2400),
    part("gates", "gates", 12, 0, 0, 0),
    part("revue", "review", 12, 240, 420, 3600),
    part("ci", "CI", 12, 1500, 1800, 19_800),
    part("merge", "merge", 12, 10, 20, 150),
    part("ciAttente", "CI waiting for runners", 9, 1200, 1680, 16_200),
    part("ciCourse", "CI running", 9, 420, 540, 4000),
  ],
  phaseLaPlusLourde: { nom: "CI", totalS: 19_800 },
  partLaPlusLourde: { nom: "CI waiting for runners", partPct: 62 },
  relancees: 4,
  renvoyees: 2,
  passesRenvoyeesS: 1500,
};

// Le chiffre de la pass, tel que la bande le pose ; null quand elle n'en pose pas.
const passeDeLaBande = (_doc: typeof doc, temps: object | undefined): Faux | null => poserBandeRail(doc, { temps: temps as never, maintenant: MAINTENANT }).children.find((pose: Faux) => laPart(pose).className === "bande-part bande-passe") ?? null;

describe("la pass, dans la bande", () => {
  test("en une ligne, la part qui pèse le plus sur le temps de pass de la semaine ; chaque phase, sa médiane et son p75 au survol", () => {
    const pose = passeDeLaBande(doc, { ...NORMAL, passe: PASSE }) ?? assert.fail("pas de pass");
    assert.equal(laPart(pose).className, "bande-part bande-passe");
    assert.equal(pose.textContent, "Pass · CI waiting for runners" + "62%" + "of pass time");
    assert.equal(
      auSurvol(pose),
      [
        "Over the last 7 days, 12 deliveries, each of their passes counted.",
        "Heaviest stage in total: CI, 5 h 30 min.",
        "Waiting for the pass: median 2 min, p75 5 min.",
        "Gates: none.",
        "Review: median 4 min, p75 7 min.",
        "CI: median 25 min, p75 30 min.",
        "Merge: median 10 s, p75 20 s.",
        "CI waiting for runners: median 20 min, p75 28 min.",
        "CI running: median 7 min, p75 9 min.",
        "CI runs restarted because the branch moved: 4.",
        "Sent back: 2 deliveries, 25 min in the passes sent back.",
      ].join("\n"),
    );
  });

  test("une mesure qui manque se dit « no measure yet », jamais zéro", () => {
    const sansCi = { ...PASSE, parts: PASSE.parts.map((p) => (p.cle.startsWith("ciA") || p.cle.startsWith("ciC") ? { ...p, livraisons: 0, medianeS: null, p75S: null, totalS: 0 } : p)), relancees: null, renvoyees: 0 };
    const dit = auSurvol(passeDeLaBande(doc, { ...NORMAL, passe: sansCi }) ?? assert.fail("pas de pass"));
    assert.match(dit, /CI waiting for runners: no measure yet\.\nCI running: no measure yet\.\nCI runs restarted because the branch moved: no measure yet\.\nNo delivery sent back\./);
    assert.doesNotMatch(dit, /runners: median 0|restarted because the branch moved: 0/);
  });

  test("sans temps de la pass publié ou lisible : rien, quand le même temps lisible la pose", () => {
    // Le témoin : le temps de la pass lisible pose sa part — sans lui, ce test ne prouverait rien.
    assert.notEqual(passeDeLaBande(doc, { ...NORMAL, passe: PASSE }), null);
    for (const temps of [undefined, NORMAL, { ...NORMAL, passe: null }, { ...NORMAL, passe: { ...PASSE, livraisons: 0 } }, { ...NORMAL, passe: { ...PASSE, partLaPlusLourde: null } }, { ...NORMAL, passe: "x" }]) {
      assert.equal(passeDeLaBande(doc, temps), null);
    }
  });

  test("dans la bande, à côté du temps d'un ticket", () => {
    const bande = poserBandeRail(doc, { temps: { ...NORMAL, passe: PASSE }, maintenant: MAINTENANT, cooks: { nombre: 2, tickets: [] } });
    assert.deepEqual(classes(bande), ["bande-part bande-temps", "bande-part bande-passe", "bande-part bande-premier-coup", "bande-part bande-cooks", "bande-part bande-dernier-merge"]);
  });
});

describe("le premier coup, dans la bande", () => {
  test("sa valeur contre son but, tels que la station les publie ; ce qui pèse le plus au survol", () => {
    const pose = premierCoupDeLaBande(doc, NORMAL) ?? assert.fail("pas de premier coup");
    assert.equal(laPart(pose).className, "bande-part bande-premier-coup");
    assert.equal(pose.textContent, PREMIER_COUP);
    assert.equal(laPart(pose).dataset.depasse, undefined);
    assert.equal(auSurvol(pose), "Weighs most: red CI (2)");
  });

  test("sous son but : en rouge", () => {
    const pose = premierCoupDeLaBande(doc, LENT) ?? assert.fail("pas de premier coup");
    assert.equal(pose.textContent, "First try" + "50%" + "· goal 70%");
    assert.equal(laPart(pose).dataset.depasse, "oui");
  });

  test("sans valeur publiée : rien", () => {
    const sans = CHIFFRES_NORMAL.map((c) => (c.cle === "premier-coup" ? { ...c, valeur: "no data yet" } : c));
    for (const temps of [undefined, { enregistrements: [] }, { ...NORMAL, chiffres: sans }, { ...NORMAL, chiffres: CHIFFRES_NORMAL.filter(({ cle }) => cle !== "premier-coup") }]) {
      assert.equal(premierCoupDeLaBande(doc, temps), null);
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

describe("le dernier merge, dans la bande", () => {
  test("depuis combien de temps le dernier ticket mesuré est mergé ; son numéro et sa date au survol", () => {
    const pose = dernierMergeDeLaBande(doc, NORMAL, MAINTENANT) ?? assert.fail("pas de dernier merge");
    assert.equal(laPart(pose).className, "bande-part bande-dernier-merge");
    assert.equal(pose.textContent, DERNIER_MERGE);
    assert.equal(auSurvol(pose), "#2340, merged 2026-10-10 10:00 UTC.");
    // Dans le désordre : le plus récent compte, pas le dernier de la liste.
    const desordre = { ...NORMAL, enregistrements: [...NORMAL.enregistrements].reverse() };
    assert.equal(dernierMergeDeLaBande(doc, desordre, "2026-10-10T12:00:00.000Z")?.textContent, "Last merge" + "2 h" + "ago");
    // Au-delà d'un jour, en jours.
    assert.equal(dernierMergeDeLaBande(doc, NORMAL, "2026-10-13T10:04:00.000Z")?.textContent, "Last merge" + "3 d" + "ago");
  });

  test("sans ticket mesuré lisible : rien", () => {
    for (const temps of [undefined, { enregistrements: [] }, { enregistrements: [{ ticket: 1, mergedAt: "pas une date" }, null, "x"] }]) {
      assert.equal(dernierMergeDeLaBande(doc, temps, MAINTENANT), null);
    }
  });
});

describe("la bande entière", () => {
  test("tous les chiffres ont une valeur : une seule ligne, chacun une fois, dans l'ordre de la maquette, puis ce qui va au bout — le backlog n'y est plus (#3460)", () => {
    const age = new Faux("p");
    age.className = "age-du-rail";
    const bande = poserBandeRail(doc, { temps: NORMAL, maintenant: MAINTENANT, cooks: { nombre: 2, tickets: [] }, apres: [age] });
    assert.equal(bande.className, "bande-rail");
    assert.equal(bande.role, "group");
    assert.deepEqual(classes(bande), [
      "bande-part bande-temps",
      "bande-part bande-premier-coup",
      "bande-part bande-cooks",
      "bande-part bande-dernier-merge",
      "age-du-rail",
    ]);
    assert.deepEqual(textes(bande).slice(0, 4), [TEMPS_NORMAL, PREMIER_COUP, "Cooks" + "2" + "running", DERNIER_MERGE]);
    assert.doesNotMatch(bande.textContent, /Backlog/);
    // Ni titre, ni aide `?`, ni barre : que des chiffres.
    assert.deepEqual(bande.dessous("h3"), []);
    assert.equal(bande.dessous("button").some(({ className }: Faux) => className === "aide"), false);
    assert.doesNotMatch(bande.textContent, /no measure yet|not available yet/i);
  });

  test("aucun chiffre n'a de valeur, sauf les cooks : la ligne ne dit que « Cooks 3 running »", () => {
    const bande = poserBandeRail(doc, { temps: undefined, maintenant: MAINTENANT, cooks: { nombre: 3, tickets: [] } });
    assert.equal(bande.children.length, 1);
    assert.equal(bande.textContent, "Cooks" + "3" + "running");
    // Les mêmes temps publiés sans valeur lisible : rien de plus.
    const vides = poserBandeRail(doc, { temps: { enregistrements: [], resume: "x", chiffres: [{ cle: "premier-coup", nom: "first try", valeur: "no data yet", seuil: "70%" }] }, maintenant: MAINTENANT, cooks: { nombre: 3, tickets: [] } });
    assert.equal(vides.textContent, "Cooks" + "3" + "running");
  });

  test("un chiffre manque — le premier coup, pas encore publié : les autres restent, à leur place, et lui n'y est pas du tout", () => {
    const sansPremierCoup = { ...NORMAL, chiffres: CHIFFRES_NORMAL.map((c) => (c.cle === "premier-coup" ? { ...c, valeur: "no data yet" } : c)) };
    const bande = poserBandeRail(doc, { temps: sansPremierCoup, maintenant: MAINTENANT, cooks: { nombre: 2, tickets: [] } });
    assert.deepEqual(classes(bande), ["bande-part bande-temps", "bande-part bande-cooks", "bande-part bande-dernier-merge"]);
    assert.doesNotMatch(bande.textContent, /First try|no data yet/);
  });

  test("sans rail lu : pas de cooks inventés", () => {
    const bande = poserBandeRail(doc, { temps: NORMAL, maintenant: MAINTENANT });
    assert.deepEqual(classes(bande), ["bande-part bande-temps", "bande-part bande-premier-coup", "bande-part bande-dernier-merge"]);
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
      suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
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
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
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

  test("une seule ligne de chiffres en tête du rail, chacun une fois ; au-dessus, ni bloc des temps, ni « Blocked without a question », ni aide `?`, ni la ligne repliée « Caps, closer and all projects »", async () => {
    const vue = await ouvrir(NORMAL);
    const [temps, premierCoup, cooks, dernierMerge] = parts(vue);
    assert.equal(temps?.textContent, TEMPS_NORMAL);
    assert.equal(premierCoup?.textContent, PREMIER_COUP);
    assert.equal(cooks?.textContent, "Cooks" + "2" + "running");
    assert.equal(dernierMerge?.className, "bande-part bande-dernier-merge");
    assert.match(dernierMerge?.textContent ?? "", /^Last merge.+ago$/);
    // Chaque chiffre une fois, dans une seule bande, avant les colonnes.
    const enfants = vue.element("rail").children.map(({ className }) => className);
    assert.equal(enfants.filter((nom) => nom === "bande-rail").length, 1);
    assert.ok(enfants.indexOf("bande-rail") < enfants.indexOf("colonnes"), enfants.join(", "));
    const noms = parts(vue).map((part) => part.className);
    assert.deepEqual(noms, [...new Set(noms)]);
    // Au-dessus du rail, plus rien d'autre que la bande : ni bloc de chiffres, ni titre sans rien dessous, ni aide `?`, ni la
    // ligne repliée « Caps, closer and all projects ».
    const dessus = vue.element("bandeau-sante");
    assert.deepEqual(dessus.children, []);
    // Devant la bande, seul un signe de lecture (une lecture vieille, hors ligne) peut se poser : aucun bloc, titre ni ligne repliée.
    assert.deepEqual(enfants.slice(0, enfants.indexOf("bande-rail")).filter((nom) => !/^(fraicheur|hors-ligne)/.test(nom)), [], enfants.join(", "));
    assert.doesNotMatch(vue.element("rail").textContent, /Caps, closer and all projects|Blocked without a question/);
    assert.doesNotMatch(bande(vue)?.textContent ?? "", /no measure yet|Not available yet|\?/i);
  });

  test("sur Stations, ni la bande ni les réglages de santé, passés dans Settings (#3014) ; Rail rend la bande seule", async () => {
    const vue = await ouvrir(NORMAL);
    assert.deepEqual(vue.element("bandeau-sante").children, []);
    await ouvrirOnglet(vue, "Stations");
    assert.equal(bande(vue), undefined);
    assert.deepEqual(vue.element("bandeau-sante").children, []);
    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(vue.element("bandeau-sante").children, []);
    assert.notEqual(bande(vue), undefined);
  });

  test("le temps de la pass que la station publie (#3512) se lit dans la bande de l'onglet Rail, à côté du temps d'un ticket", async () => {
    const vue = await ouvrir({ ...NORMAL, passe: PASSE });
    assert.deepEqual(parts(vue).slice(0, 2).map(({ textContent }) => textContent), [TEMPS_NORMAL, "Pass · CI waiting for runners" + "62%" + "of pass time"]);
  });

  test("des temps publiés après le rail : la bande les dit sans attendre la lecture suivante du rail", async () => {
    const vue = await ouvrir(undefined);
    // Sans temps publiés, la bande ne dit que les cooks.
    assert.deepEqual(parts(vue).map(({ textContent }) => textContent), ["Cooks" + "2" + "running"]);
    vue.dire("surProjetsDesStations", projets(LENT));
    await repos();
    assert.deepEqual(parts(vue).slice(0, 3).map(({ textContent }) => textContent), ["Ticket time" + "14 min" + "median", "First try" + "50%" + "· goal 70%", "Cooks" + "2" + "running"]);
  });
});
