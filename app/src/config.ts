// Dire à l'app où sont les projets : un seul fichier, hors du dépôt, un nom et
// un dossier par projet. C'est tout ce qui se règle. Le chef l'écrit à la main, le second
// le lit : l'app n'y ajoute qu'un projet, dans la même forme — n'en retire qu'un projet, et n'y change
// l'ordre des projets que lorsque le chef les range dans la barre. Elle y
// écrit aussi les couleurs d'un projet (colors.ts) : celles qui lui manquent, et celles
// que le chef choisit — et les préférences du chef lues dans son gist (settings-personal/sync.ts).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, sep } from "node:path";
import { colorsRead, whole, isColor, ROLES, draw, type Colors, type Role } from "./colors.ts";
import { refusalOfAcronym } from "./acronym.ts";

// Le modèle et l'effort du manager et du reviewer d'un projet.
export type ProjectCalibration = { manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string } };

// `refus` : ce projet reste dans la barre, mais ne s'ouvre pas — et dit pourquoi.
// `calibrage` : celui que le chef a posé en l'ajoutant depuis l'app — l'écran d'ajout le propose
// ensuite pour le projet suivant. Absent d'un projet écrit à la main : l'app n'en sait rien.
// `couleurs` : celles de son onglet et de son accent, telles que le fichier les écrit — une qui
// manque y est tirée, puis écrite (`colorerProjets`).
// `sigle` : celui que le chef a écrit pour sa case de la barre (acronym.ts) — absent, l'app en tire un de son nom.
// `depot`, `base` : son dépôt GitHub et sa branche d'intégration, posés à son ajout depuis l'app
// (addition.ts) — c'est d'eux que se confie sa cuisine à une station. Absents d'un projet écrit à la main.
export type Project = { nom: string; dossier: string; depot?: string; base?: string; refus?: string; calibrage?: ProjectCalibration; couleurs?: Colors; sigle?: string };
// `refus` : le fichier entier n'a pas pu être lu — aucun projet, et la raison.
// `nonRelu` : il a changé depuis, et sa relecture a été refusée — les projets
// sont ceux d'avant, et la raison est celle du fichier tel qu'il est.
// `barreDeMenus` : `false`, le chef a retiré l'état de la cuisine de la barre des menus du Mac et de la zone de
// notification de Windows (menu-bar.ts, #3269) ; absent, il y est.
export type Configuration = { chemin: string; projets: Project[]; refus?: string; nonRelu?: string; barreDeMenus?: boolean };
// Un projet tel qu'il s'écrit dans le fichier.
export type Declare = { nom: string; dossier: string; depot?: string; base?: string; calibrage?: ProjectCalibration };

// Rien ici ne se recopie tel quel : chaque valeur dit ce qui la remplace.
export const EXAMPLE = JSON.stringify(
  {
    projets: [{ nom: "<the project's name — that of its GitHub repository>", dossier: "<its folder on this workstation, absolute or starting with ~/>", depot: "<its GitHub repository, <owner>/<name>>", base: "<its integration branch>" }],
  },
  null,
  2,
);

export function pathConfiguration(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return env.BRIGADE_APP_CONFIG || join(home, ".config", "brigade", "app.json");
}

export function readConfiguration(path: string, home = homedir()): Configuration {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const refusal = (error as NodeJS.ErrnoException).code === "ENOENT" ? "this file does not exist" : `unreadable file: ${(error as Error).message}`;
    return { chemin: path, projets: [], refus: refusal };
  }
  return understand(path, text, home);
}

function understand(path: string, text: string, home: string): Configuration {
  const refuses = (refusal: string): Configuration => ({ chemin: path, projets: [], refus: refusal });

  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch (error) {
    return refuses(`unreadable JSON: ${(error as Error).message}`);
  }
  const { projets: list, barreDeMenus: menuBar } = (content ?? {}) as { projets?: unknown; barreDeMenus?: unknown };
  if (!Array.isArray(list)) return refuses("“projets” must be a list");
  if (menuBar !== undefined && typeof menuBar !== "boolean") return refuses("“barreDeMenus” must be true or false — whether the kitchen's state shows in the menu bar or the notification area");

  const projects: Project[] = [];
  for (const [rank, declare] of list.entries()) {
    const { nom: name, dossier: folder, commande: command } = (declare ?? {}) as { nom?: unknown; dossier?: unknown; commande?: unknown };
    if (typeof name !== "string" || name.trim() === "") return refuses(`project #${rank + 1}: “nom” is missing`);
    const which = `project #${rank + 1} (${name})`;
    if (typeof folder !== "string" || folder === "") return refuses(`${which}: “dossier” is missing`);
    if (projects.some((project) => project.nom === name)) return refuses(`two projects are named “${name}”`);
    // `~\` aussi, comme on l'écrit sous Windows.
    const absolute = folder === "~" || folder.startsWith("~/") || (sep === "\\" && folder.startsWith("~\\")) ? join(home, folder.slice(1)) : folder;
    if (!isAbsolute(absolute)) return refuses(`${which}: “dossier” must be an absolute path, or start with ~/`);
    // Le fichier d'avant dictait une ligne de commande : il le dit, plutôt que d'être lu à moitié.
    if (command !== undefined) return refuses(`${which}: “commande” is no longer read — remove it: the app reads the project on GitHub and sends the station's actions there`);
    const refusal = refusalOfFolder(absolute);
    const calibration = readCalibration((declare as { calibrage?: unknown }).calibrage);
    const colors = colorsRead((declare as { couleurs?: unknown }).couleurs);
    if (typeof colors === "string") return refuses(`${which}: ${colors}`);
    const { sigle: acronym } = declare as { sigle?: unknown };
    const acronymRefuses = acronym === undefined ? undefined : refusalOfAcronym(acronym);
    if (acronymRefuses !== undefined) return refuses(`${which}: ${acronymRefuses}`);
    const { depot: repository, base } = declare as { depot?: unknown; base?: unknown };
    if (repository !== undefined && (typeof repository !== "string" || repository.trim() === "")) return refuses(`${which}: “depot” must be a non-empty string — its GitHub repository, \`<owner>/<name>\``);
    if (base !== undefined && (typeof base !== "string" || base.trim() === "")) return refuses(`${which}: “base” must be a non-empty string — its integration branch`);
    projects.push({ nom: name, dossier: absolute, ...(repository === undefined ? {} : { depot: repository }), ...(base === undefined ? {} : { base }), ...(calibration === undefined ? {} : { calibrage: calibration }), ...(refusal === undefined ? {} : { refus: refusal }), ...(colors === undefined ? {} : { couleurs: colors }), ...(typeof acronym === "string" ? { sigle: acronym.trim() } : {}) });
  }
  return { chemin: path, projets: projects, ...(menuBar === undefined ? {} : { barreDeMenus: menuBar }) };
}

// Le calibrage écrit d'un projet, s'il est entier — sinon l'app n'en lit rien, et ne le refuse pas.
function readCalibration(readOne: unknown): ProjectCalibration | undefined {
  const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value : undefined);
  const role = (value: unknown) => {
    const { modele: model, effort } = (value ?? {}) as { modele?: unknown; effort?: unknown };
    const [m, e] = [text(model), text(effort)];
    return m === undefined || e === undefined ? undefined : { modele: m, effort: e };
  };
  const { manager, reviewer } = (readOne ?? {}) as { manager?: unknown; reviewer?: unknown };
  const [gestionnaire, relecteur] = [role(manager), role(reviewer)];
  return gestionnaire === undefined || relecteur === undefined ? undefined : { manager: gestionnaire, reviewer: relecteur };
}

// Le fichier qui manque est créé — une liste vide, et son dossier avec. Un
// fichier déjà là n'est jamais réécrit ici. Rend la raison, s'il n'a pas pu l'être.
export function createConfiguration(path: string): string | undefined {
  const refusal = (error: unknown) => `this file could not be created: ${(error as Error).message}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    return refusal(error);
  }
  try {
    writeFileSync(path, written({ projets: [] }), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") return refusal(error);
    // Un lien pendant « existe » pour qui veut créer, et pour personne d'autre.
    if (!existsSync(path)) return refusal(new Error("it is a link to a file that does not exist"));
  }
  return undefined;
}

const written = (content: unknown): string => `${JSON.stringify(content, null, 2)}\n`;

type Open = { contenu: { projets: unknown[] }; lue: Configuration } | { refus: string };

// Le fichier tel qu'il est, pour y ajouter : créé s'il manque, et compris — ou
// la raison. L'app n'écrit pas dans un fichier qu'elle n'a pas compris.
function open(path: string, home: string): Open {
  const created = createConfiguration(path);
  return created === undefined ? reread(path, home) : { refus: created };
}

// Le même, sans le créer : on ne retire rien d'un fichier qui n'existe pas.
function reread(path: string, home: string): Open {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { refus: `unreadable file: ${(error as Error).message}` };
  }
  const readEntry = understand(path, text, home);
  if (readEntry.refus !== undefined) return { refus: `the app does not write into a file it has not understood — ${readEntry.refus}` };
  return { contenu: JSON.parse(text) as { projets: unknown[] }, lue: readEntry };
}

function rewrite(path: string, fresh: string): string | undefined {
  try {
    writeFileSync(path, fresh);
  } catch (error) {
    return `this file could not be written: ${(error as Error).message}`;
  }
  return undefined;
}

// Le fichier tel qu'il serait avec ce projet à la suite des autres — ou la raison
// pour laquelle il n'y entre pas. Les règles sont celles de la lecture : le fichier
// n'est écrit que s'il était compris avant, et s'il l'est encore après.
function withProject(path: string, project: Declare, home: string): { neuf: string } | { refus: string } {
  const opened = open(path, home);
  if ("refus" in opened) return opened;
  opened.contenu.projets.push({ nom: project.nom.trim(), dossier: project.dossier, ...(project.depot ? { depot: project.depot } : {}), ...(project.base ? { base: project.base } : {}), ...(project.calibrage === undefined ? {} : { calibrage: project.calibrage }) });
  const fresh = written(opened.contenu);
  const understood = understand(path, fresh, home);
  // Un projet qui ne s'ouvrirait pas n'est pas ajouté : le chef est là pour en choisir un autre.
  const refusal = understood.refus ?? understood.projets.at(-1)?.refus;
  return refusal === undefined ? { neuf: fresh } : { refus: refusal };
}

// Ajoute un projet à la suite des autres, et rend la raison s'il ne l'a pas été.
// Ce que l'app n'y lit pas y reste.
export function addProject(path: string, project: Declare, home = homedir()): string | undefined {
  const withIt = withProject(path, project, home);
  return "refus" in withIt ? withIt.refus : rewrite(path, withIt.neuf);
}

// Retire un projet du fichier : sa ligne, et elle seule — ni les autres projets, ni
// ce que l'app n'y lit pas. Rend la raison, s'il n'a pas été retiré.
export function removeProject(path: string, name: string, home = homedir()): string | undefined {
  const opened = reread(path, home);
  if ("refus" in opened) return opened.refus;
  const { projets: projects } = opened.contenu;
  const rank = projects.findIndex((declare) => (declare as { nom?: unknown } | null)?.nom === name);
  if (rank === -1) return `“${name}” is not in this file: nothing was changed there`;
  projects.splice(rank, 1);
  return rewrite(path, written(opened.contenu));
}

// Range un projet à une autre place de la liste — `rang`, compté depuis zéro, est celle qu'il
// prend : les autres se décalent. Chaque ligne reste entière, et rien d'autre du fichier ne bouge.
// C'est l'ordre du fichier que la barre et « Tous les projets » montrent : un projet ajouté
// ensuite arrive à sa fin. Lâché à sa propre place, rien n'est écrit. Rend la raison, s'il n'a pas été rangé.
export function tidyProject(path: string, name: string, rank: number, home = homedir()): string | undefined {
  const opened = reread(path, home);
  if ("refus" in opened) return opened.refus;
  const { projets: projects } = opened.contenu;
  const before = projects.findIndex((declare) => (declare as { nom?: unknown } | null)?.nom === name);
  if (before === -1) return `“${name}” is not in this file: nothing was changed there`;
  if (!Number.isInteger(rank) || rank < 0 || rank >= projects.length) return `there is no place #${rank + 1} among ${projects.length} projects: nothing was changed there`;
  if (rank === before) return undefined;
  projects.splice(rank, 0, ...projects.splice(before, 1));
  return rewrite(path, written(opened.contenu));
}

// Les couleurs qui manquent aux projets du fichier — à un projet qui vient d'y entrer, ou qui y
// était avant qu'elles existent : une teinte de la palette qu'aucun autre projet ne porte, dans
// aucun rôle, tant qu'il en reste une, posée sur chaque rôle qui en manque et écrite dans
// « couleurs ». Celles qui y sont ne changent pas, et rien n'est écrit s'il n'en manque aucune.
// Rend la raison, si elles ne l'ont pas été.
export function colorProjects(path: string, home = homedir(), chance: () => number = Math.random): string | undefined {
  const opened = reread(path, home);
  if ("refus" in opened) return opened.refus;
  const heldEntries: Colors[] = opened.lue.projets.map(({ couleurs: colors }) => ({ ...colors }));
  if (heldEntries.every(whole)) return undefined;
  // Le fichier a été compris : ses projets sont ceux qui ont été lus, dans le même ordre.
  for (const [rank, colors] of heldEntries.entries()) {
    if (whole(colors)) continue;
    const tint = draw(heldEntries.flatMap((other) => (other === colors ? [] : ROLES.map((role) => other[role]))), chance);
    for (const role of ROLES) colors[role] ??= tint;
    const declare = opened.contenu.projets[rank] as { couleurs?: Colors };
    declare.couleurs = { ...declare.couleurs, ...colors };
  }
  return rewrite(path, written(opened.contenu));
}

// Change une couleur d'un projet : celle de son onglet, ou celle de son accent — rien d'autre du
// fichier. Rend la raison, si elle ne l'a pas été.
export function changeColor(path: string, name: string, role: Role, color: string, home = homedir()): string | undefined {
  if (!isColor(color)) return `“${color}” is not a color written as \`#rrggbb\``;
  const opened = reread(path, home);
  if ("refus" in opened) return opened.refus;
  const declare = opened.contenu.projets.find((candidate) => (candidate as { nom?: unknown } | null)?.nom === name) as { couleurs?: Colors } | undefined;
  if (declare === undefined) return `“${name}” is not in this file: nothing was changed there`;
  declare.couleurs = { ...declare.couleurs, [role]: color.toLowerCase() };
  return rewrite(path, written(opened.contenu));
}

// Change le sigle d'un projet, celui de sa case dans la barre (acronym.ts) : `null` le retire, et l'app en tire
// un de son nom. Un sigle qu'un autre projet porte déjà, écrit par le chef, est refusé — deux cases ne se
// lisent pas pareil. Rien d'autre du fichier ne change. Rend la raison, s'il ne l'a pas été.
export function changeAcronym(path: string, name: string, acronym: unknown, home = homedir()): string | undefined {
  if (acronym !== null) {
    const refusal = refusalOfAcronym(acronym);
    if (refusal !== undefined) return `nothing was written: ${refusal}`;
  }
  const opened = reread(path, home);
  if ("refus" in opened) return opened.refus;
  const declare = opened.contenu.projets.find((candidate) => (candidate as { nom?: unknown } | null)?.nom === name) as { sigle?: string } | undefined;
  if (declare === undefined) return `“${name}” is not in this file: nothing was changed there`;
  if (acronym === null) {
    if (declare.sigle === undefined) return undefined;
    delete declare.sigle;
    return rewrite(path, written(opened.contenu));
  }
  const wanted = (acronym as string).trim();
  const other = opened.lue.projets.find((project) => project.nom !== name && project.sigle?.toUpperCase() === wanted.toUpperCase());
  if (other !== undefined) return `nothing was written: “${other.sigle}” is already the label of ${other.nom}`;
  if (declare.sigle === wanted) return undefined;
  declare.sigle = wanted;
  return rewrite(path, written(opened.contenu));
}


// Montre ou retire l'état de la cuisine de la barre des menus du Mac et de la zone de notification de Windows
// (menu-bar.ts, #3269) — rien d'autre du fichier. Rend la raison, si rien n'a été écrit.
export function changeMenuBar(path: string, active: unknown, home = homedir()): string | undefined {
  if (typeof active !== "boolean") return "nothing was written: whether the kitchen's state shows in the menu bar is true or false";
  const opened = reread(path, home);
  if ("refus" in opened) return opened.refus;
  const content = opened.contenu as { barreDeMenus?: boolean };
  if ((content.barreDeMenus ?? true) === active) return undefined;
  content.barreDeMenus = active;
  return rewrite(path, written(opened.contenu));
}

// Un dossier absent n'invalide pas le fichier : un disque débranché ne doit pas
// cacher les autres projets.
function refusalOfFolder(folder: string): string | undefined {
  try {
    return statSync(folder).isDirectory() ? undefined : `this is not a folder: ${folder}`;
  } catch {
    return `folder not found: ${folder}`;
  }
}
