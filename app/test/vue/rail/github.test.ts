// Le kanban d'un projet, lu de GitHub seul (#2220 ; seul chemin depuis #2061 ; la nouvelle cuisine depuis #4507) : ses
// issues ouvertes, ses PR ouvertes et celles mergées dans la journée. Joué sur un faux GitHub, puis rendu par l'app : ses
// pages, ses refus, ses relectures sous ETag et sa colonne Served.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { understand, board as boardOf, type Facts, type Board } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository } from "../../../src/board/read.ts";
import { withWhatAwaitingTheChef } from "../../../src/board/wait-of-chef.ts";
import type { MemoryOfReads } from "../../../src/board/rail-github.ts";
import { statusOfBoard } from "../../../src/board/rail.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown, etag?: string): AnswerGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  created_at: "2026-11-03T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});

// Le projet : #1 prêt, #2 au travail, #3 en pass (PR #40), #4 parqué. Ses PR fermées, celles que le monde dit.
type World = { fermees?: unknown[]; issues?: () => unknown[]; appels?: string[] };
function github({ fermees: closedEntries, issues, appels: calls = [] }: World = {}): CallGitHub {
  return async (path) => {
    calls.push(path);
    if (path.includes("/issues?state=open")) return ok(issues?.() ?? [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(4, ["fire", "parked"]), issue(40, ["fire"], { pull_request: {} })]);
    if (path.includes("/pulls?state=closed")) return ok(closedEntries ?? []);
    if (path.includes("/pulls?state=open")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: {} };
  };
}

const READ = new Date("2026-11-04T03:02:03.076Z");
// La lecture de l'app (main.ts, `lireLeTableau`) : le kanban, puis ce qui attend le chef.
const read = async (call: CallGitHub, memory?: MemoryOfReads) =>
  withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => READ, ...(memory === undefined ? {} : { memoire: memory }) }), call);

// Ce que la vue dessine de la lecture : le tableau de `facts`, avec ce que `status` écrit.
function draws(readOne: ReadOfBoardOfRepository): Board {
  assert.ok(readOne.lu, "the rail is read");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
  return boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe });
}
const kanban = (seenOne: Board) => seenOne.kitchenBoard ?? assert.fail("no kanban");
const columns = (seenOne: Board) => Object.fromEntries(kanban(seenOne).columns.map(({ title, cards }) => [title, cards.map(({ ticket }) => `#${ticket}`)]));

describe("le kanban d'un projet : ses issues, leurs labels et leurs PR", () => {
  test("plus de cent tickets : chaque page est lue", async () => {
    const cent = Array.from({ length: 100 }, (_, rank) => issue(100 + rank, ["fire"]));
    const seenOne = draws(await read(async (path, headers) => (path.includes("/issues?state=open") ? ok(/[?&]page=1$/.test(path) ? cent : [issue(300, ["fire"])]) : github()(path, headers))));
    assert.equal(columns(seenOne)["Ready"]?.length, 101);
  });

  test("GitHub qui refuse : la lecture du projet échoue en le disant — jamais un rail vide", async () => {
    const refuses: CallGitHub = async (path, headers) => (path.includes("/issues?state=open") ? { status: 403, data: {} } : github()(path, headers));
    const missed = await read(refuses);
    assert.equal(missed.lu, false);
    assert.equal(!missed.lu ? missed.raison : "", "GitHub refused to read the rail of acme/kitchen (HTTP 403).");
  });

  test("relu avec les ETag : une seconde lecture sans changement redemande chaque chemin sous condition", async () => {
    const memory: MemoryOfReads = new Map();
    const conditions: string[] = [];
    const withEtag: CallGitHub = async (path, headers) => {
      if (headers?.["If-None-Match"] !== undefined) {
        conditions.push(path);
        return { status: 304, data: null };
      }
      return { ...(await github()(path)), etag: `"${path}"` };
    };
    const first = await read(withEtag, memory);
    const second = await read(withEtag, memory);
    assert.deepEqual(second, first);
    assert.ok(conditions.some((path) => path.includes("/issues?state=open")) && conditions.some((path) => path.includes("/pulls?state=open")) && conditions.some((path) => path.includes("/pulls?state=closed")));
  });
});

describe("la colonne Served : les issues fermées par une PR mergée en 24 h", () => {
  const closedOne = (n: number, mergeThe: string | null, station = "box/claude") => ({
    number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${REPOSITORY}/pull/${1000 + n}`, created_at: "2026-11-05T10:00:00Z",
    updated_at: mergeThe ?? "2026-11-05T12:00:00Z", merged_at: mergeThe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`${station}\`.`,
  });

  test("brigade le 2026-11-06 : une trentaine de tickets servis, tous dans Served, le plus récent d'abord", async () => {
    const thirty = Array.from({ length: 30 }, (_, i) => closedOne(100 + i, new Date(Date.parse("2026-11-04T03:00:00Z") - (i + 1) * 40 * 60_000).toISOString()));
    const old = closedOne(99, "2026-11-02T00:00:00Z");
    const withoutMerge = closedOne(98, null);
    const seenOne = draws(await read(github({ fermees: [...thirty, withoutMerge, old] })));
    const servedOnes = columns(seenOne)["Served"] ?? [];
    assert.equal(servedOnes.length, 30);
    assert.equal(servedOnes[0], "#100");
    assert.ok(!servedOnes.some((c) => c === "#98" || c === "#99"), "neither unmerged nor older than 24 h");
    assert.equal(seenOne.compteurs.find(({ libelle: wording }) => wording === "served 24 h")?.nombre, 30);
  });

  test("une seule lecture des PR fermées par rafraîchissement", async () => {
    const calls: string[] = [];
    await read(github({ fermees: [closedOne(7, "2026-11-04T01:00:00Z")], appels: calls }));
    assert.equal(calls.filter((c) => c.includes("/pulls?state=closed")).length, 1);
  });
});
