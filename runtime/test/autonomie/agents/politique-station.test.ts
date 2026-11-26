// The autonomy policy (#4380) in the station's kitchen: the test passes through `ouvrirCuisine`, the station's entry
// point — at its first tick, an agent at propose with N clean gestures moves to act, an agent at act whose delivery an
// escaped bug cites goes back to propose, and the chef is notified once, in the project's journal.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { consignerGeste, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../../src/autonomie/agents/niveaux.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { ouvrirCuisine } from "../../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../../src/station/configuration.ts";
import { projetSurGit } from "../../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, jusqua, repertoireTemporaire } from "../../outils.ts";

test("the station's kitchen runs the autonomy policy: a promotion, a demotion by an escaped bug, and one notification of the chef", async (t) => {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.issues([]);
  const bug = { number: 77, title: "the checkout is broken since #12", body: "", labels: [{ name: "bug" }], state: "open", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), html_url: "" };
  gh.repondre(`repos/${DEPOT}/issues?state=all&since=*`, { corps: [bug] });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  const etat = env.BRIGADE_STATE_DIR ?? "";
  mkdirSync(etat, { recursive: true });
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium", BRIGADE_CLOSING_MODEL: "sonnet", BRIGADE_CLOSING_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const horloge = () => new Date();
  for (let n = 1; n <= 5; n++) consignerGeste(etat, "closer", { line: `merged #${n}`, reason: `merged #${n}`, outcome: OUTCOME.FIXED_BY_SELF }, horloge);
  magasinDeNiveaux(etat).poser("brigade", "pass", "act");
  consignerGeste(etat, "pass", { line: "merged PR #41 of #12", reason: "merged PR #41 of #12", outcome: OUTCOME.FIXED_BY_SELF }, horloge);
  const cuisine = ouvrirCuisine(env, { dire: () => {}, intervalleTickMs: 5 });
  try {
    await jusqua(() => magasinDeNiveaux(etat).lire("brigade").pass === "propose");
    assert.equal(magasinDeNiveaux(etat).lire("brigade").closer, "act");
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
  const relu = ouvrirJournal(etat);
  try {
    const notifiees = relu.duType("chef.notified", 10);
    assert.equal(notifiees.length, 1);
    assert.match(notifiees[0]?.payload.reason ?? "", /pass went back from act to propose: the escaped bug .*#77/);
  } finally {
    relu.fermer();
  }
});
