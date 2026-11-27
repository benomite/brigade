// #4044 : la lecture du rail pose `apres` sur la carte du ticket qui doit merger après un autre — dépendance déclarée, fichier commun —
// et sur elle seule : ni un ticket pris, ni un ticket hors du rail, ni un ticket sans lien.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheRailOnGithub, ticketsOfTheWait } from "../../../src/vue/rail/github.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, body, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
const FILES: Record<number, string> = { 1040: "a.ts", 1041: "a.ts", 1042: "b.ts" };

const github: CallGitHub = async (path) => {
  if (path.includes("/issues?") && path.includes("labels=fire")) {
    return ok([
      issue(1, ["fire"]),
      issue(2, ["fire"], "Depends on #1"),
      issue(3, ["fire", "taken"], "Depends on #1"),
      issue(4, ["fire", "parked", "taken"]),
      issue(5, ["fire"], "Depends on #4"),
      issue(40, ["fire", "in-pass"]),
      issue(41, ["fire", "in-pass"]),
      issue(42, ["fire", "in-pass"]),
      issue(7, ["fire"]),
    ]);
  }
  if (path.includes("/issues?")) return ok([]);
  if (path.includes("/pulls?state=closed")) return ok([]);
  if (path.includes("/pulls?")) return ok([40, 41, 42].map((n) => ({ number: 1000 + n, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/${1000 + n}`, created_at: "2026-11-04T02:30:00Z", head: { ref: `cook/${n}-github` }, body: "" })));
  const files = /\/pulls\/(\d+)\/files/.exec(path)?.[1];
  if (files !== undefined) return ok([{ filename: FILES[Number(files)] }]);
  const events = /\/issues\/(\d+)\/events/.exec(path)?.[1];
  if (events !== undefined) return ok([{ event: "labeled", label: { name: "in-pass" }, created_at: `2026-11-04T0${Number(events) % 10}:00:00Z` }]);
  if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
  if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
  if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
  return { status: 404, data: {} };
};

test("only the later card of a declared dependency or a common file says what it comes after", async () => {
  const { tickets } = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github, maintenant: () => new Date("2026-11-04T03:00:00Z") });
  assert.deepEqual(tickets.map(({ ticket, apres: after }) => [ticket, after ?? null]), [[1, null], [2, [1]], [3, null], [4, null], [5, null], [40, null], [41, [40]], [42, null], [7, null]]);
  const cards = ticketsOfTheWait(tickets);
  assert.deepEqual(cards.map(({ ticket, apres: after }) => [ticket, after ?? null]), [[1, null], [2, [1]], [3, null], [5, null], [40, null], [41, [40]], [42, null], [7, null]]);
});
