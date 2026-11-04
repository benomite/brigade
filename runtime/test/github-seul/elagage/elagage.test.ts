// The pruning of the stale `cook/<n>-github` branches: a branch whose issue
// GitHub says is closed is deleted; a live one, or any other branch, is kept.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { elaguerBranchesPerimees } from "../../../src/github-seul/elagage/elagage.ts";

describe("the stale `cook/<n>-github` branches", () => {
  const sonder = (fermees: Record<number, boolean | null>, branches: string[]) => {
    const supprimees: string[] = [];
    const avertissements: string[] = [];
    return {
      supprimees,
      avertissements,
      options: {
        branches: async () => branches,
        issueFermee: async (numero: number) => fermees[numero] ?? null,
        supprimer: async (branche: string) => void supprimees.push(branche),
        avertir: (message: string) => void avertissements.push(message),
      },
    };
  };

  test("those whose issue is closed are deleted, live ones are kept", async () => {
    const k = sonder({ 14: true, 15: false, 16: true }, ["cook/14-github", "cook/15-github", "cook/16-github"]);
    assert.deepEqual(await elaguerBranchesPerimees(k.options), ["cook/14-github", "cook/16-github"]);
    assert.deepEqual(k.supprimees, ["cook/14-github", "cook/16-github"]);
  });

  test("an issue GitHub does not answer for keeps its branch, and other branches are never touched", async () => {
    const k = sonder({ 14: true }, ["cook/14-github", "cook/20-github", "cook/14-aaa", "cook/fermeture-0a1b2c3d", "main"]);
    assert.deepEqual(await elaguerBranchesPerimees(k.options), ["cook/14-github"]);
    assert.deepEqual(k.supprimees, ["cook/14-github"]);
  });

  test("a branch that cannot be deleted is said, and the others still go", async () => {
    const k = sonder({ 14: true, 16: true }, ["cook/14-github", "cook/16-github"]);
    const supprimer = k.options.supprimer;
    k.options.supprimer = async (branche) => {
      if (branche === "cook/14-github") throw new Error("push refused");
      await supprimer(branche);
    };
    assert.deepEqual(await elaguerBranchesPerimees(k.options), ["cook/16-github"]);
    assert.match(k.avertissements.join("\n"), /cook\/14-github not removed — push refused/);
  });
});
