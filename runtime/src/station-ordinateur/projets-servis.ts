// Les projets qu'une station sert : une seule liste, son fichier de
// configuration (`<BRIGADE_STATION_DIR>/projets`, `station/configuration.ts`),
// une ligne par projet (#3402). Ses cuisines la lisent (`station/station.ts`),
// le service GitHub seul de l'ordinateur aussi (`servir.ts`), et l'app la lit et
// l'écrit par cette interface, depuis l'onglet Stations d'un projet.
//
// Il y en avait deux : ce fichier, et `projets-servis.json` (#2357), qu'aucune
// cuisine ne lisait ni aucune présence ne publiait — l'app disait servi un
// projet que la station ne publiait pas, et retirer l'un laissait l'autre le
// servir. `projets-servis.json` n'est plus qu'une ancienne liste : ses dépôts
// passent dans le fichier (`migrerLAncienneListe`), puis il est mis de côté.
//
// L'app ajoute une ligne écrite comme à la main (`<nom> <owner>/<repo>`), hors
// du bloc que la station réécrit seule d'après sa sélection (`projets/bloc.ts`) ;
// elle retire la ligne du dépôt, dans le bloc ou hors de lui. Chaque écriture
// remplace le fichier d'un coup (écrit à côté, puis renommé) : une lecture
// concurrente lit l'ancienne liste ou la nouvelle, jamais une moitié.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nomDuDepot } from "../projets/ajout-de-station.ts";
import { DEBUT } from "../projets/bloc.ts";
import { CONFIGURATION, lireConfiguration } from "../station/configuration.ts";

// L'ancienne liste, que plus rien ne lit une fois migrée.
export const ANCIENNE_LISTE = "projets-servis.json";
// Où elle est mise de côté, une fois ses dépôts passés dans la configuration.
export const ANCIENNE_LISTE_MIGREE = `${ANCIENNE_LISTE}.migrated`;
const FORMAT = 1;
const DEPOT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// Un fichier qui ne se lit pas : la station ne devine rien, n'écrit rien, et le dit.
export class ProjetsServisIllisibles extends Error {
  constructor(fichier: string, pourquoi: string) {
    super(`${fichier} cannot be read — ${pourquoi}: this station's served projects stay as they are until it is fixed`);
    this.name = "ProjetsServisIllisibles";
  }
}

// Un dépôt que la liste refuse : il ne donnerait ni clone ni nom de projet.
export class DepotRefuse extends Error {
  constructor(depot: string) {
    super(`${JSON.stringify(depot)} is not a GitHub repository this station can serve — expected <owner>/<repo>, whose name gives a project name (lower case, digits and dashes)`);
    this.name = "DepotRefuse";
  }
}

// Un dépôt dont le nom de projet est déjà celui d'un autre projet de la station :
// deux lignes du même nom, la seconde ne serait pas servie. Dit en une phrase.
export class NomDejaPris extends DepotRefuse {
  constructor(depot: string, nom: string, autre: string) {
    super(depot);
    this.message = `this station already serves a project named ${nom}, from ${autre}: ${depot} would take the same name`;
    this.name = "NomDejaPris";
  }
}

export const cheminDesProjetsServis = (racine: string) => join(racine, CONFIGURATION);
export const cheminDeLAncienneListe = (racine: string) => join(racine, ANCIENNE_LISTE);

const minuscules = (depot: string) => depot.toLowerCase();

// `<owner>/<repo>`, qu'il soit donné ainsi ou par son adresse sur github.com.
const normaliser = (brut: string) => brut.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "").replace(/\.git$/, "");

// Le dépôt tel que la liste le garde, ou une erreur `DepotRefuse`.
export function depotServable(brut: string): string {
  const depot = normaliser(brut);
  if (!DEPOT.test(depot) || nomDuDepot(depot) === null) throw new DepotRefuse(brut);
  return depot;
}

// Le texte de la configuration : vide si elle n'existe pas encore ; illisible, une erreur.
function lireTexte(racine: string): string {
  const fichier = cheminDesProjetsServis(racine);
  try {
    return readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw new ProjetsServisIllisibles(fichier, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

function ecrireTexte(racine: string, texte: string): void {
  mkdirSync(racine, { recursive: true });
  const fichier = cheminDesProjetsServis(racine);
  const aCote = `${fichier}.${process.pid}.ecriture`;
  writeFileSync(aCote, texte);
  renameSync(aCote, fichier);
}

// Les projets que le texte sert : nom et dépôt, dans l'ordre de leurs lignes.
const projetsDe = (texte: string) => lireConfiguration(texte).projets.map(({ nom, depot }) => ({ nom, depot }));

// Le texte, une ligne écrite comme à la main ajoutée hors du bloc de la station
// — juste avant lui, s'il y en a un.
function avecLaLigne(texte: string, ligne: string): string {
  const lignes = texte === "" ? [] : texte.replace(/\n*$/, "").split("\n");
  const bloc = lignes.indexOf(DEBUT);
  if (bloc === -1) return `${[...lignes, ligne].join("\n")}\n`;
  let ou = bloc;
  while (ou > 0 && lignes[ou - 1]?.trim() === "") ou--;
  return `${[...lignes.slice(0, ou), ligne, ...lignes.slice(ou)].join("\n")}\n`;
}

// Ajoute le dépôt au texte, s'il n'y est pas ; ou dit pourquoi il ne le peut pas.
function ajouterAuTexte(texte: string, depot: string): string {
  const projets = projetsDe(texte);
  if (projets.some((projet) => minuscules(projet.depot) === minuscules(depot))) return texte;
  const nom = nomDuDepot(depot) as string;
  const pris = projets.find((projet) => projet.nom === nom);
  if (pris !== undefined) throw new NomDejaPris(depot, nom, pris.depot);
  return avecLaLigne(texte, `${nom} ${depot}`);
}

// Les dépôts de l'ancienne liste. Lève `ProjetsServisIllisibles` sur un fichier
// qui n'est pas la liste : il n'est alors ni migré ni mis de côté.
function lireLAncienneListe(racine: string): string[] {
  const fichier = cheminDeLAncienneListe(racine);
  let lu: { brigade?: unknown; format?: unknown; depots?: unknown };
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8")) as typeof lu;
  } catch (erreur) {
    throw new ProjetsServisIllisibles(fichier, erreur instanceof Error ? erreur.message : String(erreur));
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "projets-servis") throw new ProjetsServisIllisibles(fichier, "it is not a list of served projects");
  if (typeof lu.format !== "number" || lu.format > FORMAT) throw new ProjetsServisIllisibles(fichier, `format ${String(lu.format)} is not one this station reads`);
  if (!Array.isArray(lu.depots) || !lu.depots.every((depot): depot is string => typeof depot === "string")) throw new ProjetsServisIllisibles(fichier, "its `depots` is not a list of repositories");
  return lu.depots;
}

// Ce que la migration a fait : les dépôts passés dans la configuration, et ceux
// qui n'ont pas pu y entrer, chacun avec sa raison.
export type Migration = { migres: string[]; ecartes: Array<{ depot: string; pourquoi: string }> };

// Passe les dépôts de l'ancienne liste dans la configuration — ceux qui y sont
// déjà n'y entrent pas deux fois —, puis la met de côté : plus rien ne la lit.
// Sans ancienne liste, rien ne change. Une ancienne liste ou une configuration
// illisible lève `ProjetsServisIllisibles`, et rien n'est écrit.
export function migrerLAncienneListe(racine: string): Migration {
  const migration: Migration = { migres: [], ecartes: [] };
  if (!existsSync(cheminDeLAncienneListe(racine))) return migration;
  const anciens = lireLAncienneListe(racine);
  const avant = lireTexte(racine);
  let texte = avant;
  for (const brut of anciens) {
    try {
      const depot = depotServable(brut);
      const suivant = ajouterAuTexte(texte, depot);
      if (suivant !== texte) migration.migres.push(depot);
      texte = suivant;
    } catch (erreur) {
      migration.ecartes.push({ depot: brut, pourquoi: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  }
  if (texte !== avant) ecrireTexte(racine, texte);
  renameSync(cheminDeLAncienneListe(racine), join(racine, ANCIENNE_LISTE_MIGREE));
  return migration;
}

// La liste, dans l'ordre des lignes de la configuration : l'ancienne liste y
// passe d'abord. Lève `ProjetsServisIllisibles` sur un fichier qui ne se lit pas.
export function lireProjetsServis(racine: string): string[] {
  migrerLAncienneListe(racine);
  return projetsDe(lireTexte(racine)).map(({ depot }) => depot);
}

// Ajoute un dépôt à la liste, s'il n'y est pas déjà (sans égard à la casse) :
// sa ligne, `<nom> <owner>/<repo>`. Rend la liste écrite.
export function ajouterProjetServi(racine: string, brut: string): string[] {
  const depot = depotServable(brut);
  migrerLAncienneListe(racine);
  const avant = lireTexte(racine);
  const texte = ajouterAuTexte(avant, depot);
  if (texte !== avant) ecrireTexte(racine, texte);
  return projetsDe(texte).map((projet) => projet.depot);
}

// Retire un dépôt de la liste (sans égard à la casse) : chacune de ses lignes,
// écrite à la main ou dans le bloc de la station. Rend la liste écrite.
export function retirerProjetServi(racine: string, brut: string): string[] {
  const depot = minuscules(normaliser(brut));
  migrerLAncienneListe(racine);
  const avant = lireTexte(racine);
  const sienne = (ligne: string) => {
    const champs = ligne.trim().split(/\s+/);
    return !champs[0]?.startsWith("#") && champs[1] !== undefined && minuscules(champs[1]) === depot;
  };
  const texte = avant
    .split("\n")
    .filter((ligne) => !sienne(ligne))
    .join("\n");
  if (texte !== avant) ecrireTexte(racine, texte);
  return projetsDe(texte).map((projet) => projet.depot);
}
