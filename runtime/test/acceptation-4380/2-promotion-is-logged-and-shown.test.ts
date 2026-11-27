// Acceptance test (#4380), criterion 2.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consignerGeste, gestesDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { appliquerLaPolitique, NOMBRE_DE_GESTES_PROPRES } from "../../src/autonomie/agents/politique.ts";
import type { Ajout } from "../../src/evenements.ts";
import { lireLesFaits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const MAINTENANT = new Date("2026-11-26T12:00:00.000Z");
const horloge = () => MAINTENANT;
const sha = (n: number) => `${String(n).padStart(7, "0")}a`;

test("the promotion is one logged entry whose reason names the facts, and facts shows the new level", (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  for (let n = 1; n <= NOMBRE_DE_GESTES_PROPRES; n++) consignerGeste(repertoire, "closer", { line: `merged #${n} as ${sha(n)}`, reason: `the chef said OK, commit ${sha(n)}`, outcome: OUTCOME.HANDED_TO_CHEF }, horloge);
  const avant = gestesDe(repertoire, "closer").length;
  appliquerLaPolitique({ repertoire, projet: PROJET, chiffres: { bugsEchappes: [], reverts: [] }, horloge, reveillerLeChef: () => {} });
  const ajoutes = gestesDe(repertoire, "closer").slice(avant);
  assert.equal(ajoutes.length, 1);
  assert.match(ajoutes[0].reason, /propose/);
  assert.match(ajoutes[0].reason, /act/);
  assert.match(ajoutes[0].reason, new RegExp(String(NOMBRE_DE_GESTES_PROPRES)));
  const equipe = lireLesFaits({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET }, MAINTENANT).equipe as Array<{ agent: string; autonomy: string }>;
  assert.equal(equipe.find(({ agent }) => agent === "closer")?.autonomy, "act");
});
