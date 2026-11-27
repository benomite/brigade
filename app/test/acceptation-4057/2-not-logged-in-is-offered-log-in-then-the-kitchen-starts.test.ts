// #4057, critère 2 : pas connecté, le nouveau venu se voit proposer « log in » à cette étape, et la cuisine démarre une fois qu'il l'est.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { CopieLocale } from "../../../runtime/src/projets/copie-locale.ts";
import { openOfAStation } from "../../src/first-launch.ts";
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
    ouvrirLaCopie: async (): Promise<CopieLocale> => {
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

test("a newcomer who is not logged in is offered log in at that step, and the kitchen starts once they are", async (t) => {
  let connection: Connection = "perdue";
  const { journal: log, ouvrir: open } = theFirstLaunch(t, () => connection);
  const offer = await open();
  assert.equal(offer.state, "login", "the step offers log in");
  assert.ok(!log.includes("kitchen") && !log.includes("added"), `nothing started yet: ${log.join(", ")}`);
  connection = "connectee";
  assert.equal((await open()).state, "open");
  assert.ok(log.includes("kitchen") && log.includes("added"), `the kitchen started: ${log.join(", ")}`);
});
