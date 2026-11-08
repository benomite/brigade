// La reprise d'un renvoi pour conflit qui finit en refus de permission (#2951).
import assert from "node:assert/strict";
import { test } from "node:test";
import { reprendreApresRefus, type DependancesDeReprise, type IssueDuRenvoi, type ResultatGit } from "../src/reprise-conflit-refus.ts";

const refus = (commande: string): IssueDuRenvoi => ({ echec: { commande, sortie: "fatal: Permission denied" } });

function fausses(git: ResultatGit) {
  const appels: string[] = [];
  const deps: DependancesDeReprise = {
    git: async (args) => (appels.push(`git ${args.join(" ")}`), git),
    recreerLaBranche: async () => void appels.push("recreer"),
    relancerLeTicket: async () => void appels.push("relancer"),
  };
  return { deps, appels };
}

test("a permission denial on git fetch/merge/rebase: the station integrates the base itself", async () => {
  for (const commande of ["git fetch origin", "git merge main", "git rebase origin/main"]) {
    const { deps, appels } = fausses({ code: 0, sortie: "" });
    assert.deepEqual(await reprendreApresRefus("main", refus(commande), deps), { action: "integrer-la-base" });
    assert.deepEqual(appels, ["git merge --no-edit main"]);
  }
});

test("when integrating is refused again, the branch is recreated from main and the ticket re-run", async () => {
  const { deps, appels } = fausses({ code: 128, sortie: "Permission denied" });
  assert.deepEqual(await reprendreApresRefus("main", refus("git rebase main"), deps), { action: "recreer-depuis-main" });
  assert.deepEqual(appels, ["git merge --no-edit main", "recreer", "relancer"]);
});

test("after a conflit renvoi ending in a permission denial, the action is never another renvoi nor a TODO card for the chef", async () => {
  for (const git of [{ code: 0, sortie: "" }, { code: 1, sortie: "denied" }]) {
    const { deps } = fausses(git);
    const action = await reprendreApresRefus("main", refus("git fetch"), deps);
    assert.ok(action !== null && ["integrer-la-base", "recreer-depuis-main"].includes(action.action));
  }
  const { deps } = fausses({ code: 0, sortie: "" });
  deps.git = async () => { throw new Error("spawn git ENOENT"); };
  assert.equal((await reprendreApresRefus("main", refus("git fetch"), deps))?.action, "recreer-depuis-main");
});

test("an issue that is not a permission denial on a git command is left to the existing flow", async () => {
  const { deps, appels } = fausses({ code: 0, sortie: "" });
  assert.equal(await reprendreApresRefus("main", { echec: null }, deps), null);
  assert.equal(await reprendreApresRefus("main", { echec: { commande: "git merge main", sortie: "CONFLICT (content)" } }, deps), null);
  assert.equal(await reprendreApresRefus("main", refus("npm test"), deps), null);
  assert.deepEqual(appels, []);
});
