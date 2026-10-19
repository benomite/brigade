// A station's configuration: the projects it serves, one line each. It is the
// only file that adding or removing a project touches — no unit, no drop-in,
// no system rule.
//
// One line: the project's name, its GitHub repo, its integration branch, then,
// if needed, `BRIGADE_…=value` settings specific to that project.
//
//   # project  repo                branch   settings
//   brigade   benomite/brigade   v2
//   calculus  benomite/calculus  main     BRIGADE_SECRETS_FILE=/srv/secrets/calculus.env
//
// Everything else comes from the station: its environment, which every project
// inherits, and its directories, where every project has its place.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECISIONS } from "../decisions.ts";
import { NOM_DE_PROJET } from "../runtime.ts";

// What the station carries under its directory (`BRIGADE_STATION_DIR`).
export const CONFIGURATION = "projets";
// Each project's state: its log, its lock, its runs, its worktrees.
export const STATES = "etat";
// Each project's clone, when its line does not name another one.
export const CLONES = "clones";

export type ConfiguredProject = {
  name: string;
  repo: string;
  base: string;
  // The project's own settings, as its line writes them.
  settings: Record<string, string>;
  // The line, its whitespace collapsed to one: two reads that return the same
  // one changed nothing for the project.
  line: string;
};

export type Configuration = { projects: ConfiguredProject[]; problems: string[] };

const SETTING = /^(BRIGADE_[A-Z0-9_]+)=(.*)$/;

// What a line does not set: its first three fields, and what the station
// holds itself.
const HELD: Record<string, string> = {
  BRIGADE_PROJECT: "c'est le premier champ de la ligne",
  BRIGADE_GITHUB_REPO: "c'est le deuxième champ de la ligne",
  BRIGADE_BASE_BRANCH: "c'est le troisième champ de la ligne",
  BRIGADE_STATE_DIR: `la station range l'état de chaque projet sous \`${STATES}/\``,
  BRIGADE_STATION_DIR: "c'est le répertoire de la station, pas d'un projet",
};

// Reads the configuration text. An unreadable line only affects itself: it is
// reported, and the other projects are served.
export function readConfiguration(text: string): Configuration {
  const projects: ConfiguredProject[] = [];
  const problems: string[] = [];
  text.split("\n").forEach((raw, index) => {
    const fields = raw.trim().split(/\s+/).filter(Boolean);
    if (fields.length === 0 || fields[0]?.startsWith("#")) return;
    const refuse = (why: string) => void problems.push(`ligne ${index + 1} de la configuration (« ${raw.trim().slice(0, 80)} ») : ${why}`);
    const [name = "", repo, base, ...rest] = fields;
    if (repo === undefined || base === undefined) return refuse("attendu le nom du projet, son dépôt GitHub (<owner>/<repo>) et sa branche d'intégration");
    if (!NOM_DE_PROJET.test(name)) return refuse(`nom de projet invalide — attendu un identifiant court en minuscules, chiffres et tirets (brigade, thermigo)`);
    if (projects.some((project) => project.name === name)) return refuse(`le projet « ${name} » a déjà sa ligne`);
    const settings: Record<string, string> = {};
    for (const field of rest) {
      const [, key, value] = SETTING.exec(field) ?? [];
      if (key === undefined || value === undefined) return refuse(`« ${field.slice(0, 40)} » n'est pas un réglage — attendu BRIGADE_…=valeur`);
      if (key in HELD) return refuse(`${key} ne se règle pas sur la ligne : ${HELD[key]}`);
      if ((DECISIONS as readonly string[]).includes(key)) return refuse(`${key} est une décision du chef : elle vit au journal du projet, pas dans la configuration`);
      if (key in settings) return refuse(`${key} est réglé deux fois`);
      settings[key] = value;
    }
    projects.push({ name, repo, base, settings, line: fields.join(" ") });
  });
  return { projects, problems };
}

// Reads the configuration file. Missing, the station serves no project: it is
// installed, its projects will come.
export function readConfigurationFile(file: string): Configuration {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { projects: [], problems: [] };
    return { projects: [], problems: [`configuration illisible (${file}) — ${error instanceof Error ? error.message : String(error)}`] };
  }
  return readConfiguration(text);
}

// A project's environment: the station's, its locations, then the settings of
// its line. It is the one a project runtime used to read on its own.
export function projectEnvironment(root: string, project: ConfiguredProject, env: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    ...env,
    BRIGADE_REPO_DIR: join(root, CLONES, project.name),
    ...project.settings,
    BRIGADE_PROJECT: project.name,
    BRIGADE_GITHUB_REPO: project.repo,
    BRIGADE_BASE_BRANCH: project.base,
    BRIGADE_STATE_DIR: join(root, STATES, project.name),
  };
}
