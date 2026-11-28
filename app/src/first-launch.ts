// Le premier lancement de l'app sur un ordinateur neuf (#1434, épique #1427) : le chef y retrouve
// les stations qu'il a déjà appairées et les projets qu'elles portent, et en ouvre un d'un clic,
// sans choisir de dossier. L'app n'y lit rien elle-même : les stations sont celles que le process principal
// lit (#1428), la copie locale aussi (#1429) — elle reprend une copie qui existe, ou clone le
// dépôt dans le dossier que l'app gère, et dit où elle en est. Ce module fait le reste : la copie
// ouverte, le projet entre dans le fichier des projets (config.ts), avec son dépôt et sa branche
// d'intégration : la branche par défaut que GitHub a donnée du dépôt, quand la vue la passe (l'écran
// « Add a project », #3181), sinon celle que l'origine de la copie désigne. La vue l'ouvre alors.
// Avant la copie, l'app demande si Claude Code est connecté sur cet ordinateur (#4057) : pas connecté, rien ne
// démarre, et la vue propose « log in » ; la cuisine démarre une fois le chef connecté, à l'ouverture suivante.
import type { Configuration, Declare } from "./config.ts";

// Le geste qui connecte le `gh` de cet ordinateur : la commande à lancer, telle quelle.
export type Connection = { id: "github-sign-in"; label: string; command: string[] };
// Un projet qu'une station porte, et la station appairée du chef, telle que son gist la dit.
export type ProjectCarried = { name: string; repository: string | null };
export type StationPaired = { id: string; name: string; machine: string; kind: string | null; cooks: boolean; version: string; online: boolean; lastSeen: string; stoppedAt: string | null; projects: ProjectCarried[] };
export type StationsOfChef =
  | { state: "listed"; stations: StationPaired[]; unreadable: Array<{ id: string; reason: string }>; reason?: string }
  | { state: "sign-in-required"; reason: string; action: Connection }
  | { state: "unavailable"; cause: "gh-missing" | "network" | "timeout" | "rate-limit" | "github"; reason: string; link?: string; detail?: string };
// La copie locale d'un dépôt : ouverte, ou pourquoi elle ne l'est pas ; et chaque étape de son ouverture.
export type CauseOfFailure = "git-missing" | "gh-missing" | "sign-in-required" | "access-denied" | "repository-missing" | "network" | "timeout" | "folder-taken" | "invalid" | "unknown";
export type LocalCopy =
  | { state: "open"; project: string; repository: string; folder: string; cloned: boolean }
  | { state: "failed"; project: string; repository: string; cause: CauseOfFailure; reason: string; link?: string; action?: Connection; detail?: string };
export type Progress = { stage: "looking" | "reusing" | "cloning"; sentence: string; folder?: string; percent?: number };
// Ce que `claude auth status` dit de la session de cet ordinateur.
export type Session = "connectee" | "absente" | "introuvable" | "inconnue";

// Ce que l'ouverture d'un projet rend à la vue : la copie du runtime — ouverte, ou pourquoi elle ne
// l'est pas —, ou une copie faite que le fichier des projets n'a pas prise (`not-added`), et pourquoi —, ou rien de
// commencé tant que Claude Code n'est pas connecté sur cet ordinateur (`login`, #4057).
export type Opening =
  | LocalCopy
  | { state: "failed"; project: string; repository: string; cause: "not-added" | "busy"; reason: string; detail?: string }
  | { state: "login"; project: string; repository: string; cause: "login"; reason: string };

// La connexion de Claude Code sur cet ordinateur, dite comme la station la publie (stations/document.ts).
export type ConnectionClaude = "connectee" | "perdue" | "inconnue";

// Ce que `claude auth status` a dit (`Session`), en connexion : seul un « non » net la dit
// perdue. Un binaire muet ou absent la laisse inconnue — l'écran de l'outil manquant, ou le premier cook, le dira.
export function connectionOfTheSession(session: Session): ConnectionClaude {
  if (session === "connectee") return "connectee";
  return session === "absente" ? "perdue" : "inconnue";
}

// Le `claude` de cet ordinateur : celui que nomme `BRIGADE_CLAUDE_BIN` (un essai), sinon celui du PATH.
export const claudeOf = (env: NodeJS.ProcessEnv): string => env.BRIGADE_CLAUDE_BIN || "claude";

export const NOT_CONNECTED = (projectName: string) => `Claude Code is not logged in on this computer: log in, and ${projectName} starts cooking.`;

export type OptionsOfOpen = {
  // L'opération du runtime, chargée depuis son dossier (locations.ts).
  ouvrirLaCopie: (options: { repository: string; project?: string; folder?: string; progres?: (step: Progress) => void }) => Promise<LocalCopy>;
  // La branche d'intégration que l'origine de la copie désigne (addition.ts, `lireClone`), quand GitHub n'en a pas donné.
  lireLaBase: (folder: string) => Promise<string | undefined>;
  configuration: () => Configuration;
  // Rend la raison, si le projet n'a pas été ajouté (tracking.ts).
  ajouter: (projectName: Declare) => string | undefined;
  // Chaque étape de la copie, pour la vue.
  progres: (repo: string, step: Progress) => void;
  // Claude Code est-il connecté sur cet ordinateur (`connexionDeLaSession`) — demandé avant que la cuisine démarre.
  connexionClaude: () => Promise<ConnectionClaude>;
};

const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

// Ouvre un projet qu'une station porte, ou un dépôt choisi dans « Add a project ». Un projet que le
// fichier a déjà, la copie reprend son dossier ; sinon elle est faite, puis le projet y est ajouté.
// `base` : la branche par défaut que GitHub a donnée du dépôt. Ne lève pas : un échec est un état.
export function openOfAStation(options: OptionsOfOpen): (name: unknown, repo: unknown, base?: unknown) => Promise<Opening> {
  // Une ouverture à la fois : un clone en cours ne se double pas d'un second.
  let inProgress: string | undefined;
  let connected = false;
  return async (name, repo, data) => {
    const project = text(name) ? name.trim() : "";
    const repository = text(repo) ? repo.trim() : "";
    if (project === "" || repository === "") {
      return { state: "failed", project, repository, cause: "invalid", reason: "This project has no known GitHub repository, so it cannot be opened from here." };
    }
    if (inProgress !== undefined) {
      return { state: "failed", project, repository, cause: "busy", reason: `${inProgress} is being opened: wait until it is, then open ${project}.` };
    }
    inProgress = project;
    try {
      // Une lecture qui échoue ne retient rien : la connexion reste inconnue, et le premier cook la dira.
      // Connecté une fois, il l'est pour la suite : une perte plus tard, la panne « Max connection lost » la dit.
      if (!connected) {
        let connection: ConnectionClaude;
        try {
          connection = await options.connexionClaude();
        } catch {
          connection = "inconnue";
        }
        if (connection === "perdue") return { state: "login", project, repository, cause: "login", reason: NOT_CONNECTED(project) };
        connected = connection === "connectee";
      }
      const already = options.configuration().projets.find((projectName) => projectName.nom === project);
      const copy = await options.ouvrirLaCopie({ repository, project, ...(already === undefined ? {} : { folder: already.dossier }), progres: (step) => options.progres(repository, step) });
      if (copy.state !== "open" || (already !== undefined && already.dossier === copy.folder)) return copy;
      const base = text(data) ? data.trim() : await options.lireLaBase(copy.folder).catch(() => undefined);
      const refusal = options.ajouter({ nom: copy.project, dossier: copy.folder, depot: copy.repository, ...(base === undefined ? {} : { base }) });
      if (refusal === undefined) return copy;
      return { state: "failed", project, repository, cause: "not-added", reason: `${repository} is in ${copy.folder}, but the app could not add ${project} to its projects file.`, detail: refusal };
    } finally {
      inProgress = undefined;
    }
  };
}
