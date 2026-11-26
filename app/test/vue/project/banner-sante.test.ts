// Le bandeau de santé (#2490, #2921, ex-Kitchen > Health), une section de Settings (#3014) : les plafonds de durée, réglés là et
// nulle part ailleurs dans la page du projet, le closer et les lignes de tous les projets. Les chiffres — le temps des
// tickets, le premier coup — ne sont plus sur le rail (#3013, #3523). Les blocs sont joués avec le faux élément
// de l'app (aides/fausse-vue.ts), puis la vue entière, telle qu'elle est.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { ReadDuCloser, RenduDesVerifications, RenduDuSetting } from "../../../src/closer-sante.ts";
import { CAPS, type ReadDesCaps, type RenduDuCap } from "../../../src/caps-duree.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import { CLES as CLES_DES_SETTINGS, PROPOSE } from "../../../src/settings-du-project.ts";
import { poserBlocCloser } from "../../../src/vue/project/banner-sante/Closer.js";
import { EN_COURS, poserBlocCapsDuree } from "../../../src/vue/project/banner-sante/DurationCaps.js";
import { PAR_PR } from "../../../src/vue/composants/setting/setting.js";
import { Faux, jouerLaVue, ouvrirRead, ouvrirOnglet, repos, type Jouee } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

const texte = (racine: Faux) => racine.textContent;
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));

const READ: ReadDesCaps = {
  branche: "main",
  plafonds: CAPS.map((cap) => ({ cle: cap.cle, nom: cap.nom, unite: cap.unite, entier: cap.entier, duree: cap.duree, defaut: "defaut" in cap ? cap.defaut : null, valeur: cap.cle === "gatesSeconds" ? 120 : null })),
};
// Une rangée de réglage (composants/setting, #2920), par sa clé.
const lineDe = (racine: Faux, cle: string) => [...racine.descendants()].find((pose) => pose.className === "reglage" && pose.dataset.cle === cle) ?? assert.fail(`pas de ligne ${cle}`);
const champDe = (line: Faux) => line.dessous("input")[0] ?? assert.fail("pas de champ");
const PR = "https://github.com/chef/parade/pull/41";
// Aucun « save » sur un écran de réglages (#2920) : un bouton qui enregistre, ou une classe qui le nomme.
const sansEnregistrer = (racine: Faux) => {
  assert.deepEqual(racine.dessous("button").map(({ textContent }) => textContent).filter((libelle) => /^(save|saving…)$/i.test(libelle)), []);
  assert.deepEqual([...racine.descendants()].filter(({ className }) => /enregistrer/.test(className)), []);
};

describe("les plafonds de durée, sur Health", () => {
  test("le seuil du temps perdu par ticket tel que la station le publie, sans champ ; les durées du dépôt ; les autres repliés", () => {
    const bloc = poserBlocCapsDuree(doc, { lecture: READ, lostTimeMaxMin: 2 });
    const perduMax = lineDe(bloc, "lostTimeMaxMin");
    assert.match(texte(perduMax), /^Lost time per ticket2 minmedian of recent tickets, published by the stationnot editable here yet/);
    assert.equal(perduMax.dessous("input").length, 0);
    assert.equal(perduMax.dataset.depot, undefined, "il ne se change pas d'ici : pas de PR à annoncer");
    assert.match(texte(lineDe(bloc, "gatesSeconds")), /^Gates duration120 sin the repository/);
    // Gardé dans le dépôt : chaque rangée d'un seuil dit qu'un changement ouvre une PR.
    for (const { cle } of CAPS) {
      const line = lineDe(bloc, cle);
      assert.equal(line.dataset.depot, "", cle);
      assert.deepEqual(parClasse(line, "par-pr").map(texte), [PAR_PR], cle);
    }
    sansEnregistrer(bloc);
    const replie = bloc.dessous("details")[0] ?? assert.fail("pas de repli");
    assert.match(texte(replie), /Other drift thresholdsnone set in the repository/);
    assert.equal(replie.dessous("input").length, CAPS.filter(({ duree }) => !duree).length);
  });

  test("le champ s'applique à son `change`, sans « save », quand il change la valeur du dépôt ; ce qui est tapé est gardé", () => {
    const changes: [string, string][] = [];
    const choisis: [string, string][] = [];
    const bloc = poserBlocCapsDuree(doc, { lecture: READ, changer: (cle, saisie) => changes.push([cle, saisie]), choisir: (cle, choisi) => choisis.push([cle, choisi]) });
    sansEnregistrer(bloc);
    const line = lineDe(bloc, "gatesSeconds");
    const champ = champDe(line);
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
    const nonPose = champDe(lineDe(bloc, "ticketTokens"));
    nonPose.value = " ";
    nonPose.declencher("change");
    assert.deepEqual(changes, [
      ["gatesSeconds", "150"],
      ["gatesSeconds", ""],
    ]);
  });

  test("en cours, la rangée le dit et son champ attend ; la PR ouverte se dit avec la valeur proposée et s'ouvre ; un refus garde son détail au survol", () => {
    const ouvertes: string[] = [];
    const bloc = poserBlocCapsDuree(doc, {
      lecture: READ,
      ouvrir: (url) => ouvertes.push(url),
      etats: new Map([
        ["gatesSeconds", { dit: { pr: PR, numero: 41, valeur: 150 } }],
        ["lostTokens", { choisi: "abc", dit: { refus: "nothing was changed: tokens lost must be a whole number greater than zero", detail: "" } }],
        ["ticketTokens", { choisi: "800", enCours: true }],
      ]),
    });
    const proposee = lineDe(bloc, "gatesSeconds");
    assert.match(texte(proposee), /^Gates duration120 sin the repository/, "la valeur montrée reste celle en vigueur, jusqu'au merge");
    assert.equal(champDe(proposee).value, "120");
    assert.deepEqual(parClasse(proposee, "propose").map(texte), ["150 s proposed inpull request #41"]);
    (proposee.dessous("button").find(({ textContent }) => textContent === "pull request #41") ?? assert.fail("pas de lien vers la PR")).click();
    assert.deepEqual(ouvertes, [PR]);

    const retrait = poserBlocCapsDuree(doc, { lecture: READ, etats: new Map([["ticketTokens", { dit: { pr: PR, numero: 42, valeur: null } }]]) });
    assert.match(texte(lineDe(retrait, "ticketTokens")), /removal proposed inpull request #42/);

    const refusee = lineDe(bloc, "lostTokens");
    assert.match(texte(refusee), /nothing was changed/);
    assert.equal(champDe(refusee).value, "abc", "ce que le chef a tapé reste dans le champ");

    const enCours = lineDe(bloc, "ticketTokens");
    assert.deepEqual(parClasse(enCours, "en-cours").map(texte), [EN_COURS]);
    assert.equal(champDe(enCours).disabled, true);
  });

  test("tant que rien n'est lu, une ligne le dit ; une lecture ratée tient en une ligne", () => {
    assert.match(texte(poserBlocCapsDuree(doc, {})), /Reading the caps of the repository…/);
    const rate = poserBlocCapsDuree(doc, { lecture: { sans: "duration caps unavailable", detail: "GitHub refused (HTTP 401)" } });
    assert.match(texte(rate), /duration caps unavailable/);
    assert.doesNotMatch(texte(rate), /HTTP 401/, "le détail est au survol, pas à l'écran");
  });
});

// Le closer (#2491) : trois passes — une en cours, une mergée, une fermée sans merge —, deux vérifications en plus, et ses
// réglages, le calibrage et le plafond de tokens posés dans le dépôt.
const pass = (numero: number, autres: Partial<Extract<ReadDuCloser["passes"], { liste: unknown }>["liste"][number]>) => ({
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
const CLOSER: ReadDuCloser = {
  passes: {
    liste: [
      pass(2531, {
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
      pass(2477, { ouverteLe: "2026-10-08T08:00:00.000Z", candidats: [{ id: "M1", quoi: "x" }], pr: { numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 } }),
      pass(2410, { ouverteLe: "2026-10-06T08:00:00.000Z", pr: { numero: 2412, url: "https://github.com/chef/parade/pull/2412", mergee: false, retirees: 0, ajoutees: 0 } }),
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
const buttonNomme = (racine: Faux, libelle: string) => racine.dessous("button").find((button) => button.textContent === libelle) ?? assert.fail(`pas de bouton ${libelle}`);

describe("le closer, sur Health", () => {
  test("ses passes, chacune avec ce qu'elle a retiré — ou pourquoi rien —, et sa PR", () => {
    const ouverts: string[] = [];
    const bloc = poserBlocCloser(doc, { lecture: CLOSER, ouvrir: (url) => ouverts.push(url) });
    assert.equal(bloc.dataset.bloc, "closer");
    const passes = partieDe(bloc, "passes").children.filter(({ className }) => className === "passe");
    assert.deepEqual(passes.map(texte), [
      "#2531Oct 10in progress — its PR is in the pass3 candidatesPR of #2531",
      "#2477Oct 8its PR merged1 candidatePR of #2477",
      "#2410Oct 6nothing removedits PR was closed without a mergeno candidatePR of #2410",
    ]);
    buttonNomme(bloc, "PR of #2477").click();
    buttonNomme(bloc, "#2531").click();
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
    const actions: [string, string][] = [];
    const bloc = poserBlocCloser(doc, { lecture: CLOSER, changerVerification: (action, saisie) => actions.push([action, saisie]) });
    const en = partieDe(bloc, "en-plus");
    assert.match(texte(en), /Unused CSS classesremove/);
    const addition = buttonNomme(en, "add");
    assert.equal(addition.disabled, true);
    assert.equal(addition.className, "recommande");
    const champ = en.dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = " Doc sentences naming removed code ";
    champ.declencher("input");
    assert.equal(addition.disabled, false);
    addition.click();
    buttonNomme(en, "remove").click();
    assert.deepEqual(actions, [
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
    assert.match(texte(lineDe(bloc, "calibration")), /^Calibrationsonnet \/ mediumin the repository/);
    assert.match(texte(lineDe(bloc, "cooksBelow")), /^Start condition\?not setthe station's, or none in flightnot read on GitHub yet/);
    assert.match(texte(lineDe(bloc, "maxTokens")), /^Tokens cap300,000 tokensin the repositorynot read on GitHub yet/);
    assert.match(texte(lineDe(bloc, "maxRemovedLines")), /^Removed lines capnot setthe station's, or 500 lines/);
    assert.doesNotMatch(texte(lineDe(bloc, "maxRemovedLines")), /not read on GitHub/);
    sansEnregistrer(partieDe(bloc, "reglages"));
    for (const cle of ["calibration", "cooksBelow", "maxTokens", "maxRemovedLines"]) assert.deepEqual(parClasse(lineDe(bloc, cle), "par-pr").map(texte), [PAR_PR], cle);

    const lines = lineDe(bloc, "maxRemovedLines");
    const champ = champDe(lines);
    champ.value = "800";
    champ.declencher("input");
    champ.declencher("change");

    const calibration = lineDe(bloc, "calibration");
    const [modele = assert.fail("pas de modèle"), effort = assert.fail("pas d'effort")] = calibration.dessous("select");
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
    const calibration = lineDe(bloc, "calibration");
    assert.match(texte(calibration), /^Calibrationsonnet \/ mediumin the repository/);
    assert.deepEqual(parClasse(calibration, "propose").map(texte), ["opus / high proposed inpull request #41"]);
    const retirees = lineDe(bloc, "maxRemovedLines");
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

// La vue entière : parade, ouvert sur Settings, sous le bandeau de santé (#2921, #3014), devant un GitHub qui garde ce qu'on lui écrit.
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function jouer(): Promise<{ vue: Jouee; ecrits: [string, string, string][]; closer: unknown[][] }> {
  const read = READ;
  const ecrits: [string, string, string][] = [];
  const closer: unknown[][] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    machines: () => [],
    plafondsDuree: async () => read,
    changerPlafondDuree: async (project, cle, saisie): Promise<RenduDuCap> => {
      ecrits.push([project, cle, saisie]);
      // Proposé par une PR : la branche d'intégration — ce que la lecture rend — ne change pas tant qu'elle n'est pas mergée.
      return { propose: PROPOSE, pr: PR, numero: 41, cle: cle as "gatesSeconds", valeur: Number(saisie) };
    },
    closerDeSante: async () => CLOSER,
    changerReglageDuCloser: async (project, cle, saisie): Promise<RenduDuSetting> => {
      closer.push([project, cle, saisie]);
      return { propose: PROPOSE, pr: PR, numero: 42, cle: cle as "maxRemovedLines", valeur: Number(saisie) };
    },
    changerVerificationDuCloser: async (project, action, saisie): Promise<RenduDesVerifications> => {
      closer.push([project, action, saisie]);
      // Proposée par une PR : la liste en vigueur reste celle de la branche d'intégration jusqu'au merge.
      return { propose: PROPOSE, pr: PR, numero: 43, geste: action, verification: saisie, liste: ["Unused CSS classes"] };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  // Le bandeau est une section de Settings (#3014).
  await ouvrirRead(vue, "Settings");
  return { vue, ecrits, closer };
}
const bloc = (vue: Jouee) => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "plafonds-duree") ?? assert.fail("pas de plafonds");

describe("le bandeau de santé, dans la vue", () => {
  test("ni chiffre : une section de Settings, sous son titre, montre les plafonds, le closer et les lignes de tous les projets, sans rien à déplier", async () => {
    const { vue } = await jouer();
    await repos();
    // Les chiffres sont dans la bande du rail (#3013) : la section n'a que son titre et ses quatre blocs (#3014) —
    // les chiffres d'autonomie du projet compris (#3222).
    // La fausse vue ne rejoue pas la place des éléments de index.html : la section se lit dans le fichier, groupe de Settings.
    const html = readFileSync(join(import.meta.dirname, "../../../src/vue/index.html"), "utf8");
    const settings = html.slice(html.indexOf('<section id="etat"'), html.indexOf('<div id="reglages-machine"'));
    assert.match(settings, /<section id="reglages-sante" class="groupe"[^>]*>\s*<h2 [^>]*class="niveau-du-groupe">Caps, closer and all projects<\/h2>\s*<div id="bandeau-sante"><\/div>/);
    assert.equal(vue.element("etat").hidden, false);
    const section = vue.element("bandeau-sante");
    assert.deepEqual(section.children.map(({ dataset }) => dataset.bloc), ["plafonds-duree", "closer", "know-how", "temps-de-la-passe", "chiffres-autonomie", "post-mortems", "de-tous-les-projets"]);
    assert.deepEqual(section.children.filter(({ balise }) => balise === "details"), [], "rien à déplier pour les voir");
  });

  test("tout ce que la ligne repliée montrait est dans Settings : chaque plafond, les parties du closer, Cost et Closer de tous les projets", async () => {
    const { vue } = await jouer();
    await repos();
    for (const { cle } of CAPS) assert.ok(lineDe(bloc(vue), cle), cle);
    const duCloser = vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "closer") ?? assert.fail("pas de closer");
    assert.match(texte(partieDe(duCloser, "passes")), /#2477Oct 8its PR merged/);
    assert.ok(partieDe(duCloser, "en-plus"));
    assert.ok(lineDe(duCloser, "maxRemovedLines"));
    assert.deepEqual(vue.element("de-tous-les-projets").dessous("button").map(({ ariaLabel }) => ariaLabel), ["the cost of all projects", "the weekly summaries of all projects"]);
  });

  test("ni sur Rail, ni sur Stations : la section n'est posée que Settings ouvert, et se repose à sa réouverture", async () => {
    const { vue } = await jouer();
    for (const onglet of ["Rail", "Stations"] as const) {
      await ouvrirOnglet(vue, onglet);
      assert.equal(vue.element("etat").hidden, true, onglet);
      assert.deepEqual(vue.element("bandeau-sante").children, [], onglet);
      assert.doesNotMatch(vue.element("rail").textContent, /Caps, closer and all projects/, onglet);
    }
    await ouvrirRead(vue, "Settings");
    assert.equal(vue.element("etat").hidden, false);
    assert.deepEqual(vue.element("bandeau-sante").children.map(({ dataset }) => dataset.bloc), ["plafonds-duree", "closer", "know-how", "temps-de-la-passe", "chiffres-autonomie", "post-mortems", "de-tous-les-projets"]);
  });

  test("un plafond changé dans le bandeau part au process principal à son `change`, et la rangée dit la PR ouverte, qui s'ouvre", async () => {
    const { vue, ecrits } = await jouer();
    await repos();
    assert.deepEqual(vue.dernier("plafondsDuree"), ["parade"]);
    sansEnregistrer(bloc(vue));
    const line = lineDe(bloc(vue), "gatesSeconds");
    assert.deepEqual(parClasse(line, "par-pr").map(texte), [PAR_PR]);
    const champ = champDe(line);
    champ.value = "150";
    champ.declencher("input");
    champ.declencher("change");
    await repos();
    await repos();

    assert.deepEqual(ecrits, [["parade", "gatesSeconds", "150"]]);
    const apres = lineDe(bloc(vue), "gatesSeconds");
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
    assert.match(texte(partieDe(duCloser(), "passes")), /#2477Oct 8its PR merged/);

    const champ = partieDe(duCloser(), "en-plus").dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = "Doc sentences naming removed code";
    champ.declencher("input");
    buttonNomme(partieDe(duCloser(), "en-plus"), "add").click();
    await repos();
    await repos();
    assert.doesNotMatch(texte(partieDe(duCloser(), "en-plus")), /Doc sentences naming removed coderemove/, "la liste en vigueur, jusqu'au merge");
    assert.deepEqual(parClasse(partieDe(duCloser(), "en-plus"), "propose").map(texte), ["the check “Doc sentences naming removed code” proposed inpull request #43"]);
    assert.equal((partieDe(duCloser(), "en-plus").dessous("input")[0] ?? assert.fail("pas de champ")).value, "", "ajoutée, le champ se vide");

    const line = lineDe(duCloser(), "maxRemovedLines");
    const nombre = champDe(line);
    nombre.value = "800";
    nombre.declencher("input");
    nombre.declencher("change");
    await repos();
    await repos();
    assert.match(texte(lineDe(duCloser(), "maxRemovedLines")), /^Removed lines capnot set/, "la valeur en vigueur reste, jusqu'au merge");
    assert.deepEqual(parClasse(lineDe(duCloser(), "maxRemovedLines"), "propose").map(texte), ["800 lines proposed inpull request #42"]);
    assert.deepEqual(closer, [
      ["parade", "ajouter", "Doc sentences naming removed code"],
      ["parade", "maxRemovedLines", "800"],
    ]);
  });

  test("les plafonds ne se règlent nulle part ailleurs que dans le bandeau de la page du projet", async () => {
    const { vue } = await jouer();
    for (const onglet of ["Rail", "Stations"] as const) {
      await ouvrirOnglet(vue, onglet);
      const caps = [...vue.element("rail").descendants()].filter(({ dataset }) => dataset.bloc === "plafonds-duree" || (dataset.cle !== undefined && CAPS.some(({ cle }) => cle === dataset.cle)));
      assert.deepEqual(caps, [], onglet);
    }
    // Settings : ses réglages du projet n'en portent aucun.
    assert.deepEqual(CLES_DES_SETTINGS.filter((cle) => /drift|temps|duration|tests|gates/i.test(cle)), []);
  });
});
