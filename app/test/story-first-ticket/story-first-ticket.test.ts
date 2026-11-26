// Le premier ticket du premier projet du chef, raconté pas à pas (#3302). D'abord ses morceaux : les lignes que chaque
// lecture du rail ajoute — pris, PR ouverte, en pass, renvoyé et pourquoi, repris, servi —, le récit gardé dans le
// stockage de la vue — seulement pour le premier projet, rangé pour de bon, jamais écrit par-dessus une trace illisible —,
// et ce que la page en dit. Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : un projet ajouté par « Add a
// project » sur un ordinateur sans projet, les lectures de son rail qui arrivent l'une après l'autre, le geste qui range ;
// et un chef qui avait déjà un projet, à qui rien n'est raconté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, comprendre, stepsDesTickets, holdFacts, type StepDuTicket, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import {
  avancer,
  CLE_DU_FIRST_TICKET,
  EN_PASS,
  MOTS,
  OUVRIR_LA_PR,
  poserStoryDuFirstTicket,
  firstTaken,
  PR_OUVERTE,
  TAKEN,
  RANGER,
  RENVOYE,
  REPRIS,
  SERVED,
  holdLeStoryDuFirstTicket,
  TITRE,
  type Line,
} from "../../src/vue/story-first-ticket/story-first-ticket.js";
import { REPOSITORY_DE_LA_VISIT } from "../../src/vue/visit/visit.js";
import { Faux, FauxStockage, jouerLaVue, type Jouee, type Answers, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-11-11T10:04:12.000Z";
const PR = { numero: 6, url: "https://github.com/chef/cantine/pull/6" };
const RAISON = "the review requested changes on `3f2a9c1` (PR #6):\n\nThe price of a dish shows `NaN €`.";
const step = (state: string, plus: Partial<StepDuTicket> = {}): StepDuTicket => ({ ticket: 5, etat: state, pr: null, renvoi: null, ...plus });
const TAKEN_LU = step("pris");
const EN_PASS_LU = step("en pass", { pr: PR });
const RENVOYE_LU = step("pris", { pr: PR, renvoi: { n: 1, raison: RAISON } });
const DE_NOUVEAU = step("en pass", { pr: PR, renvoi: { n: 1, raison: RAISON } });
const SERVED_LU = step("servi", { pr: PR });
const suivre = (lectures: StepDuTicket[], depart: Line[] = []) => lectures.reduce<Line[]>((lines, lue) => avancer(lines, lue, A), depart);
const cles = (lines: readonly Line[]) => lines.map(({ cle }) => cle);

describe("les lignes que chaque lecture du rail ajoute", () => {
  test("pris, PR ouverte, en pass, renvoyé et pourquoi, repris, de nouveau en pass, servi avec sa PR", () => {
    const lines = suivre([TAKEN_LU, EN_PASS_LU, RENVOYE_LU, DE_NOUVEAU, SERVED_LU]);
    assert.deepEqual(cles(lines), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.deepEqual(lines[1]?.pr, PR);
    assert.deepEqual([lines[3]?.n, lines[3]?.raison], [1, RAISON]);
    assert.deepEqual(lines[6]?.pr, PR);
  });

  test("une lecture qui ne change rien n'ajoute rien ; servi, le récit est fini", () => {
    const lines = suivre([TAKEN_LU, TAKEN_LU, EN_PASS_LU, EN_PASS_LU]);
    assert.deepEqual(cles(lines), ["pris", "pr", "pass"]);
    const served = suivre([SERVED_LU, TAKEN_LU, RENVOYE_LU], lines);
    assert.deepEqual(cles(served), ["pris", "pr", "pass", "servi"]);
  });

  test("vu d'abord en pass, déjà renvoyé une fois : la prise, le renvoi et sa raison, la PR, la pass", () => {
    assert.deepEqual(cles(suivre([DE_NOUVEAU])), ["pris", "renvoi", "pr", "pass"]);
  });

  test("un renvoi vu seulement à la pass suivante se dit quand même, une seule fois par rang ; un second renvoi se dit aussi", () => {
    const lines = suivre([TAKEN_LU, EN_PASS_LU, DE_NOUVEAU, DE_NOUVEAU, step("pris", { pr: PR, renvoi: { n: 2, raison: "the CI is red" } })]);
    assert.deepEqual(cles(lines), ["pris", "pr", "pass", "renvoi", "pass", "renvoi", "repris"]);
    assert.equal(lines[5]?.raison, "the CI is red");
  });

  test("une autre PR après un renvoi se dit ; la même ne se redit pas", () => {
    const autre = { numero: 9, url: "https://github.com/chef/cantine/pull/9" };
    const lines = suivre([TAKEN_LU, EN_PASS_LU, RENVOYE_LU, step("en pass", { pr: autre, renvoi: { n: 1, raison: RAISON } })]);
    assert.deepEqual(cles(lines), ["pris", "pr", "pass", "renvoi", "repris", "pr", "pass"]);
    assert.deepEqual(lines[5]?.pr, autre);
  });

  test("un ticket en attente, WAITING ou mis de côté n'ajoute rien", () => {
    assert.deepEqual(suivre([step("en attente"), step("WAITING"), step("86")]), []);
  });

  test("le premier ticket : le plus petit qu'une lecture montre pris ou en pass — jamais un ticket en attente ni un servi", () => {
    assert.equal(firstTaken([step("en attente", { ticket: 2 }), step("servi", { ticket: 1 }), step("en pass", { ticket: 7 }), step("pris", { ticket: 4 })]), 4);
    assert.equal(firstTaken([step("en attente"), step("servi")]), undefined);
  });
});

describe("le récit gardé dans le stockage de la vue", () => {
  test("le premier projet ajouté est raconté, ligne à ligne ; un autre projet ne l'est pas ; un second ajout ne décide plus rien", () => {
    const stockage = new FauxStockage();
    let rendus = 0;
    const story = holdLeStoryDuFirstTicket({ stockage, rendre: () => void rendus++, maintenant: () => A });
    story.projetAjoute("cantine", false);
    story.projetAjoute("parade", false);
    // Rien n'est encore pris : rien à montrer.
    story.observer("cantine", [step("en attente")]);
    assert.equal(story.de("cantine"), undefined);
    story.observer("parade", [TAKEN_LU]);
    assert.equal(story.de("parade"), undefined);
    story.observer("cantine", [TAKEN_LU]);
    story.observer("cantine", [EN_PASS_LU]);
    assert.deepEqual(cles(story.de("cantine")?.lignes ?? []), ["pris", "pr", "pass"]);
    assert.equal(story.de("cantine")?.ticket, 5);
    // Un ticket pris plus tard n'est pas le premier : le récit reste sur #5.
    story.observer("cantine", [step("pris", { ticket: 3 }), EN_PASS_LU]);
    assert.equal(story.de("cantine")?.ticket, 5);
    // Gardé : l'app rouverte reprend le récit là où il en était.
    const rouvert = holdLeStoryDuFirstTicket({ stockage, rendre: () => {}, maintenant: () => A });
    assert.deepEqual(rouvert.de("cantine"), story.de("cantine"));
    assert.ok(rendus >= 3);
  });

  test("un chef qui avait déjà un projet : rien n'est raconté, même au projet suivant", () => {
    const stockage = new FauxStockage();
    const story = holdLeStoryDuFirstTicket({ stockage, rendre: () => {}, maintenant: () => A });
    story.projetAjoute("cantine", true);
    story.observer("cantine", [TAKEN_LU]);
    story.projetAjoute("escale", false);
    story.observer("escale", [TAKEN_LU]);
    assert.equal(story.de("cantine"), undefined);
    assert.equal(story.de("escale"), undefined);
  });

  test("rangé : il ne revient plus, ni à la lecture suivante, ni l'app rouverte", () => {
    const stockage = new FauxStockage();
    const story = holdLeStoryDuFirstTicket({ stockage, rendre: () => {}, maintenant: () => A });
    story.projetAjoute("cantine", false);
    story.observer("cantine", [TAKEN_LU]);
    story.ranger();
    story.observer("cantine", [EN_PASS_LU]);
    assert.equal(story.de("cantine"), undefined);
    assert.equal(holdLeStoryDuFirstTicket({ stockage, rendre: () => {}, maintenant: () => A }).de("cantine"), undefined);
    assert.equal(JSON.parse(stockage.getItem(CLE_DU_FIRST_TICKET) ?? "{}").range, true);
  });

  test("une trace illisible ne décide rien : rien n'est raconté, et rien n'est écrit par-dessus", () => {
    for (const illisible of ["{pas du json", JSON.stringify({ projet: 3, lignes: [] }), JSON.stringify({ projet: "cantine", lignes: [{ cle: "autre", le: A }] })]) {
      const stockage = new FauxStockage();
      stockage.setItem(CLE_DU_FIRST_TICKET, illisible);
      const story = holdLeStoryDuFirstTicket({ stockage, rendre: () => assert.fail("rien ne se redessine"), maintenant: () => A });
      story.projetAjoute("cantine", false);
      story.observer("cantine", [TAKEN_LU]);
      story.ranger();
      assert.equal(story.de("cantine"), undefined);
      assert.equal(stockage.getItem(CLE_DU_FIRST_TICKET), illisible);
    }
  });

  test("un stockage qui refuse la lecture ne décide rien ; un stockage plein garde le récit le temps que l'app tourne", () => {
    const refuse = { getItem: () => { throw new Error("denied"); }, setItem: () => assert.fail("rien ne s'écrit") };
    const muet = holdLeStoryDuFirstTicket({ stockage: refuse, rendre: () => {}, maintenant: () => A });
    muet.projetAjoute("cantine", false);
    muet.observer("cantine", [TAKEN_LU]);
    assert.equal(muet.de("cantine"), undefined);

    const plein = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    const tenu = holdLeStoryDuFirstTicket({ stockage: plein, rendre: () => {}, maintenant: () => A });
    tenu.projetAjoute("cantine", false);
    tenu.observer("cantine", [TAKEN_LU]);
    assert.deepEqual(cles(tenu.de("cantine")?.lignes ?? []), ["pris"]);
  });
});

describe("ce que la page en dit", () => {
  test("son titre et « dismiss » ; une ligne par étape, son mot puis ce qu'il veut dire ; la raison d'un renvoi ; le lien de la PR", () => {
    const facts: string[] = [];
    const lines = suivre([TAKEN_LU, EN_PASS_LU, RENVOYE_LU, DE_NOUVEAU, SERVED_LU]);
    const pose = poserStoryDuFirstTicket(doc, { ticket: 5, lignes: lines }, { ouvrir: () => void facts.push("ouvrir"), ranger: () => void facts.push("ranger") }) as unknown as Faux;
    assert.equal(pose.dessous("strong")[0]?.textContent, TITRE(5));
    const steps = pose.dessous("li");
    assert.deepEqual(steps.map(({ dataset }) => dataset.etape), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.deepEqual(
      steps.map((li) => [li.dessous("strong")[0]?.textContent, li.dessous("span").find(({ className }) => className === "dit")?.textContent]),
      [
        [MOTS.pris, TAKEN(5)],
        [MOTS.pr, PR_OUVERTE(5, 6)],
        [MOTS.pass, EN_PASS],
        [MOTS.renvoi, RENVOYE],
        [MOTS.repris, REPRIS(5)],
        [MOTS.pass, EN_PASS],
        [MOTS.servi, SERVED(5, 6)],
      ],
    );
    assert.equal(steps[3]?.dessous("p").find(({ className }) => className === "raison")?.textContent, RAISON.replace("PR #6", "the PR of #5"));
    // Le mot de la cuisine, et ce qu'il veut dire en clair : une copie à lui, les gates, la CI, la relecture.
    assert.match(TAKEN(5), /its own copy of the repository/);
    assert.match(EN_PASS, /gates.*CI.*review/);
    // Le lien de la PR : sur sa ligne ouverte et sur le service — pas ailleurs.
    assert.deepEqual(
      steps.map((li) => li.dessous("button").map(({ textContent }) => textContent)),
      [[], [OUVRIR_LA_PR(5, 6)], [], [], [], [], [OUVRIR_LA_PR(5, 6)]],
    );
    steps[6]?.dessous("button")[0]?.click();
    (pose.dessous("button").find(({ textContent }) => textContent === RANGER) ?? assert.fail("pas de « dismiss »")).click();
    assert.deepEqual(facts, ["ouvrir", "ranger"]);
  });
});

describe("ce que les faits en donnent", () => {
  test("le rail avec sa PR et son dernier renvoi, puis les servis et leur PR mergée — rien d'illisible, aucune adresse qui ne s'ouvre pas", () => {
    const brut = {
      etat: "ouverte",
      lu: A,
      dernierTick: A,
      compteurs: { rail: 2, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 2 },
      dernierEvenement: null,
      rail: [
        { ticket: 5, etat: "pris", titre: "La carte", url: "https://github.com/chef/cantine/issues/5", pr: PR, renvoi: { n: 1, raison: RAISON } },
        { ticket: 7, etat: "en attente", titre: "Le menu", url: "https://github.com/chef/cantine/issues/7" },
      ],
      livres: [
        { ticket: 3, titre: "Les allergènes", url: null, livre: A, station: null, pr: "https://github.com/chef/cantine/pull/4" },
        { ticket: 2, titre: "Le pain", url: null, livre: A, station: null, pr: "file:///etc/passwd" },
      ],
    };
    const lus = comprendre(JSON.stringify(brut));
    assert.ok(!("informe" in lus), "informe" in lus ? lus.informe : "");
    assert.deepEqual(stepsDesTickets(lus as Facts), [
      { ticket: 5, etat: "pris", pr: PR, renvoi: { n: 1, raison: RAISON } },
      { ticket: 7, etat: "en attente", pr: null, renvoi: null },
      { ticket: 3, etat: "servi", pr: { numero: 4, url: "https://github.com/chef/cantine/pull/4" }, renvoi: null },
      { ticket: 2, etat: "servi", pr: null, renvoi: null },
    ]);
    // Une PR qui n'a pas la forme rend sa carte illisible, comme tout champ du rail : rien n'y est deviné.
    const informe = comprendre(JSON.stringify({ ...brut, rail: [{ ...brut.rail[0], pr: { numero: "six", url: PR.url } }] }));
    assert.ok(!("informe" in informe));
    assert.deepEqual(stepsDesTickets(informe as Facts).filter(({ etat: state }) => state !== "servi"), []);
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const REPOSITORY = "chef/cantine";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = (projects: Project[]) => () => ({
  configuration: pourLaBar({ chemin: CHEMIN, projets: projects }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const PARADE: Project = { nom: "parade", dossier: "/home/chef/Brigade/parade", depot: "chef/parade", base: "main" };
const VISIT: Project = { nom: "brigade", dossier: "/home/chef/Brigade/brigade", depot: REPOSITORY_DE_LA_VISIT, base: "main" };
type Entree = Facts["rail"][number];
const entree = (state: string, plus: Partial<Entree> = {}): Entree => ({ ticket: 5, etat: state, titre: "La carte du midi", url: `https://github.com/${REPOSITORY}/issues/5`, ...plus });
const read = (rail: Entree[], livres: NonNullable<Facts["livres"]> = []): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: livres.length },
  dernierEvenement: null,
  rail,
  cooks: [],
  attend: [],
  livres,
});

// « Add a project », puis le dépôt chef/cantine : la page de cantine s'ouvre, déjà prête pour Brigade.
async function ajouterCantine(stockage: FauxStockage, projects: Project[] = [], answers: Answers = {}) {
  let vue: Jouee | undefined;
  vue = await jouerLaVue(
    {
      demarrage: demarrage(projects),
      stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
      compteGitHub: () => ({ login: "octo-chef" }),
      stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
      depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
      ouvrirDUneStation: (name, repository, base) => {
        vue?.dire("surConfiguration", pourLaBar({ chemin: CHEMIN, projets: [...projects, { nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
        return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
      },
      projetsServis: () => ({ depots: [REPOSITORY] }),
      checkRepoSetup: () => ({ ready: true, missingBindings: [], missingLabels: [] }),
      espace: () => [SECOND],
      departDuProjet: () => ({ aucune: true }),
      ...answers,
    },
    { stockage },
  );
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  (vue.element("ajout").dessous("button").find(({ textContent }) => textContent === REPOSITORY) ?? assert.fail("pas de dépôt")).click();
  await repos();
  assert.equal(vue.element("espace").textContent, "cantine");
  return vue;
}
async function lire(vue: Jouee, facts: Facts) {
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const section = (vue: Jouee) => vue.element("recit-premier-ticket");
const stepsDites = (vue: Jouee) => section(vue).dessous("li").map(({ dataset }) => dataset.etape);

describe("la vue jouée : le premier ticket du premier projet, raconté à mesure qu'il se passe", () => {
  test("ajouté sur un ordinateur sans projet : chaque lecture de son rail ajoute sa ligne ; servi, le lien ouvre sa PR ; rangé, il ne revient plus", async () => {
    const stockage = new FauxStockage();
    const ouvertes: string[] = [];
    const vue = await ajouterCantine(stockage, [VISIT], {
      ouvrirPrDuCook: (project, ticket) => (ouvertes.push(`cook ${project}#${ticket}`), false),
      ouvrirPr: (project, ticket) => (ouvertes.push(`servi ${project}#${ticket}`), true),
    });
    await lire(vue, read([entree("en attente")]));
    assert.equal(section(vue).hidden, true);
    await lire(vue, read([entree("pris", { station: "box/claude" })]));
    assert.equal(section(vue).hidden, false);
    assert.deepEqual(stepsDites(vue), ["pris"]);
    await lire(vue, read([entree("en pass", { pr: PR })]));
    await lire(vue, read([entree("pris", { pr: PR, renvoi: { n: 1, raison: RAISON } })]));
    await lire(vue, read([entree("en pass", { pr: PR, renvoi: { n: 1, raison: RAISON } })]));
    await lire(vue, read([], [{ ticket: 5, titre: "La carte du midi", url: null, livre: A, station: "box/claude", pr: PR.url }]));
    assert.deepEqual(stepsDites(vue), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.ok(section(vue).dessous("p").some(({ textContent }) => textContent === RAISON.replace("PR #6", "the PR of #5")));
    const served = section(vue).dessous("li").at(-1) ?? assert.fail("pas de ligne servie");
    (served.dessous("button")[0] ?? assert.fail("pas de lien")).click();
    await repos();
    assert.deepEqual(ouvertes, ["cook cantine#5", "servi cantine#5"]);
    (section(vue).dessous("button").find(({ textContent }) => textContent === RANGER) ?? assert.fail("pas de « dismiss »")).click();
    await repos();
    assert.equal(section(vue).hidden, true);
    await lire(vue, read([entree("pris", { ticket: 8 })]));
    assert.equal(section(vue).hidden, true);
    // L'app rouverte : rien ne revient.
    const rouverte = await jouerLaVue({ demarrage: demarrage([VISIT, { nom: "cantine", dossier: "/home/chef/Brigade/cantine", depot: REPOSITORY, base: "main" }]) }, { stockage });
    await repos();
    assert.equal(rouverte.element("recit-premier-ticket").hidden, true);
  });

  test("un chef qui avait déjà un projet : son nouveau projet n'a rien de raconté", async () => {
    const stockage = new FauxStockage();
    const vue = await ajouterCantine(stockage, [PARADE]);
    await lire(vue, read([entree("pris")]));
    await lire(vue, read([entree("en pass", { pr: PR })]));
    assert.equal(section(vue).hidden, true);
    assert.deepEqual(JSON.parse(stockage.getItem(CLE_DU_FIRST_TICKET) ?? "{}"), { projet: null, lignes: [] });
  });
});
