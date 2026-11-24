// #4079 — L'app et l'icône de la station de fond actives ensemble : un seul objet Tray est créé (src/tray/icone.ts), et la
// station seule en pose une.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");

// Electron, doublé : chaque `new Tray` s'écrit dans un fichier commun aux process.
const FAUX_ELECTRON = `import { appendFileSync } from "node:fs";
const dit = (appel) => process.stdout.write("@@" + JSON.stringify(appel) + "\\n");
const nom = (image) => (image && image.etiquette) || "?";
export class Tray {
  constructor() { appendFileSync(process.env.FAKE_TRAYS, process.pid + "\\n"); }
  on(evenement) { dit({ on: evenement }); }
  popUpContextMenu() {}
  setToolTip(t) { dit({ infobulle: t }); }
  setTitle(t) { dit({ titre: t }); }
  setImage(i) { dit({ image: nom(i) + (i.representations ? ":" + i.representations.length : "") }); }
  setContextMenu(m) { dit({ menu: m.template.map((e) => e.label) }); }
  destroy() { dit({ detruite: true }); }
}
export const nativeImage = { createEmpty: () => ({ etiquette: "peinte", representations: [], addRepresentation(r) { this.representations.push(r); }, isEmpty() { return this.representations.length === 0; } }) };
export const Menu = { buildFromTemplate: (template) => ({ template }) };
export default {};
`;
const CROCHET = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
`;
// Ce que fait le process : poser l'icône comme l'app ou la station de fond (`tenir`, puis rester vivant), ou jouer les gestes de
// l'icône (`gestes`, d'après OPS) et dire ce que le Tray a reçu.
const POSEUR = `import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { creerLIcone, PlaceTenue } from ${JSON.stringify(pathToFileURL(join(APP, "src", "tray", "icone.ts")).href)};
const image = ([largeur, hauteur, octets]) => ({ etiquette: "origine", isEmpty: () => false, getScaleFactors: () => [1], getSize: () => ({ width: largeur, height: hauteur }), toBitmap: () => Buffer.alloc(octets ?? largeur * hauteur * 4) });
if (process.env.SCENARIO === "gestes") {
  const ops = JSON.parse(process.env.OPS);
  const fichier = join(dirname(process.env.BRIGADE_APP_CONFIG), "icone.pid");
  try {
    const icone = creerLIcone(image(ops.image), ops.plateforme);
    icone.ligne(image(ops.image), { infobulle: "brigade", ligne: "0 cooking · 0 for you", questions: ops.questions });
    icone.menu([{ label: "Open brigade" }]);
    if (ops.autrePid) writeFileSync(fichier, String(process.ppid));
    icone.retirer();
    process.stdout.write("@@" + JSON.stringify({ fichier: existsSync(fichier) }) + "\\n");
  } catch (erreur) {
    process.stdout.write("@@" + JSON.stringify({ erreur: erreur.message }) + "\\n");
  }
} else {
  try {
    creerLIcone(image([16, 16]), "darwin");
    process.stdout.write("created\\n");
  } catch (erreur) {
    if (!(erreur instanceof PlaceTenue)) throw erreur;
    process.stdout.write("yielded\\n");
  }
  setInterval(() => {}, 60_000);
}
`;

async function installer(t: TestContext) {
  const machine = repertoireTemporaire(t);
  mkdirSync(join(machine, "maison"));
  writeFileSync(join(machine, "crochet.mjs"), CROCHET);
  writeFileSync(join(machine, "faux-electron.mjs"), FAUX_ELECTRON);
  writeFileSync(join(machine, "poseur.mjs"), POSEUR);
  const pids: number[] = [];
  t.after(() => pids.forEach((pid) => { try { process.kill(pid, "SIGKILL"); } catch { /* déjà arrêté */ } }));
  const lancer = (env: Record<string, string> = {}, arguments_: string[] = []): { process: ChildProcess; sortie: () => string } => {
    const p = spawn(process.execPath, ["--import", pathToFileURL(join(machine, "crochet.mjs")).href, join(machine, "poseur.mjs"), ...arguments_], {
      cwd: APP,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...CACHE_DE_COMPILATION, HOME: join(machine, "maison"), FAKE_ELECTRON: join(machine, "faux-electron.mjs"), FAKE_TRAYS: join(machine, "trays"), BRIGADE_APP_CONFIG: join(machine, "app.json"), ...env },
    });
    pids.push(p.pid!);
    let sortie = "";
    p.stdout.on("data", (m: Buffer) => (sortie += m.toString()));
    p.stderr.on("data", (m: Buffer) => (sortie += m.toString()));
    return { process: p, sortie: () => sortie };
  };
  // Le premier mot que dit un process qui reste vivant.
  const premierMot = async (p: { sortie: () => string }): Promise<string> => {
    await jusqua(() => p.sortie().includes("\n"), 15_000);
    return p.sortie().split("\n")[0]!;
  };
  const crees = () => (existsSync(join(machine, "trays")) ? readFileSync(join(machine, "trays"), "utf8").split("\n").filter(Boolean) : []);
  const gestes = async (ops: object): Promise<Record<string, unknown>[]> => {
    const p = lancer({ SCENARIO: "gestes", OPS: JSON.stringify(ops) });
    await new Promise((fini) => p.process.on("close", fini));
    return p
      .sortie()
      .split("\n")
      .filter((l) => l.startsWith("@@"))
      .map((l) => JSON.parse(l.slice(2)) as Record<string, unknown>);
  };
  return { machine, pids, lancer, premierMot, crees, gestes };
}

test("l'app et la station de fond actives ensemble : un seul Tray existe", async (t) => {
  const { lancer, premierMot, crees } = await installer(t);
  const station = lancer({}, ["--tray-fond"]);
  assert.equal(await premierMot(station), "created", "the station's icon alone raises one icon");
  assert.equal(crees().length, 1);
  const app = lancer();
  assert.equal(await premierMot(app), "yielded", "the app, started while the station's icon lives, raises none");
  assert.equal(crees().length, 1, "one Tray exists with the app and the station both active");
  // L'inverse : l'app tient l'icône, la station de fond n'en pose pas.
  station.process.kill("SIGKILL");
  app.process.kill("SIGKILL");
  await jusqua(() => station.process.exitCode !== null || station.process.signalCode !== null, 5_000);
  const appSeule = lancer();
  assert.equal(await premierMot(appSeule), "created", "a place held by a process that is gone is free");
  const fond = lancer({}, ["--tray-fond"]);
  assert.equal(await premierMot(fond), "yielded", "the station's icon yields to the app");
  assert.equal(crees().length, 2, "two Trays in all, one at a time");
});

test("le pid d'un autre process vivant, resté dans le fichier, ne tient pas la place", async (t) => {
  const { machine, lancer, premierMot, crees } = await installer(t);
  const autre = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore" });
  t.after(() => autre.kill("SIGKILL"));
  writeFileSync(join(machine, "icone.pid"), String(autre.pid));
  assert.equal(await premierMot(lancer({}, ["--tray-fond"])), "created", "an unrelated live process does not hold the icon");
  assert.equal(crees().length, 1);
});

const LIGNE = "0 cooking · 0 for you";

test("sur un Mac, l'icône dit sa ligne au survol et à côté d'elle, puis rend sa place", async (t) => {
  const { gestes } = await installer(t);
  assert.deepEqual(await gestes({ plateforme: "darwin", questions: 3, image: [16, 16] }), [
    { infobulle: `brigade — ${LIGNE}` },
    { titre: ` ${LIGNE}` },
    { menu: ["Open brigade"] },
    { detruite: true },
    { fichier: false },
  ]);
});

test("sous Windows, le clic ouvre le menu et le nombre de questions est peint sur l'image", async (t) => {
  const { gestes } = await installer(t);
  assert.deepEqual(await gestes({ plateforme: "win32", questions: 2, image: [16, 16] }), [
    { on: "click" },
    { infobulle: `brigade — ${LIGNE}` },
    { image: "peinte:1" },
    { menu: ["Open brigade"] },
    { detruite: true },
    { fichier: false },
  ]);
});

test("sans question, ou sur une image qui ne se peint pas, l'image reste telle quelle", async (t) => {
  const { gestes } = await installer(t);
  const image = async (ops: object) => (await gestes({ plateforme: "win32", ...ops })).find((e) => "image" in e)?.image;
  assert.equal(await image({ questions: 0, image: [16, 16] }), "origine");
  assert.equal(await image({ questions: 2, image: [16, 8] }), "origine", "a bitmap that is not square is not painted");
  assert.equal(await image({ questions: 2, image: [16, 16, 100] }), "origine", "a bitmap of the wrong size is not painted");
});

test("retirée, l'icône ne rend pas la place d'un autre process", async (t) => {
  const { gestes } = await installer(t);
  const faits = await gestes({ plateforme: "darwin", questions: 0, image: [16, 16], autrePid: true });
  assert.deepEqual(faits.at(-1), { fichier: true });
});

test("une image qui ne se lit pas : l'erreur le dit et aucun Tray n'est posé", async (t) => {
  const { machine, lancer, crees } = await installer(t);
  writeFileSync(join(machine, "poseur-vide.mjs"), POSEUR.replace("isEmpty: () => false", "isEmpty: () => true"));
  const p = spawn(process.execPath, ["--import", pathToFileURL(join(machine, "crochet.mjs")).href, join(machine, "poseur-vide.mjs")], {
    cwd: APP,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...CACHE_DE_COMPILATION, SCENARIO: "gestes", OPS: JSON.stringify({ plateforme: "darwin", questions: 0, image: [16, 16] }), HOME: join(machine, "maison"), FAKE_ELECTRON: join(machine, "faux-electron.mjs"), FAKE_TRAYS: join(machine, "trays"), BRIGADE_APP_CONFIG: join(machine, "app.json") },
  });
  let sortie = "";
  p.stdout.on("data", (m: Buffer) => (sortie += m.toString()));
  await new Promise((fini) => p.on("close", fini));
  assert.match(sortie, /its icon could not be read/);
  assert.equal(crees().length, 0);
  void lancer;
});
