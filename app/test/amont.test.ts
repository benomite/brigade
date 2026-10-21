// Ce qui n'est pas encore sur le rail (#697) : un rail vide ne veut pas dire un projet fini. Les
// sorties lues ici sont écrites par `manager upstream` du runtime lui-même
// (runtime/src/manager-cli.ts), jouée dans ce process sur un vrai journal et devant un faux `gh` :
// la forme que l'app lit est tenue contre celle que le runtime écrit. L'app compte ce que la box
// liste, range chaque issue sous le mot qu'elle porte, et n'y déduit rien. À côté, la vue jouée
// telle qu'elle est (aides/fausse-vue.ts) : le nombre en tête du rail, la liste qu'il déplie, la
// fiche qu'une issue ouvre, et ce que dit un rail vide.
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal } from "../../runtime/src/manager-cli.ts";
import { appeler, DEPOT, fauxGh, issueGitHub } from "../../runtime/test/outils.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { COMMANDE, comprendre, GROUPES, grouper, tenirAmont, voir, type Vu } from "../src/amont.ts";
import type { Lecture } from "../src/box.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { COMMANDE as COMMANDE_MANAGER, GESTES_DU_MANAGER, voir as voirManager } from "../src/manager.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const PARADE = "parade";
const A = "2026-10-15T09:12:04.000Z";
const OUVERTES = `repos/${DEPOT}/issues?state=open&per_page=100`;

// Un journal, et ce que la box rendrait : `manager upstream` devant un faux `gh` qui dicte les
// issues ouvertes, et `manager` — l'état du manager —, telles quelles.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-amont-"));
  let minute = 0;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.UTC(2026, 9, 15, 9, ++minute)) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const gh = fauxGh(t);
  const noter = (fait: Fait, ticket: number | null, author = "manager") => void journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const amont = async (issues: ReturnType<typeof issueGitHub>[]): Promise<string> => {
    gh.repondre(OUVERTES, { corps: issues });
    const cli = appeler(principal, ["upstream"], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await cli.fin, 0, cli.sortie());
    return cli.sortie();
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

// Ce qui est lu : le test échoue net si rien n'a été compté.
function compte(vu: Vu) {
  assert.ok("compte" in vu, `rien n'a été compté : ${"sans" in vu ? vu.sans : ""}`);
  return vu;
}

// Un dépôt dont chaque issue ouverte hors du rail est dans un état différent.
async function unDepot(t: TestContext) {
  const { noter, amont, manager } = cuisine(t);
  // Sur le rail : il n'est pas à venir.
  noter(arrivee("Sur le rail"), 10, "github");
  // Sortie du rail : `fire` retiré, encore ouverte.
  noter(arrivee("Sortie"), 11, "github");
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 11, "github");
  // Le manager attend une réponse.
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 12);
  // Refusée par le manager, sa raison sur deux lignes.
  noter({ type: "manager.judged", payload: { run: "juge-14-a", fingerprint: "e1", verdict: "refused", kind: "incomplete", reason: "Aucun critère\nobservable.", missing: null, model: null, effort: null, calibration: null } }, 14);
  const sortie = await amont([
    issueGitHub(10, { labels: ["fire", "model:haiku", "effort:low"] }),
    issueGitHub(11, { title: "Le ticket sorti", labels: ["prio:2"] }),
    issueGitHub(12, { labels: ["question"] }),
    issueGitHub(14, { labels: [] }),
    issueGitHub(16, { title: "Une épique", labels: ["epic", "prio:1"] }),
    issueGitHub(20, { title: "Pas encore lue", labels: [] }),
    issueGitHub(21, { labels: ["fire"], pull_request: {} }),
  ]);
  return { sortie, manager, noter };
}

describe("ce qui n'est pas encore sur le rail, lu dans la sortie de `manager upstream`", () => {
  test("le nombre est celui des issues ouvertes que la box liste — ni le rail, ni les PR — et chacune est rangée sous ce qui lui arrive, dans les mots de la box", { skip: SANS_POSIX }, async (t) => {
    const { sortie } = await unDepot(t);

    const vu = compte(voir(lecture(sortie)));

    assert.equal(vu.compte, 5);
    assert.deepEqual(
      vu.groupes.map(({ etat, nom, issues }) => [etat, nom, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", "not yet read by the manager", [20]],
        ["epique", "epic, not yet split", [16]],
        ["attend", "awaiting your answer — it is also in TODO", [12]],
        ["ecartee", "set aside by the manager", [14]],
        ["sortie", "off the rail — still open", [11]],
      ],
    );
    const issue = (ticket: number) => vu.groupes.flatMap(({ issues }) => issues).find((posee) => posee.ticket === ticket) ?? assert.fail(`pas de #${ticket}`);
    // Ce que la box en dit, mot pour mot — la raison du manager en une ligne.
    assert.equal(issue(14).dit, "refused (an incomplete ticket) — Aucun critère observable.");
    assert.equal(issue(11).dit, "left the rail: label `fire` removed");
    assert.equal(issue(20).dit, "the manager has not judged it yet");
    // Sa fiche : son titre, la priorité que la box donne — ou qu'elle n'en a pas —, son issue qui s'ouvre.
    assert.deepEqual(issue(11).fiche, { titre: { valeur: "Le ticket sorti" }, priorite: { valeur: "prio:2", exact: true }, issue: true });
    assert.deepEqual(issue(20).fiche.priorite, { valeur: "none — its issue carries no `prio:` label" });
    assert.equal(issue(20).ouvrable, true);
  });

  test("les cinq groupes du chef viennent d'abord, puis les passages ; un mot que l'app ne connaît pas se pose après eux, tel quel", () => {
    const une = (ticket: number, etat: string) => ({ ticket, titre: `#${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}`, priorite: null, etat, dit: etat });

    const groupes = grouper([une(1, "servie"), une(2, "inconnu"), une(3, "non-lue"), une(4, "en-route"), une(5, "decoupee"), une(6, "non-lue")]);

    assert.deepEqual(GROUPES.slice(0, 5).map(({ etat }) => etat), ["non-lue", "epique", "attend", "ecartee", "sortie"]);
    assert.deepEqual(
      groupes.map(({ etat, nom, issues }) => [etat, nom, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", "not yet read by the manager", [3, 6]],
        ["en-route", "on its way to the rail", [4]],
        ["decoupee", "epic split — its tickets carry the work", [5]],
        ["servie", "served — its issue is still open", [1]],
        ["inconnu", "inconnu", [2]],
      ],
    );
  });

  test("rail vide : l'app dit ce qui est en amont et ce que le manager en fait, d'après son état lu — ou qu'il n'y a rien à venir", { skip: SANS_POSIX }, async (t) => {
    const { sortie, manager, noter } = await unDepot(t);
    const amonts = tenirAmont();

    // L'état du manager pas encore lu : l'app ne devine pas s'il les lit.
    assert.equal(
      amonts.recevoir(lecture(sortie)).vide,
      "nothing on the rail — 5 issues upcoming (1 not yet read by the manager · 1 epic, not yet split · 1 awaiting your answer — it is also in TODO · 1 set aside by the manager · 1 off the rail — still open) — the manager's state was not read: whether it is reading them is not known",
    );
    // Jamais allumé : éteint.
    assert.match(amonts.manager(lectureManager(manager()))?.vide ?? "", / — the manager is off: it reads none of them, and nothing new enters the rail until you turn it on$/);
    noter({ type: "manager.enabled", payload: {} }, null, "chef");
    assert.match(amonts.manager(lectureManager(manager()))?.vide ?? "", / — the manager is on: it reads them at each wake-up, judges what it has not read and splits the epics$/);

    // Rien en amont non plus.
    const { amont } = cuisine(t);
    assert.equal(voir(lecture(await amont([]))).vide, "nothing on the rail, nothing upcoming");
    assert.equal(compte(voir(lecture(await amont([])))).compte, 0);
  });

  test("une lecture ratée ne donne jamais de nombre, et dit pourquoi — ce n'est pas « rien à venir »", () => {
    const echec = (erreur: string, atteinte: boolean, cas: null | "ssh-en-echec" = null): Lecture => ({ projet: PARADE, demande: 3, a: A, erreur, atteinte, cas });
    const sans = (vu: Vu) => {
      assert.ok(!("compte" in vu), "un nombre a été donné");
      assert.match(vu.sans, /This is not “nothing upcoming”$/);
      assert.equal(vu.vide, `nothing on the rail — ${vu.sans}`);
      return vu.sans;
    };

    // Un runtime d'avant `upstream` la refuse : code 2.
    assert.match(sans(voir(echec("$ ssh box brigade parade manager upstream\nusage : …\n→ exit code 2", true))), /refused `manager upstream` \(code 2\) — .*update brigade on the station/);
    assert.match(sans(voir(echec("$ ssh …\nbrigade : … n'a pas été lu\n→ exit code 1", true))), /read neither GitHub nor its log \(code 1\)/);
    assert.match(sans(voir(echec("$ ssh …\nssh: connect to host box port 22: Connection refused\n→ exit code 255", false, "ssh-en-echec"))), /: NOT REACHED\./);
    // Une sortie qui n'a pas la forme : ni complétée, ni comptée.
    assert.match(sans(voir(lecture(""))), /the command returned nothing/);
    assert.match(sans(voir(lecture("12 issues"))), /it is not JSON/);
    assert.match(sans(voir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ticket: 3, titre: "t", url: "u", priorite: null, etat: "non-lue" }] })))), /“issues\[0\]\.dit” is not a string/);
  });

  test("la commande lue est celle que docs/runtime/ documente, dans le dépôt et sur la box", () => {
    const doc = docRuntime(join(import.meta.dirname, "../.."));

    assert.equal(COMMANDE, "manager upstream");
    assert.ok(doc.includes("npm --prefix runtime run manager -- upstream"), "docs/runtime/ ne cite pas `manager -- upstream`");
    assert.ok(doc.includes("`brigade <projet> manager [on \\| off \\| return <n°> \\| backlog \\| upstream]`"), "docs/runtime/ ne cite pas `manager upstream`");
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
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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

const tete = (vue: Jouee): Faux => vue.element("rail").dessous("div").find((pose) => pose.className === "amont") ?? assert.fail("pas d'en-tête de ce qui est à venir");
const nombre = (vue: Jouee): Faux => tete(vue).dessous("button").find((pose) => pose.className === "nombre") ?? assert.fail("pas de nombre");
const liste = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("section").find((pose) => pose.className === "amont-liste");
const fiche = (vue: Jouee) => vue.element("fiche");

describe("dans l'espace du projet, ce qui est à venir se lit à côté du rail", () => {
  test("un nombre en tête du rail ; un clic déplie la liste, groupe par groupe ; un autre la replie", { skip: SANS_POSIX }, async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    // Avant la première lecture : rien de technique en tête du rail (#623), et aucun nombre.
    assert.equal(tete(vue).textContent, "upcoming: being read…");
    assert.match(tete(vue).children[0]?.title ?? "", /ssh box brigade parade manager upstream/);

    vue.dire("surAmont", tenirAmont().recevoir(lecture(sortie)));

    assert.equal(nombre(vue).textContent, "5 upcoming");
    assert.equal((nombre(vue) as Faux & { ariaExpanded?: string }).ariaExpanded, "false");
    assert.equal(liste(vue), undefined);
    // Le rail n'est pas vide : aucune phrase à la place.
    assert.deepEqual(tete(vue).dessous("p"), []);

    nombre(vue).click();
    const groupes = (liste(vue) ?? assert.fail("la liste n'est pas dépliée")).children;
    assert.deepEqual(
      groupes.map((groupe) => groupe.dessous("h4")[0]?.textContent),
      ["not yet read by the manager1", "epic, not yet split1", "awaiting your answer — it is also in TODO1", "set aside by the manager1", "off the rail — still open1"],
    );
    const sortie11 = groupes[4]?.dessous("li")[0] ?? assert.fail("pas d'issue sortie du rail");
    assert.deepEqual(sortie11.children.map((pose) => pose.textContent), ["#11Le ticket sorti", "left the rail: label `fire` removed"]);
    // Une lecture neuve ne la replie pas.
    vue.dire("surAmont", tenirAmont().recevoir(lecture(sortie)));
    assert.notEqual(liste(vue), undefined);
    nombre(vue).click();
    assert.equal(liste(vue), undefined);
  });

  test("une issue s'ouvre sur sa fiche, avec son titre et sa priorité ; son lien nomme le projet et le ticket, jamais une adresse", { skip: SANS_POSIX }, async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(lecture(sortie)));
    nombre(vue).click();

    const bon = (liste(vue) ?? assert.fail("pas de liste")).dessous("li").find((li) => li.textContent.startsWith("#11")) ?? assert.fail("pas de #11");
    (bon.dessous("button")[0] ?? assert.fail("pas de bouton")).click();
    await repos();

    assert.equal(fiche(vue).hidden, false);
    assert.equal(fiche(vue).dessous("header")[0]?.children[0]?.textContent, "#11");
    assert.equal(fiche(vue).dessous("h3")[0]?.textContent, "Le ticket sorti");
    const ligne = (libelle: string) => fiche(vue).dessous("div").find((rang) => rang.children[0]?.textContent === libelle)?.children[1] ?? assert.fail(`pas de ligne ${libelle}`);
    assert.equal(ligne("priority").textContent, "prio:2");
    // Son issue s'ouvre par un geste de la fiche (#639).
    const ouvrirLIssue = fiche(vue).dessous("li").find((pose) => pose.dataset.geste === "issue")?.dessous("button")[0] ?? assert.fail("pas de geste « issue »");
    ouvrirLIssue.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 11]);
  });

  test("rail vide : il le dit, et dit ce qui est en amont — ou qu'il n'y a rien, ni sur le rail ni à venir", { skip: SANS_POSIX }, async (t) => {
    const { sortie } = await unDepot(t);
    const vue = await ouvrir();
    recevoirFaits(vue, RAIL_VIDE);
    const phrase = () => tete(vue).dessous("p").find((pose) => pose.className === "vide")?.textContent;
    assert.equal(phrase(), "nothing on the rail — what is upcoming is being read…");

    vue.dire("surAmont", tenirAmont().recevoir(lecture(sortie)));
    assert.match(phrase() ?? "", /^nothing on the rail — 5 issues upcoming \(1 not yet read by the manager · /);

    vue.dire("surAmont", voir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [] }))));
    assert.equal(phrase(), "nothing on the rail, nothing upcoming");
    assert.equal(nombre(vue).textContent, "0 upcoming");
  });

  test("une lecture ratée : le bouton dit qu'elle n'a pas été lue, la liste dépliée dit pourquoi — aucun nombre", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", voir({ projet: PARADE, demande: 3, a: A, erreur: "$ ssh …\nusage : …\n→ exit code 2", atteinte: true, cas: null }));

    assert.equal(nombre(vue).textContent, "upcoming: not read");
    nombre(vue).click();
    assert.match(liste(vue)?.textContent ?? "", /update brigade on the station\. This is not “nothing upcoming”$/);
  });
});
