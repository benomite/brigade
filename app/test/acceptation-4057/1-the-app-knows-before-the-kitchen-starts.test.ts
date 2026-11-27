// #4057, critère 1 : au premier lancement, avant que la cuisine d'un premier projet démarre, l'app sait si Claude Code est connecté sur cet ordinateur.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openOfAStation, type LocalCopy } from "../../src/first-launch.ts";
import { followConfiguration } from "../../src/tracking.ts";

type Connection = "connectee" | "perdue" | "inconnue";

// The first run of the app: an empty projects file, a first project opened from the first-launch screen. `claude` says
// what Claude Code answers on this machine (`connexionClaude`), and `journal` keeps the order of what happens.
function theFirstLaunch(t: TestContext, claude: () => Connection) {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-4057-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const tracking = followConfiguration({ chemin: join(folder, "app.json"), maison: folder, surChangement: () => {} });
  t.after(() => tracking.fermer());
  const copy = join(folder, "projects", "parade");
  const log: string[] = [];
  const open = openOfAStation({
    ouvrirLaCopie: async (): Promise<LocalCopy> => {
      log.push("kitchen");
      mkdirSync(copy, { recursive: true });
      return { state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: true };
    },
    lireLaBase: async () => "main",
    configuration: tracking.configuration,
    ajouter: (project) => (log.push("added"), tracking.ajouter(project)),
    progres: () => {},
    connexionClaude: async () => (log.push("asked"), claude()),
  } as Parameters<typeof openOfAStation>[0]);
  return { journal: log, ouvrir: () => open("parade", "benomite/parade") as Promise<{ state: string }> };
}

test("on first run the app asks whether Claude Code is logged in before the kitchen of the first project starts", async (t) => {
  const { journal: log, ouvrir: open } = theFirstLaunch(t, () => "connectee");
  await open();
  assert.equal(log[0], "asked");
  assert.ok(log.includes("kitchen"), "the kitchen started");
  assert.ok(log.indexOf("asked") < log.indexOf("kitchen"), `asked before the kitchen starts: ${log.join(", ")}`);
});
