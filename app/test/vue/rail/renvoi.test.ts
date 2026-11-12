// Le dernier renvoi d'un ticket à un cook, lu des commentaires de son issue (#3302) : la marque que la station écrit
// (runtime/src/github-seul/renvois/renvois.ts), son rang et sa raison sur plusieurs lignes, sans la ligne de la station ni
// ce qui suit ; seul qui a la main sur le dépôt compte — la règle de `renvoisLus`, jouée sur les mêmes commentaires. Puis
// la lecture du rail sur GitHub, qui le porte avec la PR du ticket dans `facts`, sans aucune lecture de plus.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renvoisLus } from "../../../../runtime/src/github-seul/renvois/renvois.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeRailSurGithub } from "../../../src/vue/rail/github.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { dernierRenvoi } from "../../../src/vue/rail/renvoi.ts";

const DEPOT = "chef/cantine";
const RAISON = "the review requested changes on `3f2a9c1` (PR #6):\n\nThe price of a dish shows `NaN €`.";
// Les deux commentaires que la station écrit, mot pour mot comme renvois.ts les compose.
const renvoye = (id: number, n: number, raison: string, association = "OWNER") => ({
  id,
  author_association: association,
  created_at: `2026-11-11T10:0${n}:00Z`,
  body: `<!-- brigade:renvoi n=${n} sha=3f2a9c1 -->\nStation \`box/claude\`: sent back to a cook (${n}/2) — ${raison}\n\nThe next cook takes up the branch of PR #6, fixes what is said above, and delivers again.`,
});
const sorti = (id: number, n: number, raison: string) => ({
  id,
  author_association: "OWNER",
  created_at: "2026-11-11T11:00:00Z",
  body: `<!-- brigade:renvoi n=${n} sha=9b8c7d6 -->\nStation \`box/claude\`: still not mergeable after ${n - 1} sends back — ${raison}\n\nTaken off the kitchen (\`served-elsewhere\`): its calibration is incomplete. A human decides.`,
});
const prise = (id: number) => ({ id, author_association: "OWNER", created_at: "2026-11-11T09:00:00Z", body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`." });

describe("le dernier renvoi, lu des commentaires de l'issue", () => {
  test("son rang et sa raison, sur plusieurs lignes, sans la ligne de la station ni ce qui suit", () => {
    assert.deepEqual(dernierRenvoi([prise(1), renvoye(2, 1, RAISON)]), { n: 1, raison: RAISON });
    assert.deepEqual(dernierRenvoi([renvoye(2, 1, RAISON), renvoye(3, 2, "the CI is red on `abc1234` (PR #6):\n- `tests`")]), { n: 2, raison: "the CI is red on `abc1234` (PR #6):\n- `tests`" });
    assert.deepEqual(dernierRenvoi([renvoye(2, 1, RAISON), sorti(3, 3, "the CI is red")]), { n: 3, raison: "the CI is red" });
    assert.equal(dernierRenvoi([prise(1)]), null);
  });

  test("seul qui a la main sur le dépôt renvoie : la règle de `renvoisLus`, sur les mêmes commentaires", () => {
    const commentaires = [renvoye(2, 1, RAISON), renvoye(3, 2, "forged", "NONE"), renvoye(4, 2, "forged too", "CONTRIBUTOR")];
    const duRuntime = renvoisLus(commentaires.map(({ id, body, author_association: association, created_at: createdAt }) => ({ id, body, association, createdAt })));
    assert.deepEqual(duRuntime.map(({ n }) => n), [1]);
    assert.deepEqual(dernierRenvoi(commentaires), { n: 1, raison: RAISON });
  });
});

describe("la lecture du rail le porte, avec la PR du ticket", () => {
  test("un ticket repris après un renvoi : `facts` dit sa PR et son renvoi ; un ticket en attente, rien — et ses commentaires ne sont lus qu'une fois", async () => {
    const appels: string[] = [];
    const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
    const appeler: AppelGitHub = async (chemin) => {
      appels.push(chemin);
      if (chemin.includes("/issues?")) {
        return ok([
          { number: 5, title: "La carte", html_url: `https://github.com/${DEPOT}/issues/5`, created_at: "2026-11-11T08:00:00Z", labels: [{ name: "fire" }, { name: "taken" }] },
          // #7, en attente, calibré par le manager : personne ne le tient, et rien ne le bloque (le rail bloqué, ticket 3358).
          { number: 7, title: "Le menu", html_url: `https://github.com/${DEPOT}/issues/7`, created_at: "2026-11-11T08:00:00Z", labels: [{ name: "fire" }, { name: "model:sonnet" }, { name: "effort:medium" }] },
        ]);
      }
      if (chemin.includes("/pulls?state=closed")) return ok([]);
      if (chemin.includes("/pulls?")) return ok([{ number: 6, html_url: `https://github.com/${DEPOT}/pull/6`, created_at: "2026-11-11T09:30:00Z", head: { ref: "cook/5-github" }, body: "" }]);
      if (chemin.includes("/issues/5/comments")) return ok([prise(1), renvoye(2, 1, RAISON)]);
      if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
      return { status: 404, data: {} };
    };
    const maintenant = () => new Date("2026-11-11T10:30:00Z");
    const rail = await lireLeRailSurGithub({ depot: DEPOT, appeler, maintenant });
    assert.deepEqual(rail.tickets.map(({ ticket, renvoi }) => [ticket, renvoi]), [[5, { n: 1, raison: RAISON }], [7, undefined]]);
    assert.equal(appels.filter((chemin) => chemin.includes("/issues/5/comments")).length, 1);
    assert.equal(appels.some((chemin) => chemin.includes("/issues/7/comments")), false);
    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant });
    assert.ok(lu.lu);
    const entrees = lu.faits.rail as { ticket: number; pr?: unknown; renvoi?: unknown }[];
    assert.deepEqual(entrees.map(({ ticket, pr, renvoi }) => ({ ticket, pr, renvoi })), [
      { ticket: 5, pr: { numero: 6, url: `https://github.com/${DEPOT}/pull/6` }, renvoi: { n: 1, raison: RAISON } },
      { ticket: 7, pr: undefined, renvoi: undefined },
    ]);
  });
});
