// Le fichier de l'app (`app.json`) existe dès le premier lancement du runtime :
// neutre, sans chemin de personne — ce que l'app écrit
// elle-même à son premier lancement (app/src/config.ts, `creerConfiguration`).
// Un fichier déjà là ne perd jamais une valeur : on n'y ajoute que les clés
// qui lui manquent, et un fichier complet n'est pas touché.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Les clés que l'app lit, et leur valeur quand le chef n'en a pas posé.
export const APP_PAR_DEFAUT: Readonly<Record<string, unknown>> = { projets: [] };

export type AppAssuree = { chemin: string; fait: "cree" | "complete" | "intact" } | { chemin: string; refus: string };

// Où le fichier se trouve : `BRIGADE_APP_CONFIG`, sinon sous le dossier de
// l'utilisateur. Sans l'un ni l'autre, nulle part — on ne devine pas un chemin.
export function cheminDeLApp(env: NodeJS.ProcessEnv): string | undefined {
  if (env.BRIGADE_APP_CONFIG) return env.BRIGADE_APP_CONFIG;
  const maison = env.HOME || env.USERPROFILE;
  return maison ? join(maison, ".config", "brigade", "app.json") : undefined;
}

// Crée `app.json` s'il manque, y complète les clés qui manquent. Ne lève
// jamais : un fichier illisible ou un dossier fermé se disent, et le runtime
// démarre quand même.
export function assurerLApp(chemin: string): AppAssuree {
  const ecrire = (contenu: unknown, flag: string): string | undefined => {
    try {
      mkdirSync(dirname(chemin), { recursive: true });
      writeFileSync(chemin, `${JSON.stringify(contenu, null, 2)}\n`, { flag });
      return undefined;
    } catch (erreur) {
      return (erreur as Error).message;
    }
  };

  if (!existsSync(chemin)) {
    const refus = ecrire(APP_PAR_DEFAUT, "wx");
    return refus === undefined ? { chemin, fait: "cree" } : { chemin, refus: `could not be created: ${refus}` };
  }
  let contenu: unknown;
  try {
    contenu = JSON.parse(readFileSync(chemin, "utf8"));
  } catch (erreur) {
    return { chemin, refus: `could not be read as JSON (${(erreur as Error).message}): left as it is` };
  }
  if (typeof contenu !== "object" || contenu === null || Array.isArray(contenu)) return { chemin, refus: "is not a JSON object: left as it is" };
  const manquantes = Object.keys(APP_PAR_DEFAUT).filter((cle) => !(cle in contenu));
  if (manquantes.length === 0) return { chemin, fait: "intact" };
  const refus = ecrire({ ...contenu, ...Object.fromEntries(manquantes.map((cle) => [cle, APP_PAR_DEFAUT[cle]])) }, "w");
  return refus === undefined ? { chemin, fait: "complete" } : { chemin, refus: `could not be completed: ${refus}` };
}

// Ce que le runtime dit au démarrage, ou rien quand il n'y a rien à dire.
export function direLApp(lu: AppAssuree): string | undefined {
  if ("refus" in lu) return `${lu.chemin} ${lu.refus}`;
  if (lu.fait === "cree") return `${lu.chemin} created with the default settings`;
  if (lu.fait === "complete") return `${lu.chemin} completed with the default settings for the keys it lacked`;
  return undefined;
}
