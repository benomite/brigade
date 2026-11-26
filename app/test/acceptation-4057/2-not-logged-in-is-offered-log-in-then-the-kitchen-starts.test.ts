// #4057, critère 2 : pas connecté, le nouveau venu se voit proposer « log in » à cette étape, et la cuisine démarre une fois qu'il l'est.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { CopieLocale } from "../../../runtime/src/projets/copie-locale.ts";
import { ouvrirDUneStation } from "../../src/first-launch.ts";
import { suivreConfiguration } from "../../src/suivi.ts";

type Connection = "connectee" | "perdue" | "inconnue";

// The first run of the app: an empty projects file, a first project opened from the first-launch screen. `claude` says
// what Claude Code answers on this machine (`connexionClaude`), and `journal` keeps the order of what happens.
function leFirstLaunch(t: TestContext, claude: () => Connection) {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-4057-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const suivi = suivreConfiguration({ chemin: join(dossier, "app.json"), maison: dossier, surChangement: () => {} });
  t.after(() => suivi.fermer());
  const copie = join(dossier, "projects", "parade");
  const log: string[] = [];
  const ouvrir = ouvrirDUneStation({
    ouvrirLaCopie: async (): Promise<CopieLocale> => {
      log.push("kitchen");
      mkdirSync(copie, { recursive: true });
      return { state: "open", project: "parade", repository: "benomite/parade", folder: copie, cloned: true };
    },
    lireLaBase: async () => "main",
    configuration: suivi.configuration,
    ajouter: (project) => (log.push("added"), suivi.ajouter(project)),
    progres: () => {},
    connexionClaude: async () => (log.push("asked"), claude()),
  } as Parameters<typeof ouvrirDUneStation>[0]);
  return { journal: log, ouvrir: () => ouvrir("parade", "benomite/parade") as Promise<{ state: string }> };
}

test("a newcomer who is not logged in is offered log in at that step, and the kitchen starts once they are", async (t) => {
  let connection: Connection = "perdue";
  const { journal: log, ouvrir } = leFirstLaunch(t, () => connection);
  const offre = await ouvrir();
  assert.equal(offre.state, "login", "the step offers log in");
  assert.ok(!log.includes("kitchen") && !log.includes("added"), `nothing started yet: ${log.join(", ")}`);
  connection = "connectee";
  assert.equal((await ouvrir()).state, "open");
  assert.ok(log.includes("kitchen") && log.includes("added"), `the kitchen started: ${log.join(", ")}`);
});
