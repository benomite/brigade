// #4421: the `trust` command, where the trust gate reaches production — `author` reads the
// collaborator permission on GitHub (a fake `gh`) and the chef the kitchen resolved; `accept` and
// `check` keep and read the chef's accord in the state directory.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { noterLeChef } from "../../src/chef/chef.ts";
import { principal } from "../../src/trust/commande.ts";
import { DEPOT, fauxGh } from "../outils.ts";

const PERMISSION = (login: string) => `repos/${DEPOT}/collaborators/${login}/permission`;

function poste(t: TestContext) {
  const etat = mkdtempSync(join(tmpdir(), "brigade-trust-"));
  t.after(() => rmSync(etat, { recursive: true, force: true }));
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/collaborators/*`, { statut: 404, corps: { message: "Not Found" } });
  const env = { BRIGADE_STATE_DIR: etat, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  const jouer = async (args: string[], sur: Record<string, string | undefined> = env) => {
    let [sortie, erreur] = ["", ""];
    try {
      await principal({ args, env: sur, dire: (ligne) => (sortie += `${ligne}\n`), redire: (ligne) => (erreur += `${ligne}\n`) });
      return { code: 0, sortie, erreur };
    } catch (fin) {
      if (!(fin instanceof Sortie)) throw fin;
      return { code: fin.code, sortie, erreur };
    }
  };
  const permissions = () => gh.appels().filter((appel) => appel.some((arg) => arg.includes("/permission")));
  return { etat, gh, env, jouer, permissions };
}

test("`author`: a collaborator with write access is trusted, read from GitHub's collaborator permission", async (t) => {
  const { gh, jouer, permissions } = poste(t);
  gh.repondre(PERMISSION("alice"), { corps: { permission: "write" } });
  assert.deepEqual(await jouer(["author", "alice"]), { code: 0, sortie: "alice is trusted\n", erreur: "" });
  assert.equal(permissions().length, 1);
});

test("`author`: an author with read access, or unknown to the repository (404), is not trusted", async (t) => {
  const { gh, jouer } = poste(t);
  gh.repondre(PERMISSION("reader"), { corps: { permission: "read" } });
  for (const auteur of ["reader", "stranger"]) {
    const fin = await jouer(["author", auteur]);
    assert.equal(fin.code, 0, fin.erreur);
    assert.equal(fin.sortie, `${auteur} is not trusted: not the chef, not a kitchen agent, and no write access to ${DEPOT}\n`);
  }
});

test("`author`: the chef the kitchen resolved, and a kitchen agent, are trusted without asking GitHub", async (t) => {
  const { etat, jouer, permissions } = poste(t);
  noterLeChef(etat, { login: "benoit", source: "repo owner" });
  assert.equal((await jouer(["author", "benoit"])).sortie, "benoit is trusted\n");
  assert.equal((await jouer(["author", "github-actions[bot]"])).sortie, "github-actions[bot] is trusted\n");
  assert.deepEqual(permissions(), []);
});

test("`author`: a GitHub answer that does not read fails the command — nothing is decided in its place", async (t) => {
  const { gh, jouer } = poste(t);
  gh.repondre(PERMISSION("down"), { statut: 502, corps: { message: "Bad Gateway" } });
  gh.repondre(PERMISSION("blank"), { corps: { permission: "" } });
  gh.repondre(PERMISSION("shapeless"), { corps: {} });
  for (const auteur of ["down", "blank", "shapeless"]) {
    const fin = await jouer(["author", auteur]);
    assert.equal(fin.code, 1, auteur);
    assert.equal(fin.sortie, "", auteur);
    assert.match(fin.erreur, new RegExp(`GitHub: the permission of ${auteur} on ${DEPOT} is not read`), auteur);
  }
});

test("`accept` then `check`: the accord is kept in the state directory, and read back by a later run", async (t) => {
  const { jouer } = poste(t);
  assert.equal((await jouer(["check", "issue", "42"])).sortie, "issue 42 is not accepted\n");
  assert.deepEqual(await jouer(["accept", "issue", "42"]), { code: 0, sortie: "issue 42 is accepted\n", erreur: "" });
  assert.equal((await jouer(["check", "issue", "42"])).sortie, "issue 42 is accepted\n");
  assert.equal((await jouer(["check", "comment", "42"])).sortie, "comment 42 is not accepted\n");
});

test("`check`: an unreadable store fails the command, and is not overwritten by `accept`", async (t) => {
  const { etat, jouer } = poste(t);
  writeFileSync(join(etat, "accepted.json"), "{");
  for (const geste of ["check", "accept"]) {
    const fin = await jouer([geste, "issue", "1"]);
    assert.equal(fin.code, 1, geste);
    assert.match(fin.erreur, /is not JSON/, geste);
  }
});

test("usage refusals: no state directory, no repository for `author`, a word or an id that does not read", async (t) => {
  const { env, jouer, permissions } = poste(t);
  for (const args of [[], ["bouger"], ["author"], ["author", " "], ["author", "a", "b"], ["accept", "pr", "1"], ["accept", "issue", "0"], ["check", "issue", "x"], ["check", "issue", "1", "2"]]) {
    const fin = await jouer(args);
    assert.equal(fin.code, 2, args.join(" "));
    assert.match(fin.erreur, /run trust -- author <login>/, args.join(" "));
  }
  assert.match((await jouer(["check", "issue", "1"], { ...env, BRIGADE_STATE_DIR: "" })).erreur, /BRIGADE_STATE_DIR is not set/);
  const sansDepot = await jouer(["author", "alice"], { ...env, BRIGADE_GITHUB_REPO: "" });
  assert.equal(sansDepot.code, 2);
  assert.match(sansDepot.erreur, /BRIGADE_GITHUB_REPO is not set/);
  assert.deepEqual(permissions(), []);
});
