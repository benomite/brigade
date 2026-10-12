// Dire à l'app où sont les projets : un seul fichier, hors du dépôt, un nom et
// un dossier par projet. C'est tout ce qui se règle.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

// Où tourne le runtime d'un projet : l'hôte que `ssh` connaît, et rien d'autre.
// Ce qui s'y lance est le geste de la box, avec le `nom` du projet.
export type Box = { hote: string };
// `refus` : ce projet reste dans la barre, mais ne s'ouvre pas — et dit pourquoi.
// `box` : absente, l'app ne lit rien de ce projet.
export type Projet = { nom: string; dossier: string; refus?: string; box?: Box };
// `refus` : le fichier entier n'a pas pu être lu — aucun projet, et la raison.
export type Configuration = { chemin: string; projets: Projet[]; refus?: string };

// Rien ici ne se recopie tel quel : chaque valeur dit ce qui la remplace.
export const EXEMPLE = JSON.stringify(
  { projets: [{ nom: "<le nom du projet sur ta box>", dossier: "<son dossier sur ce poste, absolu ou en ~/>", hote: "<facultatif : le nom par lequel ton ssh joint ta box>" }] },
  null,
  2,
);

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
    const { nom, dossier, hote, commande } = (declare ?? {}) as { nom?: unknown; dossier?: unknown; hote?: unknown; commande?: unknown };
    if (typeof nom !== "string" || nom.trim() === "") return refuse(`projet n° ${rang + 1} : « nom » manque`);
    const lequel = `projet n° ${rang + 1} (${nom})`;
    if (typeof dossier !== "string" || dossier === "") return refuse(`${lequel} : « dossier » manque`);
    if (projets.some((projet) => projet.nom === nom)) return refuse(`deux projets s'appellent « ${nom} »`);
    const absolu = dossier === "~" || dossier.startsWith("~/") ? join(maison, dossier.slice(1)) : dossier;
    if (!isAbsolute(absolu)) return refuse(`${lequel} : « dossier » doit être un chemin absolu, ou commencer par ~/`);
    // Le fichier d'avant dictait une ligne de commande : il le dit, plutôt que d'être lu à moitié.
    if (commande !== undefined) return refuse(`${lequel} : « commande » n'est plus lu — retire-le : l'app lance le geste de la box (\`brigade ${nom} <commande>\`), « hote » lui suffit`);
    if (hote !== undefined && (typeof hote !== "string" || hote.trim() === "")) return refuse(`${lequel} : « hote » doit être un texte non vide`);
    const refus = refusDuDossier(absolu);
    projets.push({ nom, dossier: absolu, ...(refus === undefined ? {} : { refus }), ...(hote === undefined ? {} : { box: { hote } }) });
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
