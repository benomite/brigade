// Ce qui est avant le rail (#1836, #697) : un rail vide ne veut pas dire un projet fini. Le tableau de la cuisine lu
// ici est bâti par le runtime lui-même (runtime/src/tableau/publication/publier.ts, `tableauDuJournal`) sur un vrai
// journal, rendu en corps d'issue, puis lu comme l'app le lit de GitHub (tableau/lecture.ts, tableau/rail.ts) : la forme
// que l'app lit est tenue contre celle que la box publie. L'app compte ce que la box liste, range chaque issue sous le
// mot qu'elle porte, et n'y déduit rien. À côté, la vue jouée telle qu'elle est (aides/fausse-vue.ts) : la barre en
// tête du rail, la colonne Backlog qu'elle déplie, la fiche qu'une carte ouvre, et ce que dit un rail vide.
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import type { Issue as IssueGitHub } from "../../runtime/src/github.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal } from "../../runtime/src/manager-cli.ts";
import { tableauDuJournal } from "../../runtime/src/tableau/publication/publier.ts";
import { rendreLeTableau } from "../../runtime/src/tableau/rendu/rendre.ts";
import { DEPOT } from "../../runtime/test/outils.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { COMMANDE, comprendre, GROUPES, grouper, tenirAmont, voir, type Vu } from "../src/amont.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { COMMANDE as COMMANDE_MANAGER } from "../src/manager.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { pourLaBarre } from "../src/barre.ts";
import { lireLeTableauDuDepot } from "../src/tableau/lecture.ts";
import { lectureDuTableau } from "../src/tableau/rail.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-10-15T09:12:04.000Z";
const LU = new Date("2026-10-15T09:12:00.000Z");
const GENERE_LE = new Date("2026-10-15T09:12:30.000Z");

// Une issue ouverte, telle que la box la lit de GitHub.
const ouverte = (number: number, labels: string[] = [], autres: Partial<IssueGitHub> = {}): IssueGitHub => ({
  number,
  title: `Ticket ${number}`,
  labels,
  state: "open",
  createdAt: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
  updatedAt: "2026-10-02T00:00:00Z",
  url: `https://github.com/${DEPOT}/issues/${number}`,
  ...autres,
});

// Un journal, et ce que la box publierait de lui : le corps du tableau de la cuisine, avec les issues ouvertes qu'on
// lui donne, lu par l'app comme elle le lit de GitHub ; et `manager` — l'état du manager —, tel quel.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-amont-"));
  let minute = 0;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.UTC(2026, 9, 15, 9, ++minute)) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null, author = "manager") => void journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const corps = (issues: IssueGitHub[]): string => rendreLeTableau(tableauDuJournal(journal, "brigade", LU, { depot: DEPOT, ouvertes: { lu: LU.toISOString(), issues } }), GENERE_LE);
  const amont = async (issues: IssueGitHub[]): Promise<Lecture> => {
    const publie = corps(issues);
    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: async () => ({ status: 200, data: [{ number: 1, title: "Kitchen board", body: publie, html_url: `https://github.com/${DEPOT}/issues/1` }] }), maintenant: () => new Date(A) });
    return lectureDuTableau(lu, PARADE, 3, [COMMANDE]);
  };
  const manager = (): string => {
    const lignes: string[] = [];
    void principal({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
    return `${lignes.join("\n")}\n`;
  };
  return { noter, amont, manager };
}

const lecture = (texte: string): Lecture => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMANDE, texte }] });
const lectureManager = (texte: string): Lecture => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMANDE_MANAGER, texte }] });
const arrivee = (title: string) => ({ type: "ticket.arrived" as const, payload: { title, priority: null, createdAt: "2026-10-08T10:00:00Z", url: "u" } });
const REFUS = { run: "juge-14-a", fingerprint: "e1", verdict: "refused", kind: "incomplete", reason: "Aucun critère\nobservable.", missing: null, model: null, effort: null, calibration: null } as const;

// Ce qui est lu : le test échoue net si rien n'a été compté.
function compte(vu: Vu) {
  assert.ok("compte" in vu, `rien n'a été compté : ${"sans" in vu ? vu.sans : ""}`);
  return vu;
}

// Un tableau de référence : un nombre connu d'issues dans chacun des cinq états, une sur le rail, une lancée, une PR.
async function unDepot(t: TestContext) {
  const { noter, amont, manager } = cuisine(t);
  // Sur le rail : il n'est pas avant lui.
  noter(arrivee("Sur le rail"), 10, "github");
  // Refusée par le manager, un ticket incomplet, sa raison sur deux lignes.
  noter({ type: "manager.judged", payload: REFUS }, 14);
  // Écartée par le code : une question, laissée au chef.
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 12);
  const sortie = await amont([
    ouverte(10, ["fire", "model:haiku", "effort:low"]),
    ouverte(11, ["model:opus", "effort:high", "prio:2"], { title: "Prêt sans feu" }),
    ouverte(12, ["question"]),
    ouverte(14),
    ouverte(16, ["epic", "prio:1"], { title: "Une épique" }),
    ouverte(17, ["epic"]),
    ouverte(20, [], { title: "Pas encore lue" }),
    ouverte(21),
    ouverte(22, ["fire", "model:opus", "effort:high"]),
    ouverte(23, [], { pr: true }),
  ]);
  return { sortie, manager, noter };
}

describe("ce qui est avant le rail, lu sur le tableau de la cuisine", () => {
  test("un tableau de référence : chaque état compte exactement ses issues — ni le rail, ni ce qui est lancé, ni les PR —, dans l'ordre de la barre", async (t) => {
    const { sortie } = await unDepot(t);

    const vu = compte(voir(sortie));

    assert.equal(vu.compte, 7);
    assert.deepEqual(
      vu.groupes.map(({ etat, nom, issues }) => [etat, nom, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", "not read yet", [20, 21]],
        ["incomplete", "refused as incomplete", [14]],
        ["epique", "epic, not split yet", [16, 17]],
        ["prete", "ready, not fired", [11]],
        ["mise-de-cote", "set aside", [12]],
      ],
    );
    // Au survol de la barre, son seul texte : le total, puis chaque état.
    assert.equal(vu.survol, "7 issues before the rail — 2 not read yet · 1 refused as incomplete · 2 epic, not split yet · 1 ready, not fired · 1 set aside");
    const issue = (ticket: number) => vu.groupes.flatMap(({ issues }) => issues).find((posee) => posee.ticket === ticket) ?? assert.fail(`pas de #${ticket}`);
    // Ce qui la retient, mot pour mot — la raison du manager en une ligne.
    assert.equal(issue(14).dit, "refused (an incomplete ticket) — Aucun critère observable.");
    assert.equal(issue(20).dit, "the manager has not judged it yet");
    assert.equal(issue(11).dit, "calibrated (model:opus, effort:high), without `fire`: the rail takes it once `fire` is set");
    // Sa fiche : son titre, la priorité que la box donne — ou qu'elle n'en a pas —, son issue qui s'ouvre.
    assert.deepEqual(issue(11).fiche, { titre: { valeur: "Prêt sans feu" }, priorite: { valeur: "prio:2", exact: true }, issue: true });
    assert.deepEqual(issue(20).fiche.priorite, { valeur: "none — its issue carries no `prio:` label" });
    // Sa carte, celle du rail : son numéro ouvrable, sa priorité, son titre, et sur sa ligne ce qui la retient.
    assert.deepEqual(issue(11).carte, { ticket: 11, titre: "Prêt sans feu", ouvrable: true, attendu: false, attend: [], dit: [], fiche: issue(11).fiche, ligne: issue(11).dit, prio: "prio:2" });
    assert.equal(issue(20).carte.prio, undefined);
  });

  test("les cinq états viennent dans l'ordre de la barre ; un mot que l'app ne connaît pas se pose après eux, tel quel", () => {
    const une = (ticket: number, etat: string) => ({ ticket, titre: `#${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}`, priorite: null, etat, dit: etat });

    const groupes = grouper([une(1, "mise-de-cote"), une(2, "inconnu"), une(3, "non-lue"), une(4, "prete"), une(5, "epique"), une(6, "non-lue"), une(7, "incomplete")]);

    assert.deepEqual(GROUPES.map(({ etat }) => etat), ["non-lue", "incomplete", "epique", "prete", "mise-de-cote"]);
    assert.deepEqual(
      groupes.map(({ etat, issues }) => [etat, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", [3, 6]],
        ["incomplete", [7]],
        ["epique", [5]],
        ["prete", [4]],
        ["mise-de-cote", [1]],
        ["inconnu", [2]],
      ],
    );
  });

  test("rail vide : l'app dit ce qui est avant lui et ce que le manager en fait, d'après son état lu — ou qu'il n'y a rien", async (t) => {
    const { sortie, manager, noter } = await unDepot(t);
    const amonts = tenirAmont();

    // L'état du manager pas encore lu : l'app ne devine pas s'il les lit.
    assert.equal(
      amonts.recevoir(sortie).vide,
      "nothing on the rail — 7 issues before it (2 not read yet · 1 refused as incomplete · 2 epic, not split yet · 1 ready, not fired · 1 set aside) — the manager's state was not read: whether it is reading them is not known",
    );
    // Jamais allumé : éteint.
    assert.match(amonts.manager(lectureManager(manager()))?.vide ?? "", / — the manager is off: it reads none of them, and nothing new enters the rail until you turn it on$/);
    noter({ type: "manager.enabled", payload: {} }, null, "chef");
    assert.match(amonts.manager(lectureManager(manager()))?.vide ?? "", / — the manager is on: it reads them at each wake-up, judges what it has not read and splits the epics$/);

    // Rien avant le rail non plus.
    const { amont } = cuisine(t);
    const rien = voir(await amont([]));
    assert.equal(rien.vide, "nothing on the rail, nothing before it");
    assert.equal(compte(rien).compte, 0);
    assert.equal(compte(rien).survol, "nothing before the rail: every open issue of the repository is on it");
  });

  test("un tableau trop long, qui a dû laisser de côté ce qui est avant le rail : aucun nombre, et la raison — ce n'est pas « rien »", () => {
    const vu = voir(lectureDuTableau({ lu: true, depot: DEPOT, numero: 7, adresse: null, genereLe: A, luLe: A, age: 0, projet: "brigade", file: [], pages: [], bilans: [], cuisine: { rubriques: [] } as never, gestes: [], resserre: ["avantLeRail"] }, PARADE, 3, [COMMANDE]));
    assert.ok("sans" in vu, "la raison doit être dite");
    assert.equal(vu.sans, `what is before the rail was not read: What is before the rail is not on the Kitchen board of ${DEPOT} (issue 7): the board was too long for GitHub, and the box had to leave it out. This is not “nothing before the rail”`);
  });

  test("une lecture ratée ne donne jamais de nombre, et dit pourquoi — ce n'est pas « rien avant le rail »", () => {
    const echec = (erreur: string, atteinte: boolean, cas: null = null): Lecture => ({ projet: PARADE, demande: 3, a: A, erreur, atteinte, cas });
    const sans = (vu: Vu) => {
      assert.ok(!("compte" in vu), "un nombre a été donné");
      assert.ok("sans" in vu, "la lecture ratée doit dire pourquoi");
      assert.match(vu.sans, /This is not “nothing before the rail”$/);
      assert.equal(vu.vide, `nothing on the rail — ${vu.sans}`);
      return vu.sans;
    };

    // Le tableau de la cuisine ne se lit pas : sa raison, en une phrase.
    assert.match(sans(voir({ ...echec("GitHub refused to list the issues of acme/brigade (HTTP 403).", true), duTableau: true })), /^what is before the rail was not read: GitHub refused to list the issues of acme\/brigade \(HTTP 403\)\. This/);
    // Une sortie qui n'a pas la forme : ni complétée, ni comptée.
    assert.match(sans(voir(lecture(""))), /in what the Kitchen board gave: the command returned nothing/);
    assert.match(sans(voir(lecture("12 issues"))), /it is not JSON/);
    assert.match(sans(voir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ticket: 3, titre: "t", url: "u", priorite: null, etat: "non-lue" }] })))), /“issues\[0\]\.dit” is not a string/);
  });

  test("la commande que le tableau remplace est celle que docs/runtime/ documente, dans le dépôt et sur la box", () => {
    const doc = docRuntime(join(import.meta.dirname, "../.."));

    assert.equal(COMMANDE, "manager upstream");
    assert.ok(doc.includes("npm --prefix runtime run manager -- upstream"), "docs/runtime/ ne cite pas `manager -- upstream`");
    assert.ok(doc.includes("`brigade <projet> manager [return <n°> \\| backlog \\| upstream]`"), "docs/runtime/ ne cite pas `manager upstream`");
    assert.ok(doc.includes("`avantLeRail`"), "docs/runtime/ ne documente pas ce que le tableau publie");
  });
  test("un champ de plus est laissé de côté, un champ qui manque refuse la forme entière", () => {
    const issue = { ticket: 3, titre: "t", url: "https://github.com/x/y/issues/3", priorite: 2, etat: "non-lue", dit: "d" };

    assert.deepEqual(comprendre(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, autre: true }], plus: 1 })), { lu: A, depot: DEPOT, issues: [issue] });
    assert.deepEqual(comprendre(JSON.stringify({ lu: A, issues: [] })), { informe: "“depot” is not a string" });
    assert.deepEqual(comprendre(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, priorite: "2" }] })), { informe: "“issues[0].priorite” is not a non-negative integer" });
  });

  test("l'adresse d'une issue reste au process principal : celle que la box a donnée, en https seulement, du projet lu", () => {
    const amonts = tenirAmont();
    const issue = (ticket: number, url: string) => ({ ticket, titre: "t", url, priorite: null, etat: "non-lue", dit: "d" });
    amonts.recevoir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [issue(3, "https://github.com/x/y/issues/3"), issue(4, "http://ailleurs/4")] })));

    assert.equal(amonts.adresse(PARADE, 3), "https://github.com/x/y/issues/3");
    assert.equal(amonts.adresse(PARADE, 4), undefined);
    assert.equal(amonts.adresse("autre", 3), undefined);
    // Le projet n'est plus affiché : ce qui a été lu de lui est lâché.
    amonts.veiller([]);
    assert.equal(amonts.adresse(PARADE, 3), undefined);
  });
});

// La vue jouée : un projet, sa box, son rail.
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 10, etat: "en attente", titre: "Sur le rail", url: `https://github.com/${DEPOT}/issues/10`, activite: null }],
  cooks: [],
  attend: [],
};
const RAIL_VIDE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, rail: 0 }, rail: [] };
function recevoirFaits(vue: Jouee, faits: Faits): void {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}

const tete = (vue: Jouee): Faux => vue.element("rail").dessous("div").find((pose) => pose.className === "amont") ?? assert.fail("pas d'en-tête de ce qui est avant le rail");
const barre = (vue: Jouee): Faux | undefined => tete(vue).dessous("button").find((pose) => pose.className === "avant-le-rail");
const laBarre = (vue: Jouee): Faux => barre(vue) ?? assert.fail("pas de barre");
const colonnes = (vue: Jouee): Faux[] => vue.element("rail").dessous("div").find((pose) => pose.className === "colonnes")?.children ?? assert.fail("pas de colonnes");
const backlog = (vue: Jouee): Faux | undefined => colonnes(vue).find((pose) => pose.className === "colonne backlog");
const fiche = (vue: Jouee) => vue.element("fiche");

describe("dans l'espace du projet, ce qui est avant le rail se lit à côté de lui", () => {
  test("une barre empilée, sans un mot : une part par état, de la longueur de son compte ; les comptes au survol", async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    // Avant la première lecture : ni barre, ni texte en tête du rail.
    assert.equal(barre(vue), undefined);
    assert.equal(tete(vue).textContent, "");

    vue.dire("surAmont", tenirAmont().recevoir(sortie));

    const pose = laBarre(vue);
    assert.deepEqual(
      pose.children.map((part) => [part.className, part.dataset.etat, part.style.getPropertyValue("flex-grow")]),
      [
        ["part", "non-lue", "2"],
        ["part", "incomplete", "1"],
        ["part", "epique", "2"],
        ["part", "prete", "1"],
        ["part", "mise-de-cote", "1"],
      ],
    );
    assert.equal(tete(vue).textContent, "");
    assert.equal((pose as Faux & { ariaExpanded?: string }).ariaExpanded, "false");
    // Le survol dit les comptes, et lui seul.
    const dit = "7 issues before the rail — 2 not read yet · 1 refused as incomplete · 2 epic, not split yet · 1 ready, not fired · 1 set aside";
    assert.equal(pose.ariaLabel, dit);
    pose.declencher("mouseenter");
    assert.equal(tete(vue).textContent, dit);
    pose.declencher("mouseleave");
    assert.equal(tete(vue).textContent, "");
    // Le rail n'est pas vide : aucune phrase à la place, et la colonne Backlog n'est pas dépliée.
    assert.deepEqual(tete(vue).dessous("p"), []);
    assert.equal(backlog(vue), undefined);
  });

  test("un clic sur la barre déplie la colonne Backlog à gauche de « On the rail » : les cartes du rail, par état, triées par `prio:` ; un autre la replie", async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(sortie));

    laBarre(vue).click();
    const colonne = backlog(vue) ?? assert.fail("la colonne Backlog n'est pas dépliée");
    assert.equal(colonnes(vue).indexOf(colonne), 0);
    assert.equal(colonnes(vue)[1]?.dessous("h4")[0]?.children[0]?.textContent, "On the rail");
    assert.equal((laBarre(vue) as Faux & { ariaExpanded?: string }).ariaExpanded, "true");
    // Redessinée, la barre garde le clavier : sa bulle reste ouverte.
    assert.equal(laBarre(vue).focalise, 1);
    assert.deepEqual(colonne.dessous("h4")[0]?.children.map((pose) => pose.textContent), ["Backlog", "7", "fold"]);
    const groupes = colonne.children.filter((pose) => pose.className === "groupe");
    assert.deepEqual(
      groupes.map((groupe) => [groupe.dataset.etat, groupe.dessous("h5")[0]?.textContent, groupe.dessous("li").map((bon) => bon.dessous("button")[0]?.textContent)]),
      [
        ["non-lue", "not read yet2", ["#20", "#21"]],
        ["incomplete", "refused as incomplete1", ["#14"]],
        ["epique", "epic, not split yet2", ["#16", "#17"]],
        ["prete", "ready, not fired1", ["#11"]],
        ["mise-de-cote", "set aside1", ["#12"]],
      ],
    );
    // La carte du rail : son numéro, sa priorité, son titre, et en une ligne ce qui la retient.
    const prete = groupes[3]?.dessous("li")[0] ?? assert.fail("pas de carte #11");
    assert.equal(prete.className, "bon");
    assert.deepEqual(prete.dessous("span").find((pose) => pose.className === "prio mono")?.textContent, "prio:2");
    assert.equal(prete.dessous("strong")[0]?.textContent, "Prêt sans feu");
    assert.equal(prete.dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, "calibrated (model:opus, effort:high), without `fire`: the rail takes it once `fire` is set");

    // Une lecture neuve ne la replie pas ; un clic sur la barre, si.
    vue.dire("surAmont", tenirAmont().recevoir(sortie));
    assert.notEqual(backlog(vue), undefined);
    laBarre(vue).click();
    assert.equal(backlog(vue), undefined);
    // Son titre la replie aussi.
    laBarre(vue).click();
    (backlog(vue)?.dessous("button").find((pose) => pose.className === "replier") ?? assert.fail("pas de geste qui replie")).click();
    assert.equal(backlog(vue), undefined);
    assert.equal((laBarre(vue) as Faux & { ariaExpanded?: string }).ariaExpanded, "false");
  });

  test("une carte s'ouvre sur sa fiche, avec son titre et sa priorité ; son numéro ouvre son issue — le lien nomme le projet et le ticket, jamais une adresse", async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(sortie));
    laBarre(vue).click();

    const bon = (backlog(vue) ?? assert.fail("pas de colonne")).dessous("li").find((li) => li.textContent.startsWith("#11")) ?? assert.fail("pas de #11");
    bon.click();
    await repos();

    assert.equal(fiche(vue).hidden, false);
    assert.equal(fiche(vue).dessous("header")[0]?.children[0]?.textContent, "#11");
    assert.equal(fiche(vue).dessous("h3")[0]?.textContent, "Prêt sans feu");
    const ligne = (libelle: string) => fiche(vue).dessous("div").find((rang) => rang.children[0]?.textContent === libelle)?.children[1] ?? assert.fail(`pas de ligne ${libelle}`);
    assert.equal(ligne("priority").textContent, "prio:2");

    // Le numéro de la carte ouvre son issue, sans passer par la fiche.
    (bon.dessous("button")[0] ?? assert.fail("pas de numéro")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 11]);
  });

  test("rail vide : il le dit, et dit ce qui est avant lui — ou qu'il n'y a rien, ni sur le rail ni avant lui", async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, RAIL_VIDE);
    const phrase = () => tete(vue).dessous("p").find((pose) => pose.className === "vide")?.textContent;
    assert.equal(phrase(), "nothing on the rail — what is before it is being read…");

    vue.dire("surAmont", tenirAmont().recevoir(sortie));
    assert.match(phrase() ?? "", /^nothing on the rail — 7 issues before it \(2 not read yet · /);

    vue.dire("surAmont", voir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [] }))));
    assert.equal(phrase(), "nothing on the rail, nothing before it");
    // Rien avant le rail : la barre est vide, et son survol le dit.
    assert.deepEqual(laBarre(vue).children, []);
    assert.equal(laBarre(vue).dataset.vide, "");
    assert.equal(laBarre(vue).ariaLabel, "nothing before the rail: every open issue of the repository is on it");
  });

  test("une lecture ratée : la barre reste vide, son survol dit pourquoi, la colonne dépliée aussi — aucun nombre", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", voir({ projet: PARADE, demande: 3, a: A, erreur: "GitHub refused to list the issues of acme/brigade (HTTP 403).", atteinte: true, cas: null, duTableau: true }));

    const pose = laBarre(vue);
    assert.equal(pose.dataset.sans, "");
    assert.deepEqual(pose.children, []);
    assert.match(pose.ariaLabel ?? "", /HTTP 403\)\. This is not “nothing before the rail”$/);
    pose.click();
    const colonne = backlog(vue) ?? assert.fail("la colonne n'est pas dépliée");
    assert.deepEqual(colonne.dessous("h4")[0]?.children.map((posee) => posee.textContent), ["Backlog", "?", "fold"]);
    assert.match(colonne.textContent, /HTTP 403\)\. This is not “nothing before the rail”$/);
  });

  test("un tableau frais qui ne porte pas ce qui est avant le rail : ni barre, ni colonne — rien n'est dit (#1770)", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", voir({ projet: PARADE, demande: 3, a: A, erreur: "`manager upstream` is not on the Kitchen board", atteinte: true, cas: null, duTableau: true, pasPublie: true }));
    assert.equal(barre(vue), undefined);
    assert.equal(tete(vue).textContent, "");
  });
});
