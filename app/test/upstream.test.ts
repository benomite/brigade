// Ce qui est avant le rail (#1836, #697) : un rail vide ne veut pas dire un projet fini. Les issues ouvertes du dépôt sont
// lues ici comme l'app les lit de GitHub (board/read.ts, board/rail.ts, #2061), sur un faux GitHub : chacune que
// le rail ne porte pas est rangée d'après ses labels seuls. L'app compte ce que la lecture liste, range chaque issue sous
// le mot qu'elle porte, et n'y déduit rien. Ce que la vue en pose — ce que dit un rail vide — se joue dans
// test/vue/ (le bandeau Backlog au-dessus du rail n'est plus, #4354). L'état du manager vient de son journal, lu par la commande du
// runtime.
import { docRuntime } from "./helpers/doc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal } from "../../runtime/src/manager-cli.ts";
import { DEPOT } from "../../runtime/test/outils.ts";
import { COMMAND, understand, GROUPS, group, holdUpstream, see, type Seen } from "../src/upstream.ts";
import type { Reading } from "../src/box.ts";
import { COMMAND as COMMAND_MANAGER } from "../src/manager.ts";
import type { CallGitHub } from "../src/board/client.ts";
import { readTheBoardOfRepository } from "../src/board/read.ts";
import { readOfBoard } from "../src/board/rail.ts";

const PARADE = "parade";
const A = "2026-10-15T09:12:04.000Z";

// Une issue ouverte, telle que l'API de GitHub la rend. `pr` : une PR, que l'API des issues rend comme une issue.
type Open = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; pull_request?: object };
const openOne = (number: number, labels: string[] = [], others: { title?: string; pr?: true } = {}): Open => ({
  number,
  title: others.title ?? `Ticket ${number}`,
  labels: labels.map((name) => ({ name })),
  created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
  ...(others.pr === true ? { pull_request: {} } : {}),
});

// Un GitHub dont ce sont les issues ouvertes : celles au label `fire` sont le rail, les autres sont avant lui.
const github = (issues: Open[]): CallGitHub => async (path) => {
  if (path.includes("/issues?") && path.includes("labels=fire")) return { status: 200, data: issues.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
  if (path.includes("/issues?")) return { status: 200, data: issues };
  if (path.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};

// Ce que l'app lit de GitHub pour ces issues ouvertes, rendu dans la forme de `manager upstream` ; et `manager` — l'état
// du manager, lu de son journal par la commande du runtime —, tel quel.
function kitchen(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-amont-"));
  let minute = 0;
  const log = ouvrirJournal(directory, { maintenant: () => new Date(Date.UTC(2026, 9, 15, 9, ++minute)) });
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const note = (done: Fait, ticket: number | null, author = "manager") => void log.ajouter({ project: "brigade", ticket, author, ...done });
  const upstream = async (issues: Open[]): Promise<Reading> => {
    const readOne = await readTheBoardOfRepository({ depot: DEPOT, appeler: github(issues), maintenant: () => new Date(A) });
    return readOfBoard(readOne, PARADE, 3, [COMMAND]);
  };
  const manager = (): string => {
    const lines: string[] = [];
    void principal({ args: [], env: { BRIGADE_STATE_DIR: directory }, dire: (line) => void lines.push(line), redire: (line) => assert.fail(line) });
    return `${lines.join("\n")}\n`;
  };
  return { noter: note, amont: upstream, manager };
}

const reading = (text: string): Reading => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMAND, texte: text }] });
const readManager = (text: string): Reading => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMAND_MANAGER, texte: text }] });

// Ce qui est lu : le test échoue net si rien n'a été compté.
function account(seenOne: Seen) {
  assert.ok("compte" in seenOne, `rien n'a été compté : ${"sans" in seenOne ? seenOne.sans : ""}`);
  return seenOne;
}

// Un dépôt de référence : un nombre connu d'issues dans chacun des quatre états que les labels disent, deux sur le rail,
// une PR.
async function oneRepository(t: TestContext, others: Open[] = []) {
  const { amont: upstream, manager, noter: note } = kitchen(t);
  const output = await upstream([
    openOne(10, ["fire", "model:haiku", "effort:low"]),
    openOne(11, ["model:opus", "effort:high", "prio:2"], { title: "Prêt sans feu" }),
    openOne(12, ["blocked-on-human"]),
    openOne(13, ["served-elsewhere"]),
    openOne(14, ["model:opus"]),
    openOne(16, ["epic", "prio:1"], { title: "Une épique" }),
    openOne(17, ["epic"]),
    openOne(20, [], { title: "Pas encore lue" }),
    openOne(21),
    openOne(22, ["fire", "model:opus", "effort:high"]),
    openOne(23, [], { pr: true }),
    ...others,
  ]);
  return { sortie: output, manager, noter: note };
}

// Ce que le survol de la barre dit du dépôt de référence.
const HOVER = "8 issues before the rail — 3 not read yet · 2 epic, not split yet · 1 ready, not fired · 2 set aside";

describe("ce qui est avant le rail, lu sur GitHub", () => {
  test("un dépôt de référence : chaque état compte exactement ses issues — ni le rail, ni les PR —, dans l'ordre de la barre", async (t) => {
    const { sortie: output } = await oneRepository(t);

    const seenOne = account(see(output));

    assert.equal(seenOne.compte, 8);
    assert.equal(seenOne.lu, A);
    assert.deepEqual(
      seenOne.groupes.map(({ etat: state, nom: name, issues }) => [state, name, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", "not read yet", [14, 20, 21]],
        ["epique", "epic, not split yet", [16, 17]],
        ["prete", "ready, not fired", [11]],
        ["mise-de-cote", "set aside", [12, 13]],
      ],
    );
    // Au survol de la barre, son seul texte : le total, puis chaque état.
    assert.equal(seenOne.survol, HOVER);
    const issue = (ticket: number) => seenOne.groupes.flatMap(({ issues }) => issues).find((setOne) => setOne.ticket === ticket) ?? assert.fail(`pas de #${ticket}`);
    // Ce qui la retient, mot pour mot — ce que ses labels disent, en une ligne.
    // Un label d'attente d'avant parked la parque (#4260), comme le runtime le lit (runtime/src/amont.ts).
    assert.equal(issue(12).dit, "parked (`parked`): it waits for someone — who, for what and until when are on the issue; nothing takes it before");
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
    const { sortie: output } = await oneRepository(t, [
      openOne(35, ["bug"], { title: "The kitchen is idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)" }),
      openOne(36, [], { title: "The kitchen of the street is idle" }),
    ]);

    const seenOne = account(see(output));

    assert.equal(seenOne.compte, 9, "8 besoins de référence, et #36, un besoin comme un autre");
    assert.deepEqual(seenOne.groupes.flatMap(({ issues }) => issues.map(({ ticket }) => ticket)).filter((ticket) => ticket >= 34), [36]);
    assert.deepEqual(seenOne.alertes, [
      { ticket: 35, titre: "The kitchen is idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)", genre: "inerte", dit: "Kitchen idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)" },
    ]);
    assert.equal(seenOne.survol.startsWith("9 issues before the rail"), true);
    // Sans alerte, aucune clé.
    assert.equal("alertes" in account(see((await oneRepository(t)).sortie)), false);
  });

  test("les cinq états viennent dans l'ordre du bandeau, puis les deux d'un besoin découpé ; un mot que l'app ne connaît pas se pose après eux, tel quel", () => {
    const one = (ticket: number, state: string) => ({ ticket, titre: `#${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}`, priorite: null, etat: state, dit: state });

    const groups = group([one(1, "mise-de-cote"), one(2, "inconnu"), one(3, "non-lue"), one(4, "prete"), one(5, "epique"), one(6, "non-lue"), one(7, "incomplete")]);

    assert.deepEqual(GROUPS.map(({ etat: state }) => state), ["non-lue", "incomplete", "epique", "prete", "mise-de-cote", "decoupee", "servie", "idee"]);
    assert.deepEqual(
      groups.map(({ etat: state, issues }) => [state, issues.map(({ ticket }) => ticket)]),
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
    const { sortie: output, manager, noter: note } = await oneRepository(t);
    const upstreams = holdUpstream();

    // L'état du manager pas encore lu : l'app ne devine pas s'il les lit.
    assert.equal(
      upstreams.recevoir(output).vide,
      "nothing on the rail — 8 issues before it (3 not read yet · 2 epic, not split yet · 1 ready, not fired · 2 set aside) — the manager's state was not read: whether it is reading them is not known",
    );
    // Jamais allumé : éteint.
    assert.match(upstreams.manager(readManager(manager()))?.vide ?? "", / — the manager is off: it reads none of them, and nothing new enters the rail until you turn it on$/);
    note({ type: "manager.enabled", payload: {} }, null, "chef");
    assert.match(upstreams.manager(readManager(manager()))?.vide ?? "", / — the manager is on: it reads them at each wake-up, judges what it has not read and splits the epics$/);

    // Rien avant le rail non plus.
    const { amont: upstream } = kitchen(t);
    const nothing = see(await upstream([]));
    assert.equal(nothing.vide, "nothing on the rail, nothing before it");
    assert.equal(account(nothing).compte, 0);
    assert.equal(account(nothing).survol, "nothing before the rail: every open issue of the repository is on it");
  });

  test("les issues ouvertes qui ne se lisent pas, le rail si : ni nombre, ni « pas lu » — rien n'est dit (#1770)", async () => {
    const call = github([openOne(10, ["fire"]), openOne(20)]);
    const readOne = await readTheBoardOfRepository({ depot: DEPOT, appeler: async (path, headers) => (path.includes("/issues?") && !path.includes("labels=fire") ? { status: 403, data: {} } : call(path, headers)), maintenant: () => new Date(A) });
    const seenOne = see(readOfBoard(readOne, PARADE, 3, [COMMAND]));
    assert.ok("nonPublie" in seenOne, JSON.stringify(seenOne));
    assert.ok(!("compte" in seenOne) && !("sans" in seenOne));
    assert.equal(seenOne.vide, "nothing on the rail");
  });

  test("une lecture ratée ne donne jamais de nombre, et dit pourquoi — ce n'est pas « rien avant le rail »", async () => {
    const failure = (error: string, reached: boolean, theCase: null = null): Reading => ({ projet: PARADE, demande: 3, a: A, erreur: error, atteinte: reached, cas: theCase });
    const without = (seenOne: Seen) => {
      assert.ok(!("compte" in seenOne), "un nombre a été donné");
      assert.ok("sans" in seenOne, "la lecture ratée doit dire pourquoi");
      assert.match(seenOne.sans, /This is not “nothing before the rail”$/);
      assert.equal(seenOne.vide, `nothing on the rail — ${seenOne.sans}`);
      return seenOne.sans;
    };

    // GitHub ne se lit pas : sa raison, en une phrase.
    assert.match(without(see({ ...failure("GitHub refused to read the rail of acme/brigade (HTTP 403).", true), duTableau: true })), /^what is before the rail was not read: GitHub refused to read the rail of acme\/brigade \(HTTP 403\)\. This/);
    // Le même refus, lu tel que l'app le lit.
    const refusal = await readTheBoardOfRepository({ depot: DEPOT, appeler: async () => ({ status: 403, data: {} }), maintenant: () => new Date(A) });
    assert.match(without(see(readOfBoard(refusal, PARADE, 3, [COMMAND]))), /^what is before the rail was not read: GitHub refused to read the rail of acme\/brigade \(HTTP 403\)\. This/);
    // Une sortie qui n'a pas la forme : ni complétée, ni comptée.
    assert.match(without(see(reading(""))), /in what GitHub gave: the command returned nothing/);
    assert.match(without(see(reading("12 issues"))), /it is not JSON/);
    assert.match(without(see(reading(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ticket: 3, titre: "t", url: "u", priorite: null, etat: "non-lue" }] })))), /“issues\[0\]\.dit” is not a string/);
  });

  test("la commande que la lecture de GitHub remplace est celle que docs/runtime/ documente, dans le dépôt et sur la box", () => {
    const doc = docRuntime(join(import.meta.dirname, "../.."));

    assert.equal(COMMAND, "manager upstream");
    assert.ok(doc.includes("npm --prefix runtime run manager -- upstream"), "docs/runtime/ ne cite pas `manager -- upstream`");
    assert.ok(doc.includes("`brigade <projet> manager [return <n°> \\| backlog \\| upstream]`"), "docs/runtime/ ne cite pas `manager upstream`");
  });
  test("un champ de plus est laissé de côté, un champ qui manque refuse la forme entière", () => {
    const issue = { ticket: 3, titre: "t", url: "https://github.com/x/y/issues/3", priorite: 2, etat: "non-lue", dit: "d" };

    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, autre: true }], plus: 1 })), { lu: A, depot: DEPOT, issues: [issue] });
    assert.deepEqual(understand(JSON.stringify({ lu: A, issues: [] })), { informe: "“depot” is not a string" });
    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, priorite: "2" }] })), { informe: "“issues[0].priorite” is not a non-negative integer" });
  });

  test("l'adresse d'une issue reste au process principal : celle que la lecture a donnée, en https seulement, du projet lu", () => {
    const upstreams = holdUpstream();
    const issue = (ticket: number, url: string) => ({ ticket, titre: "t", url, priorite: null, etat: "non-lue", dit: "d" });
    upstreams.recevoir(reading(JSON.stringify({ lu: A, depot: DEPOT, issues: [issue(3, "https://github.com/x/y/issues/3"), issue(4, "http://ailleurs/4")] })));

    assert.equal(upstreams.adresse(PARADE, 3), "https://github.com/x/y/issues/3");
    assert.equal(upstreams.adresse(PARADE, 4), undefined);
    assert.equal(upstreams.adresse("autre", 3), undefined);
    // Le projet n'est plus affiché : ce qui a été lu de lui est lâché.
    upstreams.veiller([]);
    assert.equal(upstreams.adresse(PARADE, 3), undefined);
  });
});
