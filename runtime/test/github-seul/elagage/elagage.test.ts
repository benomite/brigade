// The pruning of the stale `cook/<n>-github` branches: a branch whose issue
// GitHub says is closed is deleted; a live one, or any other branch, is kept.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BRANCHES_PAR_TOUR, elaguerBranchesPerimees, type Curseur } from "../../../src/github-seul/elagage/elagage.ts";
import { LimiteGitHubAtteinte } from "../../../src/limite-github.ts";

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

  test("twenty stale branches are removed over several passes, a few issues read per pass, never all at once (#2436)", async () => {
    const numeros = Array.from({ length: 20 }, (_, i) => 100 + i);
    const k = sonder(Object.fromEntries(numeros.map((n) => [n, true])), numeros.map((n) => `cook/${n}-github`));
    // A deleted branch is no longer listed.
    k.options.branches = async () => numeros.map((n) => `cook/${n}-github`).filter((branche) => !k.supprimees.includes(branche));
    let lues = 0;
    const issueFermee = k.options.issueFermee;
    k.options.issueFermee = async (numero: number) => {
      lues += 1;
      return issueFermee(numero);
    };
    const curseur: Curseur = { derniere: null };
    const passes: number[] = [];
    while (k.supprimees.length < 20 && passes.length < 20) {
      const avant = lues;
      await elaguerBranchesPerimees(k.options, curseur);
      passes.push(lues - avant);
    }
    assert.deepEqual(k.supprimees.sort(), numeros.map((n) => `cook/${n}-github`).sort());
    assert.equal(passes.length, Math.ceil(20 / BRANCHES_PAR_TOUR));
    assert.ok(passes.every((n) => n <= BRANCHES_PAR_TOUR));
  });

  test("the passes go round the live branches, and GitHub's pause ends a pass without a word", async () => {
    const k = sonder({}, ["cook/1-github", "cook/2-github", "cook/3-github", "cook/4-github", "cook/5-github"]);
    const vues: number[] = [];
    let enPause = false;
    k.options.issueFermee = async (numero: number) => {
      if (enPause) throw new LimiteGitHubAtteinte(0, 0);
      vues.push(numero);
      return false;
    };
    const curseur: Curseur = { derniere: null };
    await elaguerBranchesPerimees(k.options, curseur);
    await elaguerBranchesPerimees(k.options, curseur);
    assert.deepEqual(vues, [1, 2, 3, 4, 5, 1]);
    enPause = true;
    await elaguerBranchesPerimees(k.options, curseur);
    assert.deepEqual(k.avertissements, []);
    enPause = false;
    await elaguerBranchesPerimees(k.options, curseur);
    assert.deepEqual(vues.slice(6), [2, 3, 4]);
  });
});
