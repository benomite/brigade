// Les outils requis, côté process principal (#4059, tools-required.ts) : ce qui manque à une machine simulée, le PATH
// complété d'un outil posé hors de lui, et l'absence de tout geste qui installe (#4266).
import assert from "node:assert/strict";
import { test } from "node:test";
import * as required from "../../../runtime/src/outils-requis/outils-requis.ts";
import * as machine from "../../../runtime/src/outils-requis/machine.ts";
import { programmesDe } from "../../../runtime/src/second/outils.ts";
import { holdToolsRequired, type Runtime } from "../../src/tools-required.ts";

const fichiers = (chemins: Set<string>) => (chemin: string) => chemins.has(chemin);

// Une machine simulée : ses fichiers lançables, que le test change.
function uneMachine(plateforme: NodeJS.Platform, poses: string[], { reussit = () => false }: { reussit?: () => boolean } = {}) {
  const chemins = new Set(poses);
  const runtime: Runtime = {
    ...required,
    ...machine,
    programmesDe,
    lireLaMachine: (options) => machine.lireLaMachine({ ...options, plateforme, maison: plateforme === "win32" ? "C:\\Users\\chef" : "/Users/chef", existe: fichiers(chemins), reussit }),
  };
  return { chemins, runtime };
}

test("ce qui manque : les outils demandés, dans l'ordre où les installer, chacun avec son chemin", async () => {
  const { runtime } = uneMachine("darwin", ["/usr/local/bin/gh"]);
  const tools = holdToolsRequired({ charger: async () => runtime, env: { PATH: "/usr/bin:/usr/local/bin" }, autoriserLaPage: () => {} });
  assert.deepEqual((await tools.manquants()).map(({ outil: tool }) => tool), ["git", "claude"]);
  assert.deepEqual((await tools.manquants(["claude", "gh"])).map(({ outil: tool }) => tool), ["claude"]);
  // Une liste qui n'en est pas une : les trois.
  assert.deepEqual((await tools.manquants("gh")).map(({ outil: tool }) => tool), ["git", "claude"]);
});

test("un outil posé par son installeur hors du PATH de l'app y est ajouté : l'app le trouve sans redémarrer", async () => {
  const env: Record<string, string | undefined> = { Path: "C:\\Windows", PATHEXT: ".EXE", ProgramFiles: "C:\\Program Files" };
  const { runtime } = uneMachine("win32", ["C:\\Program Files\\GitHub CLI\\gh.exe"]);
  const tools = holdToolsRequired({ charger: async () => runtime, env, autoriserLaPage: () => {} });
  const manquants = await tools.manquants(["gh"]);
  assert.deepEqual(manquants, []);
  assert.equal(env.Path, "C:\\Program Files\\GitHub CLI;C:\\Windows");
  assert.equal(env.PATH, undefined);
  // Sur un Mac, le PATH se complète de même, son séparateur le sien.
  const mac: Record<string, string | undefined> = { PATH: "/usr/bin" };
  const deMac = uneMachine("darwin", ["/Users/chef/.local/bin/claude"]);
  assert.deepEqual(await holdToolsRequired({ charger: async () => deMac.runtime, env: mac, autoriserLaPage: () => {} }).manquants(["claude"]), []);
  assert.equal(mac.PATH, "/Users/chef/.local/bin:/usr/bin");
});

test("l'app ne sait que lire : elle n'a aucun geste qui installe, et lire une machine ne lance rien", async () => {
  const { runtime } = uneMachine("darwin", []);
  const tools = holdToolsRequired({ charger: async () => runtime, env: { PATH: "/usr/bin" }, autoriserLaPage: () => {} });
  assert.deepEqual(Object.keys(tools), ["manquants"]);
  const manquants = await tools.manquants();
  assert.deepEqual(manquants.map(({ outil: tool, installation }) => [tool, installation.lien]), [
    ["git", "https://git-scm.com/download/mac"],
    ["gh", "https://cli.github.com"],
    ["claude", "https://code.claude.com/docs/en/setup"],
  ]);
});

test("chaque outil qui manque voit sa page d'installation autorisée : c'est ce qui laisse l'écran l'ouvrir (#4266)", async () => {
  const { runtime } = uneMachine("darwin", ["/usr/local/bin/gh"]);
  const autorisees: string[] = [];
  const tools = holdToolsRequired({ charger: async () => runtime, env: { PATH: "/usr/bin" }, autoriserLaPage: (lien) => autorisees.push(lien) });
  const manquants = await tools.manquants();
  assert.deepEqual(manquants.map(({ outil: tool }) => tool), ["git", "claude"]);
  assert.deepEqual(autorisees, manquants.map(({ installation }) => installation.lien));
  assert.ok(autorisees.every((lien) => lien.startsWith("https://")));
});
