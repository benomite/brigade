// Le budget GitHub de l'app (app/src/budget-github.ts, #3007) : six projets lus toute la journée restent loin du budget
// horaire du jeton du chef. Les lectures passent par la composition même de main.ts (`lireLeTableau`) — la lecture du
// rail, ce qui attend le chef et les cartes assignées, sous condition, sous le budget, au plus une fois par minute et par
// projet —, contre un GitHub en mémoire qui donne ses ETag, répond 304 et dit son budget (`x-ratelimit-*`). L'heure est
// simulée : aucun test n'attend l'horloge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readingUnderBudget, ReadsInPause, PAUSE_WITHOUT_HOUR_MS, refusalForOverrun, holdTheBudgetGitHub, type BudgetGitHub } from "../src/budget-github.ts";
import type { BoardRead } from "../src/board/read.ts";
import { withWhatAwaitingTheChef } from "../src/board/wait-of-chef.ts";
import { byFetch, type CallGitHub, type LimitGitHub, type AnswerGitHub } from "../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository } from "../src/board/read.ts";
import { readConditional, type MemoryOfReads } from "../src/board/rail-github.ts";
import { FRESHNESS_MAX_OF_A_READ_MS } from "../src/vue/served/freshness.ts";
import { holdReadsOfBoard } from "../src/board/rail.ts";
import { shareOfCardsAssigned } from "../src/vue/cards-assigned/cards-assigned.ts";

const START = Date.parse("2026-11-09T08:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const PROJECTS = ["chef/un", "chef/deux", "chef/trois", "chef/quatre", "chef/cinq", "chef/six"].map((repository) => ({ nom: repository.split("/")[1]!, depot: repository }));

const issue = (repository: string, number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${repository}/issues/${number}`,
  created_at: "2026-11-08T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});

type Request = { chemin: string; entetes: Record<string, string>; a: number; status: number };

// Un GitHub en mémoire, à l'heure de `horloge`. Chaque réponse porte son ETag, et un `If-None-Match` qui le redonne
// reçoit un 304 sans corps. `changeToutesLes` : chaque projet change aussi souvent — un label, un commentaire —, ce qui
// change les listes d'issues et les commentaires du ticket pris. `limite` : le budget qu'il dit, à chaque réponse.
// `repondre` : une réponse imposée, avant tout le reste.
function fakeGitHub(clock: { t: number }, options: { changeToutesLes?: number; limite?: () => LimitGitHub; repondre?: (path: string) => AnswerGitHub | undefined } = {}) {
  const requests: Request[] = [];
  const limit = options.limite ?? (() => ({ restant: 4_500, total: 5_000, repriseLe: clock.t + 30 * MINUTE }));
  const data = (path: string): { data: unknown; version: number } | { status: number } => {
    const repository = /^\/repos\/([^/]+\/[^/?]+)/.exec(path)?.[1] ?? "";
    const version = options.changeToutesLes === undefined ? 0 : Math.floor((clock.t - START) / options.changeToutesLes);
    const atFire = [issue(repository, 1, ["fire", "prio:2"]), issue(repository, 2, ["fire", "taken", "prio:1"]), issue(repository, 3, ["fire", "in-pass"]), issue(repository, 4, ["fire", version % 2 === 0 ? "prio:3" : "prio:4"])];
    if (path.includes("/issues?") && path.includes("labels=fire")) return { data: atFire, version };
    if (path.includes("/issues?")) return { data: [...atFire, issue(repository, 5, ["blocked-on-human"]), issue(repository, 6, ["model:opus", "effort:high"]), issue(repository, 7, [])], version };
    if (path.includes("/pulls?state=open")) return { data: [{ number: 40, html_url: `https://github.com/${repository}/pull/40`, created_at: "2026-11-09T07:00:00Z", head: { ref: "cook/3-x" }, body: "" }], version: 0 };
    if (path.includes("/pulls?")) return { data: [], version: 0 };
    if (/\/pulls\/\d+$/.test(path)) return { data: { additions: 135, deletions: 21, created_at: "2026-11-09T07:00:00Z" }, version: 0 };
    if (path === `/repos/${repository}`) return { data: { default_branch: "main", owner: { login: "chef", type: "User" } }, version: 0 };
    if (path.includes("/contents/")) return { data: { content: btoa(JSON.stringify({ chef: "chef" })) }, version: 0 };
    if (path.includes("/check-runs")) return { data: { check_runs: [{ conclusion: "success" }] }, version: 0 };
    if (path.includes("/issues/2/comments")) return { data: [{ id: 9, body: "<!-- brigade:prise station=box/claude -->", author_association: "OWNER", created_at: "2026-11-09T07:30:00Z" }], version };
    if (/\/issues\/\d+\/(comments|events|timeline)/.test(path)) return { data: [], version: 0 };
    return { status: 404 };
  };
  const call: CallGitHub = async (path, headers = {}) => {
    const imposed = options.repondre?.(path);
    const readEntry = data(path);
    const answer: AnswerGitHub =
      imposed ??
      ("status" in readEntry
        ? { status: readEntry.status, data: { message: "Not Found" }, limite: limit() }
        : headers["If-None-Match"] === `"${path}#${readEntry.version}"`
          ? { status: 304, data: "", etag: `"${path}#${readEntry.version}"`, limite: limit() }
          : { status: 200, data: readEntry.data, etag: `"${path}#${readEntry.version}"`, limite: limit() });
    requests.push({ chemin: path, entetes: headers, a: clock.t, status: answer.status });
    return answer;
  };
  return { appeler: call, demandes: requests };
}

// La lecture des projets telle que main.ts la compose (`lireLeTableau`, `tableaux`).
function readOfTheApp(clock: { t: number }, callGitHub: CallGitHub, budget: BudgetGitHub = holdTheBudgetGitHub({ maintenant: () => clock.t })) {
  const callUnderBudget = budget.appeler(callGitHub);
  const memories = new Map<string, MemoryOfReads>();
  const memoryOfRail = (repository: string): MemoryOfReads => memories.get(repository) ?? memories.set(repository, new Map()).get(repository)!;
  const readTheBoard = (project: { nom: string; depot: string }): Promise<ReadOfBoardOfRepository> =>
    readingUnderBudget({
      budget,
      depot: project.depot,
      dernier: () => boards.dernier(project.nom),
      maintenant: () => clock.t,
      lire: async () => {
        const { depot: repository } = project;
        const readOne = await readTheBoardOfRepository({ depot: repository, appeler: callUnderBudget, memoire: memoryOfRail(repository), maintenant: () => new Date(clock.t) });
        const call = readConditional(callUnderBudget, memoryOfRail(repository));
        return withWhatAwaitingTheChef(readOne, call, shareOfCardsAssigned({ appeler: call, depot: repository, login: async () => "chef" }));
      },
    });
  const boards = holdReadsOfBoard({ lire: readTheBoard, fraicheurMs: INTERVAL_BY_PROJECT_MS, maintenant: () => clock.t });
  return { budget, tableaux: boards };
}

// Les veilles de l'app relisent chaque projet toutes les cinq secondes (main.ts) : un tour de lecture, à cette heure.
// La simulation avance d'une minute par tour : une lecture fait une quinzaine de demandes, mais GitHub ne compte que ce qui a changé.
const INTERVAL_BY_PROJECT_MS = 60_000;
async function oneTour(boards: { lire(project: (typeof PROJECTS)[number]): Promise<ReadOfBoardOfRepository> }): Promise<ReadOfBoardOfRepository[]> {
  return Promise.all(PROJECTS.map((project) => boards.lire(project)));
}

// Six projets lus huit heures simulées, une heure par test pour que chacun reste court : les tests d'un fichier se jouent
// l'un après l'autre, dans l'ordre, et chaque heure reprend la cuisine où la précédente l'a laissée. Une cuisine
// affairée : chaque projet change toutes les trois minutes.
const day = (() => {
  const clock = { t: START };
  const github = fakeGitHub(clock, { changeToutesLes: 3 * MINUTE });
  return { horloge: clock, github, ...readOfTheApp(clock, github.appeler) };
})();

for (let hour = 0; hour < 8; hour++) {
  test(`simulated hour ${hour + 1} of 8: six projects polled stay at most at 1,000 counted GitHub requests`, async () => {
    const { horloge: clock, github, budget, tableaux: boards } = day;
    const end = START + (hour + 1) * HOUR;
    let moreTop = 0;
    // Les veilles relisent toutes les cinq secondes ; un tour par minute simule ce qu'elles demandent, en moins de temps ; les relectures d'un rail inchangé sont des 304, que GitHub ne compte pas.
    for (; clock.t < end; clock.t += INTERVAL_BY_PROJECT_MS) {
      // Un geste du chef toutes les dix minutes : la lecture suivante va à GitHub, sans reprendre la dernière (main.ts).
      if ((clock.t - START) % (10 * MINUTE) === 0) boards.oublier();
      const readEntries = await oneTour(boards);
      assert.ok(readEntries.every((readEntry) => readEntry.lu), "every rail is read");
      moreTop = Math.max(moreTop, budget.demandesDeLaDerniereHeure().comptees);
    }
    // Ce que GitHub a reçu dans cette heure : ce qu'il compte (tout sauf un 304), et ce qui est parti.
    const received = github.demandes.filter(({ a }) => a >= end - HOUR && a < end);
    const counted = received.filter(({ status }) => status !== 304).length;
    console.log(`simulated hour ${hour + 1}: ${counted} counted requests, ${received.length} sent (304 included), ${moreTop} in the busiest sliding hour`);
    assert.ok(counted > 0);
    assert.ok(counted <= 1_000, `${counted} counted requests in the simulated hour`);
    assert.ok(moreTop <= 1_000, `${moreTop} counted requests in the busiest sliding hour`);
    // Le compteur du module dit ce que GitHub a reçu dans la dernière heure.
    const last = github.demandes.filter(({ a }) => a > clock.t - HOUR);
    assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: last.length, comptees: last.filter(({ status }) => status !== 304).length });
  });
}

test("a project is not read again within a reading's freshness (4 s), unless a gesture forgets the reading", async () => {
  const clock = { t: START };
  const github = fakeGitHub(clock);
  const { tableaux: boards } = readOfTheApp(clock, github.appeler);
  await oneTour(boards);
  const first = github.demandes.length;
  assert.ok(first > 0);
  clock.t += FRESHNESS_MAX_OF_A_READ_MS - 1;
  await oneTour(boards);
  assert.equal(github.demandes.length, first, "nothing is sent within the freshness");
  clock.t += 1;
  await oneTour(boards);
  assert.ok(github.demandes.length > first, "the freshness past, every project is read again");
});

test("a 304 is not downloaded again: the kept answer is reused, and the stored ETag goes with the next request", async () => {
  const clock = { t: START };
  const github = fakeGitHub(clock);
  const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
  const memory: MemoryOfReads = new Map();
  const call = readConditional(budget.appeler(github.appeler), memory);
  const path = "/repos/chef/un/issues?state=open&labels=fire";
  const first = await call(path);
  assert.equal(first.status, 200);
  assert.equal(github.demandes[0]!.entetes["If-None-Match"], undefined);
  const second = await call(path);
  assert.equal(github.demandes[1]!.entetes["If-None-Match"], first.etag, "the stored ETag is sent");
  assert.equal(github.demandes[1]!.status, 304);
  assert.deepEqual(second, { status: 200, data: first.data, etag: first.etag }, "the kept body is reused");
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 2, comptees: 1 }, "the 304 is sent but not counted");
});

test("under 20% of the budget left, reads pause for every project until the reset time, then resume", async () => {
  const clock = { t: START };
  const resumption = START + 25 * MINUTE;
  let remaining = 1_000;
  const github = fakeGitHub(clock, { limite: () => ({ restant: remaining, total: 5_000, repriseLe: resumption }) });
  const { budget, tableaux: boards } = readOfTheApp(clock, github.appeler);
  // 1,000 of 5,000 is 20%: not under it.
  const readEntries = await oneTour(boards);
  assert.ok(readEntries.every((readEntry) => readEntry.lu));
  assert.equal(budget.enPauseJusqua(), null);
  // Under it: the read in course stops at the next request, and every project keeps its last rail.
  remaining = 999;
  clock.t += INTERVAL_BY_PROJECT_MS;
  const before = github.demandes.length;
  const inPause = await oneTour(boards);
  assert.equal(budget.enPauseJusqua(), resumption);
  // The six reads left together: each sent its first request before the first answer said the budget is low, then
  // nothing more left.
  assert.equal(github.demandes.length, before + PROJECTS.length, "one request per project, then nothing");
  assert.deepEqual(inPause.map(({ pauseJusqua, ...rail }: { pauseJusqua?: string }) => (assert.equal(pauseJusqua, new Date(resumption).toISOString()), rail)), readEntries, "every project keeps its last rail, saying when the reads resume");
  for (; clock.t < resumption; clock.t += 30_000) await oneTour(boards);
  clock.t = resumption - 1;
  boards.oublier();
  await oneTour(boards);
  assert.equal(github.demandes.length, before + PROJECTS.length, "no project is read before the reset time");
  // The reset time: every project is read again.
  remaining = 5_000;
  clock.t = resumption;
  boards.oublier();
  const resumptions = await oneTour(boards);
  assert.equal(budget.enPauseJusqua(), null);
  assert.ok(resumptions.every((readEntry) => readEntry.lu && readEntry.luLe === new Date(resumption).toISOString()), "every project is read at the reset time");
  for (const { depot: repository } of PROJECTS) assert.ok(github.demandes.some(({ chemin: path, a }) => a === resumption && path.startsWith(`/repos/${repository}/`)), `${repository} is read again`);
});

test("after a rate-limit refusal no request is sent before the reset time, and a project never read says the pause", async () => {
  const clock = { t: START };
  const resumption = START + 40 * MINUTE;
  let refuse = true;
  const github = fakeGitHub(clock, {
    repondre: () => (refuse ? { status: 403, data: { message: "API rate limit exceeded for user ID 1. If you reach out to GitHub Support…" }, limite: { restant: 0, total: 5_000, repriseLe: resumption } } : undefined),
  });
  const { budget, tableaux: boards } = readOfTheApp(clock, github.appeler);
  const readEntries = await oneTour(boards);
  // The six reads left together: each had sent its first request before the first refusal came back, none sent another.
  assert.equal(github.demandes.length, PROJECTS.length, "the first refusal stops every read");
  assert.equal(new Set(github.demandes.map(({ chemin: path }) => path.split("/issues")[0])).size, PROJECTS.length, "one request per project");
  assert.equal(budget.enPauseJusqua(), resumption);
  for (const readEntry of readEntries) {
    assert.equal(readEntry.lu, false);
    assert.match(readEntry.lu ? "" : readEntry.raison, /is not read until 2026-11-09 08:40 UTC: GitHub refused a read for going over the rate limit \(HTTP 403\), so the app paused its GitHub reads for every project \(\d+ counted requests in the last hour\)/);
  }
  refuse = false;
  for (; clock.t < resumption; clock.t += 30_000) {
    boards.oublier();
    await oneTour(boards);
  }
  assert.equal(github.demandes.length, PROJECTS.length, "no request before the reset time");
  clock.t = resumption;
  boards.oublier();
  assert.ok((await oneTour(boards)).every((readEntry) => readEntry.lu), "the reset time come, every rail is read");
});

test("a refusal with retry-after pauses that long; one that gives no time pauses a minute; a 429 is a refusal", async () => {
  const clock = { t: START };
  const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
  let answer: AnswerGitHub = { status: 403, data: { message: "You have exceeded a secondary rate limit" }, reessayerApresMs: 90_000 };
  const call = budget.appeler(async () => answer);
  await call("/repos/chef/un");
  assert.equal(budget.enPauseJusqua(), START + 90_000);
  await assert.rejects(call("/repos/chef/un"), (error: unknown) => error instanceof ReadsInPause && error.jusqua === START + 90_000);
  clock.t = START + 90_000;
  answer = { status: 429, data: "" };
  await call("/repos/chef/un");
  assert.equal(budget.enPauseJusqua(), START + 90_000 + PAUSE_WITHOUT_HOUR_MS);
  // A 403 that is not about the rate limit, or a 404, pauses nothing.
  assert.equal(refusalForOverrun({ status: 403, data: { message: "Resource not accessible by integration" } }), false);
  assert.equal(refusalForOverrun({ status: 404, data: {}, limite: { restant: 0, total: 60, repriseLe: START } }), false);
});

test("a read that fails or carries no budget headers decides no pause; the failed one is sent but not counted", async () => {
  const clock = { t: START };
  const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
  let fails = true;
  const call = budget.appeler(async () => {
    if (fails) throw new Error("getaddrinfo ENOTFOUND api.github.com");
    return { status: 200, data: [] };
  });
  await assert.rejects(call("/repos/chef/un"), /ENOTFOUND/);
  fails = false;
  assert.equal((await call("/repos/chef/un")).status, 200);
  assert.equal(budget.enPauseJusqua(), null);
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 2, comptees: 1 });
  // An hour later, both have left the counter.
  clock.t += HOUR;
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 0, comptees: 0 });
});

test("the desktop's fetch reads GitHub's budget headers, and leaves out those it cannot read", async () => {
  const fake = (headers: Record<string, string>) => (async () => new Response("[]", { status: 200, headers: headers })) as unknown as typeof fetch;
  const readEntry = await byFetch({ fetch: fake({ "x-ratelimit-remaining": "812", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1793000000", "retry-after": "30", etag: '"e"' }) })("https://api.github.com/x", {});
  assert.deepEqual(readEntry, { status: 200, data: [], etag: '"e"', limite: { restant: 812, total: 5_000, repriseLe: 1_793_000_000_000 }, reessayerApresMs: 30_000 });
  const unreadable = await byFetch({ fetch: fake({ "x-ratelimit-remaining": "beaucoup", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1793000000", "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }) })("https://api.github.com/x", {});
  assert.deepEqual(unreadable, { status: 200, data: [] });
});

// #3414 : « read again » after the reset time, and a pause that says who spends the quota.
const readUnderBudget = (budget: BudgetGitHub, call: CallGitHub, clock: { t: number }) =>
  readingUnderBudget({ budget, depot: "chef/un", maintenant: () => clock.t, dernier: () => undefined, lire: async () => {
    const answer = await budget.appeler(call)("/repos/chef/un");
    return answer.status === 200 ? { lu: true } as unknown as ReadOfBoardOfRepository : { lu: false, depot: "chef/un", luLe: new Date(clock.t).toISOString(), raison: "refused" };
  } });

test("the pause time on screen is never earlier than the real one; once it has passed, one read draws the rail", async () => {
  const clock = { t: START };
  const resumption = START + 54 * MINUTE + 20_000;
  let limit: LimitGitHub = { restant: 542, total: 5_000, repriseLe: resumption };
  const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
  const call: CallGitHub = async () => ({ status: 200, data: [], limite: limit });
  await budget.appeler(call)("/repos/chef/un");
  const pause = await readUnderBudget(budget, call, clock);
  assert.match(pause.lu ? "" : pause.raison, /is not read until 2026-11-09 08:55 UTC/, "08:54:20 is shown as 08:55, not 08:54");
  clock.t = resumption;
  limit = { restant: 4_994, total: 5_000, repriseLe: resumption + HOUR };
  assert.equal((await readUnderBudget(budget, call, clock)).lu, true, "one read at the reset time draws the rail");
});

test("if GitHub still refuses after the reset time, the message names the new wait, not the passed time", async () => {
  const clock = { t: START };
  const resumption = START + 10 * MINUTE;
  const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
  let answer: AnswerGitHub = { status: 403, data: { message: "API rate limit exceeded" }, limite: { restant: 0, total: 5_000, repriseLe: resumption } };
  const call: CallGitHub = async () => answer;
  await readUnderBudget(budget, call, clock);
  clock.t = resumption + 5 * MINUTE;
  answer = { status: 403, data: { message: "API rate limit exceeded" }, limite: { restant: 0, total: 5_000, repriseLe: resumption } };
  const readEntry = await readUnderBudget(budget, call, clock);
  assert.match(readEntry.lu ? "" : readEntry.raison, /is not read until 2026-11-09 08:16 UTC/, "the wait is counted from now, not the passed 08:10");
});

test("the pause says something else uses the quota when the app counted only a small part of what was spent", async () => {
  const clock = { t: START };
  const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
  let remaining = 4_000;
  const call: CallGitHub = async () => ({ status: 200, data: [], limite: { restant: remaining, total: 5_000, repriseLe: START + 50 * MINUTE } });
  for (let i = 0; i < 5; i++) await budget.appeler(call)("/repos/chef/un");
  remaining = 542;
  await budget.appeler(call)("/repos/chef/un");
  const readEntry = await readUnderBudget(budget, call, clock);
  assert.match(readEntry.lu ? "" : readEntry.raison, /Something else uses the quota on this account: GitHub counts 4458 requests spent, the app only 6\./);
  // When the app spent most of what was spent, the message does not blame anything else.
  const only = holdTheBudgetGitHub({ maintenant: () => clock.t });
  let remains = 10;
  const almost: CallGitHub = async () => ({ status: 200, data: [], limite: { restant: remains, total: 10, repriseLe: START + HOUR } });
  for (let i = 0; i < 5; i++) await only.appeler(almost)("/repos/chef/un");
  remains = 1;
  await only.appeler(almost)("/repos/chef/un");
  const without = await readUnderBudget(only, almost, clock);
  assert.match(without.lu ? "" : without.raison, /is not read until/);
  assert.doesNotMatch(without.lu ? "" : without.raison, /Something else/);
});

test("after a restart during a quota pause, the rail saved on disk is shown with its read time and the hour the reads resume (#4624)", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { holdTheLastRailsOnDisk } = await import("../src/board/last-rail-on-disk.ts");
  const directory = mkdtempSync(join(tmpdir(), "last-rails-"));
  try {
    const saved = { lu: true, depot: "chef/un", luLe: "2026-11-27T15:50:00.000Z", cuisine: { rubriques: [] }, faits: {}, file: [], bilans: [], lignesDuRail: [], activites: [] } as unknown as BoardRead;
    holdTheLastRailsOnDisk(directory).save(saved);
    // The app restarts: a new holder, nothing in memory, GitHub says 0 requests left until 16:27.
    const afterRestart = holdTheLastRailsOnDisk(directory);
    const clock = { t: Date.parse("2026-11-27T15:57:00Z") };
    const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
    const reset = Date.parse("2026-11-27T16:27:00Z");
    await budget.appeler(async () => ({ status: 403, data: { message: "API rate limit exceeded" }, limite: { total: 5000, restant: 0, repriseLe: reset } }))("/x", {}).catch(() => {});
    let reads = 0;
    const shown = await readingUnderBudget({ budget, depot: "chef/un", maintenant: () => clock.t, dernier: () => afterRestart.load("chef/un"), lire: async () => (reads++, saved) });
    assert.equal(reads, 0);
    assert.equal(shown.lu, true);
    assert.equal(shown.luLe, "2026-11-27T15:50:00.000Z");
    assert.equal((shown as BoardRead).pauseJusqua, "2026-11-27T16:27:00.000Z");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
