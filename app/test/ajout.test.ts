// Ce qu'un clone dit de lui-même (ajout.ts) : le dépôt GitHub de son origine et la branche qu'elle désigne, lus par le
// vrai `git`. L'écran « Add a project » ne les demande plus (#3181) : c'est la branche de la copie qui sert d'intégration
// quand GitHub n'a pas donné la sienne (premier-lancement.ts).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { brancheDe, depotDe, depotDeLOrigine, lireClone } from "../src/ajout.ts";
import { lireConfiguration } from "../src/config.ts";

describe("un projet du fichier des projets", () => {
  test("un dépôt ou une branche écrits vides sont refusés comme le reste du fichier", (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-ajout-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    const chemin = join(racine, "app.json");
    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "calculus", dossier: "/", depot: "", base: "main" }] }));
    assert.match(lireConfiguration(chemin).refus ?? "", /“depot” must be a non-empty string/);
  });
});

describe("ce qu'un clone dit de lui-même", () => {
  test("une origine GitHub dit son dépôt, quelle que soit sa forme — une autre ne dit rien", () => {
    for (const origine of ["https://github.com/chef/calculus.git", "https://github.com/chef/calculus", "https://github.com/chef/calculus/", "git@github.com:chef/calculus.git", "ssh://git@github.com/chef/calculus.git", "https://jeton@github.com/chef/calculus.git\n"]) {
      assert.equal(depotDe(origine), "chef/calculus", origine);
    }
    assert.equal(depotDe("git@github.com:chef/calc.ulus.git"), "chef/calc.ulus");
    for (const origine of ["", "git@gitlab.com:chef/calculus.git", "https://github.com/chef", "/srv/git/calculus.git", "https://github.com.pirate.example/chef/calculus", "https://github.com/chef/calculus/issues"]) {
      assert.equal(depotDe(origine), undefined, origine);
    }
  });

  test("la branche que l'origine désigne se lit telle que le clone l'a notée", () => {
    assert.equal(brancheDe("origin/main\n"), "main");
    assert.equal(brancheDe("origin/release/v2"), "release/v2");
    assert.equal(brancheDe("origin/HEAD"), "HEAD");
    assert.equal(brancheDe(""), undefined);
    assert.equal(brancheDe("main"), undefined);
  });

  test("le dépôt et la branche se lisent dans le clone — un dossier qui ne les dit pas ne dit rien, sans rien inventer", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-clone-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    const [clone, ailleurs, nu] = ["clone", "ailleurs", "nu"].map((nom) => join(racine, nom)) as [string, string, string];
    for (const [dossier, origine] of [[clone, "git@github.com:chef/calculus.git"], [ailleurs, "https://jeton@gitlab.com/chef/calculus.git"]] as const) {
      execFileSync("git", ["init", "-q", dossier]);
      execFileSync("git", ["-C", dossier, "remote", "add", "origin", origine]);
    }
    // Le clone sait vers quelle branche pointe son origine, comme après un `git clone`.
    execFileSync("git", ["-C", clone, "-c", "user.name=chef", "-c", "user.email=chef@example.com", "commit", "-q", "--allow-empty", "-m", "départ"]);
    execFileSync("git", ["-C", clone, "update-ref", "refs/remotes/origin/v2", "HEAD"]);
    execFileSync("git", ["-C", clone, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/v2"]);
    mkdirSync(nu);

    assert.deepEqual(await lireClone("git", clone), { depot: "chef/calculus", base: "v2" });
    // Une origine qui n'est pas GitHub, un clone sans branche désignée, un dossier sans git, un `git` absent : rien n'est inventé.
    const autre = await lireClone("git", ailleurs);
    assert.deepEqual(autre, {});
    // L'origine n'est pas redite : elle peut porter un jeton.
    assert.doesNotMatch(JSON.stringify(autre), /jeton/);
    assert.deepEqual(await lireClone("git", nu), {});
    assert.deepEqual(await lireClone(join(racine, "pas-de-git"), clone), {});
  });

  test("le dépôt d'un projet sans `depot` est celui de l'origine de son dossier (#1660), en https comme en ssh", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-origine-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    const dossiers = new Map<string, string | undefined>([["https", "https://github.com/chef/parade.git"], ["ssh", "git@github.com:chef/parade"], ["gitlab", "https://gitlab.com/chef/parade.git"], ["sans", undefined]]);
    for (const [nom, origine] of dossiers) {
      execFileSync("git", ["init", "-q", join(racine, nom)]);
      if (origine !== undefined) execFileSync("git", ["-C", join(racine, nom), "remote", "add", "origin", origine]);
    }
    assert.equal(await depotDeLOrigine("git", join(racine, "https")), "chef/parade");
    assert.equal(await depotDeLOrigine("git", join(racine, "ssh")), "chef/parade");
    assert.equal(await depotDeLOrigine("git", join(racine, "gitlab")), undefined);
    assert.equal(await depotDeLOrigine("git", join(racine, "sans")), undefined);
    assert.equal(await depotDeLOrigine("git", join(racine, "absent")), undefined);
  });
});
