// #4244 : la lecture du rail pose la zone que la fiche d'un ticket en file déclare dans `zone`, et `depend` seulement quand le ticket attend.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../../src/tableau/client.ts";
import { lireLeRailSurGithub } from "../../../src/vue/rail/github.ts";

const REPOSITORY = "chef/cantine";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const CARD = "<!-- brigade:fiche -->\n- awaiting: none\n- zone: app/src, runtime/src";

test("a queued ticket carries the zone of its fiche, and a depend key only when it waits", async () => {
  const appeler: CallGitHub = async (chemin) => {
    if (chemin.includes("/issues?")) return ok([issue(5, ["fire"], "Depends on #4."), issue(6, ["fire"]), issue(4, ["fire", "taken"])]);
    if (chemin.includes("/pulls?")) return ok([]);
    if (/\/issues\/(5|6)\/comments/.test(chemin)) return ok([{ body: CARD, author_association: "OWNER" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
  const lu = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu);
  const tickets = lu.tickets as unknown as { ticket: number; zone?: string[]; depend?: number[] }[];
  const card = (n: number) => tickets.find((t) => t.ticket === n);
  assert.deepEqual(card(5)?.zone, ["app/src", "runtime/src"]);
  assert.deepEqual(card(5)?.depend, [4]);
  assert.deepEqual(card(6)?.zone, ["app/src", "runtime/src"]);
  assert.equal("depend" in (card(6) ?? {}), false);
  assert.equal("zone" in (card(4) ?? {}), false);
});
