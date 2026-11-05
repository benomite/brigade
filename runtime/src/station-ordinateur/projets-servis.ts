// Les projets que la station d'un ordinateur sert elle-même, sur GitHub seul
// (#2357, épique #2356) : une liste de dépôts (`<owner>/<repo>`) tenue dans son
// état local, `<BRIGADE_STATION_DIR>/projets-servis.json`. Le sélecteur de
// l'app l'écrira par cette interface ; la commande `cli.ts` la lit et l'écrit.
//
//   { "brigade": "projets-servis", "format": 1, "depots": ["acme/shop"] }
//
// Une installation neuve n'a pas le fichier : la liste est vide, et la station
// ne sert rien. Chaque écriture remplace le fichier d'un coup (écrit à côté,
// puis renommé) : une lecture concurrente lit l'ancienne liste ou la nouvelle,
// jamais une moitié. La liste survit donc au redémarrage de la station.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nomDuDepot } from "../projets/ajout-de-station.ts";

export const FICHIER_DES_PROJETS_SERVIS = "projets-servis.json";
const FORMAT = 1;
const DEPOT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// Un fichier qui ne se lit pas : la station ne devine rien, elle ne sert rien,
// et le dit.
export class ProjetsServisIllisibles extends Error {
  constructor(fichier: string, pourquoi: string) {
    super(`${fichier} cannot be read — ${pourquoi}: this station serves no project until it is fixed or removed`);
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

export const cheminDesProjetsServis = (racine: string) => join(racine, FICHIER_DES_PROJETS_SERVIS);

const minuscules = (depot: string) => depot.toLowerCase();

// `<owner>/<repo>`, qu'il soit donné ainsi ou par son adresse sur github.com.
const normaliser = (brut: string) => brut.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "").replace(/\.git$/, "");

// Le dépôt tel que la liste le garde, ou une erreur `DepotRefuse`.
export function depotServable(brut: string): string {
  const depot = normaliser(brut);
  if (!DEPOT.test(depot) || nomDuDepot(depot) === null) throw new DepotRefuse(brut);
  return depot;
}

// La liste, dans l'ordre où les dépôts y sont entrés. Lève
// `ProjetsServisIllisibles` sur un fichier qui n'est pas la liste.
export function lireProjetsServis(racine: string): string[] {
  const fichier = cheminDesProjetsServis(racine);
  if (!existsSync(fichier)) return [];
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

function ecrire(racine: string, depots: readonly string[]): void {
  mkdirSync(racine, { recursive: true });
  const fichier = cheminDesProjetsServis(racine);
  const aCote = `${fichier}.${process.pid}.ecriture`;
  writeFileSync(aCote, `${JSON.stringify({ brigade: "projets-servis", format: FORMAT, depots }, null, 2)}\n`);
  renameSync(aCote, fichier);
}

// Ajoute un dépôt à la liste, s'il n'y est pas déjà (sans égard à la casse).
// Rend la liste écrite.
export function ajouterProjetServi(racine: string, brut: string): string[] {
  const depot = depotServable(brut);
  const depots = lireProjetsServis(racine);
  if (depots.some((deja) => minuscules(deja) === minuscules(depot))) return depots;
  const suivants = [...depots, depot];
  ecrire(racine, suivants);
  return suivants;
}

// Retire un dépôt de la liste (sans égard à la casse). Rend la liste écrite.
export function retirerProjetServi(racine: string, brut: string): string[] {
  const depot = minuscules(normaliser(brut));
  const depots = lireProjetsServis(racine);
  const suivants = depots.filter((deja) => minuscules(deja) !== depot);
  if (suivants.length !== depots.length) ecrire(racine, suivants);
  return suivants;
}
