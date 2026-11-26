// Acceptance test (#4380), criterion 5.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";
import { consignerGeste, gestesDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { appliquerLaPolitique, NOMBRE_DE_GESTES_PROPRES } from "../../src/autonomie/agents/politique.ts";
import type { Ajout } from "../../src/evenements.ts";
import { lireLesFaits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const MAINTENANT = new Date("2026-11-26T12:00:00.000Z");
const horloge = () => MAINTENANT;

test("a level set as the chef does is pinned, and neither a promotion nor a demotion history moves it", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  const reglages = createAgentSettings({ stateDir: repertoire, env: {}, project: PROJET });
  const poser = (agent: string, value: string) => reglages.handle({ method: "PUT", path: `/api/agents/${agent}/settings`, body: { key: "autonomy", value }, author: "chef" });
  assert.equal((await poser("closer", "propose")).status, 200);
  assert.equal((await poser("pass", "act")).status, 200);
  const equipe = lireLesFaits({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET }, MAINTENANT).equipe as Array<{ agent: string; pinned: boolean }>;
  assert.equal(equipe.find(({ agent }) => agent === "closer")?.pinned, true);
  assert.match(readFileSync(join(repertoire, "autonomy-levels.json"), "utf8"), /pinned/);

  // A promotion history for the closer, a demotion history for the pass.
  for (let n = 1; n <= NOMBRE_DE_GESTES_PROPRES; n++) consignerGeste(repertoire, "closer", { line: `merged #${n}`, reason: `the chef said OK, commit 000000${n}a`, outcome: OUTCOME.HANDED_TO_CHEF }, horloge);
  consignerGeste(repertoire, "pass", { line: "merged #7 as 0000007a", reason: "commit 0000007a", outcome: OUTCOME.FIXED_BY_SELF }, horloge);
  const avant = { closer: gestesDe(repertoire, "closer").length, pass: gestesDe(repertoire, "pass").length };
  const reveils: string[] = [];
  const chiffres = { bugsEchappes: [], reverts: [{ depot: "o/shop", sha: "deadbee", revertes: ["0000007a"], tickets: [7] }] };
  appliquerLaPolitique({ repertoire, projet: PROJET, chiffres, horloge, reveillerLeChef: (raison: string) => void reveils.push(raison) });
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "propose");
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).pass, "act");
  assert.equal(gestesDe(repertoire, "closer").length, avant.closer);
  assert.equal(gestesDe(repertoire, "pass").length, avant.pass);
  assert.equal(reveils.length, 0);
});
