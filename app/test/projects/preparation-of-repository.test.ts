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
import { preparationOfRepository } from "../../src/projects/preparation-of-repository.ts";
import type { Bridge } from "../../src/vue/bridge.d.ts";

const APP = join(import.meta.dirname, "..", "..");
const READY: RepoSetup = { ready: true, missingBindings: false, missingLabels: [] };
const NOT_READY: RepoSetup = { ready: false, missingBindings: true, missingLabels: ["product", "prio:1"] };
const openOne = (repository: string): CopieLocale => ({ state: "open", project: repository.split("/")[1]!, repository: repository, folder: `/copies/${repository.split("/")[1]}`, cloned: false });

// Le process principal, ses dépendances feintes : ce que le contrat a reçu, et ce qu'il rend.
function principal({ copie: copy = openOne, check = async () => NOT_READY, run = async () => READY }: { copie?: (repository: string) => CopieLocale; check?: (repo: Repo) => Promise<RepoSetup>; run?: (repo: Repo) => Promise<RepoSetup> } = {}) {
  const receivedOnes: Array<[string, Repo]> = [];
  const preparation = preparationOfRepository({
    ouvrirLaCopie: async (repository) => copy(repository),
    lireLaBase: async () => "trunk",
    contrat: async () => ({
      checkRepoSetup: (repo) => (receivedOnes.push(["check", repo]), check(repo)),
      runRepoSetup: (repo) => (receivedOnes.push(["run", repo]), run(repo)),
    }),
  });
  return { preparation, recus: receivedOnes };
}

// Le préchargement tel que l'app le charge, son `electron` feint : `invoke` va aux canaux du process principal.
function bridgeOf(channels: Record<string, (...args: unknown[]) => Promise<unknown>>): Bridge {
  let expose: Bridge | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (_: string, bridge: Bridge) => void (expose = bridge) },
    ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => channels[channel]!(...args), on: () => {} },
  };
  const source = readFileSync(join(APP, "src", "preload.cjs"), "utf8");
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (name: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("le câblage de la vérification du dépôt choisi", () => {
  test("le process principal tient les deux canaux, et les passe à la préparation du dépôt", () => {
    const main = readFileSync(join(APP, "src", "main.ts"), "utf8");
    assert.match(main, /ipcMain\.handle\("checkRepoSetup", \(_, depot: unknown\) => preparation\.verifier\(depot\)\);/);
    assert.match(main, /ipcMain\.handle\("runRepoSetup", \(_, depot: unknown\) => preparation\.installer\(depot\)\);/);
    assert.match(main, /duRuntime<typeof import\("\.\.\/\.\.\/runtime\/src\/depot-prepare\/preparation\.ts"\)>\("depot-prepare", "preparation\.ts"\)/);
  });

  test("vérifier : le contrat reçoit la copie locale du dépôt, sa branche, et la vue son constat", async () => {
    const { preparation, recus: receivedOnes } = principal();
    const bridge = bridgeOf({ checkRepoSetup: (repository) => preparation.verifier(repository) });
    assert.deepEqual(await bridge.checkRepoSetup("chef/site"), NOT_READY);
    assert.deepEqual(receivedOnes, [["check", { dir: "/copies/site", github: "chef/site", branch: "trunk" }]]);
  });

  test("préparer : le geste du runtime, et son nouveau constat", async () => {
    const { preparation, recus: receivedOnes } = principal();
    const bridge = bridgeOf({ runRepoSetup: (repository) => preparation.installer(repository) });
    assert.deepEqual(await bridge.runRepoSetup("chef/site"), READY);
    assert.deepEqual(receivedOnes.map(([action]) => action), ["run"]);
  });

  test("le runtime refuse : la vue reçoit un rejet, sa phrase pour message", async () => {
    const { preparation } = principal({
      run: async () => {
        throw new Error("GitHub refused to create the label `product` on chef/site (HTTP 403: Resource not accessible).");
      },
    });
    const bridge = bridgeOf({ runRepoSetup: (repository) => preparation.installer(repository) });
    await assert.rejects(bridge.runRepoSetup("chef/site"), { message: "GitHub refused to create the label `product` on chef/site (HTTP 403: Resource not accessible)." });
  });

  test("la copie locale ne se fait pas : la raison du clone, et le contrat n'est pas joué", async () => {
    const { preparation, recus: receivedOnes } = principal({ copie: (repository) => ({ state: "failed", project: "site", repository: repository, cause: "access-denied", reason: "Your GitHub account cannot read chef/site." }) });
    const bridge = bridgeOf({ checkRepoSetup: (repository) => preparation.verifier(repository) });
    await assert.rejects(bridge.checkRepoSetup("chef/site"), { message: "Your GitHub account cannot read chef/site." });
    assert.deepEqual(receivedOnes, []);
  });

  test("un nom qui n'est pas un dépôt n'atteint ni la copie ni le contrat", async () => {
    let copies = 0;
    const { preparation, recus: receivedOnes } = principal({ copie: (repository) => (copies++, openOne(repository)) });
    assert.deepEqual(await preparation.verifier("../etc"), { refus: "That is not a repository name: owner/repo." });
    assert.equal(copies, 0);
    assert.deepEqual(receivedOnes, []);
  });
});
