// Ajouter un projet à l'app (#983) : son dossier, son dépôt et sa branche d'intégration, rien
// d'autre — ni station, ni machine. Ce que l'écran refuse, ce qui s'écrit dans le
// vrai fichier des projets, et ce que le clone choisi propose, lu par le vrai `git`. Aucune
// machine n'est jointe : l'ajout n'a même pas de quoi en joindre une.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ajouterALApp, brancheDe, depotDe, depotDeLOrigine, lireClone, lireSaisie, refusDeSaisie, type Saisie } from "../src/ajout.ts";
import { lireConfiguration } from "../src/config.ts";
import { suivreConfiguration } from "../src/suivi.ts";

const SAISIE: Saisie = { dossier: "/projets/calculus", depot: "chef/calculus", base: "main" };

// Un essai : le fichier des projets, suivi comme dans l'app, et un dossier de projet qui existe.
function essai(t: TestContext, contenu: unknown = { projets: [] }) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-ajout-"));
  mkdirSync(join(racine, "calculus"));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  const suivi = suivreConfiguration({ chemin, surChangement: () => {} });
  t.after(() => {
    suivi.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const saisie: Saisie = { ...SAISIE, dossier: join(racine, "calculus") };
  const declares = () => (JSON.parse(readFileSync(chemin, "utf8")) as { projets: unknown[] }).projets;
  // L'ajout tel que le process principal le branche (main.ts).
  const ajouter = (recu: unknown = saisie) => ajouterALApp(recu, suivi.ajouter);
  return { racine, chemin, saisie, ajouter, declares };
}

describe("ce que l'écran d'ajout demande", () => {
  test("trois champs, et rien d'autre : le dossier, le dépôt, la branche — ce que la vue envoie de plus n'est pas lu", () => {
    assert.deepEqual(lireSaisie({ ...SAISIE, machine: "parade", stations: ["g1"], sauvegardes: "/srv" }), SAISIE);
    assert.deepEqual(lireSaisie({ dossier: "  /a  ", depot: 3, base: null }), { dossier: "/a", depot: "", base: "" });
  });

  test("une saisie complète n'a aucun champ signalé ; une saisie vide signale chacun des trois", () => {
    assert.deepEqual(refusDeSaisie(SAISIE), {});
    assert.deepEqual(Object.keys(refusDeSaisie(lireSaisie({}))).sort(), ["base", "depot", "dossier"]);
  });

  test("un dépôt qui n'en est pas un, ou qui ne donne pas de nom, et une branche qui n'en est pas une, sont signalés avec ce qui est attendu", () => {
    for (const depot of ["https://github.com/chef/calculus", "chef/calculus.git", "chef", "chef/..", "-chef/calculus"]) {
      assert.match(refusDeSaisie({ ...SAISIE, depot }).depot ?? "", /is not a GitHub repository — expected `<owner>\/<name>`/, depot);
    }
    assert.match(refusDeSaisie({ ...SAISIE, depot: "chef/___" }).depot ?? "", /gives no project name/);
    assert.match(refusDeSaisie({ ...SAISIE, base: "main branch" }).base ?? "", /is not a branch name/);
  });

  test("aucun mot de l'écran ne parle d'une box ou d'une machine", () => {
    const dits = [...Object.values(refusDeSaisie(lireSaisie({}))), ...Object.values(refusDeSaisie({ ...SAISIE, depot: "x", base: "a b" }))].join("\n");
    assert.doesNotMatch(dits, /\bbox|machine|\bstation/i);
  });
});

describe("ajouter un projet à l'app", () => {
  test("ajouté, il est écrit dans le fichier avec son dépôt et sa branche, sous le nom de son dépôt — sans station", (t) => {
    const { ajouter, declares, chemin, saisie } = essai(t);

    assert.deepEqual(ajouter({ ...saisie, depot: "chef/Calculus" }), { etat: "ajoute", nom: "calculus" });
    assert.deepEqual(declares(), [{ nom: "calculus", dossier: saisie.dossier, depot: "chef/Calculus", base: "main" }]);
    const [lu] = lireConfiguration(chemin).projets;
    assert.equal(lu?.depot, "chef/Calculus");
    assert.equal(lu?.base, "main");
    assert.deepEqual(Object.keys(lu ?? {}).sort(), ["base", "depot", "dossier", "nom"], "un projet ajouté n'écrit rien d'autre que son dossier, son dépôt et sa branche");
  });

  test("un champ qui manque : rien n'est écrit, et chaque champ dit pourquoi", (t) => {
    const { ajouter, declares } = essai(t);
    const issue = ajouter({ dossier: "", depot: "", base: "" });
    assert.equal(issue.etat, "champs");
    assert.deepEqual(Object.keys("champs" in issue ? issue.champs : {}).sort(), ["base", "depot", "dossier"]);
    assert.deepEqual(declares(), []);
  });

  test("ce que le fichier des projets refuse est dit, et rien n'y est écrit : un nom déjà pris, un dossier qui n'est pas là", (t) => {
    const { ajouter, declares, racine, saisie } = essai(t, { projets: [{ nom: "calculus", dossier: "/" }] });
    assert.deepEqual(ajouter(), { etat: "pas-ajoute", titre: "Not added — two projects are named “calculus”" });
    const absent = ajouter({ ...saisie, depot: "chef/autre", dossier: join(racine, "absent") });
    assert.match("titre" in absent ? absent.titre : "", /^Not added — folder not found: /);
    assert.deepEqual(declares(), [{ nom: "calculus", dossier: "/" }]);
  });

  test("un projet ajouté se relit, et un dépôt ou une branche écrits vides sont refusés comme le reste du fichier", (t) => {
    const { chemin } = essai(t, { projets: [{ nom: "calculus", dossier: "/", depot: "", base: "main" }] });
    assert.match(lireConfiguration(chemin).refus ?? "", /“depot” must be a non-empty string/);
  });
});

describe("ce que le clone choisi propose", () => {
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

  test("le dépôt et la branche se lisent dans le clone — un dossier qui ne les dit pas le dit, sans rien inventer", async (t) => {
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

    assert.deepEqual(await lireClone("git", clone), { depot: "chef/calculus", base: "v2", raisons: {} });
    const autre = await lireClone("git", ailleurs);
    assert.equal(autre.depot, undefined);
    assert.match(autre.raisons.depot ?? "", /is not a github\.com address the app can read: type its GitHub repository\.$/);
    assert.match(autre.raisons.base ?? "", /type the integration branch\.$/);
    // L'origine n'est pas redite : elle peut porter un jeton.
    assert.doesNotMatch(JSON.stringify(autre), /jeton/);
    const sans = await lireClone("git", nu);
    assert.match(sans.raisons.depot ?? "", /^This folder's origin cannot be read/);
    assert.deepEqual(Object.keys((await lireClone(join(racine, "pas-de-git"), clone)).raisons).sort(), ["base", "depot"]);
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
