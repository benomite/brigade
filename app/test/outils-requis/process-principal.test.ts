// Les outils requis, côté process principal (#4059, outils-requis.ts) : ce qui manque à une machine simulée, le PATH
// complété d'un outil posé hors de lui, et l'absence de tout geste qui installe (#4266).
import assert from "node:assert/strict";
import { test } from "node:test";
import * as requis from "../../../runtime/src/outils-requis/outils-requis.ts";
import * as machine from "../../../runtime/src/outils-requis/machine.ts";
import { programmesDe } from "../../../runtime/src/second/outils.ts";
import { tenirOutilsRequis, type Runtime } from "../../src/outils-requis.ts";

const fichiers = (chemins: Set<string>) => (chemin: string) => chemins.has(chemin);

// Une machine simulée : ses fichiers lançables, que le test change.
function uneMachine(plateforme: NodeJS.Platform, poses: string[], { reussit = () => false }: { reussit?: () => boolean } = {}) {
  const chemins = new Set(poses);
  const runtime: Runtime = {
    ...requis,
    ...machine,
    programmesDe,
    lireLaMachine: (options) => machine.lireLaMachine({ ...options, plateforme, maison: plateforme === "win32" ? "C:\\Users\\chef" : "/Users/chef", existe: fichiers(chemins), reussit }),
  };
  return { chemins, runtime };
}

test("ce qui manque : les outils demandés, dans l'ordre où les installer, chacun avec sa page", async () => {
  const { runtime } = uneMachine("darwin", ["/usr/local/bin/gh"]);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin:/usr/local/bin" } });
  assert.deepEqual((await outils.manquants()).map(({ outil }) => outil), ["git", "claude"]);
  assert.deepEqual((await outils.manquants(["claude", "gh"])).map(({ outil }) => outil), ["claude"]);
  // Une liste qui n'en est pas une : les trois.
  assert.deepEqual((await outils.manquants("gh")).map(({ outil }) => outil), ["git", "claude"]);
});

test("un outil posé par son installeur hors du PATH de l'app y est ajouté : l'app le trouve sans redémarrer", async () => {
  const env: Record<string, string | undefined> = { Path: "C:\\Windows", PATHEXT: ".EXE", ProgramFiles: "C:\\Program Files" };
  const { runtime } = uneMachine("win32", ["C:\\Program Files\\GitHub CLI\\gh.exe"]);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env });
  const manquants = await outils.manquants(["gh"]);
  assert.deepEqual(manquants, []);
  assert.equal(env.Path, "C:\\Program Files\\GitHub CLI;C:\\Windows");
  assert.equal(env.PATH, undefined);
  // Sur un Mac, le PATH se complète de même, son séparateur le sien.
  const mac: Record<string, string | undefined> = { PATH: "/usr/bin" };
  const deMac = uneMachine("darwin", ["/Users/chef/.local/bin/claude"]);
  assert.deepEqual(await tenirOutilsRequis({ charger: async () => deMac.runtime, env: mac }).manquants(["claude"]), []);
  assert.equal(mac.PATH, "/Users/chef/.local/bin:/usr/bin");
});

test("l'app ne sait que lire : elle n'a aucun geste qui installe, et lire une machine ne lance rien", async () => {
  const { runtime } = uneMachine("darwin", []);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin" } });
  assert.deepEqual(Object.keys(outils), ["manquants"]);
  const manquants = await outils.manquants();
  assert.deepEqual(manquants.map(({ outil, installation }) => [outil, installation.lien]), [
    ["git", "https://git-scm.com/download/mac"],
    ["gh", "https://cli.github.com"],
    ["claude", "https://code.claude.com/docs/en/setup"],
  ]);
});
