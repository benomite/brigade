// Arrêter un cook arrête tout ce qu'il a lancé, sur chaque plateforme : sous
// macOS et Linux par son groupe de process, sous Windows par la table des
// process (`arbre.ts`). Le cook de ces tests lance un enfant, qui lance un
// petit-enfant ; chacun écrit son pid, et aucun ne doit survivre.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { scriptDeLArbre, signalerLArbre } from "../src/arbre.ts";
import type { Plafonds } from "../src/events/guardrails.ts";
import { demanderLArret, fichiersDuRelais, superviser, superviserParRelais, type Supervise } from "../src/superviseur.ts";
import { aArreter, ENV_ENFANT, jusqua, mort, repertoireTemporaire, temporaireDuFichier, tuerLesRelais, vivant } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const LARGES: Plafonds = { turns: 1000, durationMs: 120_000, tokens: 1_000_000, idleMs: 120_000 };

// Un process de l'arbre : il écrit son pid dans `dossier`, lance l'étage
// suivant s'il en reste, et vit. Avec `sort`, la racine s'en va dès que tout
// l'arbre a écrit son pid : ce qu'elle a lancé reste derrière elle.
const ETAGE = `
const { spawn } = require("node:child_process");
const { readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const [, dossier, reste, mode] = process.argv;
const n = Number(reste);
if (n > 0) spawn(process.execPath, ["-e", process.env.ARBRE_ETAGE, dossier, String(n - 1), "vit"], { stdio: "ignore" });
writeFileSync(join(dossier, process.pid + ".pid"), "");
if (mode === "racine" || mode === "sort") process.stdout.write(JSON.stringify({ type: "system", subtype: "init" }) + "\\n");
const garde = setInterval(() => {
  if (mode === "sort" && readdirSync(dossier).length > Number(process.env.ARBRE_TAILLE)) process.exit(0);
}, 20);
`;
// La racine et ses deux étages.
const TAILLE = 2;

function lancement(t: TestContext, mode: "racine" | "sort") {
  const repertoire = repertoireTemporaire(t);
  const pids = join(repertoire, "pids");
  // Le dossier des pids naît vide : chaque process de l'arbre y écrit le sien.
  mkdirSync(pids);
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
  return {
    repertoire,
    lus,
    options: {
      commande: process.execPath,
      args: ["-e", ETAGE, pids, String(TAILLE), mode],
      env: { ...ENV_ENFANT, ARBRE_ETAGE: ETAGE, ARBRE_TAILLE: String(TAILLE) },
      plafonds: LARGES,
      graceMs: 2000,
      flux: join(repertoire, "run.jsonl"),
    },
  };
}

// Tout l'arbre a écrit son pid : la racine et ses deux étages.
const arbreLance = (lus: () => number[]) => jusqua(() => lus().length === TAILLE + 1);

async function aucunNeSurvit(pids: number[]): Promise<void> {
  assert.equal(pids.length, TAILLE + 1);
  for (const pid of pids) await mort(pid);
  assert.deepEqual(pids.filter(vivant), []);
}

describe("l'arbre d'un cook", { concurrency: true }, () => {
  test("arrêter un cook tenu par le runtime tue tout ce qu'il a lancé — aucun enfant, aucun petit-enfant ne lui survit", async (t) => {
    const { lus, options } = lancement(t, "racine");    const supervise: Supervise = superviser(options);
    aArreter(t, () => supervise.abandonner());
    await arbreLance(lus);
    const pids = lus();

    supervise.arreter();
    const fin = await supervise.fin;

    assert.equal(fin.arret?.reason, "stop");
    await aucunNeSurvit(pids);
  });

  test("un cook qui sort de lui-même ne laisse rien derrière lui : ce qu'il a lancé et qui vit encore est tué", async (t) => {
    const { lus, options } = lancement(t, "sort");    const supervise = superviser(options);
    aArreter(t, () => supervise.abandonner());

    const fin = await supervise.fin;

    assert.equal(fin.arret, null);
    assert.equal(fin.code, 0);
    await aucunNeSurvit(lus());
  });

  for (const [plateforme, comment] of [
    [process.platform, "par le geste de cette plateforme"],
    ["win32", "par le fichier d'arrêt, le geste de Windows"],
  ] as const) {
    test(`arrêter un cook porté par un relais (${comment}) tue tout son arbre, et le relais écrit sa fin`, async (t) => {
      const { repertoire, lus, options } = lancement(t, "racine");      aArreter(t, () => tuerLesRelais(repertoire));
      const supervise = superviserParRelais({ ...options, run: "arbre", secrets: {} });
      aArreter(t, () => supervise.lacher());
      await arbreLance(lus);
      const pids = lus();
      const fichiers = fichiersDuRelais(options.flux);

      if (supervise.pid === undefined) throw new Error("relais sans pid");
      demanderLArret(supervise.pid, fichiers, plateforme);
      const fin = await supervise.fin;

      assert.equal(existsSync(fichiers.fin), true, "le relais a écrit la fin de son cook");
      assert.equal(fin.code === 0, false);
      await aucunNeSurvit(pids);
      await mort(supervise.pid);
    });
  }

  test("signaler l'arbre d'un pid qui n'est plus là ne lève pas", () => {
    assert.doesNotThrow(() => signalerLArbre(2 ** 30, "SIGKILL"));
    assert.doesNotThrow(() => signalerLArbre(0, "SIGKILL"));
  });
});

test("sous Windows, le script de l'arbre part de la racine, refuse un pid repris et refait le tour tant qu'un process de l'arbre vit", () => {
  const script = scriptDeLArbre(4242, Date.UTC(2026, 9, 21, 10, 0, 0));
  assert.match(script, /^\$racine = 4242$/m);
  assert.match(script, /FromUnixTimeMilliseconds\(1792576799000\)/);
  assert.match(script, /\$ne\[\$racine\] -lt \$depuis\) \{ exit 0 \}/);
  assert.match(script, /Stop-Process -Id \$id -Force/);
  assert.match(scriptDeLArbre(4242), /^\$depuis = \$null$/m);
});

test("arbre.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
