// Ce qui est avant le rail (#1836, #697) : un rail vide ne veut pas dire un projet fini. Les issues ouvertes du dépôt sont
// lues ici comme l'app les lit de GitHub (tableau/lecture.ts, tableau/rail.ts, #2061), sur un faux GitHub : chacune que
// le rail ne porte pas est rangée d'après ses labels seuls. L'app compte ce que la lecture liste, range chaque issue sous
// le mot qu'elle porte, et n'y déduit rien. Ce que la vue en pose — le bandeau Backlog au-dessus du rail, ce que dit un
// rail vide — se joue dans test/backlog-band/ (#3460). L'état du manager vient de son journal, lu par la commande du
// runtime.
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal } from "../../runtime/src/manager-cli.ts";
import { DEPOT } from "../../runtime/test/outils.ts";
import { COMMANDE, comprendre, GROUPES, grouper, tenirAmont, voir, type Vu } from "../src/amont.ts";
import type { Lecture } from "../src/box.ts";
import { COMMANDE as COMMANDE_MANAGER } from "../src/manager.ts";
import type { AppelGitHub } from "../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../src/tableau/lecture.ts";
import { lectureDuTableau } from "../src/tableau/rail.ts";

const PARADE = "parade";
const A = "2026-10-15T09:12:04.000Z";

// Une issue ouverte, telle que l'API de GitHub la rend. `pr` : une PR, que l'API des issues rend comme une issue.
type Ouverte = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; pull_request?: object };
const ouverte = (number: number, labels: string[] = [], autres: { title?: string; pr?: true } = {}): Ouverte => ({
  number,
  title: autres.title ?? `Ticket ${number}`,
  labels: labels.map((name) => ({ name })),
  created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
  ...(autres.pr === true ? { pull_request: {} } : {}),
});

// Un GitHub dont ce sont les issues ouvertes : celles au label `fire` sont le rail, les autres sont avant lui.
const github = (issues: Ouverte[]): AppelGitHub => async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { status: 200, data: issues.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
  if (chemin.includes("/issues?")) return { status: 200, data: issues };
  if (chemin.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};

// Ce que l'app lit de GitHub pour ces issues ouvertes, rendu dans la forme de `manager upstream` ; et `manager` — l'état
// du manager, lu de son journal par la commande du runtime —, tel quel.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-amont-"));
  let minute = 0;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.UTC(2026, 9, 15, 9, ++minute)) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null, author = "manager") => void journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const amont = async (issues: Ouverte[]): Promise<Lecture> => {
    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github(issues), maintenant: () => new Date(A) });
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

// Ce qui est lu : le test échoue net si rien n'a été compté.
function compte(vu: Vu) {
  assert.ok("compte" in vu, `rien n'a été compté : ${"sans" in vu ? vu.sans : ""}`);
  return vu;
}

// Un dépôt de référence : un nombre connu d'issues dans chacun des quatre états que les labels disent, deux sur le rail,
// une PR.
async function unDepot(t: TestContext, autres: Ouverte[] = []) {
  const { amont, manager, noter } = cuisine(t);
  const sortie = await amont([
    ouverte(10, ["fire", "model:haiku", "effort:low"]),
    ouverte(11, ["model:opus", "effort:high", "prio:2"], { title: "Prêt sans feu" }),
    ouverte(12, ["blocked-on-human"]),
    ouverte(13, ["served-elsewhere"]),
    ouverte(14, ["model:opus"]),
    ouverte(16, ["epic", "prio:1"], { title: "Une épique" }),
    ouverte(17, ["epic"]),
    ouverte(20, [], { title: "Pas encore lue" }),
    ouverte(21),
    ouverte(22, ["fire", "model:opus", "effort:high"]),
    ouverte(23, [], { pr: true }),
    ...autres,
  ]);
  return { sortie, manager, noter };
}

// Ce que le survol de la barre dit du dépôt de référence.
const SURVOL = "8 issues before the rail — 3 not read yet · 2 epic, not split yet · 1 ready, not fired · 2 set aside";

describe("ce qui est avant le rail, lu sur GitHub", () => {
  test("un dépôt de référence : chaque état compte exactement ses issues — ni le rail, ni les PR —, dans l'ordre de la barre", async (t) => {
    const { sortie } = await unDepot(t);

    const vu = compte(voir(sortie));

    assert.equal(vu.compte, 8);
    assert.equal(vu.lu, A);
    assert.deepEqual(
      vu.groupes.map(({ etat, nom, issues }) => [etat, nom, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", "not read yet", [14, 20, 21]],
        ["epique", "epic, not split yet", [16, 17]],
        ["prete", "ready, not fired", [11]],
        ["mise-de-cote", "set aside", [12, 13]],
      ],
    );
    // Au survol de la barre, son seul texte : le total, puis chaque état.
    assert.equal(vu.survol, SURVOL);
    const issue = (ticket: number) => vu.groupes.flatMap(({ issues }) => issues).find((posee) => posee.ticket === ticket) ?? assert.fail(`pas de #${ticket}`);
    // Ce qui la retient, mot pour mot — ce que ses labels disent, en une ligne.
    assert.equal(issue(12).dit, "it carries `blocked-on-human`: a human decides");
    assert.equal(issue(13).dit, "it carries `served-elsewhere`: this kitchen does not serve it");
    assert.equal(issue(14).dit, "not calibrated yet: no `model:` and `effort:` labels");
    assert.equal(issue(16).dit, "it carries `epic`: not split yet");
    assert.equal(issue(11).dit, "calibrated (model:opus, effort:high), without `fire`: the rail takes it once `fire` is set");
    // Sa fiche : son titre, la priorité de son label — ou qu'elle n'en a pas —, son issue qui s'ouvre.
    assert.deepEqual(issue(11).fiche, { titre: { valeur: "Prêt sans feu" }, priorite: { valeur: "prio:2", exact: true }, issue: true });
    assert.deepEqual(issue(20).fiche.priorite, { valeur: "none — its issue carries no `prio:` label" });
    // Sa carte, celle du rail : son numéro ouvrable, sa priorité, son titre, et sur sa ligne ce qui la retient.
    assert.deepEqual(issue(11).carte, { ticket: 11, titre: "Prêt sans feu", ouvrable: true, attendu: false, attend: [], dit: [], fiche: issue(11).fiche, ligne: issue(11).dit, prio: "prio:2" });
    assert.equal(issue(20).carte.prio, undefined);
  });

  test("une issue que la cuisine a ouverte sur elle-même n'est pas un besoin : ni comptée, ni rangée, mais dite à part (#3523)", async (t) => {
    const { sortie } = await unDepot(t, [
      ouverte(34, ["bug"], { title: "Kitchen secondes held: its breaker is open" }),
      ouverte(35, ["bug"], { title: "The kitchen is idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)" }),
      ouverte(36, [], { title: "The kitchen of the street is idle" }),
    ]);

    const vu = compte(voir(sortie));

    assert.equal(vu.compte, 9, "8 besoins de référence, et #36, un besoin comme un autre");
    assert.deepEqual(vu.groupes.flatMap(({ issues }) => issues.map(({ ticket }) => ticket)).filter((ticket) => ticket >= 34), [36]);
    assert.deepEqual(vu.alertes, [
      { ticket: 34, titre: "Kitchen secondes held: its breaker is open", genre: "disjoncteur", dit: "Kitchen held: its breaker is open" },
      { ticket: 35, titre: "The kitchen is idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)", genre: "inerte", dit: "Kitchen idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)" },
    ]);
    assert.equal(vu.survol.startsWith("9 issues before the rail"), true);
    // Sans alerte, aucune clé.
    assert.equal("alertes" in compte(voir((await unDepot(t)).sortie)), false);
  });

  test("les cinq états viennent dans l'ordre du bandeau, puis les deux d'un besoin découpé ; un mot que l'app ne connaît pas se pose après eux, tel quel", () => {
    const une = (ticket: number, etat: string) => ({ ticket, titre: `#${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}`, priorite: null, etat, dit: etat });

    const groupes = grouper([une(1, "mise-de-cote"), une(2, "inconnu"), une(3, "non-lue"), une(4, "prete"), une(5, "epique"), une(6, "non-lue"), une(7, "incomplete")]);

    assert.deepEqual(GROUPES.map(({ etat }) => etat), ["non-lue", "incomplete", "epique", "prete", "mise-de-cote", "decoupee", "servie"]);
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
      "nothing on the rail — 8 issues before it (3 not read yet · 2 epic, not split yet · 1 ready, not fired · 2 set aside) — the manager's state was not read: whether it is reading them is not known",
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

  test("les issues ouvertes qui ne se lisent pas, le rail si : ni nombre, ni « pas lu » — rien n'est dit (#1770)", async () => {
    const appeler = github([ouverte(10, ["fire"]), ouverte(20)]);
    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: async (chemin, entetes) => (chemin.includes("/issues?") && !chemin.includes("labels=fire") ? { status: 403, data: {} } : appeler(chemin, entetes)), maintenant: () => new Date(A) });
    const vu = voir(lectureDuTableau(lu, PARADE, 3, [COMMANDE]));
    assert.ok("nonPublie" in vu, JSON.stringify(vu));
    assert.ok(!("compte" in vu) && !("sans" in vu));
    assert.equal(vu.vide, "nothing on the rail");
  });

  test("une lecture ratée ne donne jamais de nombre, et dit pourquoi — ce n'est pas « rien avant le rail »", async () => {
    const echec = (erreur: string, atteinte: boolean, cas: null = null): Lecture => ({ projet: PARADE, demande: 3, a: A, erreur, atteinte, cas });
    const sans = (vu: Vu) => {
      assert.ok(!("compte" in vu), "un nombre a été donné");
      assert.ok("sans" in vu, "la lecture ratée doit dire pourquoi");
      assert.match(vu.sans, /This is not “nothing before the rail”$/);
      assert.equal(vu.vide, `nothing on the rail — ${vu.sans}`);
      return vu.sans;
    };

    // GitHub ne se lit pas : sa raison, en une phrase.
    assert.match(sans(voir({ ...echec("GitHub refused to read the rail of acme/brigade (HTTP 403).", true), duTableau: true })), /^what is before the rail was not read: GitHub refused to read the rail of acme\/brigade \(HTTP 403\)\. This/);
    // Le même refus, lu tel que l'app le lit.
    const refus = await lireLeTableauDuDepot({ depot: DEPOT, appeler: async () => ({ status: 403, data: {} }), maintenant: () => new Date(A) });
    assert.match(sans(voir(lectureDuTableau(refus, PARADE, 3, [COMMANDE]))), /^what is before the rail was not read: GitHub refused to read the rail of acme\/brigade \(HTTP 403\)\. This/);
    // Une sortie qui n'a pas la forme : ni complétée, ni comptée.
    assert.match(sans(voir(lecture(""))), /in what GitHub gave: the command returned nothing/);
    assert.match(sans(voir(lecture("12 issues"))), /it is not JSON/);
    assert.match(sans(voir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ticket: 3, titre: "t", url: "u", priorite: null, etat: "non-lue" }] })))), /“issues\[0\]\.dit” is not a string/);
  });

  test("la commande que la lecture de GitHub remplace est celle que docs/runtime/ documente, dans le dépôt et sur la box", () => {
    const doc = docRuntime(join(import.meta.dirname, "../.."));

    assert.equal(COMMANDE, "manager upstream");
    assert.ok(doc.includes("npm --prefix runtime run manager -- upstream"), "docs/runtime/ ne cite pas `manager -- upstream`");
    assert.ok(doc.includes("`brigade <projet> manager [return <n°> \\| backlog \\| upstream]`"), "docs/runtime/ ne cite pas `manager upstream`");
  });
  test("un champ de plus est laissé de côté, un champ qui manque refuse la forme entière", () => {
    const issue = { ticket: 3, titre: "t", url: "https://github.com/x/y/issues/3", priorite: 2, etat: "non-lue", dit: "d" };

    assert.deepEqual(comprendre(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, autre: true }], plus: 1 })), { lu: A, depot: DEPOT, issues: [issue] });
    assert.deepEqual(comprendre(JSON.stringify({ lu: A, issues: [] })), { informe: "“depot” is not a string" });
    assert.deepEqual(comprendre(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, priorite: "2" }] })), { informe: "“issues[0].priorite” is not a non-negative integer" });
  });

  test("l'adresse d'une issue reste au process principal : celle que la lecture a donnée, en https seulement, du projet lu", () => {
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
