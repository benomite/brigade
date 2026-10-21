// Inscrit un tour de tests à l'historique des tests du projet (`registre.ts`) :
//   node --test --test-reporter=junit --test-reporter-destination=<rapport.xml> …
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/valeur-tests/historique/ingerer-cli.ts <rapport.xml>
// — ou `-` à la place du rapport, pour le lire sur l'entrée standard. Le
// lanceur est celui du projet, `node --test`, sous la commande de tests du
// runtime comme de l'app. Ses options ne se donnent pas après le motif des
// fichiers : elles passent par `NODE_OPTIONS`, qui garde aussi le rapport
// ordinaire sur la sortie standard —
//   NODE_OPTIONS="--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=<rapport.xml>" npm --prefix runtime test
//
// Options, chacune une fois au plus :
//   --run <id>       l'identifiant du tour ; par défaut, l'empreinte du rapport :
//                    le même rapport inscrit deux fois ne compte qu'une
//   --commit <sha>   le commit joué ; par défaut, le HEAD de la racine
//   --date <date>    quand le tour a été joué (ISO 8601) ; par défaut, maintenant
//   --root <dir>     d'où se comptent les chemins des fichiers de tests ; par
//                    défaut, la racine du dépôt git où la commande est lancée
//
// Codes : 0, le tour est inscrit — ou l'était déjà ; 1, rien n'est inscrit, la
// raison sur la dernière ligne ; 2, l'appel ne se lit pas.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../../appel.ts";
import { execFileSync } from "../../sans-invite.ts";
import { lireRapportJUnit, RapportIlisible } from "./junit.ts";
import { ouvrirHistorique } from "./registre.ts";

const OPTIONS = ["--run", "--commit", "--date", "--root"] as const;

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> node runtime/src/valeur-tests/historique/ingerer-cli.ts <junit report | -> [--run <id>] [--commit <sha>] [--date <ISO date>] [--root <directory>]",
  "  the report is what `node --test --test-reporter=junit` writes; `-` reads it from the standard input",
].join("\n");

// La sortie de `git` dans `repertoire`, ou null hors d'un dépôt.
function git(repertoire: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: repertoire, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export function principal({ args, env, dire, redire }: Appel, options: { cwd?: string; entree?: () => string } = {}): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [rapport, ...reste] = args;
  if (rapport === undefined || rapport.startsWith("--")) echouer(2, `the junit report is needed\n${USAGE}`);
  const valeurs = new Map<string, string>();
  for (let i = 0; i < reste.length; i += 2) {
    const [option = "", valeur] = [reste[i], reste[i + 1]];
    if (!(OPTIONS as readonly string[]).includes(option)) echouer(2, `unknown option: “${option}”\n${USAGE}`);
    if (valeurs.has(option)) echouer(2, `${option} is given twice\n${USAGE}`);
    if (valeur === undefined || valeur === "") echouer(2, `${option} needs a value\n${USAGE}`);
    valeurs.set(option, valeur);
  }

  const cwd = options.cwd ?? process.cwd();
  // Le lanceur écrit le chemin réel de chaque fichier : la racine s'y compare
  // par le sien — `/private/var` sous macOS, le nom long d'un dossier sous
  // Windows.
  const racineDonnee = resolve(cwd, valeurs.get("--root") ?? git(cwd, ["rev-parse", "--show-toplevel"]) ?? cwd);
  const racine = existsSync(racineDonnee) ? realpathSync.native(racineDonnee) : racineDonnee;
  const dateDonnee = valeurs.get("--date");
  const date = dateDonnee === undefined ? new Date() : new Date(dateDonnee);
  if (Number.isNaN(date.getTime())) echouer(2, `--date is not a date: “${dateDonnee}”\n${USAGE}`);

  let xml: string;
  try {
    xml = rapport === "-" ? (options.entree ?? (() => readFileSync(0, "utf8")))() : readFileSync(resolve(cwd, rapport), "utf8");
  } catch (erreur) {
    echouer(1, `the report cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  let resultats;
  try {
    resultats = lireRapportJUnit(xml, racine);
  } catch (erreur) {
    if (!(erreur instanceof RapportIlisible)) throw erreur;
    echouer(1, erreur.message);
  }
  const commit = valeurs.get("--commit") ?? git(racine, ["rev-parse", "HEAD"]);
  if (commit === null) echouer(1, `no --commit given, and ${racine} is not a git checkout`);
  const run = valeurs.get("--run") ?? createHash("sha256").update(xml).digest("hex");

  let historique;
  try {
    historique = ouvrirHistorique(repertoireEtat);
  } catch (erreur) {
    echouer(1, `the test history cannot be opened in ${repertoireEtat}: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  try {
    const { nouveau, tests, echecs } = historique.inscrire({ run, date, commit, resultats });
    dire(nouveau ? `test run ${run} recorded: ${tests} tests, ${echecs} failed` : `test run ${run} is already recorded: nothing added`);
  } finally {
    historique.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
