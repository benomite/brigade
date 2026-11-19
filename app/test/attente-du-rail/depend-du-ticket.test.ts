// #3810 : ce que la lecture du rail pose dans `depend` d'un ticket — les tickets qu'il attend, une fois chacun —, pour un
// ticket en file comme pour un ticket qu'un cook tient (l'attente d'une épique découpée se dit dans les tickets de son
// découpage), et pas de clé `depend` sur un ticket que rien ne retient.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeRailSurGithub } from "../../src/vue/rail/github.ts";

const DEPOT = "chef/cantine";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const EPIQUE = "Split.\n\n<!-- brigade:tickets -->\n| #10 | A | open |\n| #11 | B | open |\n<!-- /brigade:tickets -->";

test("depend : les tickets attendus d'un ticket en file et d'un ticket tenu, aucune clé sur un ticket libre", async () => {
  const appeler: AppelGitHub = async (chemin) => {
    if (chemin.includes("/issues?")) return ok([issue(3, ["fire"], EPIQUE), issue(4, ["fire", "taken"]), issue(5, ["fire"], "Builds on #4."), issue(8, ["fire"]), issue(9, ["fire", "taken"], "Builds on #3."), issue(10, ["fire"]), issue(11, ["fire"])]);
    if (chemin.includes("/pulls?")) return ok([]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
  const lu = await lireLeRailSurGithub({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu);
  const tickets = lu.tickets as unknown as { ticket: number; depend?: number[] }[];
  const depend = (n: number) => tickets.find((t) => t.ticket === n)?.depend;
  assert.deepEqual(depend(5), [4]);
  assert.deepEqual(depend(9), [10, 11]);
  assert.equal(depend(8), undefined);
  assert.equal(depend(4), undefined);
});
