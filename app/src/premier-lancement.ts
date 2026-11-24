// Le premier lancement de l'app sur un ordinateur neuf (#1434, épique #1427) : le chef y retrouve
// les stations qu'il a déjà appairées et les projets qu'elles portent, et en ouvre un d'un clic,
// sans choisir de dossier. L'app n'y lit rien elle-même : les stations sont celles du runtime
// (`runtime/src/appairage/stations-du-chef.ts`, #1428), la copie locale aussi
// (`runtime/src/projets/copie-locale.ts`, #1429) — elle reprend une copie qui existe, ou clone le
// dépôt dans le dossier que l'app gère, et dit où elle en est. Ce module fait le reste : la copie
// ouverte, le projet entre dans le fichier des projets (config.ts), avec son dépôt et sa branche
// d'intégration : la branche par défaut que GitHub a donnée du dépôt, quand la vue la passe (l'écran
// « Add a project », #3181), sinon celle que l'origine de la copie désigne. La vue l'ouvre alors.
// Avant la copie, l'app demande si Claude Code est connecté sur cet ordinateur (#4057) : pas connecté, rien ne
// démarre, et la vue propose « log in » ; la cuisine démarre une fois le chef connecté, à l'ouverture suivante.
import type { Configuration, Declare } from "./config.ts";
import type { CopieLocale, OptionsDOuverture, Progres } from "../../runtime/src/projets/copie-locale.ts";
import type { Session } from "../../runtime/src/claude.ts";

export type { StationsDuChef, StationAppairee, ProjetPorte, Connexion } from "../../runtime/src/appairage/stations-du-chef.ts";
export type { CopieLocale, Progres } from "../../runtime/src/projets/copie-locale.ts";

// Ce que l'ouverture d'un projet rend à la vue : la copie du runtime — ouverte, ou pourquoi elle ne
// l'est pas —, ou une copie faite que le fichier des projets n'a pas prise (`not-added`), et pourquoi —, ou rien de
// commencé tant que Claude Code n'est pas connecté sur cet ordinateur (`login`, #4057).
export type Ouverture =
  | CopieLocale
  | { state: "failed"; project: string; repository: string; cause: "not-added" | "busy"; reason: string; detail?: string }
  | { state: "login"; project: string; repository: string; cause: "login"; reason: string };

// La connexion de Claude Code sur cet ordinateur, dite comme la station la publie (pannes/etats.ts).
export type ConnexionClaude = "connectee" | "perdue" | "inconnue";

// Ce que `claude auth status` a dit (runtime/src/claude.ts, `sessionClaude`), en connexion : seul un « non » net la dit
// perdue. Un binaire muet ou absent la laisse inconnue — l'écran de l'outil manquant, ou le premier cook, le dira.
export function connexionDeLaSession(session: Session): ConnexionClaude {
  if (session === "connectee") return "connectee";
  return session === "absente" ? "perdue" : "inconnue";
}

// Le `claude` de cet ordinateur : celui que nomme `BRIGADE_CLAUDE_BIN` (un essai), sinon celui du PATH.
export const claudeDe = (env: NodeJS.ProcessEnv): string => env.BRIGADE_CLAUDE_BIN || "claude";

export const PAS_CONNECTE = (projet: string) => `Claude Code is not logged in on this computer: log in, and ${projet} starts cooking.`;

export type OptionsDOuvrir = {
  // L'opération du runtime, chargée depuis son dossier (emplacements.ts).
  ouvrirLaCopie: (options: Pick<OptionsDOuverture, "repository" | "project" | "folder" | "progres">) => Promise<CopieLocale>;
  // La branche d'intégration que l'origine de la copie désigne (ajout.ts, `lireClone`), quand GitHub n'en a pas donné.
  lireLaBase: (dossier: string) => Promise<string | undefined>;
  configuration: () => Configuration;
  // Rend la raison, si le projet n'a pas été ajouté (suivi.ts).
  ajouter: (projet: Declare) => string | undefined;
  // Chaque étape de la copie, pour la vue.
  progres: (depot: string, etape: Progres) => void;
  // Claude Code est-il connecté sur cet ordinateur (`connexionDeLaSession`) — demandé avant que la cuisine démarre.
  connexionClaude: () => Promise<ConnexionClaude>;
};

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.trim() !== "";

// Ouvre un projet qu'une station porte, ou un dépôt choisi dans « Add a project ». Un projet que le
// fichier a déjà, la copie reprend son dossier ; sinon elle est faite, puis le projet y est ajouté.
// `base` : la branche par défaut que GitHub a donnée du dépôt. Ne lève pas : un échec est un état.
export function ouvrirDUneStation(options: OptionsDOuvrir): (nom: unknown, depot: unknown, base?: unknown) => Promise<Ouverture> {
  // Une ouverture à la fois : un clone en cours ne se double pas d'un second.
  let enCours: string | undefined;
  let connecte = false;
  return async (nom, depot, donnee) => {
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
      // Une lecture qui échoue ne retient rien : la connexion reste inconnue, et le premier cook la dira.
      // Connecté une fois, il l'est pour la suite : une perte plus tard, la panne « Max connection lost » la dit.
      if (!connecte) {
        let connexion: ConnexionClaude;
        try {
          connexion = await options.connexionClaude();
        } catch {
          connexion = "inconnue";
        }
        if (connexion === "perdue") return { state: "login", project, repository, cause: "login", reason: PAS_CONNECTE(project) };
        connecte = connexion === "connectee";
      }
      const deja = options.configuration().projets.find((projet) => projet.nom === project);
      const copie = await options.ouvrirLaCopie({ repository, project, ...(deja === undefined ? {} : { folder: deja.dossier }), progres: (etape) => options.progres(repository, etape) });
      if (copie.state !== "open" || (deja !== undefined && deja.dossier === copie.folder)) return copie;
      const base = texte(donnee) ? donnee.trim() : await options.lireLaBase(copie.folder).catch(() => undefined);
      const refus = options.ajouter({ nom: copie.project, dossier: copie.folder, depot: copie.repository, ...(base === undefined ? {} : { base }) });
      if (refus === undefined) return copie;
      return { state: "failed", project, repository, cause: "not-added", reason: `${repository} is in ${copie.folder}, but the app could not add ${project} to its projects file.`, detail: refus };
    } finally {
      enCours = undefined;
    }
  };
}
