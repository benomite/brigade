// Le premier lancement de l'app sur un ordinateur neuf (#1434, épique #1427) : le chef y retrouve
// les stations qu'il a déjà appairées et les projets qu'elles portent, et en ouvre un d'un clic,
// sans choisir de dossier. L'app n'y lit rien elle-même : les stations sont celles du runtime
// (`runtime/src/appairage/stations-du-chef.ts`, #1428), la copie locale aussi
// (`runtime/src/projets/copie-locale.ts`, #1429) — elle reprend une copie qui existe, ou clone le
// dépôt dans le dossier que l'app gère, et dit où elle en est. Ce module fait le reste : la copie
// ouverte, le projet entre dans le fichier des projets (config.ts), avec son dépôt et la branche
// que son origine désigne, comme l'écran d'ajout l'y aurait écrit. La vue l'ouvre alors.
import type { Configuration, Declare } from "./config.ts";
import type { CopieLocale, OptionsDOuverture, Progres } from "../../runtime/src/projets/copie-locale.ts";

export type { StationsDuChef, StationAppairee, ProjetPorte, Connexion } from "../../runtime/src/appairage/stations-du-chef.ts";
export type { CopieLocale, Progres } from "../../runtime/src/projets/copie-locale.ts";

// Ce que l'ouverture d'un projet rend à la vue : la copie du runtime — ouverte, ou pourquoi elle ne
// l'est pas —, ou une copie faite que le fichier des projets n'a pas prise (`not-added`), et pourquoi.
export type Ouverture = CopieLocale | { state: "failed"; project: string; repository: string; cause: "not-added" | "busy"; reason: string; detail?: string };

export type OptionsDOuvrir = {
  // L'opération du runtime, chargée depuis son dossier (emplacements.ts).
  ouvrirLaCopie: (options: Pick<OptionsDOuverture, "repository" | "project" | "folder" | "progres">) => Promise<CopieLocale>;
  // La branche d'intégration que l'origine de la copie désigne (ajout.ts, `lireClone`).
  lireLaBase: (dossier: string) => Promise<string | undefined>;
  configuration: () => Configuration;
  // Rend la raison, si le projet n'a pas été ajouté (suivi.ts).
  ajouter: (projet: Declare) => string | undefined;
  // Chaque étape de la copie, pour la vue.
  progres: (depot: string, etape: Progres) => void;
};

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.trim() !== "";

// Ouvre un projet qu'une station porte. Un projet que le fichier a déjà, la copie reprend son
// dossier ; sinon elle est faite, puis le projet y est ajouté. Ne lève pas : un échec est un état.
export function ouvrirDUneStation(options: OptionsDOuvrir): (nom: unknown, depot: unknown) => Promise<Ouverture> {
  // Une ouverture à la fois : un clone en cours ne se double pas d'un second.
  let enCours: string | undefined;
  return async (nom, depot) => {
    const project = texte(nom) ? nom.trim() : "";
    const repository = texte(depot) ? depot.trim() : "";
    if (project === "" || repository === "") {
      return { state: "failed", project, repository, cause: "invalid", reason: "This project has no known GitHub repository, so it cannot be opened from here." };
    }
    if (enCours !== undefined) {
      return { state: "failed", project, repository, cause: "busy", reason: `${enCours} is being opened: wait until it is, then open ${project}.` };
    }
    enCours = project;
    try {
      const deja = options.configuration().projets.find((projet) => projet.nom === project);
      const copie = await options.ouvrirLaCopie({ repository, project, ...(deja === undefined ? {} : { folder: deja.dossier }), progres: (etape) => options.progres(repository, etape) });
      if (copie.state !== "open" || (deja !== undefined && deja.dossier === copie.folder)) return copie;
      const base = await options.lireLaBase(copie.folder).catch(() => undefined);
      const refus = options.ajouter({ nom: copie.project, dossier: copie.folder, depot: copie.repository, ...(base === undefined ? {} : { base }) });
      if (refus === undefined) return copie;
      return { state: "failed", project, repository, cause: "not-added", reason: `${repository} is in ${copie.folder}, but the app could not add ${project} to its projects file.`, detail: refus };
    } finally {
      enCours = undefined;
    }
  };
}
