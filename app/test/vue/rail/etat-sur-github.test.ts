// #4229 : l'état d'un ticket sur le rail GitHub — mis de côté, `tests-written` encore porté (étape retirée), ou en file.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub } from "../../../src/tableau/client.ts";
import { lireLeRailSurGithub } from "../../../src/vue/rail/github.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown) => ({ status: 200, data });
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-10T09:00:00Z", labels: labels.map((name) => ({ name })) });

const github: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["fire", "set-aside:failures"]), issue(3, ["fire", "tests-written"])]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/2/comments")) return ok([{ id: 1, body: "Station `box/claude`: the guard stopped it. Set aside by its failures (set-aside:failures).", author_association: "OWNER", created_at: "2026-11-16T11:17:00Z" }]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};

// brigade:guard
test("a set-aside ticket, one that still carries `tests-written`, and a plain one each read their own state", async () => {
  const rail = await lireLeRailSurGithub({ depot: DEPOT, appeler: github, maintenant: () => new Date("2026-11-19T12:00:00.000Z") });
  const etat = (n: number) => rail.tickets.find(({ ticket }) => ticket === n)?.etat;
  assert.equal(etat(1), "en attente");
  assert.equal(etat(2), "86");
  assert.equal(etat(3), "tests écrits");
});
