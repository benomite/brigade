// Dire à l'app où sont les projets : un seul fichier, hors du dépôt, un nom et
// un dossier par projet — et les box, déclarées une fois : une liste d'hôtes,
// chacun le nom par lequel le `ssh` du chef joint la box, rien d'autre. C'est tout
// ce qui se règle. Le chef l'écrit à la main, le second le lit : l'app n'y ajoute
// qu'un projet ou qu'un hôte, dans la même forme — et n'en retire qu'un projet.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

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
export type Projet = { nom: string; dossier: string; refus?: string; box?: Box; desinstalle?: Desinstalle; calibrage?: CalibrageDuProjet; stations?: string[] };
// `refus` : le fichier entier n'a pas pu être lu — aucun projet, et la raison.
// `nonRelu` : il a changé depuis, et sa relecture a été refusée — les projets
// sont ceux d'avant, et la raison est celle du fichier tel qu'il est.
// `hotes` : les box que le fichier déclare, dans son ordre — absente, il n'en déclare aucune.
export type Configuration = { chemin: string; projets: Projet[]; hotes?: string[]; refus?: string; nonRelu?: string };
// Un projet tel qu'il s'écrit dans le fichier.
export type Declare = { nom: string; dossier: string; hote?: string; calibrage?: CalibrageDuProjet };

// Rien ici ne se recopie tel quel : chaque valeur dit ce qui la remplace.
export const EXEMPLE = JSON.stringify(
  {
    hotes: ["<le nom par lequel ton ssh joint ta box — une ligne par box>"],
    projets: [{ nom: "<le nom du projet sur ta box>", dossier: "<son dossier sur ce poste, absolu ou en ~/>", hote: "<facultatif : le nom par lequel ton ssh joint ta box>" }],
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
  const { projets: liste, hotes: declares } = (contenu ?? {}) as { projets?: unknown; hotes?: unknown };
  if (!Array.isArray(liste)) return refuse("« projets » doit être une liste");
  // Les box : rien que des noms. Un même nom écrit deux fois n'en fait qu'une.
  if (declares !== undefined && !Array.isArray(declares)) return refuse("« hotes » doit être une liste");
  const hotes: string[] = [];
  for (const [rang, hote] of (declares ?? []).entries()) {
    if (typeof hote !== "string" || hote.trim() === "") return refuse(`hôte n° ${rang + 1} : doit être un texte non vide — le nom par lequel ton ssh joint la box`);
    if (!hotes.includes(hote)) hotes.push(hote);
  }

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
    if (commande !== undefined) return refuse(`${lequel} : « commande » n'est plus lu — retire-le : l'app lance le geste de la box (\`ssh <hote> brigade ${nom} <commande>\`), « hote » lui suffit`);
    if (hote !== undefined && (typeof hote !== "string" || hote.trim() === "")) return refuse(`${lequel} : « hote » doit être un texte non vide`);
    const refus = refusDuDossier(absolu);
    const calibrage = calibrageLu((declare as { calibrage?: unknown }).calibrage);
    const stations = stationsLues((declare as { stations?: unknown }).stations, hote !== undefined);
    if (typeof stations === "string") return refuse(`${lequel} : ${stations}`);
    projets.push({ nom, dossier: absolu, ...(calibrage === undefined ? {} : { calibrage }), ...(refus === undefined ? {} : { refus }), ...(hote === undefined ? {} : { box: { hote } }), ...(stations === undefined ? {} : { stations }) });
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
  if (!Array.isArray(lu)) return "« stations » doit être une liste — les stations que ce poste joue pour le projet (mac/claude)";
  const stations: string[] = [];
  for (const nom of lu) {
    if (typeof nom !== "string" || !NOM_DE_STATION.test(nom)) return `« stations » : « ${String(nom)} » n'est pas de la forme \`<machine>/<moteur>\`, en minuscules, chiffres et tirets (mac/claude) — le nom sous lequel la box la déclare \`distante\``;
    if (nom.slice(nom.indexOf("/") + 1) !== MOTEUR) return `« stations » : \`${nom}\` nomme un moteur que ce poste ne lance pas — il ne lance que \`${MOTEUR}\` (mac/${MOTEUR})`;
    if (stations.includes(nom)) return `« stations » : \`${nom}\` est écrite deux fois`;
    stations.push(nom);
  }
  if (stations.length > 0 && !servi) return "« stations » sans « hote » : une station tire son travail de la box du projet — il faut le nom par lequel ton ssh la joint";
  return stations.length === 0 ? undefined : stations;
}

// Les box que l'écran d'ajout propose : celles que le fichier déclare, dans son
// ordre, puis celles qu'il ne nomme que par un projet — un fichier d'avant la
// liste n'a rien à y récrire.
export function boxes(configuration: Configuration): string[] {
  return [...new Set([...(configuration.hotes ?? []), ...configuration.projets.flatMap(({ box }) => (box === undefined ? [] : [box.hote]))])];
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
    return { refus: `fichier illisible : ${(erreur as Error).message}` };
  }
  const lue = comprendre(chemin, texte, maison);
  if (lue.refus !== undefined) return { refus: `l'app n'écrit pas dans un fichier qu'elle n'a pas compris — ${lue.refus}` };
  return { contenu: JSON.parse(texte) as { projets: unknown[]; hotes?: unknown[] }, lue };
}

function reecrire(chemin: string, neuf: string): string | undefined {
  try {
    writeFileSync(chemin, neuf);
  } catch (erreur) {
    return `ce fichier n'a pas pu être écrit : ${(erreur as Error).message}`;
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
  ouvert.contenu.projets.push({ nom: projet.nom.trim(), dossier: projet.dossier, ...(hote ? { hote } : {}), ...(projet.calibrage === undefined ? {} : { calibrage: projet.calibrage }) });
  const neuf = ecrit(ouvert.contenu);
  const comprise = comprendre(chemin, neuf, maison);
  // Un projet qui ne s'ouvrirait pas n'est pas ajouté : le chef est là pour en choisir un autre.
  const refus = comprise.refus ?? comprise.projets.at(-1)?.refus;
  return refus === undefined ? { neuf } : { refus };
}

// Pourquoi ce projet ne serait pas ajouté — sans rien y écrire : ce qui se sait
// d'ici se sait avant d'installer quoi que ce soit sur une box.
export function refusDAjout(chemin: string, projet: Declare, maison = homedir()): string | undefined {
  const avec = avecProjet(chemin, projet, maison);
  return "refus" in avec ? avec.refus : undefined;
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
  if (rang === -1) return `« ${nom} » n'est pas dans ce fichier : rien n'y est changé`;
  projets.splice(rang, 1);
  return reecrire(chemin, ecrit(ouvert.contenu));
}

// Déclare une box : son nom, à la suite des autres dans « hotes ». Rend la raison
// si elle ne l'a pas été. Rien n'est joint : c'est un nom, que `ssh` lira.
export function ajouterHote(chemin: string, hote: string, maison = homedir()): string | undefined {
  const nom = hote.trim();
  if (nom === "") return "il manque le nom de la box : ce que tu tapes après `ssh`";
  if (/\s/.test(nom)) return `« ${nom} » contient un blanc : une box se nomme d'un seul mot, celui que tu tapes après \`ssh\``;
  if (nom.startsWith("-")) return `« ${nom} » commence par un tiret : \`ssh\` le lirait comme une option`;
  const ouvert = ouvrir(chemin, maison);
  if ("refus" in ouvert) return ouvert.refus;
  if (ouvert.lue.hotes?.includes(nom)) return `la box « ${nom} » est déjà déclarée`;
  ouvert.contenu.hotes = [...(ouvert.contenu.hotes ?? []), nom];
  return reecrire(chemin, ecrit(ouvert.contenu));
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
