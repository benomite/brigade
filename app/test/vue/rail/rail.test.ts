// Le rail, haut du backlog (#4223) : la lecture du rail sur un faux GitHub pose dans les faits les tickets en file,
// calibrés et prêts, par priorité puis âge ; leur écran à part, au-dessus des colonnes, n'existe plus (#4354).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../../src/board/read.ts";
import { topOfBacklogRead } from "../../../src/vue/rail/rail.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], created_at: string) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at, labels: labels.map((name) => ({ name })) });
const READY = ["fire", "model:opus", "effort:medium"];
const taking = { id: 11, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", created_at: "2026-11-04T02:58:00Z" };

// #1 sans priorité, #2 et #3 en prio:2 — #3 le plus ancien —, #5 pris, #6 pas calibré, #7 mis de côté.
const github: CallGitHub = async (path) => {
  if (path.includes("/issues?") && path.includes("labels=fire")) {
    return ok([
      issue(1, READY, "2026-10-01T10:00:00Z"),
      issue(2, [...READY, "prio:2"], "2026-11-02T10:00:00Z"),
      issue(3, [...READY, "prio:2"], "2026-10-30T10:00:00Z"),
      issue(5, [...READY, "taken"], "2026-09-01T10:00:00Z"),
      issue(6, ["fire"], "2026-09-01T10:00:00Z"),
      issue(7, [...READY, "blocked-on-human"], "2026-09-01T10:00:00Z"),
    ]);
  }
  if (path.includes("/issues?")) return ok([]);
  if (path.includes("/pulls?")) return ok([]);
  if (path.includes("/issues/5/comments")) return ok([taking]);
  if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
  return { status: 404, data: {} };
};

test("the rail read from GitHub carries the top of the backlog: queued, calibrated and ready, by priority then age (#4223)", async () => {
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: github, maintenant: () => new Date("2026-11-04T03:02:03.076Z") });
  assert.ok(readOne.lu);
  const door = readOne.faits.hautDuBacklog as { issues: { number: number; labels: string[]; createdAt: string }[] };
  assert.deepEqual(door.issues.map(({ number, createdAt }) => [number, createdAt]), [[3, "2026-10-30T10:00:00Z"], [2, "2026-11-02T10:00:00Z"], [1, "2026-10-01T10:00:00Z"]]);
  assert.deepEqual(door.issues[1]?.labels, [...READY, "prio:2"]);
  const top = topOfBacklogRead(door).hautDuBacklog ?? assert.fail("haut du backlog illisible");
  assert.deepEqual(top.issues, [3, 2, 1].map((n) => ({ number: n, title: `Ticket ${n}`, url: `https://github.com/${REPOSITORY}/issues/${n}` })));
});
