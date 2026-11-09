// Le bandeau au-dessus du rail (#2490, #2921, ex-Kitchen > Health) : derrière une ligne, les plafonds de durée, réglés là et
// nulle part ailleurs dans la page du projet, le closer et les lignes de tous les projets. Les chiffres — le temps des
// tickets, le premier coup — sont dans la bande du rail (#3013, rail/bande-rail.test.ts). Les blocs sont joués avec le faux élément
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
import { poserBlocCloser } from "../../../src/vue/projet/bandeau-sante/Closer.js";
import { EN_COURS, poserBlocPlafondsDuree } from "../../../src/vue/projet/bandeau-sante/PlafondsDuree.js";
import { PAR_PR } from "../../../src/vue/composants/reglage/reglage.js";
import { Faux, jouerLaVue, ouvrirOnglet, repos, type Jouee } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

const texte = (racine: Faux) => racine.textContent;
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));

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
    assert.match(texte(poserBlocPlafondsDuree(doc, {})), /Reading the caps of the repository…/);
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

// La vue entière : parade, ouvert sur Stations, sous le bandeau de santé (#2921, #3013), devant un GitHub qui garde ce qu'on lui écrit.
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
  // Le bandeau est en tête de Stations depuis que Rail n'a plus que la bande des chiffres (#3013).
  await ouvrirOnglet(vue, "Stations");
  return { vue, ecrits, closer };
}
const bloc = (vue: Jouee) => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "plafonds-duree") ?? assert.fail("pas de plafonds");

describe("le bandeau de santé, dans la vue", () => {
  test("ni chiffre, ni titre : les plafonds, le closer et les lignes de tous les projets sont repliés derrière une ligne, fermée à l'ouverture", async () => {
    const { vue } = await jouer();
    await repos();
    // Les chiffres sont dans la bande du rail (#3013) : le bandeau n'a que sa ligne repliée.
    const [reste, ...autres] = vue.element("bandeau-sante").children;
    assert.deepEqual(autres, []);
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
