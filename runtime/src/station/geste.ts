// Le geste d'une station, la commande `brigade`, une fois sous le compte et dans
// l'environnement de la station :
//
//   node src/station/geste.ts <projet> <commande> [arguments…]
//   node src/station/geste.ts --help
//
// lancé depuis le répertoire du runtime. Chaque plateforme y mène, et son aide
// est celle d'ici : sous Linux `deploy/brigade` (le paquet), sous macOS
// ~/.local/bin/brigade et sous Windows brigade.cmd, qu'écrivent
// installer-station.sh et installer-station.ps1. Le projet se cherche dans la
// configuration de la station ; la commande, parmi les scripts de son
// `package.json` qui lancent un fichier de `src/` — ni `test` ni `typecheck`,
// qui sont au dev et feraient exécuter n'importe quel fichier sous le compte
// de la station, ni `start`. Elle part avec l'environnement que la station
// donne au projet, et son code de sortie est rendu tel quel.
import { spawnSync } from "../sans-invite.ts";
import { readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { CONFIGURATION, environnementDeLaCommande, lireFichierDeConfiguration } from "./configuration.ts";

const USAGE = 64;
const PROJET_INCONNU = 65;
const PAS_DU_RUNTIME = 66;
const SYSTEMD_MUET = 67;

function refuser(code: number, motif: string): never {
  console.error(`brigade : ${motif}`);
  process.exit(code);
}

// Ce que `brigade --help` dit, et le refus d'un geste sans projet ou sans commande.
const MODE_D_EMPLOI = "usage: brigade <project> <command> [arguments…]\n       brigade <project> help    lists the commands\n";

const [projet = "", saisie = "", ...suite] = process.argv.slice(2);
if (projet === "-h" || projet === "--help") {
  writeSync(1, MODE_D_EMPLOI);
  process.exit(0);
}
if (process.argv.length < 4) {
  writeSync(2, MODE_D_EMPLOI);
  process.exit(USAGE);
}
const commande = saisie === "-h" || saisie === "--help" ? "help" : saisie;
// `npm run` demandait un `--` devant les arguments : il ne change rien.
const args = suite[0] === "--" ? suite.slice(1) : suite;
const racine = process.env.BRIGADE_STATION_DIR || refuser(SYSTEMD_MUET, "l'unité de la station ne donne pas BRIGADE_STATION_DIR : ses projets ne se trouvent pas");
const fichier = join(racine, CONFIGURATION);
const lu = lireFichierDeConfiguration(fichier).projets.find((ligne) => ligne.nom === projet);
if (lu === undefined) refuser(PROJET_INCONNU, `projet inconnu sur cette station — « ${projet} » n'a pas de ligne dans sa configuration (${fichier})`);

const scripts = Object.entries((JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }).scripts ?? {}).filter(
  ([nom, script]) => nom !== "start" && /^node src\/[\w-]+\.ts$/.test(script),
);
const script = scripts.find(([nom]) => nom === commande)?.[1];
if (script === undefined) {
  refuser(PAS_DU_RUNTIME, `« ${commande} » n'est pas une commande du runtime — celles de cette station : ${scripts.map(([nom]) => nom).join(", ")}`);
}

const env = environnementDeLaCommande(racine, lu, process.env);
const rendu = spawnSync(process.execPath, [script.slice("node ".length), ...args], { env, stdio: "inherit" });
if (rendu.error) refuser(1, `la commande ${commande} ne part pas — ${rendu.error.message}`);
if (rendu.signal !== null) process.kill(process.pid, rendu.signal);
process.exitCode = rendu.status ?? 1;
