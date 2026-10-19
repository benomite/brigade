// Dire à l'app où sont les projets : un seul fichier, hors du dépôt, un nom et
// un dossier par projet — et les box, déclarées une fois : une liste d'hôtes,
// chacun le nom par lequel le `ssh` du chef joint la box, rien d'autre. C'est tout
// ce qui se règle. Le chef l'écrit à la main, le second le lit : l'app n'y ajoute
// qu'un projet ou qu'un hôte, dans la même forme — n'en retire qu'un projet, et n'y change
// l'ordre des projets que lorsque le chef les range dans la barre. Elle y
// écrit aussi les couleurs d'un projet (couleurs.ts) : celles qui lui manquent, et celles
// que le chef choisit.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { ordinairesLus } from "./ordinaires.ts";
import { couleursLues, entieres, estCouleur, ROLES, tirer, type Couleurs, type Role } from "./couleurs.ts";

// Le modèle et l'effort du manager et du reviewer d'un projet.
export type CalibrageDuProjet = { manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string } };

// Où tourne le runtime d'un projet : l'hôte que `ssh` connaît, et rien d'autre.
// Ce qui s'y lance est le geste de la box, avec le `nom` du projet.
export type Box = { hote: string };
// Ce que l'app dit d'un projet qu'elle vient de désinstaller de sa box (retrait.ts) :
// la box qu'il avait, l'instant, et ce qui se lit à la place de ce qu'elle disait de lui.
export type Desinstalle = { hote: string; a: string; titre: string; lignes: string[] };
// `refus` : ce projet reste dans la barre, mais ne s'ouvre pas — et dit pourquoi.
// `box` : absente, l'app ne lit rien de ce projet.
// `desinstalle` : jamais lu du fichier — l'app l'a désinstallé de sa box, et le montre
// sans elle : plus rien n'y est lu ni écrit.
// `calibrage` : celui que le chef a posé en l'ajoutant depuis l'app — l'écran d'ajout le propose
// ensuite pour le projet suivant. Absent d'un projet écrit à la main : l'app n'en sait rien.
// `stations` : celles que ce poste joue pour le projet — des stations que sa box déclare
// `distante`, et qui viennent y tirer leur travail (runner.ts). Absente, il n'en joue aucune.
// `couleurs` : celles de son onglet et de son accent, telles que le fichier les écrit — une qui
// manque y est tirée, puis écrite (`colorerProjets`).
// `depot`, `base` : son dépôt GitHub et sa branche d'intégration, posés à son ajout depuis l'app
// (ajout.ts) — c'est d'eux que se confie sa cuisine à une station. Absents d'un projet écrit à la main.
export type Projet = { nom: string; dossier: string; depot?: string; base?: string; refus?: string; box?: Box; desinstalle?: Desinstalle; calibrage?: CalibrageDuProjet; stations?: string[]; couleurs?: Couleurs; ordinaires?: boolean; limiteCooks?: number };
// `refus` : le fichier entier n'a pas pu être lu — aucun projet, et la raison.
// `nonRelu` : il a changé depuis, et sa relecture a été refusée — les projets
// sont ceux d'avant, et la raison est celle du fichier tel qu'il est.
// `hotes` : les box que le fichier déclare, dans son ordre — absente, il n'en déclare aucune.
export type Configuration = { chemin: string; projets: Projet[]; hotes?: string[]; refus?: string; nonRelu?: string };
// Un projet tel qu'il s'écrit dans le fichier.
export type Declare = { nom: string; dossier: string; depot?: string; base?: string; hote?: string; calibrage?: CalibrageDuProjet };

// Rien ici ne se recopie tel quel : chaque valeur dit ce qui la remplace.
export const EXEMPLE = JSON.stringify(
  {
    projets: [{ nom: "<the project's name — that of its GitHub repository>", dossier: "<its folder on this workstation, absolute or starting with ~/>", depot: "<its GitHub repository, <owner>/<name>>", base: "<its integration branch>" }],
  },
  null,
  2,
);

// Un nom de station : `<machine>/<moteur>`, en minuscules, chiffres et tirets — la forme que la
// box réclame dans `BRIGADE_STATIONS`. Le poste ne lance qu'un moteur : `claude`.
const NOM_DE_STATION = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*\/[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;
export const MOTEUR = "claude";

export function cheminConfiguration(env: NodeJS.ProcessEnv = process.env, maison = homedir()): string {
  return env.BRIGADE_APP_CONFIG || join(maison, ".config", "brigade", "app.json");
}

export function lireConfiguration(chemin: string, maison = homedir()): Configuration {
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    const refus = (erreur as NodeJS.ErrnoException).code === "ENOENT" ? "this file does not exist" : `unreadable file: ${(erreur as Error).message}`;
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
    return refuse(`unreadable JSON: ${(erreur as Error).message}`);
  }
  const { projets: liste, hotes: declares } = (contenu ?? {}) as { projets?: unknown; hotes?: unknown };
  if (!Array.isArray(liste)) return refuse("“projets” must be a list");
  // Les box : rien que des noms. Un même nom écrit deux fois n'en fait qu'une.
  if (declares !== undefined && !Array.isArray(declares)) return refuse("“hotes” must be a list");
  const hotes: string[] = [];
  for (const [rang, hote] of (declares ?? []).entries()) {
    if (typeof hote !== "string" || hote.trim() === "") return refuse(`host #${rang + 1}: must be a non-empty string — the name your ssh uses to reach the box`);
    if (!hotes.includes(hote)) hotes.push(hote);
  }

  const projets: Projet[] = [];
  for (const [rang, declare] of liste.entries()) {
    const { nom, dossier, hote, commande } = (declare ?? {}) as { nom?: unknown; dossier?: unknown; hote?: unknown; commande?: unknown };
    if (typeof nom !== "string" || nom.trim() === "") return refuse(`project #${rang + 1}: “nom” is missing`);
    const lequel = `project #${rang + 1} (${nom})`;
    if (typeof dossier !== "string" || dossier === "") return refuse(`${lequel}: “dossier” is missing`);
    if (projets.some((projet) => projet.nom === nom)) return refuse(`two projects are named “${nom}”`);
    const absolu = dossier === "~" || dossier.startsWith("~/") ? join(maison, dossier.slice(1)) : dossier;
    if (!isAbsolute(absolu)) return refuse(`${lequel}: “dossier” must be an absolute path, or start with ~/`);
    // Le fichier d'avant dictait une ligne de commande : il le dit, plutôt que d'être lu à moitié.
    if (commande !== undefined) return refuse(`${lequel}: “commande” is no longer read — remove it: the app runs the box's action (\`ssh <hote> brigade ${nom} <commande>\`), “hote” is all it needs`);
    if (hote !== undefined && (typeof hote !== "string" || hote.trim() === "")) return refuse(`${lequel}: “hote” must be a non-empty string`);
    const refus = refusDuDossier(absolu);
    const calibrage = calibrageLu((declare as { calibrage?: unknown }).calibrage);
    const stations = stationsLues((declare as { stations?: unknown }).stations, hote !== undefined);
    if (typeof stations === "string") return refuse(`${lequel}: ${stations}`);
    const couleurs = couleursLues((declare as { couleurs?: unknown }).couleurs);
    if (typeof couleurs === "string") return refuse(`${lequel}: ${couleurs}`);
    const ordinaires = ordinairesLus(declare as { ordinaires?: unknown; limiteCooks?: unknown });
    if (typeof ordinaires === "string") return refuse(`${lequel}: ${ordinaires}`);
    const { depot, base } = declare as { depot?: unknown; base?: unknown };
    if (depot !== undefined && (typeof depot !== "string" || depot.trim() === "")) return refuse(`${lequel}: “depot” must be a non-empty string — its GitHub repository, \`<owner>/<name>\``);
    if (base !== undefined && (typeof base !== "string" || base.trim() === "")) return refuse(`${lequel}: “base” must be a non-empty string — its integration branch`);
    projets.push({ nom, dossier: absolu, ...(depot === undefined ? {} : { depot }), ...(base === undefined ? {} : { base }), ...ordinaires, ...(calibrage === undefined ? {} : { calibrage }), ...(refus === undefined ? {} : { refus }), ...(hote === undefined ? {} : { box: { hote } }), ...(stations === undefined ? {} : { stations }), ...(couleurs === undefined ? {} : { couleurs }) });
  }
  return { chemin, projets, ...(declares === undefined ? {} : { hotes }) };
}

// Le calibrage écrit d'un projet, s'il est entier — sinon l'app n'en lit rien, et ne le refuse pas.
function calibrageLu(lu: unknown): CalibrageDuProjet | undefined {
  const texte = (valeur: unknown) => (typeof valeur === "string" && valeur.trim() !== "" ? valeur : undefined);
  const role = (valeur: unknown) => {
    const { modele, effort } = (valeur ?? {}) as { modele?: unknown; effort?: unknown };
    const [m, e] = [texte(modele), texte(effort)];
    return m === undefined || e === undefined ? undefined : { modele: m, effort: e };
  };
  const { manager, reviewer } = (lu ?? {}) as { manager?: unknown; reviewer?: unknown };
  const [gestionnaire, relecteur] = [role(manager), role(reviewer)];
  return gestionnaire === undefined || relecteur === undefined ? undefined : { manager: gestionnaire, reviewer: relecteur };
}

// Les stations que ce poste joue pour un projet, telles qu'elles sont écrites — ou la raison
// pour laquelle elles ne se lisent pas. Une station se joue auprès d'une box : sans « hote »,
// il n'y a personne chez qui tirer. Un autre moteur que `claude` ne se lance pas d'ici.
function stationsLues(lu: unknown, servi: boolean): string[] | string | undefined {
  if (lu === undefined) return undefined;
  if (!Array.isArray(lu)) return "“stations” must be a list — the stations this workstation plays for the project (mac/claude)";
  const stations: string[] = [];
  for (const nom of lu) {
    if (typeof nom !== "string" || !NOM_DE_STATION.test(nom)) return `“stations”: “${String(nom)}” is not in the form \`<machine>/<engine>\`, in lowercase letters, digits and dashes (mac/claude) — the name under which the box declares it \`distante\``;
    if (nom.slice(nom.indexOf("/") + 1) !== MOTEUR) return `“stations”: \`${nom}\` names an engine this workstation does not run — it only runs \`${MOTEUR}\` (mac/${MOTEUR})`;
    if (stations.includes(nom)) return `“stations”: \`${nom}\` is written twice`;
    stations.push(nom);
  }
  if (stations.length > 0 && !servi) return "“stations” without “hote”: a station pulls its work from the project's box — it needs the name your ssh uses to reach it";
  return stations.length === 0 ? undefined : stations;
}

// Le fichier qui manque est créé — une liste vide, et son dossier avec. Un
// fichier déjà là n'est jamais réécrit ici. Rend la raison, s'il n'a pas pu l'être.
export function creerConfiguration(chemin: string): string | undefined {
  const refus = (erreur: unknown) => `this file could not be created: ${(erreur as Error).message}`;
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
    if (!existsSync(chemin)) return refus(new Error("it is a link to a file that does not exist"));
  }
  return undefined;
}

const ecrit = (contenu: unknown): string => `${JSON.stringify(contenu, null, 2)}\n`;

type Ouvert = { contenu: { projets: unknown[]; hotes?: unknown[] }; lue: Configuration } | { refus: string };

// Le fichier tel qu'il est, pour y ajouter : créé s'il manque, et compris — ou
// la raison. L'app n'écrit pas dans un fichier qu'elle n'a pas compris.
function ouvrir(chemin: string, maison: string): Ouvert {
  const cree = creerConfiguration(chemin);
  return cree === undefined ? relu(chemin, maison) : { refus: cree };
}

// Le même, sans le créer : on ne retire rien d'un fichier qui n'existe pas.
function relu(chemin: string, maison: string): Ouvert {
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    return { refus: `unreadable file: ${(erreur as Error).message}` };
  }
  const lue = comprendre(chemin, texte, maison);
  if (lue.refus !== undefined) return { refus: `the app does not write into a file it has not understood — ${lue.refus}` };
  return { contenu: JSON.parse(texte) as { projets: unknown[]; hotes?: unknown[] }, lue };
}

function reecrire(chemin: string, neuf: string): string | undefined {
  try {
    writeFileSync(chemin, neuf);
  } catch (erreur) {
    return `this file could not be written: ${(erreur as Error).message}`;
  }
  return undefined;
}

// Le fichier tel qu'il serait avec ce projet à la suite des autres — ou la raison
// pour laquelle il n'y entre pas. Les règles sont celles de la lecture : le fichier
// n'est écrit que s'il était compris avant, et s'il l'est encore après.
function avecProjet(chemin: string, projet: Declare, maison: string): { neuf: string } | { refus: string } {
  const ouvert = ouvrir(chemin, maison);
  if ("refus" in ouvert) return ouvert;
  const hote = projet.hote?.trim();
  ouvert.contenu.projets.push({ nom: projet.nom.trim(), dossier: projet.dossier, ...(projet.depot ? { depot: projet.depot } : {}), ...(projet.base ? { base: projet.base } : {}), ...(hote ? { hote } : {}), ...(projet.calibrage === undefined ? {} : { calibrage: projet.calibrage }) });
  const neuf = ecrit(ouvert.contenu);
  const comprise = comprendre(chemin, neuf, maison);
  // Un projet qui ne s'ouvrirait pas n'est pas ajouté : le chef est là pour en choisir un autre.
  const refus = comprise.refus ?? comprise.projets.at(-1)?.refus;
  return refus === undefined ? { neuf } : { refus };
}

// Ajoute un projet à la suite des autres, et rend la raison s'il ne l'a pas été.
// Ce que l'app n'y lit pas y reste.
export function ajouterProjet(chemin: string, projet: Declare, maison = homedir()): string | undefined {
  const avec = avecProjet(chemin, projet, maison);
  return "refus" in avec ? avec.refus : reecrire(chemin, avec.neuf);
}

// Retire un projet du fichier : sa ligne, et elle seule — ni les autres projets, ni
// les box déclarées, ni ce que l'app n'y lit pas. Rien n'est joint : la box du projet
// n'en sait rien. Rend la raison, s'il n'a pas été retiré.
export function retirerProjet(chemin: string, nom: string, maison = homedir()): string | undefined {
  const ouvert = relu(chemin, maison);
  if ("refus" in ouvert) return ouvert.refus;
  const { projets } = ouvert.contenu;
  const rang = projets.findIndex((declare) => (declare as { nom?: unknown } | null)?.nom === nom);
  if (rang === -1) return `“${nom}” is not in this file: nothing was changed there`;
  projets.splice(rang, 1);
  return reecrire(chemin, ecrit(ouvert.contenu));
}

// Range un projet à une autre place de la liste — `rang`, compté depuis zéro, est celle qu'il
// prend : les autres se décalent. Chaque ligne reste entière, et rien d'autre du fichier ne bouge.
// C'est l'ordre du fichier que la barre et « Tous les projets » montrent : un projet ajouté
// ensuite arrive à sa fin. Lâché à sa propre place, rien n'est écrit. Rend la raison, s'il n'a pas été rangé.
export function rangerProjet(chemin: string, nom: string, rang: number, maison = homedir()): string | undefined {
  const ouvert = relu(chemin, maison);
  if ("refus" in ouvert) return ouvert.refus;
  const { projets } = ouvert.contenu;
  const avant = projets.findIndex((declare) => (declare as { nom?: unknown } | null)?.nom === nom);
  if (avant === -1) return `“${nom}” is not in this file: nothing was changed there`;
  if (!Number.isInteger(rang) || rang < 0 || rang >= projets.length) return `there is no place #${rang + 1} among ${projets.length} projects: nothing was changed there`;
  if (rang === avant) return undefined;
  projets.splice(rang, 0, ...projets.splice(avant, 1));
  return reecrire(chemin, ecrit(ouvert.contenu));
}

// Les couleurs qui manquent aux projets du fichier — à un projet qui vient d'y entrer, ou qui y
// était avant qu'elles existent : chacune tirée parmi celles qu'aucun autre projet ne porte dans
// ce rôle, et écrite dans « couleurs ». Celles qui y sont ne changent pas, et rien n'est écrit
// s'il n'en manque aucune. Rend la raison, si elles ne l'ont pas été.
export function colorerProjets(chemin: string, maison = homedir(), hasard: () => number = Math.random): string | undefined {
  const ouvert = relu(chemin, maison);
  if ("refus" in ouvert) return ouvert.refus;
  const tenues: Couleurs[] = ouvert.lue.projets.map(({ couleurs }) => ({ ...couleurs }));
  if (tenues.every(entieres)) return undefined;
  // Le fichier a été compris : ses projets sont ceux qui ont été lus, dans le même ordre.
  for (const [rang, couleurs] of tenues.entries()) {
    if (entieres(couleurs)) continue;
    for (const role of ROLES) couleurs[role] ??= tirer(tenues.map((autre) => (autre === couleurs ? undefined : autre[role])), hasard);
    const declare = ouvert.contenu.projets[rang] as { couleurs?: Couleurs };
    declare.couleurs = { ...declare.couleurs, ...couleurs };
  }
  return reecrire(chemin, ecrit(ouvert.contenu));
}

// Change une couleur d'un projet : celle de son onglet, ou celle de son accent — rien d'autre du
// fichier. Rend la raison, si elle ne l'a pas été.
export function changerCouleur(chemin: string, nom: string, role: Role, couleur: string, maison = homedir()): string | undefined {
  if (!estCouleur(couleur)) return `“${couleur}” is not a color written as \`#rrggbb\``;
  const ouvert = relu(chemin, maison);
  if ("refus" in ouvert) return ouvert.refus;
  const declare = ouvert.contenu.projets.find((candidat) => (candidat as { nom?: unknown } | null)?.nom === nom) as { couleurs?: Couleurs } | undefined;
  if (declare === undefined) return `“${nom}” is not in this file: nothing was changed there`;
  declare.couleurs = { ...declare.couleurs, [role]: couleur.toLowerCase() };
  return reecrire(chemin, ecrit(ouvert.contenu));
}

// Règle, pour un projet, si le Mac prend aussi les tickets ordinaires et combien de cooks il
// fait tourner (`null` : aucune limite écrite) — rien d'autre du fichier. Rend la raison, si
// rien n'a été écrit.
export function changerOrdinaires(chemin: string, nom: string, actif: unknown, limite: unknown, maison = homedir()): string | undefined {
  if (typeof actif !== "boolean") return "nothing was written: whether the Mac takes the ordinary tickets is true or false";
  if (limite !== null && (!Number.isInteger(limite) || (limite as number) < 1)) return "nothing was written: the Mac's cook limit is a whole number, one or more — or empty, for none";
  const ouvert = relu(chemin, maison);
  if ("refus" in ouvert) return ouvert.refus;
  const declare = ouvert.contenu.projets.find((candidat) => (candidat as { nom?: unknown } | null)?.nom === nom) as { ordinaires?: boolean; limiteCooks?: number } | undefined;
  if (declare === undefined) return `“${nom}” is not in this file: nothing was changed there`;
  declare.ordinaires = actif;
  if (limite === null) delete declare.limiteCooks;
  else declare.limiteCooks = limite as number;
  return reecrire(chemin, ecrit(ouvert.contenu));
}

// Un dossier absent n'invalide pas le fichier : un disque débranché ne doit pas
// cacher les autres projets.
function refusDuDossier(dossier: string): string | undefined {
  try {
    return statSync(dossier).isDirectory() ? undefined : `this is not a folder: ${dossier}`;
  } catch {
    return `folder not found: ${dossier}`;
  }
}
