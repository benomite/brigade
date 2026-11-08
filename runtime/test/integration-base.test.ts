// L'intégration de la base côté station, avec un faux git qui note ses appels.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { integrerLaBase, type LanceurGit, type SortieGit } from "../src/integration-base.ts";

const OK: SortieGit = { code: 0, stdout: "", stderr: "" };

function fauxGit(reponses: Record<string, SortieGit>) {
  const appels: { args: string[]; cwd: string }[] = [];
  const git: LanceurGit = async (args, cwd) => {
    appels.push({ args, cwd });
    return reponses[String(args[0])] ?? OK;
  };
  return { git, appels };
}

describe("integrerLaBase", () => {
  test("fetch puis merge --no-commit --no-ff, dans le worktree du cook", async () => {
    const { git, appels } = fauxGit({});
    const r = await integrerLaBase(git, "/wt", "main");
    assert.deepEqual(r, { etat: "propre" });
    assert.deepEqual(appels, [
      { args: ["fetch", "origin", "main"], cwd: "/wt" },
      { args: ["merge", "--no-commit", "--no-ff", "FETCH_HEAD"], cwd: "/wt" },
    ]);
  });

  test("un conflit n'est ni commité ni annulé et rend les fichiers en conflit", async () => {
    const { git, appels } = fauxGit({
      merge: { code: 1, stdout: "CONFLICT (content)", stderr: "" },
      diff: { code: 0, stdout: "a.ts\nb.ts\n", stderr: "" },
    });
    const r = await integrerLaBase(git, "/wt", "main");
    assert.deepEqual(r, { etat: "conflit", fichiers: ["a.ts", "b.ts"] });
    const verbes = appels.map((a) => a.args[0]);
    assert.deepEqual(verbes.slice(0, 2), ["fetch", "merge"]);
    assert.ok(!verbes.includes("commit"));
    assert.ok(!appels.some((a) => a.args[0] === "merge" && a.args.includes("--abort")));
    assert.ok(!verbes.includes("reset") && !verbes.includes("checkout"));
  });

  test("un fetch qui échoue rend un échec de fetch et ne fusionne pas", async () => {
    const { git, appels } = fauxGit({ fetch: { code: 128, stdout: "", stderr: "fetch interdit" } });
    const r = await integrerLaBase(git, "/wt", "main");
    assert.deepEqual(r, { etat: "echec", etape: "fetch", detail: "fetch interdit" });
    assert.deepEqual(appels.map((a) => a.args[0]), ["fetch"]);
  });

  test("un merge qui échoue sans fichier en conflit est un échec de merge", async () => {
    const { git } = fauxGit({ merge: { code: 128, stdout: "", stderr: "merge interdit" } });
    const r = await integrerLaBase(git, "/wt", "main");
    assert.deepEqual(r, { etat: "echec", etape: "merge", detail: "merge interdit" });
  });

  test("les fichiers en conflit illisibles ne se devinent pas : échec de merge", async () => {
    const { git } = fauxGit({
      merge: { code: 1, stdout: "", stderr: "boom" },
      diff: { code: 128, stdout: "", stderr: "" },
    });
    const r = await integrerLaBase(git, "/wt", "main");
    assert.deepEqual(r, { etat: "echec", etape: "merge", detail: "boom" });
  });
});
