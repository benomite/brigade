// #4044 : la lecture du rail pose `apres` sur la carte du ticket qui doit merger après un autre — dépendance déclarée, fichier commun —
// et sur elle seule : ni un ticket pris, ni un ticket hors du rail, ni un ticket sans lien.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeRailSurGithub, ticketsDeLAttente } from "../../../src/vue/rail/github.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, body, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
const FICHIERS: Record<number, string> = { 1040: "a.ts", 1041: "a.ts", 1042: "b.ts" };

const github: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
    return ok([
      issue(1, ["fire"]),
      issue(2, ["fire"], "Depends on #1"),
      issue(3, ["fire", "taken"], "Depends on #1"),
      issue(4, ["fire", "waiting", "taken"]),
      issue(5, ["fire"], "Depends on #4"),
      issue(40, ["fire", "in-pass"]),
      issue(41, ["fire", "in-pass"]),
      issue(42, ["fire", "in-pass"]),
      issue(7, ["fire"]),
    ]);
  }
  if (chemin.includes("/issues?")) return ok([]);
  if (chemin.includes("/pulls?state=closed")) return ok([]);
  if (chemin.includes("/pulls?")) return ok([40, 41, 42].map((n) => ({ number: 1000 + n, state: "open", html_url: `https://github.com/${DEPOT}/pull/${1000 + n}`, created_at: "2026-11-04T02:30:00Z", head: { ref: `cook/${n}-github` }, body: "" })));
  const fichiers = /\/pulls\/(\d+)\/files/.exec(chemin)?.[1];
  if (fichiers !== undefined) return ok([{ filename: FICHIERS[Number(fichiers)] }]);
  const evenements = /\/issues\/(\d+)\/events/.exec(chemin)?.[1];
  if (evenements !== undefined) return ok([{ event: "labeled", label: { name: "in-pass" }, created_at: `2026-11-04T0${Number(evenements) % 10}:00:00Z` }]);
  if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
  if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};

test("only the later card of a declared dependency or a common file says what it comes after", async () => {
  const { tickets } = await lireLeRailSurGithub({ depot: DEPOT, appeler: github, maintenant: () => new Date("2026-11-04T03:00:00Z") });
  assert.deepEqual(tickets.map(({ ticket, apres }) => [ticket, apres ?? null]), [[1, null], [2, [1]], [3, null], [4, null], [5, null], [40, null], [41, [40]], [42, null], [7, null]]);
  const cartes = ticketsDeLAttente(tickets);
  assert.deepEqual(cartes.map(({ ticket, apres }) => [ticket, apres ?? null]), [[1, null], [2, [1]], [3, null], [5, null], [40, null], [41, [40]], [42, null], [7, null]]);
});
