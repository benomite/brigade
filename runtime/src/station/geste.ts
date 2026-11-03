// Le geste d'une station (`deploy/brigade`), une fois sous le compte et dans
// l'environnement de son unité :
//
//   node src/station/geste.ts <projet> <commande> [arguments…]
//
// lancé depuis le répertoire du runtime. Le projet se cherche dans la
// configuration de la station ; la commande, parmi les scripts de son
// `package.json` qui lancent un fichier de `src/` — ni `test` ni `typecheck`,
// qui sont au dev et feraient exécuter n'importe quel fichier sous le compte
// de la station, ni `start`. Elle part avec l'environnement que la station
// donne au projet, et son code de sortie est rendu tel quel.
import { spawnSync } from "../sans-invite.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { CONFIGURATION, environnementDeLaCommande, lireFichierDeConfiguration } from "./configuration.ts";

const PROJET_INCONNU = 65;
const PAS_DU_RUNTIME = 66;
const SYSTEMD_MUET = 67;

// Ce qui fait partir la commande : son fichier (relatif au dossier du runtime),
// ses arguments, l'environnement du projet ; rend son code de sortie, ou lève
// si elle ne part pas.
export type LancerLaCommande = (fichier: string, args: string[], env: Record<string, string | undefined>) => number | Promise<number>;

// Dans son propre process, sur les sorties du geste : un signal qui la tue
// tue le geste du même signal.
function dansSonProcess(fichier: string, args: string[], env: Record<string, string | undefined>): number {
  const rendu = spawnSync(process.execPath, [fichier, ...args], { env, stdio: "inherit" });
  if (rendu.error) throw rendu.error;
  if (rendu.signal !== null) process.kill(process.pid, rendu.signal);
  return rendu.status ?? 1;
}

// `lancerLaCommande` : la commande part dans son propre process, hors des tests.
export async function principal({ args: tapes, env: recu, redire }: Appel, lancerLaCommande: LancerLaCommande = dansSonProcess): Promise<void> {
  function refuser(code: number, motif: string): never {
    redire(`brigade : ${motif}`);
    throw new Sortie(code);
  }

  const [projet = "", commande = "", ...args] = tapes;
  const racine = recu.BRIGADE_STATION_DIR || refuser(SYSTEMD_MUET, "l'unité de la station ne donne pas BRIGADE_STATION_DIR : ses projets ne se trouvent pas");
  const fichier = join(racine, CONFIGURATION);
  const lu = lireFichierDeConfiguration(fichier).projets.find((ligne) => ligne.nom === projet);
  if (lu === undefined) refuser(PROJET_INCONNU, `projet inconnu sur cette station — « ${projet} » n'a pas de ligne dans sa configuration (${fichier})`);

  const scripts = Object.entries((JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }).scripts ?? {}).filter(
    ([nom, script]) => nom !== "start" && /^node src\/[\w-]+\.ts$/.test(script),
  );
  const script = scripts.find(([nom]) => nom === commande)?.[1];
  if (script === undefined) {
    const connues = scripts.filter(([, s]) => s !== "node src/ancien-nom.ts").map(([nom]) => nom);
    refuser(PAS_DU_RUNTIME, `« ${commande} » n'est pas une commande du runtime — celles de cette station : ${connues.join(", ")}`);
  }

  // `npm run` donnait son nom à la commande : `ancien-nom.ts` le lit pour dire le nouveau.
  const env = { ...environnementDeLaCommande(racine, lu, recu), npm_lifecycle_event: commande };
  let code: number;
  try {
    code = await lancerLaCommande(script.slice("node ".length), args, env);
  } catch (erreur) {
    refuser(1, `la commande ${commande} ne part pas — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  if (code !== 0) throw new Sortie(code);
}

if (import.meta.main) await enProcess(principal);
