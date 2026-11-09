// Le bandeau de santé (#2490, #2921, ex-Kitchen > Health) : le temps des tickets en détail — le ticket et sa pass, par ticket et dans le temps — et les
// plafonds de durée, réglés là et nulle part ailleurs dans la page du projet. Les blocs sont joués avec le faux élément
// de l'app (aides/fausse-vue.ts), puis la vue entière, telle qu'elle est.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { LectureDuCloser, RenduDesVerifications, RenduDuReglage } from "../../../src/closer-sante.ts";
import { PLAFONDS, type LectureDesPlafonds, type RenduDuPlafond } from "../../../src/plafonds-duree.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { CLES as CLES_DES_REGLAGES, PROPOSE } from "../../../src/reglages-du-projet.ts";
import { poserBlocBloqueSansQuestion } from "../../../src/vue/projet/bandeau-sante/BloqueSansQuestion.js";
import { poserBlocCloser } from "../../../src/vue/projet/bandeau-sante/Closer.js";
import { EN_COURS, poserBlocPlafondsDuree } from "../../../src/vue/projet/bandeau-sante/PlafondsDuree.js";
import { PAR_PR } from "../../../src/vue/composants/reglage/reglage.js";
import { tempsDeLaBande } from "../../../src/vue/projet/rail/bande-rail.js";
import { lireLesTemps, poserBlocTempsTickets } from "../../../src/vue/projet/bandeau-sante/TempsTickets.js";
import { Faux, jouerLaVue, ouvrirOnglet, repos, type Jouee } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MIN = 60;

// Un ticket mesuré : `total` minutes, dont `pass` d'attente de la pass et de revue, mergé le `jour` d'octobre.
const ticket = (n: number, total: number, pass: number, jour = n - 100) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt: `2026-10-${String(jour).padStart(2, "0")}T10:00:00.000Z`,
  cuisson: (total - pass) * MIN * 0.8,
  cuissonTests: (total - pass) * MIN * 0.1,
  attentePasse: pass * MIN * 0.5,
  revue: pass * MIN * 0.5,
  ci: (total - pass) * MIN * 0.05,
  merge: (total - pass) * MIN * 0.05,
});
// Le résumé de la mesure (`resume` de temps-tickets.json) et les quatre chiffres (`chiffres`) : la bande du rail et Health les lisent sans les recalculer.
// Le temps total n'a pas de plafond (#2670, #2672) : seuls les quatre chiffres ont un seuil.
const RESUME = { n: 3, medianMin: 10, p75Min: 14, phaseLaPlusLongue: { nom: "cooking", medianMin: 6, partPct: 60 }, perteLaPlusLourde: null };
const CHIFFRES = [
  { cle: "perdu", nom: "lost time", valeur: "1 min median, 1.5 min p75", seuil: "2 min", depasse: false, pesent: ["#102 lost 1.5 min"] },
  { cle: "estimation", nom: "vs estimate", valeur: "×1.20 median", seuil: "×1.5", depasse: false, pesent: [] },
  { cle: "premier-coup", nom: "first try", valeur: "80%", seuil: "70%", depasse: false, pesent: ["red CI (2)"] },
  { cle: "reparations", nom: "main repairs", valeur: "0.050 per merge", seuil: "0.1 per merge", depasse: false, pesent: [] },
];
const TEMPS = { enregistrements: [ticket(103, 9, 3), ticket(101, 10, 2), ticket(102, 20, 6)], lostTimeMaxMin: 2, resume: RESUME, chiffres: CHIFFRES };

const texte = (racine: Faux) => racine.textContent;
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));

describe("le temps des tickets, sur Health", () => {
  test("le ticket et sa pass en médiane, dans le temps du plus ancien au plus récent, et par ticket du plus récent", () => {
    const lu = lireLesTemps(TEMPS) ?? assert.fail("rien de lu");
    assert.equal(lu.mediane, 10 * MIN);
    assert.equal(lu.medianePasse, 3 * MIN);
    assert.deepEqual(lu.dansLeTemps.map(({ ticket: n }) => n), [101, 102, 103]);
    assert.deepEqual(lu.parTicket.map(({ ticket: n, total, passe }) => [n, total / MIN, passe / MIN]), [
      [103, 9, 3],
      [102, 20, 6],
      [101, 10, 2],
    ]);

    const bloc: Faux = poserBlocTempsTickets(doc, TEMPS);
    assert.equal(bloc.dataset.temps, "normal");
    assert.deepEqual(parClasse(bloc, "temps-chiffre").map(texte), [
      "10 minmedian of the last 3 measured tickets",
      "14 minp75 of the last 3 measured tickets",
      "1 min median, 1.5 min p75lost time, threshold 2 min",
      "×1.20 medianvs estimate, threshold ×1.5",
      "80%first try, threshold 70%",
      "0.050 per mergemain repairs, threshold 0.1 per merge",
    ]);
    assert.equal(parClasse(bloc, "temps-phase-lente").map(texte)[0], "Slowest phase: cooking, median 6 min");
    const colonnes = parClasse(bloc, "temps-colonne");
    assert.deepEqual(colonnes.map(({ title }) => title), ["#101 · Oct 1 · 10 min, pass 2 min", "#102 · Oct 2 · 20 min, pass 6 min", "#103 · Oct 3 · 9 min, pass 3 min"]);
    assert.deepEqual(colonnes.map(({ dataset }) => dataset.depasse), [undefined, undefined, undefined], "le temps d'un ticket n'a pas de plafond");
    assert.equal(parClasse(bloc, "temps-plafond").length, 0);
    const lignes = bloc.dessous("tr").filter(({ dataset }) => dataset.ticket !== undefined);
    assert.deepEqual(lignes.map((ligne) => ligne.children.map(texte)), [
      ["#103", "Oct 3", "9 min", "3 min"],
      ["#102", "Oct 2", "20 min", "6 min"],
      ["#101", "Oct 1", "10 min", "2 min"],
    ]);
  });

  test("un chiffre au-delà de son seuil passe le bloc en « depasse », lui seul en rouge ; ce qui pèse le plus au survol ; la perte la plus lourde se dit", () => {
    const sur = (chiffres: object[], resume: object = RESUME) => poserBlocTempsTickets(doc, { ...TEMPS, resume, chiffres });
    const rouge = CHIFFRES.map((c) => (c.cle === "premier-coup" ? { ...c, valeur: "50%", depasse: true, pesent: ["tests failed (3)", "review (1)"] } : c));
    const perdu = sur(rouge, { ...RESUME, perteLaPlusLourde: { nom: "send-backs", medianMin: 3, partPct: 60 } });
    assert.equal(perdu.dataset.temps, "depasse");
    assert.deepEqual(parClasse(perdu, "temps-chiffre").map(({ dataset }) => dataset.depasse), [undefined, undefined, undefined, undefined, "oui", undefined]);
    assert.deepEqual(parClasse(perdu, "temps-phase-lente").map(texte), ["Heaviest loss: send-backs, median 3 min", "Slowest phase: cooking, median 6 min"]);
    const survols = parClasse(perdu, "survol").map((pose) => pose.children[0] as Faux);
    assert.equal(survols.find((c) => c.dataset.chiffre === "premier-coup")?.ariaLabel, "Weighs most: tests failed (3) · review (1)");
    const long = sur(CHIFFRES, { ...RESUME, medianMin: 90, p75Min: 160 });
    assert.equal(long.dataset.temps, "normal", "un long ticket sans temps perdu n'est au-dessus de rien");
    assert.deepEqual(parClasse(long, "temps-chiffre").map(({ dataset }) => dataset.depasse), [undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  test("les chiffres sont ceux de la station, les mêmes que ceux de la bande du rail", () => {
    const bloc = poserBlocTempsTickets(doc, TEMPS);
    const bande = tempsDeLaBande(doc, TEMPS);
    assert.deepEqual(parClasse(bloc, "temps-valeur").map(texte), ["10 min", "14 min", "1 min median, 1.5 min p75", "×1.20 median", "80%", "0.050 per merge"]);
    for (const c of CHIFFRES) assert.ok(texte(bande).includes(c.valeur) && texte(bande).includes(`/ ${c.seuil}`), c.cle);
  });

  test("jamais un blanc ni un zéro : sans mesure, « No measure yet. » — la phase, le plafond et les figures ne s'inventent pas", () => {
    for (const temps of [undefined, { enregistrements: [], lostTimeMaxMin: 2 }]) {
      const vide = poserBlocTempsTickets(doc, temps);
      assert.equal(vide.dataset.temps, "vide");
      assert.match(texte(vide), /No measure yet./);
      assert.equal(parClasse(vide, "temps-chiffre").length, 0);
    }
  });
});

const LECTURE: LectureDesPlafonds = {
  branche: "main",
  plafonds: PLAFONDS.map((plafond) => ({ cle: plafond.cle, nom: plafond.nom, unite: plafond.unite, entier: plafond.entier, duree: plafond.duree, defaut: "defaut" in plafond ? plafond.defaut : null, valeur: plafond.cle === "gatesSeconds" ? 120 : null })),
};
// Une rangée de réglage (composants/reglage, #2920), par sa clé.
const ligneDe = (racine: Faux, cle: string) => [...racine.descendants()].find((pose) => pose.className === "reglage" && pose.dataset.cle === cle) ?? assert.fail(`pas de ligne ${cle}`);
const champDe = (ligne: Faux) => ligne.dessous("input")[0] ?? assert.fail("pas de champ");
const PR = "https://github.com/chef/parade/pull/41";
// Aucun « save » sur un écran de réglages (#2920) : un bouton qui enregistre, ou une classe qui le nomme.
const sansEnregistrer = (racine: Faux) => {
  assert.deepEqual(racine.dessous("button").map(({ textContent }) => textContent).filter((libelle) => /^(save|saving…)$/i.test(libelle)), []);
  assert.deepEqual([...racine.descendants()].filter(({ className }) => /enregistrer/.test(className)), []);
};

describe("les plafonds de durée, sur Health", () => {
  test("le seuil du temps perdu par ticket tel que la station le publie, sans champ ; les durées du dépôt ; les autres repliés", () => {
    const bloc = poserBlocPlafondsDuree(doc, { lecture: LECTURE, lostTimeMaxMin: 2 });
    const perduMax = ligneDe(bloc, "lostTimeMaxMin");
    assert.match(texte(perduMax), /^Lost time per ticket2 minmedian of recent tickets, published by the stationnot editable here yet/);
    assert.equal(perduMax.dessous("input").length, 0);
    assert.equal(perduMax.dataset.depot, undefined, "il ne se change pas d'ici : pas de PR à annoncer");
    assert.match(texte(ligneDe(bloc, "gatesSeconds")), /^Gates duration120 sin the repository/);
    // Gardé dans le dépôt : chaque rangée d'un seuil dit qu'un changement ouvre une PR.
    for (const { cle } of PLAFONDS) {
      const ligne = ligneDe(bloc, cle);
      assert.equal(ligne.dataset.depot, "", cle);
      assert.deepEqual(parClasse(ligne, "par-pr").map(texte), [PAR_PR], cle);
    }
    sansEnregistrer(bloc);
    assert.match(texte(ligneDe(bloc, "testsSeconds")), /^Test suite durationnot setthe station's, if any/);
    const replie = bloc.dessous("details")[0] ?? assert.fail("pas de repli");
    assert.match(texte(replie), /Other drift thresholdsnone set in the repository/);
    assert.equal(replie.dessous("input").length, PLAFONDS.filter(({ duree }) => !duree).length);
  });

  test("le champ s'applique à son `change`, sans « save », quand il change la valeur du dépôt ; ce qui est tapé est gardé", () => {
    const changes: [string, string][] = [];
    const choisis: [string, string][] = [];
    const bloc = poserBlocPlafondsDuree(doc, { lecture: LECTURE, changer: (cle, saisie) => changes.push([cle, saisie]), choisir: (cle, choisi) => choisis.push([cle, choisi]) });
    sansEnregistrer(bloc);
    const ligne = ligneDe(bloc, "gatesSeconds");
    const champ = champDe(ligne);
    champ.value = " 150 ";
    champ.declencher("input");
    assert.deepEqual(changes, [], "taper n'applique rien");
    assert.deepEqual(choisis, [["gatesSeconds", " 150 "]]);
    champ.declencher("change");
    // La valeur déjà en vigueur n'applique rien.
    champ.value = "120";
    champ.declencher("change");
    // Vide, le retrait d'un seuil posé s'applique ; celui d'un seuil qui n'est pas posé, non.
    champ.value = "";
    champ.declencher("change");
    const nonPose = champDe(ligneDe(bloc, "testsSeconds"));
    nonPose.value = " ";
    nonPose.declencher("change");
    assert.deepEqual(changes, [
      ["gatesSeconds", "150"],
      ["gatesSeconds", ""],
    ]);
  });

  test("en cours, la rangée le dit et son champ attend ; la PR ouverte se dit avec la valeur proposée et s'ouvre ; un refus garde son détail au survol", () => {
    const ouvertes: string[] = [];
    const bloc = poserBlocPlafondsDuree(doc, {
      lecture: LECTURE,
      ouvrir: (url) => ouvertes.push(url),
      etats: new Map([
        ["gatesSeconds", { dit: { pr: PR, numero: 41, valeur: 150 } }],
        ["testsSeconds", { choisi: "abc", dit: { refus: "nothing was changed: test suite duration must be a number greater than zero", detail: "" } }],
        ["tests", { choisi: "800", enCours: true }],
        ["merges", { dit: { pr: PR, numero: 42, valeur: null } }],
      ]),
    });
    const proposee = ligneDe(bloc, "gatesSeconds");
    assert.match(texte(proposee), /^Gates duration120 sin the repository/, "la valeur montrée reste celle en vigueur, jusqu'au merge");
    assert.equal(champDe(proposee).value, "120");
    assert.deepEqual(parClasse(proposee, "propose").map(texte), ["150 s proposed inpull request #41"]);
    (proposee.dessous("button").find(({ textContent }) => textContent === "pull request #41") ?? assert.fail("pas de lien vers la PR")).click();
    assert.deepEqual(ouvertes, [PR]);
    assert.match(texte(ligneDe(bloc, "merges")), /removal proposed inpull request #42/);

    const refusee = ligneDe(bloc, "testsSeconds");
    assert.match(texte(refusee), /nothing was changed/);
    assert.equal(champDe(refusee).value, "abc", "ce que le chef a tapé reste dans le champ");

    const enCours = ligneDe(bloc, "tests");
    assert.deepEqual(parClasse(enCours, "en-cours").map(texte), [EN_COURS]);
    assert.equal(champDe(enCours).disabled, true);
  });

  test("tant que rien n'est lu, une ligne le dit ; une lecture ratée tient en une ligne", () => {
    assert.match(texte(poserBlocPlafondsDuree(doc, {})), /reading the caps of the repository…/);
    const rate = poserBlocPlafondsDuree(doc, { lecture: { sans: "duration caps unavailable", detail: "GitHub refused (HTTP 401)" } });
    assert.match(texte(rate), /duration caps unavailable/);
    assert.doesNotMatch(texte(rate), /HTTP 401/, "le détail est au survol, pas à l'écran");
  });
});

// Le closer (#2491) : trois passes — une en cours, une mergée, une fermée sans merge —, deux vérifications en plus, et ses
// réglages, le calibrage et le plafond de tokens posés dans le dépôt.
const passe = (numero: number, autres: Partial<Extract<LectureDuCloser["passes"], { liste: unknown }>["liste"][number]>) => ({
  numero,
  url: `https://github.com/chef/parade/issues/${numero}`,
  ouverteLe: "2026-10-10T08:00:00.000Z",
  ouverte: false,
  sha: "9f3c2a17b4e0",
  candidats: [],
  restants: 0,
  derive: [],
  temps: [],
  pr: null,
  ...autres,
});
const CLOSER: LectureDuCloser = {
  passes: {
    liste: [
      passe(2531, {
        ouverte: true,
        candidats: [
          { id: "D1", quoi: "24 identical lines of code: `a.js:1-24` = `b.js:40-63`" },
          { id: "M1", quoi: "export `vieux` of `c.ts:12` — referenced nowhere" },
          { id: "M2", quoi: "export `ancien` of `d.ts:3` — referenced only by tests (`d.test.ts`)" },
        ],
        derive: ["last 20 merges: +3,120 / −840 (3.7:1)", "last 100 merges: +18,340 / −7,336 (2.5:1)"],
        temps: ["Times stable: 4 tickets measured since the last pass, and no drift. No correction ticket is opened or changed."],
        pr: { numero: 2533, url: "https://github.com/chef/parade/pull/2533", mergee: false, retirees: 0, ajoutees: 0 },
      }),
      passe(2477, { ouverteLe: "2026-10-08T08:00:00.000Z", candidats: [{ id: "M1", quoi: "x" }], pr: { numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 } }),
      passe(2410, { ouverteLe: "2026-10-06T08:00:00.000Z", pr: { numero: 2412, url: "https://github.com/chef/parade/pull/2412", mergee: false, retirees: 0, ajoutees: 0 } }),
    ],
  },
  verifications: { liste: ["Unused CSS classes"] },
  reglages: {
    liste: [
      { cle: "calibration", nom: "Calibration", unite: "", defaut: null, surGithub: true, valeur: { model: "sonnet", effort: "medium" } },
      { cle: "cooksBelow", nom: "Start condition", unite: "cooks in flight", defaut: 1, surGithub: false, valeur: null },
      { cle: "maxTokens", nom: "Tokens cap", unite: "tokens", defaut: 500_000, surGithub: false, valeur: 300_000 },
      { cle: "maxRemovedLines", nom: "Removed lines cap", unite: "lines", defaut: 500, surGithub: true, valeur: null },
    ],
  },
};
const VALEURS = { modeles: MODELES, efforts: EFFORTS };
const partieDe = (racine: Faux, partie: string) => [...racine.descendants()].find(({ dataset }) => dataset.partie === partie) ?? assert.fail(`pas de partie ${partie}`);
const boutonNomme = (racine: Faux, libelle: string) => racine.dessous("button").find((bouton) => bouton.textContent === libelle) ?? assert.fail(`pas de bouton ${libelle}`);

describe("le closer, sur Health", () => {
  test("ses passes, chacune avec ce qu'elle a retiré — ou pourquoi rien —, et sa PR", () => {
    const ouverts: string[] = [];
    const bloc = poserBlocCloser(doc, { lecture: CLOSER, ouvrir: (url) => ouverts.push(url) });
    assert.equal(bloc.dataset.bloc, "closer");
    const passes = partieDe(bloc, "passes").children.filter(({ className }) => className === "passe");
    assert.deepEqual(passes.map(texte), [
      "#2531Oct 10in progress — its PR is in the pass3 candidatesPR #2533",
      "#2477Oct 8−1,234 lines+56 added1 candidatePR #2480",
      "#2410Oct 6nothing removedits PR was closed without a mergeno candidatePR #2412",
    ]);
    boutonNomme(bloc, "PR #2480").click();
    boutonNomme(bloc, "#2531").click();
    assert.deepEqual(ouverts, ["https://github.com/chef/parade/pull/2480", "https://github.com/chef/parade/issues/2531"]);
  });

  test("ce qu'il vérifie en premier : ce que la dernière passe lui a remis sur ce projet, ses candidats repliés", () => {
    const en = partieDe(poserBlocCloser(doc, { lecture: CLOSER }), "en-premier");
    assert.deepEqual(en.children.filter(({ className }) => className === "verification").map(texte), [
      "Dead code2 exports referenced nowhere, or by tests only",
      "Duplicates1 passage of identical lines",
      "Driftlast 100 merges: +18,340 / −7,336 (2.5:1)?",
      "Ticket timesstable since the previous pass?",
    ]);
    const replie = en.dessous("details")[0] ?? assert.fail("pas de candidats");
    assert.match(texte(replie), /^Candidates3 handed to pass #2531 on 9f3c2a1/);
    assert.match(texte(replie), /M1export vieux of c\.ts:12 — referenced nowhere/);
    // Sans passe, il dit ce qu'il vérifiera.
    const sans = poserBlocCloser(doc, { lecture: { ...CLOSER, passes: { liste: [] } } });
    assert.match(texte(partieDe(sans, "passes")), /No closing pass yet\./);
    assert.match(texte(partieDe(sans, "en-premier")), /its own checks — dead code, duplicates, drift, ticket times — once a pass is opened/);
  });

  test("une vérification en plus s'ajoute d'ici : « add » n'agit qu'avec un texte, et donne ce qui est tapé", () => {
    const gestes: [string, string][] = [];
    const bloc = poserBlocCloser(doc, { lecture: CLOSER, changerVerification: (geste, saisie) => gestes.push([geste, saisie]) });
    const en = partieDe(bloc, "en-plus");
    assert.match(texte(en), /Unused CSS classesremove/);
    const ajout = boutonNomme(en, "add");
    assert.equal(ajout.disabled, true);
    assert.equal(ajout.className, "recommande");
    const champ = en.dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = " Doc sentences naming removed code ";
    champ.declencher("input");
    assert.equal(ajout.disabled, false);
    ajout.click();
    boutonNomme(en, "remove").click();
    assert.deepEqual(gestes, [
      ["ajouter", "Doc sentences naming removed code"],
      ["retirer", "Unused CSS classes"],
    ]);
    // Gardées dans le dépôt : la partie dit qu'un geste ouvre une PR.
    assert.deepEqual(parClasse(en, "par-pr").map(texte), [PAR_PR]);
  });

  test("une vérification proposée : en route, la partie le dit ; la PR ouverte se dit et s'ouvre ; un retrait se dit retrait", () => {
    const enRoute = partieDe(poserBlocCloser(doc, { lecture: CLOSER, verifications: { enCours: "ajouter" } }), "en-plus");
    assert.deepEqual(parClasse(enRoute, "en-cours").map(texte), [EN_COURS]);
    const ouvertes: string[] = [];
    const bloc = poserBlocCloser(doc, { lecture: CLOSER, ouvrirLaPr: (url) => ouvertes.push(url), verifications: { dit: { pr: PR, numero: 43, geste: "ajouter", verification: "Doc sentences" } } });
    const en = partieDe(bloc, "en-plus");
    assert.match(texte(en), /^Extra checks\?Unused CSS classesremove/, "la liste en vigueur, jusqu'au merge");
    assert.deepEqual(parClasse(en, "propose").map(texte), ["the check “Doc sentences” proposed inpull request #43"]);
    (en.dessous("button").find(({ textContent }) => textContent === "pull request #43") ?? assert.fail("pas de lien")).click();
    assert.deepEqual(ouvertes, [PR]);
    const retrait = partieDe(poserBlocCloser(doc, { lecture: CLOSER, verifications: { dit: { pr: PR, numero: 44, geste: "retirer", verification: "Unused CSS classes" } } }), "en-plus");
    assert.deepEqual(parClasse(retrait, "propose").map(texte), ["the removal of “Unused CSS classes” proposed inpull request #44"]);
  });

  test("ses réglages : le calibrage, la condition de départ, les plafonds — chacun sa valeur, d'où elle vient, et un contrôle qui s'applique à son `change`", () => {
    const changes: [string, unknown][] = [];
    const bloc = poserBlocCloser(doc, { lecture: CLOSER, valeurs: VALEURS, changer: (cle, saisie) => changes.push([cle, saisie]) });
    assert.match(texte(ligneDe(bloc, "calibration")), /^Calibrationsonnet \/ mediumin the repository/);
    assert.match(texte(ligneDe(bloc, "cooksBelow")), /^Start condition\?not setthe station's, or none in flightnot read on GitHub yet/);
    assert.match(texte(ligneDe(bloc, "maxTokens")), /^Tokens cap300,000 tokensin the repositorynot read on GitHub yet/);
    assert.match(texte(ligneDe(bloc, "maxRemovedLines")), /^Removed lines capnot setthe station's, or 500 lines/);
    assert.doesNotMatch(texte(ligneDe(bloc, "maxRemovedLines")), /not read on GitHub/);
    sansEnregistrer(partieDe(bloc, "reglages"));
    for (const cle of ["calibration", "cooksBelow", "maxTokens", "maxRemovedLines"]) assert.deepEqual(parClasse(ligneDe(bloc, cle), "par-pr").map(texte), [PAR_PR], cle);

    const lignes = ligneDe(bloc, "maxRemovedLines");
    const champ = champDe(lignes);
    champ.value = "800";
    champ.declencher("input");
    champ.declencher("change");

    const calibrage = ligneDe(bloc, "calibration");
    const [modele = assert.fail("pas de modèle"), effort = assert.fail("pas d'effort")] = calibrage.dessous("select");
    // L'un sans l'autre ne s'applique pas ; les deux choisis, si.
    modele.value = "opus";
    effort.value = "";
    modele.declencher("change");
    effort.value = "high";
    effort.declencher("change");

    assert.deepEqual(changes, [
      ["maxRemovedLines", "800"],
      ["calibration", { model: "opus", effort: "high" }],
    ]);
  });

  test("un réglage proposé : sa PR se dit sous sa rangée et s'ouvre par `ouvrirLaPr`, la valeur en vigueur reste", () => {
    const ouvertes: string[] = [];
    const bloc = poserBlocCloser(doc, {
      lecture: CLOSER,
      valeurs: VALEURS,
      ouvrirLaPr: (url) => ouvertes.push(url),
      etats: new Map([
        ["calibration", { dit: { pr: PR, numero: 41, valeur: { model: "opus", effort: "high" } } }],
        ["maxRemovedLines", { dit: { pr: PR, numero: 42, valeur: 800 } }],
      ]),
    });
    const calibrage = ligneDe(bloc, "calibration");
    assert.match(texte(calibrage), /^Calibrationsonnet \/ mediumin the repository/);
    assert.deepEqual(parClasse(calibrage, "propose").map(texte), ["opus / high proposed inpull request #41"]);
    const retirees = ligneDe(bloc, "maxRemovedLines");
    assert.match(texte(retirees), /^Removed lines capnot set/);
    assert.deepEqual(parClasse(retirees, "propose").map(texte), ["800 lines proposed inpull request #42"]);
    (retirees.dessous("button").find(({ textContent }) => textContent === "pull request #42") ?? assert.fail("pas de lien")).click();
    assert.deepEqual(ouvertes, [PR]);
  });

  test("tant que rien n'est lu, chaque partie le dit ; une lecture ratée tient en une ligne, le détail au survol", () => {
    assert.match(texte(poserBlocCloser(doc)), /Reading the closer's passes…/);
    const sans = { sans: "the closer's settings unavailable", detail: "GitHub refused (HTTP 401)" };
    const rate = poserBlocCloser(doc, { lecture: { ...CLOSER, reglages: sans } });
    assert.match(texte(partieDe(rate, "reglages")), /the closer's settings unavailable/);
    assert.doesNotMatch(texte(rate), /HTTP 401/);
    assert.match(texte(partieDe(rate, "passes")), /#2531/, "les autres parties restent");
  });
});

// La vue entière : parade, ouvert sur Rail, sous le bandeau de santé (#2921), devant un GitHub qui garde ce qu'on lui écrit.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function jouer(): Promise<{ vue: Jouee; ecrits: [string, string, string][]; closer: unknown[][] }> {
  const lecture = LECTURE;
  const ecrits: [string, string, string][] = [];
  const closer: unknown[][] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    machines: () => [],
    plafondsDuree: async () => lecture,
    changerPlafondDuree: async (projet, cle, saisie): Promise<RenduDuPlafond> => {
      ecrits.push([projet, cle, saisie]);
      // Proposé par une PR : la branche d'intégration — ce que la lecture rend — ne change pas tant qu'elle n'est pas mergée.
      return { propose: PROPOSE, pr: PR, numero: 41, cle: cle as "gatesSeconds", valeur: Number(saisie) };
    },
    closerDeSante: async () => CLOSER,
    changerReglageDuCloser: async (projet, cle, saisie): Promise<RenduDuReglage> => {
      closer.push([projet, cle, saisie]);
      return { propose: PROPOSE, pr: PR, numero: 42, cle: cle as "maxRemovedLines", valeur: Number(saisie) };
    },
    changerVerificationDuCloser: async (projet, geste, saisie): Promise<RenduDesVerifications> => {
      closer.push([projet, geste, saisie]);
      // Proposée par une PR : la liste en vigueur reste celle de la branche d'intégration jusqu'au merge.
      return { propose: PROPOSE, pr: PR, numero: 43, geste, verification: saisie, liste: ["Unused CSS classes"] };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, ecrits, closer };
}
const bloc = (vue: Jouee) => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "plafonds-duree") ?? assert.fail("pas de plafonds");

describe("le bandeau de santé, dans la vue", () => {
  test("en vue, les chiffres ; les plafonds, le closer et les lignes de tous les projets sont repliés derrière une ligne, fermée à l'ouverture", async () => {
    const { vue } = await jouer();
    await repos();
    const [chiffres, reste] = vue.element("bandeau-sante").children;
    assert.deepEqual(chiffres?.dessous("section").map(({ dataset }) => dataset.bloc), ["temps-tickets", "bloque-sans-question"]);
    assert.equal(reste?.balise, "details");
    assert.deepEqual(reste?.dessous("section").map(({ dataset }) => dataset.bloc).filter((nom) => nom !== undefined), ["plafonds-duree", "closer", "de-tous-les-projets"]);
    assert.equal(reste?.dessous("summary")[0]?.textContent, "Caps, closer and all projectsduration caps, the closer, cost and closer of all projects");
  });

  test("un plafond changé dans le bandeau part au process principal à son `change`, et la rangée dit la PR ouverte, qui s'ouvre", async () => {
    const { vue, ecrits } = await jouer();
    await repos();
    assert.deepEqual(vue.dernier("plafondsDuree"), ["parade"]);
    sansEnregistrer(bloc(vue));
    const ligne = ligneDe(bloc(vue), "gatesSeconds");
    assert.deepEqual(parClasse(ligne, "par-pr").map(texte), [PAR_PR]);
    const champ = champDe(ligne);
    champ.value = "150";
    champ.declencher("input");
    champ.declencher("change");
    await repos();
    await repos();

    assert.deepEqual(ecrits, [["parade", "gatesSeconds", "150"]]);
    const apres = ligneDe(bloc(vue), "gatesSeconds");
    assert.match(texte(apres), /^Gates duration120 sin the repository/, "la valeur en vigueur reste, jusqu'au merge");
    assert.deepEqual(parClasse(apres, "propose").map(texte), ["150 s proposed inpull request #41"]);
    (apres.dessous("button").find(({ textContent }) => textContent === "pull request #41") ?? assert.fail("pas de lien vers la PR")).click();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
  });

  test("le closer du bandeau : une vérification ajoutée et un réglage changé partent au process principal ; la liste reprise, la PR du réglage dite", async () => {
    const { vue, closer } = await jouer();
    await repos();
    assert.deepEqual(vue.dernier("closerDeSante"), ["parade"]);
    const duCloser = () => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "closer") ?? assert.fail("pas de closer");
    assert.match(texte(partieDe(duCloser(), "passes")), /−1,234 lines/);

    const champ = partieDe(duCloser(), "en-plus").dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = "Doc sentences naming removed code";
    champ.declencher("input");
    boutonNomme(partieDe(duCloser(), "en-plus"), "add").click();
    await repos();
    await repos();
    assert.doesNotMatch(texte(partieDe(duCloser(), "en-plus")), /Doc sentences naming removed coderemove/, "la liste en vigueur, jusqu'au merge");
    assert.deepEqual(parClasse(partieDe(duCloser(), "en-plus"), "propose").map(texte), ["the check “Doc sentences naming removed code” proposed inpull request #43"]);
    assert.equal((partieDe(duCloser(), "en-plus").dessous("input")[0] ?? assert.fail("pas de champ")).value, "", "ajoutée, le champ se vide");

    const ligne = ligneDe(duCloser(), "maxRemovedLines");
    const nombre = champDe(ligne);
    nombre.value = "800";
    nombre.declencher("input");
    nombre.declencher("change");
    await repos();
    await repos();
    assert.match(texte(ligneDe(duCloser(), "maxRemovedLines")), /^Removed lines capnot set/, "la valeur en vigueur reste, jusqu'au merge");
    assert.deepEqual(parClasse(ligneDe(duCloser(), "maxRemovedLines"), "propose").map(texte), ["800 lines proposed inpull request #42"]);
    assert.deepEqual(closer, [
      ["parade", "ajouter", "Doc sentences naming removed code"],
      ["parade", "maxRemovedLines", "800"],
    ]);
  });

  test("les plafonds ne se règlent nulle part ailleurs que dans le bandeau de la page du projet", async () => {
    const { vue } = await jouer();
    for (const onglet of ["Rail", "Stations"] as const) {
      await ouvrirOnglet(vue, onglet);
      const plafonds = [...vue.element("rail").descendants()].filter(({ dataset }) => dataset.bloc === "plafonds-duree" || (dataset.cle !== undefined && PLAFONDS.some(({ cle }) => cle === dataset.cle)));
      assert.deepEqual(plafonds, [], onglet);
    }
    // Settings : ses réglages du projet n'en portent aucun.
    assert.deepEqual(CLES_DES_REGLAGES.filter((cle) => /drift|temps|duration|tests|gates/i.test(cle)), []);
  });
});

describe("les blocked-on-human sans question, sur Health", () => {
  test("à 0 le compteur est neutre, à 3 il est en alerte, et sans le champ il ne dit pas zéro", () => {
    const zero: Faux = poserBlocBloqueSansQuestion(doc, 0);
    assert.equal(zero.dataset.bloc, "bloque-sans-question");
    assert.equal(zero.dataset.sansQuestion, "zero");
    assert.match(texte(zero), /Blocked without a question/);
    assert.deepEqual(parClasse(zero, "sans-question-valeur").map(texte), ["0"]);
    assert.notEqual(parClasse(zero, "sans-question-ligne")[0]?.role, "alert");

    const trois: Faux = poserBlocBloqueSansQuestion(doc, 3);
    assert.equal(trois.dataset.sansQuestion, "alerte");
    assert.match(texte(trois), /Blocked without a question/);
    assert.deepEqual(parClasse(trois, "sans-question-valeur").map(texte), ["3"]);
    assert.match(texte(parClasse(trois, "sans-question-legende")[0] as Faux), /tickets blocked-on-human with no question — a defect to fix/);
    assert.equal(parClasse(trois, "sans-question-ligne")[0]?.role, "alert");
    assert.notEqual(zero.dataset.sansQuestion, trois.dataset.sansQuestion);

    for (const absent of [undefined, "3", -1, 1.5]) assert.equal(poserBlocBloqueSansQuestion(doc, absent).dataset.sansQuestion, "inconnu");
  });
});
