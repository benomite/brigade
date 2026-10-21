// Mesure la couverture propre de chaque test du projet (`rapport.ts`) :
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/valeur-tests/couverture/mesurer-cli.ts
// depuis le dépôt. Chaque zone est jouée par sa propre commande de tests, le
// script `test` de son `package.json` — le lanceur du projet, `node --test` —,
// que joue `node --run test` dans la zone, comme `npm --prefix <zone> test`
// mais sans lancer npm —, avec le crochet de mesure (`crochet.ts`) chargé par
// `NODE_OPTIONS` dans chacun de ses process. Le rapport est écrit quand toutes les zones ont été jouées, même si
// une suite a échoué : un test en échec a tout de même sa couverture.
//
// La mesure coûte plus que la suite : chaque test y est relevé deux fois.
//
// Une suite qui ne rend pas la main — un test bloqué dans du code synchrone,
// qu'aucun délai de son lanceur n'arrête — est tuée au bout de son délai
// d'horloge, avec tout son groupe de process : elle compte alors comme en
// échec (`timedOut`), et le rapport porte les tests mesurés jusque-là. Ce que
// dit chaque suite est écrit à côté du rapport, dans
// <rapport>.<nom de la zone>.log.
//
// Options :
//   --zone <dir>   une zone à jouer, un répertoire qui a son `package.json` ;
//                  autant de fois qu'il y a de zones. Par défaut, `runtime` et
//                  `app` sous la racine, celles qui existent
//   --out <file>   où écrire le rapport ; par défaut,
//                  <BRIGADE_STATE_DIR>/test-coverage.json
//   --timeout <s>  le délai d'horloge de chaque zone, en secondes entières ;
//                  par défaut, 3600 — la suite du runtime en met moins de
//                  cinq sans la mesure
//   --root <dir>   d'où se comptent les chemins, des tests comme du code ; par
//                  défaut, la racine du dépôt git où la commande est lancée
//
// Codes : 0, le rapport est écrit et toutes les suites ont réussi ; 1, une
// suite a échoué ou a été arrêtée à son délai (le rapport est écrit, et le
// dit) ou rien n'a pu être écrit,
// la raison sur la sortie d'erreur ; 2, l'appel ne se lit pas.
import { once } from "node:events";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { enProcess, Sortie, type Appel } from "../../appel.ts";
import { execFileSync, spawn } from "../../sans-invite.ts";
import { assembler, cheminCouverture, ecrireRapport, lireMesures, type Suite } from "./rapport.ts";

const USAGE = [
  "usage: node runtime/src/valeur-tests/couverture/mesurer-cli.ts [--zone <directory>]... [--out <report>] [--timeout <seconds>] [--root <directory>]",
  "  each zone is run by its `test` script (`node --run test`); the report goes to --out, or to <BRIGADE_STATE_DIR>/test-coverage.json",
].join("\n");

const CROCHET = pathToFileURL(join(import.meta.dirname, "crochet.ts")).href;

// Ce qu'une suite en échec dit d'elle, à sa fin.
const LIGNES_D_ECHEC = 40;
const DELAI_PAR_DEFAUT_S = 3600;

type Fin = { code: number | null; signal: string | null; depasse: boolean };

// Joue la suite d'une zone dans son propre groupe de process, sa sortie dans
// le journal ; passé le délai, le groupe entier est tué — le lanceur, ses
// fichiers de tests et ce qu'ils ont lancé.
async function jouerZone(zone: string, env: Record<string, string | undefined>, journal: string, delaiMs: number): Promise<Fin> {
  const ecrit = openSync(journal, "w");
  let enfant;
  try {
    enfant = spawn(process.execPath, ["--run", "test"], { cwd: zone, env, stdio: ["ignore", ecrit, ecrit], detached: true, windowsHide: true });
  } finally {
    closeSync(ecrit);
  }
  const fini = once(enfant, "exit") as Promise<[number | null, string | null]>;
  let depasse = false;
  const minuteur = setTimeout(() => {
    depasse = true;
    try {
      // Sous Windows, pas de groupe à tuer : le lanceur seul.
      if (process.platform === "win32" || enfant.pid === undefined) enfant.kill("SIGKILL");
      else process.kill(-enfant.pid, "SIGKILL");
    } catch {
      // Le groupe a fini entre-temps.
    }
  }, delaiMs);
  try {
    const [code, signal] = await fini;
    return { code, signal, depasse };
  } finally {
    clearTimeout(minuteur);
  }
}

function git(repertoire: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: repertoire, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export async function principal({ args, env, dire, redire }: Appel, options: { cwd?: string; maintenant?: () => Date } = {}): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const zonesDonnees: string[] = [];
  const valeurs = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [option = "", valeur] = [args[i], args[i + 1]];
    if (!["--zone", "--out", "--timeout", "--root"].includes(option)) echouer(2, `unknown option: “${option}”\n${USAGE}`);
    if (valeur === undefined || valeur === "") echouer(2, `${option} needs a value\n${USAGE}`);
    if (option === "--zone") zonesDonnees.push(valeur);
    else if (valeurs.has(option)) echouer(2, `${option} is given twice\n${USAGE}`);
    else valeurs.set(option, valeur);
  }

  const delaiDonne = valeurs.get("--timeout");
  const delaiS = delaiDonne === undefined ? DELAI_PAR_DEFAUT_S : Number(delaiDonne);
  if (!Number.isInteger(delaiS) || delaiS <= 0) echouer(2, `--timeout is not a whole number of seconds: “${delaiDonne}”\n${USAGE}`);

  const cwd = options.cwd ?? process.cwd();
  const racineDonnee = resolve(cwd, valeurs.get("--root") ?? git(cwd, ["rev-parse", "--show-toplevel"]) ?? cwd);
  if (!existsSync(racineDonnee)) echouer(2, `the root ${racineDonnee} does not exist`);
  // Le lanceur donne le chemin réel de chaque fichier : la racine s'y compare
  // par le sien.
  const racine = realpathSync.native(racineDonnee);
  const sortieDonnee = valeurs.get("--out");
  if (sortieDonnee === undefined && !env.BRIGADE_STATE_DIR) echouer(2, `neither --out nor BRIGADE_STATE_DIR is set\n${USAGE}`);
  const sortie = sortieDonnee === undefined ? cheminCouverture(env.BRIGADE_STATE_DIR ?? "") : resolve(cwd, sortieDonnee);
  const zones = zonesDonnees.length > 0 ? zonesDonnees.map((zone) => resolve(cwd, zone)) : ["runtime", "app"].map((zone) => join(racine, zone)).filter((zone) => existsSync(join(zone, "package.json")));
  for (const zone of zones) if (!existsSync(join(zone, "package.json"))) echouer(2, `${zone} has no package.json`);
  if (zones.length === 0) echouer(2, `no zone to run under ${racine}\n${USAGE}`);

  // Les mesures s'écrivent à côté du rapport : un `/tmp` qu'un voisin nettoie
  // les perdrait en cours de route.
  let dossier: string;
  try {
    dossier = mkdtempSync(join(dirname(sortie), `.${basename(sortie)}.mesures-`));
  } catch (erreur) {
    echouer(1, `the measures cannot be written next to ${sortie}: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  try {
    const suites: Suite[] = [];
    for (const zone of zones) {
      dire(`measuring ${zone}…`);
      const journal = `${sortie}.${basename(zone)}.log`;
      let fin: Fin;
      try {
        fin = await jouerZone(zone, { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --import=${CROCHET}`.trim(), BRIGADE_COUVERTURE_DIR: dossier, BRIGADE_COUVERTURE_RACINE: racine }, journal, delaiS * 1000);
      } catch (erreur) {
        echouer(1, `the tests of ${zone} cannot be run: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
      const code = fin.depasse ? null : fin.code;
      suites.push({ zone, code, timedOut: fin.depasse });
      if (code !== 0) {
        const raison = fin.depasse ? `were stopped after ${delaiS} s without ending` : `failed (code ${fin.code ?? fin.signal})`;
        redire(`brigade: the tests of ${zone} ${raison}; the tests measured so far are in the report. The end of their output (all of it in ${journal}):`);
        for (const ligne of readFileSync(journal, "utf8").trimEnd().split("\n").slice(-LIGNES_D_ECHEC)) redire(ligne);
      }
    }
    const rapport = assembler(lireMesures(dossier), { date: (options.maintenant ?? (() => new Date()))(), commit: git(racine, ["rev-parse", "HEAD"]), suites });
    try {
      ecrireRapport(sortie, rapport);
    } catch (erreur) {
      echouer(1, `the coverage report cannot be written to ${sortie}: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
    const propres = rapport.tests.filter((t) => t.uniqueCount > 0).length;
    dire(`coverage report written to ${sortie}: ${rapport.tests.length} tests, ${propres} with coverage of their own, ${rapport.tests.length - propres} with none`);
    if (suites.some((s) => s.code !== 0)) throw new Sortie(1);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
