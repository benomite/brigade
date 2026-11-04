// Le refus de l'interrupteur GitHub seul se lit dans `status` et dans `facts`, pas seulement dans le log (#2161).
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancherBrigadeGithub } from "../src/brigade-github.ts";
import { lireLesFaits } from "../src/faits.ts";
import { direGitHubSeul, lireGitHubSeul, noterGitHubSeul } from "../src/github-seul-etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { photoDuProjet } from "../src/status.ts";
import { repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date("2026-11-03T15:00:00.000Z");

function projet(t: Parameters<typeof repertoireTemporaire>[0]) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: () => MAINTENANT });
  journal.ajouter({ project: "parade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  journal.fermer();
  return repertoire;
}

const ouvrir = (repertoire: string, station: () => unknown, reglages: { githubOnlyState?: boolean } | null) =>
  brancherBrigadeGithub({ reglages, ancien: () => "ancien", station: station as never, avertir: () => {}, noter: (decision) => noterGitHubSeul(repertoire, decision, MAINTENANT) });

test("switch on and refused: status has its own line with the reason, and facts carries it", (t) => {
  const repertoire = projet(t);
  ouvrir(repertoire, () => ({ refus: "the station name \"a/b\" cannot sign a claim or a verdict" }), { githubOnlyState: true });
  const ligne = photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant: MAINTENANT }).filter((texte) => texte.startsWith("GitHub-only state"));
  assert.equal(ligne.length, 1);
  assert.match(ligne[0] as string, /^GitHub-only state REFUSED — .*cannot sign a claim or a verdict; the old path is kept/);
  assert.deepEqual(lireLesFaits({ BRIGADE_STATE_DIR: repertoire }, MAINTENANT).githubSeul, { etat: "refused", reason: "the station name \"a/b\" cannot sign a claim or a verdict", since: MAINTENANT.toISOString() });
});

test("switch on and accepted: status says `GitHub-only state`, and not a refusal", (t) => {
  const repertoire = projet(t);
  const ouvert = ouvrir(repertoire, () => ({ tour: async () => {} }), { githubOnlyState: true });
  const ligne = photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant: MAINTENANT }).filter((texte) => texte.startsWith("GitHub-only state"));
  assert.equal(ligne.length, 1);
  assert.doesNotMatch(ligne[0] as string, /REFUSED/);
  assert.equal((lireLesFaits({ BRIGADE_STATE_DIR: repertoire }, MAINTENANT).githubSeul as { etat: string }).etat, "accepted");
  return ouvert.chemin === "github" ? ouvert.arreter() : assert.fail("la station GitHub seul s'ouvre");
});

test("switch off: no line, no entry — and a refusal left by an earlier start goes away", (t) => {
  const repertoire = projet(t);
  noterGitHubSeul(repertoire, { etat: "refused", reason: "x" }, MAINTENANT);
  ouvrir(repertoire, () => assert.fail("rien n'est construit"), { githubOnlyState: false });
  assert.equal(lireGitHubSeul(repertoire), null);
  assert.equal(photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant: MAINTENANT }).some((texte) => texte.startsWith("GitHub-only state")), false);
  assert.equal("githubSeul" in lireLesFaits({ BRIGADE_STATE_DIR: repertoire }, MAINTENANT), false);
  assert.equal(direGitHubSeul({ etat: "accepted", since: "s" }).startsWith("GitHub-only state"), true);
});
