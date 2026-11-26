// Le rail, haut du backlog (#4223) : la lecture du rail sur un faux GitHub pose dans les faits les tickets en file,
// calibrés et prêts, par priorité puis âge ; leur écran à part, au-dessus des colonnes, n'existe plus (#4354).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuRepository } from "../../../src/tableau/read.ts";
import { hautDuBacklogLu } from "../../../src/vue/rail/rail.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], created_at: string) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at, labels: labels.map((name) => ({ name })) });
const PRET = ["fire", "model:opus", "effort:medium"];
const taking = { id: 11, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", created_at: "2026-11-04T02:58:00Z" };

// #1 sans priorité, #2 et #3 en prio:2 — #3 le plus ancien —, #5 pris, #6 pas calibré, #7 mis de côté.
const github: CallGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
    return ok([
      issue(1, PRET, "2026-10-01T10:00:00Z"),
      issue(2, [...PRET, "prio:2"], "2026-11-02T10:00:00Z"),
      issue(3, [...PRET, "prio:2"], "2026-10-30T10:00:00Z"),
      issue(5, [...PRET, "taken"], "2026-09-01T10:00:00Z"),
      issue(6, ["fire"], "2026-09-01T10:00:00Z"),
      issue(7, [...PRET, "blocked-on-human"], "2026-09-01T10:00:00Z"),
    ]);
  }
  if (chemin.includes("/issues?")) return ok([]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/5/comments")) return ok([taking]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};

test("the rail read from GitHub carries the top of the backlog: queued, calibrated and ready, by priority then age (#4223)", async () => {
  const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: github, maintenant: () => new Date("2026-11-04T03:02:03.076Z") });
  assert.ok(lu.lu);
  const door = lu.faits.hautDuBacklog as { issues: { number: number; labels: string[]; createdAt: string }[] };
  assert.deepEqual(door.issues.map(({ number, createdAt }) => [number, createdAt]), [[3, "2026-10-30T10:00:00Z"], [2, "2026-11-02T10:00:00Z"], [1, "2026-10-01T10:00:00Z"]]);
  assert.deepEqual(door.issues[1]?.labels, [...PRET, "prio:2"]);
  const haut = hautDuBacklogLu(door).hautDuBacklog ?? assert.fail("haut du backlog illisible");
  assert.deepEqual(haut.issues, [3, 2, 1].map((n) => ({ number: n, title: `Ticket ${n}`, url: `https://github.com/${REPOSITORY}/issues/${n}` })));
});
