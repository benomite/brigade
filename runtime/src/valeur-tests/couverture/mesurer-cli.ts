// Mesure la couverture propre de chaque test du projet (`rapport.ts`) :
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/valeur-tests/couverture/mesurer-cli.ts
// depuis le dépôt. Chaque zone est jouée par sa propre commande de tests,
// `npm --prefix <zone> test` — le lanceur du projet, `node --test` —, avec le
// crochet de mesure (`crochet.ts`) chargé par `NODE_OPTIONS` dans chacun de ses
// process. Le rapport est écrit quand toutes les zones ont été jouées, même si
// une suite a échoué : un test en échec a tout de même sa couverture.
//
// La mesure coûte plus que la suite : chaque test y est relevé deux fois.
//
// Options :
//   --zone <dir>   une zone à jouer, un répertoire qui a son `package.json` ;
//                  autant de fois qu'il y a de zones. Par défaut, `runtime` et
//                  `app` sous la racine, celles qui existent
//   --out <file>   où écrire le rapport ; par défaut,
//                  <BRIGADE_STATE_DIR>/test-coverage.json
//   --root <dir>   d'où se comptent les chemins, des tests comme du code ; par
//                  défaut, la racine du dépôt git où la commande est lancée
//
// Codes : 0, le rapport est écrit et toutes les suites ont réussi ; 1, une
// suite a échoué (le rapport est écrit, et le dit) ou rien n'a pu être écrit,
// la raison sur la sortie d'erreur ; 2, l'appel ne se lit pas.
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { enProcess, Sortie, type Appel } from "../../appel.ts";
import { execFileSync, spawnSync } from "../../sans-invite.ts";
import { assembler, cheminCouverture, ecrireRapport, lireMesures, type Suite } from "./rapport.ts";

const USAGE = [
  "usage: node runtime/src/valeur-tests/couverture/mesurer-cli.ts [--zone <directory>]... [--out <report>] [--root <directory>]",
  "  each zone is run by `npm --prefix <zone> test`; the report goes to --out, or to <BRIGADE_STATE_DIR>/test-coverage.json",
].join("\n");

const CROCHET = pathToFileURL(join(import.meta.dirname, "crochet.ts")).href;

// Ce qu'une suite en échec dit d'elle, à sa fin.
const LIGNES_D_ECHEC = 40;

function git(repertoire: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: repertoire, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export function principal({ args, env, dire, redire }: Appel, options: { cwd?: string; maintenant?: () => Date } = {}): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const zonesDonnees: string[] = [];
  const valeurs = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [option = "", valeur] = [args[i], args[i + 1]];
    if (!["--zone", "--out", "--root"].includes(option)) echouer(2, `unknown option: “${option}”\n${USAGE}`);
    if (valeur === undefined || valeur === "") echouer(2, `${option} needs a value\n${USAGE}`);
    if (option === "--zone") zonesDonnees.push(valeur);
    else if (valeurs.has(option)) echouer(2, `${option} is given twice\n${USAGE}`);
    else valeurs.set(option, valeur);
  }

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

  const dossier = mkdtempSync(join(tmpdir(), "brigade-couverture-"));
  try {
    const suites: Suite[] = [];
    for (const zone of zones) {
      dire(`measuring ${zone}…`);
      const joue = spawnSync("npm", ["--prefix", zone, "test"], {
        cwd: racine,
        env: { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --import=${CROCHET}`.trim(), BRIGADE_COUVERTURE_DIR: dossier, BRIGADE_COUVERTURE_RACINE: racine },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1024 * 1024 * 1024,
      });
      if (joue.error) echouer(1, `the tests of ${zone} cannot be run: ${joue.error.message}`);
      suites.push({ zone, code: joue.status });
      if (joue.status !== 0) {
        const fin = `${joue.stdout}${joue.stderr}`.trimEnd().split("\n").slice(-LIGNES_D_ECHEC);
        redire(`brigade: the tests of ${zone} failed (code ${joue.status ?? joue.signal}); their coverage is measured all the same. The end of their output:`);
        for (const ligne of fin) redire(ligne);
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
