// Ce qu'un clone dit de lui-même (addition.ts) : le dépôt GitHub de son origine et la branche qu'elle désigne, lus par le
// vrai `git`. L'écran « Add a project » ne les demande plus (#3181) : c'est la branche de la copie qui sert d'intégration
// quand GitHub n'a pas donné la sienne (first-launch.ts).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { branchOf, repositoryOf, repositoryOfTheOrigin, readClone } from "../src/addition.ts";
import { readConfiguration } from "../src/config.ts";

describe("un projet du fichier des projets", () => {
  test("un dépôt ou une branche écrits vides sont refusés comme le reste du fichier", (t) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-ajout-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const path = join(root, "app.json");
    writeFileSync(path, JSON.stringify({ projets: [{ nom: "calculus", dossier: "/", depot: "", base: "main" }] }));
    assert.match(readConfiguration(path).refus ?? "", /“depot” must be a non-empty string/);
  });
});

describe("ce qu'un clone dit de lui-même", () => {
  test("une origine GitHub dit son dépôt, quelle que soit sa forme — une autre ne dit rien", () => {
    for (const origin of ["https://github.com/chef/calculus.git", "https://github.com/chef/calculus", "https://github.com/chef/calculus/", "git@github.com:chef/calculus.git", "ssh://git@github.com/chef/calculus.git", "https://jeton@github.com/chef/calculus.git\n"]) {
      assert.equal(repositoryOf(origin), "chef/calculus", origin);
    }
    assert.equal(repositoryOf("git@github.com:chef/calc.ulus.git"), "chef/calc.ulus");
    for (const origin of ["", "git@gitlab.com:chef/calculus.git", "https://github.com/chef", "/srv/git/calculus.git", "https://github.com.pirate.example/chef/calculus", "https://github.com/chef/calculus/issues"]) {
      assert.equal(repositoryOf(origin), undefined, origin);
    }
  });

  test("la branche que l'origine désigne se lit telle que le clone l'a notée", () => {
    assert.equal(branchOf("origin/main\n"), "main");
    assert.equal(branchOf("origin/release/v2"), "release/v2");
    assert.equal(branchOf("origin/HEAD"), "HEAD");
    assert.equal(branchOf(""), undefined);
    assert.equal(branchOf("main"), undefined);
  });

  test("le dépôt et la branche se lisent dans le clone — un dossier qui ne les dit pas ne dit rien, sans rien inventer", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-clone-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const [clone, elsewhere, bare] = ["clone", "ailleurs", "nu"].map((name) => join(root, name)) as [string, string, string];
    for (const [folder, origin] of [[clone, "git@github.com:chef/calculus.git"], [elsewhere, "https://jeton@gitlab.com/chef/calculus.git"]] as const) {
      execFileSync("git", ["init", "-q", folder]);
      execFileSync("git", ["-C", folder, "remote", "add", "origin", origin]);
    }
    // Le clone sait vers quelle branche pointe son origine, comme après un `git clone`.
    execFileSync("git", ["-C", clone, "-c", "user.name=chef", "-c", "user.email=chef@example.com", "commit", "-q", "--allow-empty", "-m", "départ"]);
    execFileSync("git", ["-C", clone, "update-ref", "refs/remotes/origin/v2", "HEAD"]);
    execFileSync("git", ["-C", clone, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/v2"]);
    mkdirSync(bare);

    assert.deepEqual(await readClone("git", clone), { depot: "chef/calculus", base: "v2" });
    // Une origine qui n'est pas GitHub, un clone sans branche désignée, un dossier sans git, un `git` absent : rien n'est inventé.
    const other = await readClone("git", elsewhere);
    assert.deepEqual(other, {});
    // L'origine n'est pas redite : elle peut porter un jeton.
    assert.doesNotMatch(JSON.stringify(other), /jeton/);
    assert.deepEqual(await readClone("git", bare), {});
    assert.deepEqual(await readClone(join(root, "pas-de-git"), clone), {});
  });

  test("le dépôt d'un projet sans `depot` est celui de l'origine de son dossier (#1660), en https comme en ssh", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-origine-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const folders = new Map<string, string | undefined>([["https", "https://github.com/chef/parade.git"], ["ssh", "git@github.com:chef/parade"], ["gitlab", "https://gitlab.com/chef/parade.git"], ["sans", undefined]]);
    for (const [name, origin] of folders) {
      execFileSync("git", ["init", "-q", join(root, name)]);
      if (origin !== undefined) execFileSync("git", ["-C", join(root, name), "remote", "add", "origin", origin]);
    }
    assert.equal(await repositoryOfTheOrigin("git", join(root, "https")), "chef/parade");
    assert.equal(await repositoryOfTheOrigin("git", join(root, "ssh")), "chef/parade");
    assert.equal(await repositoryOfTheOrigin("git", join(root, "gitlab")), undefined);
    assert.equal(await repositoryOfTheOrigin("git", join(root, "sans")), undefined);
    assert.equal(await repositoryOfTheOrigin("git", join(root, "absent")), undefined);
  });
});
