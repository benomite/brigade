// Ce que le réveil sans progrès lit du tour GitHub seul (#4027, `inactivite/observer.ts`) :
// l'état de chaque ticket, de ses labels ; un nouveau commit, un résultat de CI et un
// verdict de relecture, des lectures et des écritures que la station fait déjà.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { corpsDeVerdict } from "../../src/github-etat/fusion.ts";
import type { Progres } from "../../src/inactivite/inactivite.ts";
import { etatSuivi, suivreLesProgres } from "../../src/inactivite/observer.ts";

const A = "2026-11-23T10:00:00.000Z";
const SHA1 = "1".repeat(40);
const SHA2 = "2".repeat(40);

function monter() {
  const dicte = {
    tickets: [] as TicketLu[],
    pr: null as { number: number; sha: string } | null,
    ouvertes: [] as { branche: string; fichiers: string[]; number?: number; sha?: string }[],
    checks: [] as { name?: string; outcome: "green" | "red" | "pending" }[],
  };
  const client = {
    fires: async () => dicte.tickets,
    commenter: async () => {},
    prDuTicket: async () => dicte.pr,
    prOuverteDuTicket: async () => dicte.pr,
    prsOuvertes: async () => dicte.ouvertes,
    ci: async () => dicte.checks,
  } as unknown as GitHubDuTour;
  const suivi = suivreLesProgres(() => new Date(A));
  const notes: Array<[number, Progres]> = [];
  suivi.ecouter((ticket, progres) => void notes.push([ticket, progres]));
  return { suivi, dicte, notes, github: suivi.envelopper(client) };
}

const ticket = (number: number, labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels, state: "open" });

test("the state of a ticket, in the words of the glossary, from its labels", () => {
  assert.equal(etatSuivi(["fire", "taken"]), "cooking");
  assert.equal(etatSuivi(["fire", "in-pass", "taken"]), "in pass");
  assert.equal(etatSuivi(["fire", "set-aside:failures"]), "set aside");
  assert.equal(etatSuivi(["fire", "served-elsewhere"]), "set aside");
  assert.equal(etatSuivi(["fire", "blocked-on-human"]), "parked");
  assert.equal(etatSuivi(["fire", "chef-todo"]), "parked");
  assert.equal(etatSuivi(["fire", "waiting", "in-pass"]), "WAITING");
  assert.equal(etatSuivi(["fire", "model:opus"]), null);
});

test("each reading of the tickets says which are followed, and in which state; a queued ticket is not", async () => {
  const { suivi, dicte, github } = monter();
  dicte.tickets = [ticket(1, ["fire", "taken"]), ticket(2, ["fire"]), ticket(3, ["fire", "waiting"])];
  assert.deepEqual(await github.fires(), dicte.tickets);
  assert.deepEqual(suivi.tickets(), [{ number: 1, state: "cooking" }, { number: 3, state: "WAITING" }]);
});

for (const lecture of ["prDuTicket", "prOuverteDuTicket"] as const) {
  test(`a new head of the ticket's PR, read by ${lecture}, is a new commit; the first reading and the same head are not`, async () => {
    const { dicte, notes, github } = monter();
    dicte.pr = { number: 50, sha: SHA1 };
    await github[lecture]?.(7);
    await github[lecture]?.(7);
    assert.deepEqual(notes, []);
    dicte.pr = { number: 50, sha: SHA2 };
    await github[lecture]?.(7);
    assert.deepEqual(notes, [[7, { kind: "commit", by: "agent", at: A }]]);
    dicte.pr = null;
    assert.equal(await github[lecture]?.(7), null);
    assert.equal(notes.length, 1);
  });
}

test("a new head of a `cook/<n>-` branch among the open PRs is a new commit of ticket n; another branch is nobody's", async () => {
  const { dicte, notes, github } = monter();
  dicte.ouvertes = [{ branche: "cook/7-github", fichiers: [], number: 50, sha: SHA1 }, { branche: "feature/x", fichiers: [], number: 51, sha: SHA1 }, { branche: "cook/8-github", fichiers: [] }];
  await github.prsOuvertes();
  dicte.ouvertes = [{ branche: "cook/7-github", fichiers: [], number: 50, sha: SHA2 }, { branche: "feature/x", fichiers: [], number: 51, sha: SHA2 }];
  await github.prsOuvertes();
  assert.deepEqual(notes, [[7, { kind: "commit", by: "agent", at: A }]]);
});

test("the concluded checks of a ticket's head that change are a CI result; a pending check, a first reading or a head of no ticket are not", async () => {
  const { dicte, notes, github } = monter();
  dicte.pr = { number: 50, sha: SHA1 };
  await github.prDuTicket(7);
  dicte.checks = [{ name: "tests", outcome: "pending" }];
  await github.ci(SHA1);
  await github.ci(SHA1);
  assert.deepEqual(notes, []);
  dicte.checks = [{ name: "tests", outcome: "red" }];
  assert.deepEqual(await github.ci(SHA1), dicte.checks);
  assert.deepEqual(notes, [[7, { kind: "ci", by: "agent", at: A }]]);
  dicte.checks = [{ name: "tests", outcome: "green" }];
  await github.ci(SHA2);
  await github.ci(SHA2);
  assert.equal(notes.length, 1);
});

test("a review verdict posted on the PR of a ticket is a progress of that ticket; another comment, or a PR of no ticket, is not", async () => {
  const { dicte, notes, github } = monter();
  dicte.pr = { number: 50, sha: SHA1 };
  await github.prDuTicket(7);
  await github.commenter(50, "a comment");
  await github.commenter(51, corpsDeVerdict("box", SHA1, { verdict: "approve", motif: "" }));
  assert.deepEqual(notes, []);
  await github.commenter(50, corpsDeVerdict("box", SHA1, { verdict: "request-changes", motif: "a test is missing" }));
  assert.deepEqual(notes, [[7, { kind: "review", by: "agent", at: A }]]);
});

test("a ticket no longer open is forgotten: its head and its checks are no one's", async () => {
  const { dicte, notes, github } = monter();
  dicte.tickets = [ticket(7, ["fire", "in-pass"]), ticket(8, ["fire", "in-pass"])];
  await github.fires();
  dicte.pr = { number: 50, sha: SHA1 };
  await github.prDuTicket(7);
  dicte.pr = { number: 60, sha: SHA2 };
  await github.prDuTicket(8);
  dicte.checks = [{ name: "tests", outcome: "pending" }];
  await github.ci(SHA1);
  await github.ci(SHA2);
  dicte.tickets = [ticket(8, ["fire", "in-pass"])];
  await github.fires();
  dicte.checks = [{ name: "tests", outcome: "green" }];
  await github.ci(SHA1);
  await github.commenter(50, corpsDeVerdict("box", SHA1, { verdict: "approve", motif: "" }));
  assert.deepEqual(notes, []);
  await github.ci(SHA2);
  assert.deepEqual(notes, [[8, { kind: "ci", by: "agent", at: A }]]);
  // Reopened, its first head is read again as a first reading.
  dicte.tickets = [ticket(7, ["fire", "in-pass"]), ticket(8, ["fire", "in-pass"])];
  await github.fires();
  dicte.pr = { number: 50, sha: SHA1 };
  await github.prDuTicket(7);
  assert.equal(notes.length, 1);
});

test("a client without the PR or CI readings keeps them absent", () => {
  const suivi = suivreLesProgres();
  const github = suivi.envelopper({ fires: async () => [], commenter: async () => {} } as unknown as GitHubDuTour);
  assert.deepEqual([github.prsOuvertes, github.prDuTicket, github.prOuverteDuTicket, github.ci], [undefined, undefined, undefined, undefined]);
});

test("a ticket still open keeps its head, its PR and its checks across the readings of the tickets", async () => {
  const { dicte, notes, github } = monter();
  dicte.tickets = [ticket(7, ["fire", "in-pass"])];
  dicte.pr = { number: 50, sha: SHA1 };
  await github.prDuTicket(7);
  dicte.checks = [{ name: "tests", outcome: "pending" }];
  await github.ci(SHA1);
  await github.fires();
  dicte.checks = [{ name: "tests", outcome: "green" }];
  await github.ci(SHA1);
  await github.commenter(50, corpsDeVerdict("box", SHA1, { verdict: "approve", motif: "" }));
  dicte.pr = { number: 50, sha: SHA2 };
  await github.prDuTicket(7);
  assert.deepEqual(
    notes.map(([numero, { kind }]) => [numero, kind]),
    [
      [7, "ci"],
      [7, "review"],
      [7, "commit"],
    ],
  );
});

test("a new check that only starts is not a CI result", async () => {
  const { dicte, notes, github } = monter();
  dicte.pr = { number: 50, sha: SHA1 };
  await github.prDuTicket(7);
  dicte.checks = [{ name: "tests", outcome: "pending" }];
  await github.ci(SHA1);
  dicte.checks = [{ name: "tests", outcome: "pending" }, { name: "lint", outcome: "pending" }];
  await github.ci(SHA1);
  assert.deepEqual(notes, []);
});
