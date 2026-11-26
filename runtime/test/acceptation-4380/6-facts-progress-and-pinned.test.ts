// Acceptance test (#4380), criterion 6.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consignerGeste, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import type { Ajout } from "../../src/evenements.ts";
import { lireLesFaits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const MAINTENANT = new Date("2026-11-26T12:00:00.000Z");

test("facts gives progress { toward: act, done, of: 5 } at propose, null at act, and pinned", (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  for (let n = 1; n <= 3; n++) consignerGeste(repertoire, "closer", { line: `merged #${n}`, reason: `the chef said OK, commit 000000${n}a`, outcome: OUTCOME.HANDED_TO_CHEF }, () => MAINTENANT);
  const equipe = lireLesFaits({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET }, MAINTENANT).equipe as Array<Record<string, unknown>>;
  const de = (agent: string) => equipe.find((fiche) => fiche.agent === agent) as Record<string, unknown>;
  assert.equal(de("closer").autonomy, "propose");
  assert.deepEqual(de("closer").progress, { toward: "act", done: 3, of: 5 });
  assert.equal(de("closer").pinned, false);
  assert.equal(de("pass").autonomy, "act");
  assert.equal(de("pass").progress, null);
  assert.equal(de("pass").pinned, false);
});
