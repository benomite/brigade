// Dire à l'app où sont les projets : un seul fichier, hors du dépôt, un nom et
// un dossier par projet. C'est tout ce qui se règle. Le chef l'écrit à la main,
// le second le lit : l'app n'y ajoute qu'un projet, dans la même forme.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

// Où tourne le runtime d'un projet : l'hôte que `ssh` connaît, et rien d'autre.
// Ce qui s'y lance est le geste de la box, avec le `nom` du projet.
export type Box = { hote: string };
// `refus` : ce projet reste dans la barre, mais ne s'ouvre pas — et dit pourquoi.
// `box` : absente, l'app ne lit rien de ce projet.
export type Projet = { nom: string; dossier: string; refus?: string; box?: Box };
// `refus` : le fichier entier n'a pas pu être lu — aucun projet, et la raison.
// `nonRelu` : il a changé depuis, et sa relecture a été refusée — les projets
// sont ceux d'avant, et la raison est celle du fichier tel qu'il est.
export type Configuration = { chemin: string; projets: Projet[]; refus?: string; nonRelu?: string };
// Un projet tel qu'il s'écrit dans le fichier.
export type Declare = { nom: string; dossier: string; hote?: string };

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
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    const refus = (erreur as NodeJS.ErrnoException).code === "ENOENT" ? "ce fichier n'existe pas" : `fichier illisible : ${(erreur as Error).message}`;
    return { chemin, projets: [], refus };
  }
  return comprendre(chemin, texte, maison);
}

function comprendre(chemin: string, texte: string, maison: string): Configuration {
  const refuse = (refus: string): Configuration => ({ chemin, projets: [], refus });

  let contenu: unknown;
  try {
    contenu = JSON.parse(texte);
  } catch (erreur) {
    return refuse(`JSON illisible : ${(erreur as Error).message}`);
  }
  const liste = (contenu as { projets?: unknown } | null)?.projets;
  if (!Array.isArray(liste)) return refuse("« projets » doit être une liste");

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

// Le fichier qui manque est créé — une liste vide, et son dossier avec. Un
// fichier déjà là n'est jamais réécrit ici. Rend la raison, s'il n'a pas pu l'être.
export function creerConfiguration(chemin: string): string | undefined {
  const refus = (erreur: unknown) => `ce fichier n'a pas pu être créé : ${(erreur as Error).message}`;
  try {
    mkdirSync(dirname(chemin), { recursive: true });
  } catch (erreur) {
    return refus(erreur);
  }
  try {
    writeFileSync(chemin, ecrit({ projets: [] }), { flag: "wx" });
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "EEXIST") return refus(erreur);
    // Un lien pendant « existe » pour qui veut créer, et pour personne d'autre.
    if (!existsSync(chemin)) return refus(new Error("c'est un lien vers un fichier qui n'existe pas"));
  }
  return undefined;
}

const ecrit = (contenu: unknown): string => `${JSON.stringify(contenu, null, 2)}\n`;

// Ajoute un projet à la suite des autres, et rend la raison s'il ne l'a pas été.
// Les règles sont celles de la lecture : le fichier n'est écrit que s'il était
// compris avant, et s'il l'est encore après. Ce que l'app n'y lit pas y reste.
export function ajouterProjet(chemin: string, projet: Declare, maison = homedir()): string | undefined {
  const cree = creerConfiguration(chemin);
  if (cree !== undefined) return cree;
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    return `fichier illisible : ${(erreur as Error).message}`;
  }
  const lue = comprendre(chemin, texte, maison);
  if (lue.refus !== undefined) return `l'app n'écrit pas dans un fichier qu'elle n'a pas compris — ${lue.refus}`;

  const contenu = JSON.parse(texte) as { projets: unknown[] };
  const hote = projet.hote?.trim();
  contenu.projets.push({ nom: projet.nom.trim(), dossier: projet.dossier, ...(hote ? { hote } : {}) });
  const neuf = ecrit(contenu);
  const comprise = comprendre(chemin, neuf, maison);
  // Un projet qui ne s'ouvrirait pas n'est pas ajouté : le chef est là pour en choisir un autre.
  const refus = comprise.refus ?? comprise.projets.at(-1)?.refus;
  if (refus !== undefined) return refus;
  try {
    writeFileSync(chemin, neuf);
  } catch (erreur) {
    return `ce fichier n'a pas pu être écrit : ${(erreur as Error).message}`;
  }
  return undefined;
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
