// Les règles des statuts de CI (#3953) au-delà des tests gelés : ce que la
// règle B fait d'une lecture ou d'un commentaire qui échoue, comment elle
// compte les runs, ce que la règle A fait d'une carte à laquelle le chef a
// répondu, et les deux lectures de la station — les checks de la base, les
// runs de la branche d'un ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo, cartesRetenues, brancherLeTriage } from "../../src/carte-todo.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ticketDuCheck } from "../../src/carte-ci-windows.ts";
import { deciderDuPush, evaluerMain, statutsDesChecks, statutsDesRuns } from "../../src/statuts-ci/regles.ts";
import type { RunDeCi } from "../../src/temps-ticket/ci-github.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

// L'interface des statuts, telle que les règles la lisent.
type ResultatDeCheck = { check: string; outcome: "red" | "green"; run: number | null; tete?: string };
type StatutsCi = { resultats(cible: string): Promise<ResultatDeCheck[]> };
// La carte d'un rouge de la base a la clé d'un check Windows rouge, nommé « red main ».
const ticketDuRougeDe = (branche: string) => ticketDuCheck("red main", branche);
// Le check sur lequel la règle B arrête un ticket, ou null si elle le laisse pousser.
async function arret(resultats: ResultatDeCheck[]) {
  const decision = await deciderDuPush({ statuts: { resultats: async () => resultats }, ticket: 9, commenter: async () => {} });
  return decision.pousser ? null : { check: decision.check, runs: decision.runs };
}

const rouge = (check: string, run: number, tete?: string): ResultatDeCheck => ({ check, outcome: "red", run, ...(tete === undefined ? {} : { tete }) });
const vert = (check: string, run: number, tete?: string): ResultatDeCheck => ({ check, outcome: "green", run, ...(tete === undefined ? {} : { tete }) });
const statutsFixes = (parCible: Record<string, ResultatDeCheck[]>): StatutsCi => ({ resultats: async (cible) => parCible[cible] ?? [] });

test("two reds of the same check are not three: the push goes ahead, nothing is written", async () => {
  const ecrits: string[] = [];
  const decision = await deciderDuPush({ statuts: statutsFixes({ "ticket:5": [rouge("unit", 2), rouge("unit", 1)] }), ticket: 5, commenter: async (_n, corps) => void ecrits.push(corps) });
  assert.deepEqual(decision, { pousser: true });
  assert.deepEqual(ecrits, []);
});

test("the results of one head are one run: three heads red on unit stop the push, whatever else their other checks say", async () => {
  const resultats = [rouge("unit", 31, "c"), vert("lint", 32, "c"), rouge("unit", 21, "b"), rouge("lint", 22, "b"), vert("lint", 12, "a"), rouge("unit", 11, "a")];
  assert.deepEqual(await arret(resultats), { check: "unit", runs: [31, 21, 11] });
  // La tête la plus récente, verte sur tous ses checks : rien ne s'arrête.
  assert.equal(await arret([vert("unit", 41, "d"), ...resultats]), null);
  // Trois têtes rouges, chacune sur un autre check : rien ne s'arrête.
  assert.equal(await arret([rouge("unit", 3, "c"), rouge("lint", 2, "b"), rouge("types", 1, "a")]), null);
});

test("the comment names the check, the three runs and the `parked` label — the ticket waits for the supervisor (#4129); an unnamed run is said so", async () => {
  const ecrits: Array<[number, string]> = [];
  const resultats: ResultatDeCheck[] = [{ check: "unit", outcome: "red", run: 303 }, { check: "unit", outcome: "red", run: null, tete: "b" }, { check: "unit", outcome: "red", run: 301 }];
  await deciderDuPush({ statuts: { resultats: async () => resultats }, ticket: 8, commenter: async (issue, corps) => void ecrits.push([issue, corps]) });
  assert.equal(ecrits.length, 1);
  const [issue, corps] = ecrits[0] ?? assert.fail("one comment");
  assert.equal(issue, 8);
  assert.ok(corps.startsWith("<!-- brigade:rouges-de-suite check=unit -->"));
  assert.match(corps, /red on `unit` for the third time in a row \(run 303, an unnamed run, run 301\)/);
  assert.match(corps, /no fourth run/);
  assert.ok(corps.includes("the ticket is parked (`parked`), waiting for the supervisor. Removing `parked` tries again"), corps);
  assert.ok(!corps.includes("`set-aside:failures`"), corps);
});

test("statuses that cannot be read let the push go ahead and say why; a comment that cannot be written still refuses the push", async () => {
  const illisibles: StatutsCi = { resultats: async () => Promise.reject(new Error("HTTP 502")) };
  assert.deepEqual(await deciderDuPush({ statuts: illisibles, ticket: 5, commenter: async () => assert.fail("nothing is written") }), { pousser: true, illisible: "HTTP 502" });
  const statuts = statutsFixes({ "ticket:5": [rouge("unit", 3), rouge("unit", 2), rouge("unit", 1)] });
  const decision = await deciderDuPush({ statuts, ticket: 5, commenter: async () => Promise.reject(new Error("HTTP 403")) });
  assert.deepEqual(decision, { pousser: false, check: "unit", runs: [3, 2, 1], nonDit: "HTTP 403" });
});

test("a red main: the card names its checks and asks one question; unreadable statuses or repair state move nothing", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const base = { journal, projet: "brigade", branche: "trunk" };
  assert.deepEqual(await evaluerMain({ ...base, statuts: { resultats: async () => Promise.reject(new Error("HTTP 502")) }, cuisinePeutReparer: async () => false }), { carte: "aucune", illisible: "HTTP 502" });
  const statuts = statutsFixes({ main: [rouge("unit", 900), rouge("lint", 900)] });
  assert.deepEqual(await evaluerMain({ ...base, statuts, cuisinePeutReparer: async () => Promise.reject(new Error("no turn")) }), { carte: "aucune", illisible: "no turn" });
  assert.deepEqual(cartesEnTodo(journal.base), []);
  // Aucun résultat : rien ne bouge.
  assert.deepEqual(await evaluerMain({ ...base, statuts: statutsFixes({}), cuisinePeutReparer: async () => false }), { carte: "aucune" });
  assert.deepEqual(await evaluerMain({ ...base, statuts, cuisinePeutReparer: async () => false }), { carte: "entree" });
  const [carte] = cartesEnTodo(journal.base);
  assert.equal(carte?.ticket, ticketDuRougeDe("trunk"));
  assert.match(carte?.resume ?? "", /^trunk is red on unit, lint, and the kitchen cannot make it green by itself/);
  assert.equal(carte?.question, "Will you take the red unit, lint on trunk in hand yourself?");
  assert.deepEqual(carte?.choix.map(({ suite }) => suite), ["resume", "drop"]);
  // Le vert la sort ; un second vert ne sort rien de plus.
  const verts = statutsFixes({ main: [vert("unit", 901), vert("lint", 901)] });
  assert.deepEqual(await evaluerMain({ ...base, statuts: verts, cuisinePeutReparer: async () => assert.fail("a green main asks nothing") }), { carte: "sortie" });
  assert.deepEqual(await evaluerMain({ ...base, statuts: verts, cuisinePeutReparer: async () => false }), { carte: "aucune" });
});

test("another red's card in TODO does not hold back this branch's card: each red has its own", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const entree = { journal, projet: "brigade", statuts: statutsFixes({ main: [rouge("unit", 900)] }), cuisinePeutReparer: async () => false };
  assert.deepEqual(await evaluerMain({ ...entree, branche: "trunk" }), { carte: "entree" });
  assert.deepEqual(await evaluerMain(entree), { carte: "entree" });
  assert.deepEqual(cartesEnTodo(journal.base).map(({ ticket }) => ticket).sort(), [ticketDuRougeDe("trunk"), ticketDuRougeDe("main")].sort());
});

test("a card the chef answered while main stays red does not come back before the green; a card held by the triage is not proposed again", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const ticket = ticketDuRougeDe("main");
  const entree = { journal, projet: "brigade", statuts: statutsFixes({ main: [rouge("unit", 900)] }), cuisinePeutReparer: async () => false };
  await evaluerMain(entree);
  journal.ajouter({ project: "brigade", ticket, author: "chef", type: "todo.answered", payload: { choice: 1 } } as never);
  journal.ajouter({ project: "brigade", ticket, author: "chef", type: "todo.left", payload: { why: "answered by the chef" } });
  assert.deepEqual(cartesEnTodo(journal.base), []);
  assert.deepEqual(await evaluerMain(entree), { carte: "aucune" });
  assert.deepEqual(cartesEnTodo(journal.base), []);
  // Vert : la réponse est close ; rouge de nouveau, la carte revient.
  await evaluerMain({ ...entree, statuts: statutsFixes({ main: [vert("unit", 901)] }) });
  assert.equal(journal.duTicket(ticket).at(-1)?.type, "todo.left");
  const debrancher = brancherLeTriage(journal.base, () => true);
  await evaluerMain(entree);
  assert.equal(cartesRetenues(journal.base).length, 1);
  debrancher();
  assert.deepEqual(await evaluerMain(entree), { carte: "aucune" });
  assert.deepEqual(cartesEnTodo(journal.base), []);
});

test("the checks of the base, read by the turn, are the statuses of main: the running ones say nothing, and no ticket is read there", async () => {
  const statuts = statutsDesChecks([{ name: "unit", outcome: "red" }, { outcome: "green" }, { name: "lint", outcome: "pending" }]);
  assert.deepEqual(await statuts.resultats("main"), [{ check: "unit", outcome: "red", run: null }, { check: "unnamed check", outcome: "green", run: null }]);
  assert.deepEqual(await statuts.resultats("ticket:5"), []);
});

test("the runs of a ticket's branch since its relaunch are its statuses, newest first: a failed job is red, a skipped one green, a cancelled or running one says nothing", async () => {
  const lus: string[] = [];
  const job = (nom: string | undefined, conclusion: string | null) => ({ creeLe: "", commenceLe: null, finiLe: null, ...(nom === undefined ? {} : { nom }), conclusion });
  const runs: RunDeCi[] = [
    { id: 1, tete: "a", creeLe: "2026-11-20T10:00:00Z", finiLe: null, jobs: [job("unit", "failure")] },
    { id: 3, tete: "c", creeLe: "2026-11-20T12:00:00Z", finiLe: null, jobs: [job("unit", "timed_out"), job("lint", "skipped"), job("types", "cancelled"), job("e2e", null), job(undefined, "failure")] },
    { tete: "b", creeLe: "2026-11-20T11:00:00Z", finiLe: null, jobs: [job("unit", "success")] },
    // Le plus récent, rendu le dernier par la lecture : il passe en tête.
    { id: 4, tete: "d", creeLe: "2026-11-20T13:00:00Z", finiLe: null, jobs: [job("unit", "failure")] },
  ];
  const statuts = statutsDesRuns(async (branche) => (lus.push(branche), runs), (n) => `cook/${n}-github`, Date.parse("2026-11-20T10:00:00Z"));
  assert.deepEqual(await statuts.resultats("ticket:42"), [
    { check: "unit", outcome: "red", run: 4, tete: "d" },
    { check: "unit", outcome: "red", run: 3, tete: "c" },
    { check: "lint", outcome: "green", run: 3, tete: "c" },
    { check: "unit", outcome: "green", run: null, tete: "b" },
  ]);
  assert.deepEqual(lus, ["cook/42-github"]);
  assert.deepEqual(await statuts.resultats("main"), []);
  assert.deepEqual(lus, ["cook/42-github"]);
});
