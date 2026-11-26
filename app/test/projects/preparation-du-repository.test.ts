// Le câblage de la vérification du dépôt choisi dans « Add a project » (#2627) : le préchargement passe
// `checkRepoSetup` et `runRepoSetup` au process principal, qui joue le contrat du runtime (#2626) sur la copie locale
// du dépôt ; un refus revient à la vue comme un rejet, sa phrase pour message.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runInThisContext } from "node:vm";
import type { CopieLocale } from "../../../runtime/src/projets/copie-locale.ts";
import type { Repo, RepoSetup } from "../../../runtime/src/depot-prepare/preparation.ts";
import { preparationDuRepository } from "../../src/projects/preparation-du-repository.ts";
import type { Pont } from "../../src/vue/pont.d.ts";

const APP = join(import.meta.dirname, "..", "..");
const PRET: RepoSetup = { ready: true, missingBindings: false, missingLabels: [] };
const PAS_PRET: RepoSetup = { ready: false, missingBindings: true, missingLabels: ["product", "prio:1"] };
const ouverte = (repository: string): CopieLocale => ({ state: "open", project: repository.split("/")[1]!, repository: repository, folder: `/copies/${repository.split("/")[1]}`, cloned: false });

// Le process principal, ses dépendances feintes : ce que le contrat a reçu, et ce qu'il rend.
function principal({ copie = ouverte, check = async () => PAS_PRET, run = async () => PRET }: { copie?: (repository: string) => CopieLocale; check?: (repo: Repo) => Promise<RepoSetup>; run?: (repo: Repo) => Promise<RepoSetup> } = {}) {
  const recus: Array<[string, Repo]> = [];
  const preparation = preparationDuRepository({
    ouvrirLaCopie: async (repository) => copie(repository),
    lireLaBase: async () => "trunk",
    contrat: async () => ({
      checkRepoSetup: (repo) => (recus.push(["check", repo]), check(repo)),
      runRepoSetup: (repo) => (recus.push(["run", repo]), run(repo)),
    }),
  });
  return { preparation, recus };
}

// Le préchargement tel que l'app le charge, son `electron` feint : `invoke` va aux canaux du process principal.
function pontDe(canaux: Record<string, (...args: unknown[]) => Promise<unknown>>): Pont {
  let expose: Pont | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (_: string, pont: Pont) => void (expose = pont) },
    ipcRenderer: { invoke: (canal: string, ...args: unknown[]) => canaux[canal]!(...args), on: () => {} },
  };
  const source = readFileSync(join(APP, "src", "preload.cjs"), "utf8");
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (name: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("le câblage de la vérification du dépôt choisi", () => {
  test("le process principal tient les deux canaux, et les passe à la préparation du dépôt", () => {
    const main = readFileSync(join(APP, "src", "main.ts"), "utf8");
    assert.match(main, /ipcMain\.handle\("checkRepoSetup", \(_, repository: unknown\) => preparation\.verifier\(repository\)\);/);
    assert.match(main, /ipcMain\.handle\("runRepoSetup", \(_, repository: unknown\) => preparation\.installer\(repository\)\);/);
    assert.match(main, /duRuntime<typeof import\("\.\.\/\.\.\/runtime\/src\/depot-prepare\/preparation\.ts"\)>\("depot-prepare", "preparation\.ts"\)/);
  });

  test("vérifier : le contrat reçoit la copie locale du dépôt, sa branche, et la vue son constat", async () => {
    const { preparation, recus } = principal();
    const pont = pontDe({ checkRepoSetup: (repository) => preparation.verifier(repository) });
    assert.deepEqual(await pont.checkRepoSetup("chef/site"), PAS_PRET);
    assert.deepEqual(recus, [["check", { dir: "/copies/site", github: "chef/site", branch: "trunk" }]]);
  });

  test("préparer : le geste du runtime, et son nouveau constat", async () => {
    const { preparation, recus } = principal();
    const pont = pontDe({ runRepoSetup: (repository) => preparation.installer(repository) });
    assert.deepEqual(await pont.runRepoSetup("chef/site"), PRET);
    assert.deepEqual(recus.map(([action]) => action), ["run"]);
  });

  test("le runtime refuse : la vue reçoit un rejet, sa phrase pour message", async () => {
    const { preparation } = principal({
      run: async () => {
        throw new Error("GitHub refused to create the label `product` on chef/site (HTTP 403: Resource not accessible).");
      },
    });
    const pont = pontDe({ runRepoSetup: (repository) => preparation.installer(repository) });
    await assert.rejects(pont.runRepoSetup("chef/site"), { message: "GitHub refused to create the label `product` on chef/site (HTTP 403: Resource not accessible)." });
  });

  test("la copie locale ne se fait pas : la raison du clone, et le contrat n'est pas joué", async () => {
    const { preparation, recus } = principal({ copie: (repository) => ({ state: "failed", project: "site", repository: repository, cause: "access-denied", reason: "Your GitHub account cannot read chef/site." }) });
    const pont = pontDe({ checkRepoSetup: (repository) => preparation.verifier(repository) });
    await assert.rejects(pont.checkRepoSetup("chef/site"), { message: "Your GitHub account cannot read chef/site." });
    assert.deepEqual(recus, []);
  });

  test("un nom qui n'est pas un dépôt n'atteint ni la copie ni le contrat", async () => {
    let copies = 0;
    const { preparation, recus } = principal({ copie: (repository) => (copies++, ouverte(repository)) });
    assert.deepEqual(await preparation.verifier("../etc"), { refus: "That is not a repository name: owner/repo." });
    assert.equal(copies, 0);
    assert.deepEqual(recus, []);
  });
});
