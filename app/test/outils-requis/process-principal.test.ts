// Les outils requis, côté process principal (#4059, outils-requis.ts) : ce qui manque à une machine simulée, le PATH
// complété d'un outil posé hors de lui, et le geste « install » — une commande jouée, ou une page ouverte.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import * as requis from "../../../runtime/src/outils-requis/outils-requis.ts";
import * as machine from "../../../runtime/src/outils-requis/machine.ts";
import { programmesDe } from "../../../runtime/src/second/outils.ts";
import { tenirOutilsRequis, type Runtime } from "../../src/outils-requis.ts";

type Enfant = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void; tue: boolean };
const fichiers = (chemins: Set<string>) => (chemin: string) => chemins.has(chemin);

// Une machine simulée : ses fichiers lançables, que le test change ; une commande lancée est notée, et finit comme on le lui dit.
function uneMachine(plateforme: NodeJS.Platform, poses: string[], { reussit = () => false }: { reussit?: () => boolean } = {}) {
  const chemins = new Set(poses);
  const lancees: { programme: string; args: readonly string[]; options: { windowsHide?: boolean; env?: unknown }; enfant: Enfant }[] = [];
  const runtime: Runtime = {
    ...requis,
    ...machine,
    programmesDe,
    lireLaMachine: (options) => machine.lireLaMachine({ ...options, plateforme, maison: plateforme === "win32" ? "C:\\Users\\chef" : "/Users/chef", existe: fichiers(chemins), reussit }),
  };
  const lancer = ((programme: string, args: readonly string[], options: { windowsHide?: boolean; env?: unknown }) => {
    const enfant = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), tue: false, kill: () => void (enfant.tue = true) }) as Enfant;
    lancees.push({ programme, args, options, enfant });
    return enfant;
  }) as never;
  return { chemins, lancees, runtime, lancer };
}

test("ce qui manque : les outils demandés, dans l'ordre où les installer, chacun avec son chemin", async () => {
  const { runtime } = uneMachine("darwin", ["/usr/local/bin/gh"]);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin:/usr/local/bin" }, ouvrir: async () => true });
  assert.deepEqual((await outils.manquants()).map(({ outil }) => outil), ["git", "claude"]);
  assert.deepEqual((await outils.manquants(["claude", "gh"])).map(({ outil }) => outil), ["claude"]);
  // Une liste qui n'en est pas une : les trois.
  assert.deepEqual((await outils.manquants("gh")).map(({ outil }) => outil), ["git", "claude"]);
});

test("un outil posé par son installeur hors du PATH de l'app y est ajouté : l'app le trouve sans redémarrer", async () => {
  const env: Record<string, string | undefined> = { Path: "C:\\Windows", PATHEXT: ".EXE", ProgramFiles: "C:\\Program Files" };
  const { runtime } = uneMachine("win32", ["C:\\Program Files\\GitHub CLI\\gh.exe"]);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env, ouvrir: async () => true });
  const manquants = await outils.manquants(["gh"]);
  assert.deepEqual(manquants, []);
  assert.equal(env.Path, "C:\\Program Files\\GitHub CLI;C:\\Windows");
  assert.equal(env.PATH, undefined);
  // Sur un Mac, le PATH se complète de même, son séparateur le sien.
  const mac: Record<string, string | undefined> = { PATH: "/usr/bin" };
  const deMac = uneMachine("darwin", ["/Users/chef/.local/bin/claude"]);
  assert.deepEqual(await tenirOutilsRequis({ charger: async () => deMac.runtime, env: mac, ouvrir: async () => true }).manquants(["claude"]), []);
  assert.equal(mac.PATH, "/Users/chef/.local/bin:/usr/bin");
});

test("Claude Code s'installe par sa commande : finie, il est dit installé ; ratée, sa dernière ligne le dit", async () => {
  const { runtime, lancer, lancees } = uneMachine("darwin", ["/usr/local/bin/gh"]);
  const env = { PATH: "/usr/bin" };
  const outils = tenirOutilsRequis({ charger: async () => runtime, env, ouvrir: async () => true, lancer });
  const rendu = outils.installer("claude");
  // Un second clic attend la même installation.
  assert.equal(outils.installer("claude"), rendu);
  await new Promise((fini) => setImmediate(fini));
  assert.equal(lancees.length, 1);
  assert.equal(lancees[0]?.programme, "/bin/bash");
  assert.deepEqual(lancees[0]?.args, ["-c", "curl -fsSL https://claude.ai/install.sh | bash"]);
  // Sans fenêtre de console, dans l'environnement de l'app.
  assert.equal(lancees[0]?.options.windowsHide, true);
  assert.equal(lancees[0]?.options.env, env);
  lancees[0]?.enfant.emit("close", 0, null);
  assert.deepEqual(await rendu, { fait: "Claude Code is installed", installe: true });
  const rate = outils.installer("claude");
  await new Promise((fini) => setImmediate(fini));
  lancees[1]?.enfant.stderr.emit("data", Buffer.from("Downloading…\ncurl: (6) Could not resolve host: claude.ai\n"));
  lancees[1]?.enfant.emit("close", 6, null);
  assert.deepEqual(await rate, { refus: "the install of Claude Code did not finish (code 6): curl: (6) Could not resolve host: claude.ai", detail: "Downloading…\ncurl: (6) Could not resolve host: claude.ai" });
  const absente = outils.installer("claude");
  await new Promise((fini) => setImmediate(fini));
  lancees[2]?.enfant.emit("error", new Error("spawn /bin/bash ENOENT"));
  // La fermeture qui suit l'erreur ne change rien.
  lancees[2]?.enfant.emit("close", -2, null);
  assert.deepEqual(await absente, { refus: "the install of Claude Code could not start: spawn /bin/bash ENOENT", detail: "spawn /bin/bash ENOENT" });
});

test("l'installeur d'Apple rend la main en s'ouvrant : l'outil n'est pas dit installé, le chef suit l'installeur", async () => {
  const { runtime, lancer, lancees } = uneMachine("darwin", []);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin" }, ouvrir: async () => true, lancer });
  const rendu = outils.installer("git");
  await new Promise((fini) => setImmediate(fini));
  assert.deepEqual([lancees[0]?.programme, ...(lancees[0]?.args ?? [])], ["xcode-select", "--install"]);
  lancees[0]?.enfant.emit("close", 0, null);
  const fin = await rendu;
  assert.ok("fait" in fin && !("installe" in fin));
});

test("une installation trop longue est arrêtée, et dite non finie", async () => {
  const { runtime, lancer, lancees } = uneMachine("darwin", []);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin" }, ouvrir: async () => true, lancer, delaiMs: 5 });
  const rendu = outils.installer("claude");
  await new Promise((fini) => setTimeout(fini, 30));
  assert.equal(lancees[0]?.enfant.tue, true);
  lancees[0]?.enfant.emit("close", null, "SIGTERM");
  assert.deepEqual(await rendu, { refus: "the install of Claude Code did not finish (SIGTERM)" });
});

test("le GitHub CLI sur un Mac : sa page de téléchargement s'ouvre ; si elle ne s'ouvre pas, c'est dit avec son adresse", async () => {
  const { runtime } = uneMachine("darwin", []);
  const ouvertes: string[] = [];
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin" }, ouvrir: async (url) => ouvertes.push(url) });
  const rendu = await outils.installer("gh");
  assert.deepEqual(ouvertes, ["https://github.com/cli/cli/releases/latest"]);
  assert.ok("fait" in rendu && !("installe" in rendu));
  const ferme = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/bin" }, ouvrir: async () => Promise.reject(new Error("no browser")) });
  assert.deepEqual(await ferme.installer("gh"), { refus: "the page of the GitHub CLI did not open in your browser: https://github.com/cli/cli/releases/latest", detail: "no browser" });
});

test("un outil déjà là n'est pas réinstallé ; un nom inconnu est refusé ; un runtime qui ne se charge pas se dit", async () => {
  const { runtime, lancer, lancees } = uneMachine("darwin", ["/usr/local/bin/gh"]);
  const outils = tenirOutilsRequis({ charger: async () => runtime, env: { PATH: "/usr/local/bin" }, ouvrir: async () => true, lancer });
  assert.deepEqual(await outils.installer("gh"), { fait: "the GitHub CLI is already on this computer", installe: true });
  assert.equal(lancees.length, 0);
  assert.deepEqual(await outils.installer("brew"), { refus: "this is not a tool brigade installs" });
  const casse = tenirOutilsRequis({ charger: async () => Promise.reject(new Error("module not found")), env: {}, ouvrir: async () => true });
  assert.deepEqual(await casse.installer("git"), { refus: "the install could not start: the app failed while preparing it", detail: "module not found" });
});
