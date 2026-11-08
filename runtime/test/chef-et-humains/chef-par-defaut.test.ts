// Le chef par défaut (#2931) : un test par cas — déclaré, dépôt à une personne,
// dépôt à une organisation —, sur un faux GitHub local qui répond sur le
// propriétaire et sur l'auteur de la PR d'init (le faux partagé,
// `faux-github.ts`, n'en sait rien et reste tel quel). Le chef résolu passe
// par le résolveur de la cuisine, puis `status` le relit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { resolveurDuChef, type GitHubDuChef } from "../../src/chef/chef.ts";
import { demarrer } from "../../src/runtime.ts";
import { photoDuProjet } from "../../src/status.ts";
import { repertoireTemporaire } from "../outils.ts";

type Depot = { proprietaire: string; organisation: boolean; auteurDeLInit?: string };

// Le dépôt tel que le chef le lit ; `lectures` note ce que GitHub a eu à dire.
function fauxGitHub(depot: Depot) {
  const lectures: string[] = [];
  const github: GitHubDuChef = {
    async proprietaire() {
      lectures.push("proprietaire");
      return { login: depot.proprietaire, organisation: depot.organisation };
    },
    async auteurDeLInit() {
      lectures.push("auteurDeLInit");
      return depot.auteurDeLInit ?? null;
    },
  };
  return { github, lectures };
}

// Résout le chef d'une cuisine, puis lit la ligne que `status` en dit.
async function resoudreEtDire(t: TestContext, depot: Depot, declare: string | null) {
  const etat = repertoireTemporaire(t);
  demarrer({ repertoireEtat: etat, projet: "brigade" }).arreter("test");
  const { github, lectures } = fauxGitHub(depot);
  const resolu = await resolveurDuChef({ github, declare: () => declare, repertoireEtat: etat }).resoudre();
  const env = { BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: "brigade", BRIGADE_REPO_DIR: repertoireTemporaire(t) };
  return { resolu, lectures, ligne: photoDuProjet(env).find((l) => l.startsWith("chef ")) };
}

test("chef déclaré : source `declared`, GitHub n'est pas lu", async (t) => {
  const { resolu, lectures, ligne } = await resoudreEtDire(t, { proprietaire: "acme", organisation: true, auteurDeLInit: "carol" }, "lea");
  assert.deepEqual(resolu, { login: "lea", source: "declared" });
  assert.deepEqual(lectures, []);
  assert.equal(ligne, "chef        lea (declared)");
});

test("dépôt à une personne : son propriétaire, source `repo owner`", async (t) => {
  const { resolu, lectures, ligne } = await resoudreEtDire(t, { proprietaire: "benomite", organisation: false, auteurDeLInit: "carol" }, null);
  assert.deepEqual(resolu, { login: "benomite", source: "repo owner" });
  assert.deepEqual(lectures, ["proprietaire"]);
  assert.equal(ligne, "chef        benomite (repo owner)");
});

test("dépôt à une organisation : l'auteur de la PR d'init, source `set up by`", async (t) => {
  const { resolu, lectures, ligne } = await resoudreEtDire(t, { proprietaire: "acme", organisation: true, auteurDeLInit: "carol" }, null);
  assert.deepEqual(resolu, { login: "carol", source: "set up by" });
  assert.deepEqual(lectures, ["proprietaire", "auteurDeLInit"]);
  assert.equal(ligne, "chef        carol (set up by)");
});
