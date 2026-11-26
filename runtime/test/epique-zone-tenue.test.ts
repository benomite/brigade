// #3932 : seule une épique est exemptée de la zone ; un ticket ordinaire avec une livraison ouverte la tient toujours.
import assert from "node:assert/strict";
import { test } from "node:test";
import { porteDesTachesDeTickets } from "../src/epique.ts";
import { FauxGitHub } from "./faux-github.ts";

test("an epic is a body with a task-list line naming a ticket, nothing else", () => {
  assert.equal(porteDesTachesDeTickets("## Tasks\n\n- [ ] #875\n"), true);
  assert.equal(porteDesTachesDeTickets("- [x] #12"), true);
  assert.equal(porteDesTachesDeTickets("- [ ] write docs\nsee #875\n- #876"), false);
});

test("a plain ticket with an open PR on a zone still holds it", async () => {
  const faux = new FauxGitHub();
  faux.feu(831, ["model:sonnet", "effort:medium"], "## Context\n\nNo task list here.\n");
  const pr = faux.prOuverte(["runtime/src/rail.ts"], "cook/831-abcdef01");
  pr.issue = 831;
  faux.feu(875, ["fire", "model:sonnet", "effort:medium"], "## Context\n\nx\n\n## Zone\n\n- `runtime/src/rail.ts`\n\n## Acceptance\n\n- done\n");
  const sauts: string[] = [];
  const a = faux.station("A", { sauter: (_n, ligne) => sauts.push(ligne), cuisiner: async () => ({ echec: "no" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.ok(sauts.some((ligne) => ligne.includes("zone held by #831")));
});
