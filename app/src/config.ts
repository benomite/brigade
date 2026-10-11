// Dire à l'app où sont les projets : un seul fichier, hors du dépôt, un nom et
// un dossier par projet. C'est tout ce qui se règle.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

// `refus` : ce projet reste dans la barre, mais ne s'ouvre pas — et dit pourquoi.
export type Projet = { nom: string; dossier: string; refus?: string };
// `refus` : le fichier entier n'a pas pu être lu — aucun projet, et la raison.
export type Configuration = { chemin: string; projets: Projet[]; refus?: string };

export const EXEMPLE = JSON.stringify({ projets: [{ nom: "brigade", dossier: "~/Dev/brigade" }] }, null, 2);

export function cheminConfiguration(env: NodeJS.ProcessEnv = process.env, maison = homedir()): string {
  return env.BRIGADE_APP_CONFIG || join(maison, ".config", "brigade", "app.json");
}

export function lireConfiguration(chemin: string, maison = homedir()): Configuration {
  const refuse = (refus: string): Configuration => ({ chemin, projets: [], refus });

  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return refuse("ce fichier n'existe pas encore");
    return refuse(`fichier illisible : ${(erreur as Error).message}`);
  }
  let contenu: unknown;
  try {
    contenu = JSON.parse(texte);
  } catch (erreur) {
    return refuse(`JSON illisible : ${(erreur as Error).message}`);
  }
  const liste = (contenu as { projets?: unknown } | null)?.projets;
  if (!Array.isArray(liste)) return refuse("« projets » doit être une liste");
  if (liste.length === 0) return refuse("la liste « projets » est vide");

  const projets: Projet[] = [];
  for (const [rang, declare] of liste.entries()) {
    const { nom, dossier } = (declare ?? {}) as { nom?: unknown; dossier?: unknown };
    if (typeof nom !== "string" || nom.trim() === "") return refuse(`projet n° ${rang + 1} : « nom » manque`);
    const lequel = `projet n° ${rang + 1} (${nom})`;
    if (typeof dossier !== "string" || dossier === "") return refuse(`${lequel} : « dossier » manque`);
    if (projets.some((projet) => projet.nom === nom)) return refuse(`deux projets s'appellent « ${nom} »`);
    const absolu = dossier === "~" || dossier.startsWith("~/") ? join(maison, dossier.slice(1)) : dossier;
    if (!isAbsolute(absolu)) return refuse(`${lequel} : « dossier » doit être un chemin absolu, ou commencer par ~/`);
    const refus = refusDuDossier(absolu);
    projets.push(refus === undefined ? { nom, dossier: absolu } : { nom, dossier: absolu, refus });
  }
  return { chemin, projets };
}

// Un dossier absent n'invalide pas le fichier : un disque débranché ne doit pas
// cacher les autres projets.
function refusDuDossier(dossier: string): string | undefined {
  try {
    return statSync(dossier).isDirectory() ? undefined : `ce n'est pas un dossier : ${dossier}`;
  } catch {
    return `dossier introuvable : ${dossier}`;
  }
}
