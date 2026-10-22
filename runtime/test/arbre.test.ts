// Arrêter un cook arrête tout ce qu'il a lancé, sur chaque plateforme : sous
// macOS et Linux par son groupe de process, sous Windows par la table des
// process (`arbre.ts`). Le cook de ces tests lance un enfant, qui lance un
// petit-enfant ; chacun écrit son pid, et aucun ne doit survivre.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { arbreDe, lireTable, signalerLArbre, signalerLArbreSync } from "../src/arbre.ts";
import type { Plafonds } from "../src/events/guardrails.ts";
import { arreterParLeRelais, fichiersDuRelais, superviser, superviserParRelais, type OptionsSupervision } from "../src/superviseur.ts";
import { aArreter, ENV_ENFANT, jusqua, mort, repertoireTemporaire, temporaireDuFichier, vivant } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const LARGES: Plafonds = { turns: 1000, durationMs: 300_000, tokens: 1_000_000, idleMs: 300_000 };

// Un étage de l'arbre : il écrit son pid dans `dossier`, lance l'étage suivant
// s'il en reste, et vit. La racine dit une ligne sur son flux ; en mode `sort`,
// elle s'en va dès que tout l'arbre a écrit son pid, et laisse derrière elle ce
// qu'elle a lancé.
//
// Sous Windows, chaque étage lance le suivant détaché : sinon Node le range
// dans un job qui meurt avec lui, et tuer la racine suffirait à tout tuer — le
// test ne prouverait rien de l'arbre. Sous macOS et Linux, détaché, il sortirait
// du groupe du cook : ce que le cook lance y reste.
const ETAGE = `
const { spawn } = require("node:child_process");
const { readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const [dossier, reste, mode, taille] = process.argv.slice(2);
if (Number(reste) > 0) spawn(process.execPath, [__filename, dossier, String(Number(reste) - 1), "vit", taille], { stdio: "ignore", detached: process.platform === "win32" });
writeFileSync(join(dossier, process.pid + ".pid"), "");
if (mode !== "vit") process.stdout.write(JSON.stringify({ type: "system", subtype: "init" }) + "\\n");
setInterval(() => {
  if (mode === "sort" && readdirSync(dossier).length > Number(taille)) process.exit(0);
}, 20);
`;
// Sous la racine, deux étages : l'enfant et le petit-enfant.
const ETAGES = 2;

// L'environnement du cook. Sous Windows, un process privé de `SystemRoot` et
// des siens ne démarre pas toujours : il reçoit celui du test.
const ENV = process.platform === "win32" ? { ...process.env } : ENV_ENFANT;

function lancement(t: TestContext, mode: "racine" | "sort") {
  const repertoire = repertoireTemporaire(t);
  const pids = join(repertoire, "pids");
  mkdirSync(pids);
  const etage = join(repertoire, "etage.cjs");
  writeFileSync(etage, ETAGE);
  const lus = () => (existsSync(pids) ? readdirSync(pids).map((nom) => Number(nom.replace(/\.pid$/, ""))) : []);
  // Si le test échoue, rien de l'arbre ne lui survit.
  aArreter(t, () => {
    for (const pid of lus()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Déjà mort : c'est ce qu'on attend.
      }
    }
  });
  const options: OptionsSupervision = {
    commande: process.execPath,
    args: [etage, pids, String(ETAGES), mode, String(ETAGES)],
    env: ENV,
    plafonds: LARGES,
    // Assez pour que seul l'arrêt demandé tue l'arbre, jamais le délai de grâce.
    graceMs: 60_000,
    flux: join(repertoire, "run.jsonl"),
  };
  return { lus, options };
}

// Tout l'arbre a écrit son pid : la racine, l'enfant, le petit-enfant.
const arbreLance = (lus: () => number[]) => jusqua(() => lus().length === ETAGES + 1);

async function aucunNeSurvit(pids: number[]): Promise<void> {
  assert.equal(pids.length, ETAGES + 1);
  for (const pid of pids) await mort(pid);
  assert.deepEqual(pids.filter(vivant), []);
}

describe("l'arbre d'un cook", { concurrency: true }, () => {
  test("arrêter un cook tenu par le runtime tue tout ce qu'il a lancé : ni lui, ni son enfant, ni son petit-enfant ne vit encore", async (t) => {
    const { lus, options } = lancement(t, "racine");
    const supervise = superviser(options);
    aArreter(t, () => supervise.abandonner());
    await arbreLance(lus);
    const pids = lus();
    assert.deepEqual(pids.filter(vivant), pids);

    supervise.arreter();
    const fin = await supervise.fin;

    assert.equal(fin.arret?.reason, "stop");
    await aucunNeSurvit(pids);
  });

  test("arrêter un cook porté par un relais tue tout son arbre, et le relais écrit sa fin puis s'en va", async (t) => {
    const { lus, options } = lancement(t, "racine");
    const supervise = superviserParRelais({ ...options, run: "arbre", secrets: {} });
    const relais = supervise.pid;
    if (relais === undefined) throw new Error("relais sans pid");
    aArreter(t, () => {
      supervise.lacher();
      try {
        process.kill(relais, "SIGKILL");
      } catch {
        // Déjà parti.
      }
    });
    await arbreLance(lus);
    const pids = lus();

    supervise.arreter();
    const fin = await supervise.fin;

    assert.equal(fin.arret?.reason, "stop");
    assert.equal(existsSync(fichiersDuRelais(options.flux).fin), true, "le relais a écrit la fin de son cook");
    await aucunNeSurvit(pids);
    await mort(relais);
  });

  test("un cook qui sort de lui-même ne laisse rien derrière lui : ce qu'il a lancé et qui vit encore est tué", async (t) => {
    const { lus, options } = lancement(t, "sort");
    const supervise = superviser(options);
    aArreter(t, () => supervise.abandonner());

    const fin = await supervise.fin;

    assert.deepEqual([fin.code, fin.arret], [0, null]);
    await aucunNeSurvit(lus());
  });

  test("arrêter un cook déjà sorti ne lève pas, tenu ou porté par un relais", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const options = { commande: process.execPath, args: ["-e", ""], env: ENV, plafonds: LARGES, graceMs: 60_000 };
    const tenu = superviser({ ...options, flux: join(repertoire, "tenu.jsonl") });
    const relaye = superviserParRelais({ ...options, flux: join(repertoire, "relaye.jsonl"), run: "deja-sorti", secrets: {} });
    aArreter(t, () => relaye.lacher());
    const [finTenu, finRelaye] = await Promise.all([tenu.fin, relaye.fin]);
    assert.deepEqual([finTenu.code, finRelaye.code], [0, 0]);
    const pid = tenu.pid;
    if (pid === undefined) throw new Error("cook sans pid");

    assert.doesNotThrow(() => tenu.arreter());
    assert.doesNotThrow(() => tenu.abandonner());
    assert.doesNotThrow(() => relaye.arreter());
    assert.doesNotThrow(() => arreterParLeRelais(join(repertoire, "relaye.jsonl")));
    await signalerLArbre(pid, "SIGKILL", { depuis: Date.now() });
    assert.doesNotThrow(() => signalerLArbreSync(pid, "SIGTERM", { depuis: Date.now() }));
    await signalerLArbre(0, "SIGKILL");
  });
});

// La table des process de Windows, telle que PowerShell la rend : `pid parent
// création`, une ligne par process.
describe("l'arbre lu dans la table des process de Windows", () => {
  const LANCEMENT = Date.UTC(2026, 9, 22, 10, 0, 0);
  const apres = (ms: number) => LANCEMENT + ms;
  const SOI = 999_999;

  test("la table se lit ligne à ligne, fins de ligne de Windows comprises, et ce qui n'en est pas une ligne est ignoré", () => {
    assert.deepEqual(lireTable(`\r\n4 0 0\r\n100 4 ${apres(10)}\r\nAvertissement : rien\r\n  200 100 ${apres(20)}  \r\n`), [
      { pid: 4, parent: 0, ne: 0 },
      { pid: 100, parent: 4, ne: apres(10) },
      { pid: 200, parent: 100, ne: apres(20) },
    ]);
  });

  test("l'arbre part de la racine, va de parent en enfant, et ne compte que les vivants", () => {
    const table = [
      { pid: 100, parent: 4, ne: apres(10) },
      { pid: 200, parent: 100, ne: apres(20) },
      { pid: 300, parent: 200, ne: apres(30) },
      { pid: 400, parent: 4, ne: apres(40) },
    ];
    assert.deepEqual(arbreDe(table, 100, LANCEMENT, SOI), [100, 200, 300]);
  });

  test("une racine déjà sortie laisse ses enfants dans l'arbre : Windows garde le pid de leur parent", () => {
    const table = [
      { pid: 200, parent: 100, ne: apres(20) },
      { pid: 300, parent: 200, ne: apres(30) },
    ];
    assert.deepEqual(arbreDe(table, 100, LANCEMENT, SOI), [200, 300]);
  });

  test("un pid repris n'est pas de l'arbre : ni une racine née avant son lancement, ni un enfant né avant lui ou avant son parent", () => {
    // La racine vit, mais est née avant le lancement : ce n'est plus le cook.
    assert.deepEqual(arbreDe([{ pid: 100, parent: 4, ne: LANCEMENT - 60_000 }, { pid: 200, parent: 100, ne: apres(20) }], 100, LANCEMENT, SOI), []);
    const table = [
      // Né avant le lancement de la racine morte : son parent avait ce pid avant elle.
      { pid: 200, parent: 100, ne: LANCEMENT - 60_000 },
      { pid: 300, parent: 100, ne: apres(30) },
      // Né avant son parent : le pid de son parent a été repris.
      { pid: 400, parent: 300, ne: apres(5) },
    ];
    assert.deepEqual(arbreDe(table, 100, LANCEMENT, SOI), [300]);
  });

  test("celui qui lit la table n'est jamais de l'arbre", () => {
    const table = [
      { pid: 100, parent: 4, ne: apres(10) },
      { pid: SOI, parent: 100, ne: apres(20) },
    ];
    assert.deepEqual(arbreDe(table, 100, LANCEMENT, SOI), [100]);
  });
});

test("arbre.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
