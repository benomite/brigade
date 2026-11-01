// Le nom de la station : tiré du nom de la machine à son premier démarrage,
// puis retenu dans son répertoire (`nom-de-la-station.json`) et jamais
// recalculé. macOS change le nom de la machine de lui-même — un numéro après
// un conflit, un suffixe `.home` ou `.local` — : la même machine reste la même
// station. Seul un renommage explicite le change (`renommer.ts`) ; la station
// renommée garde ses gists, et remplace donc l'ancienne au lieu de s'y ajouter.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { identiteDeLaStation } from "../appairage/presence.ts";

export const FICHIER_NOM = "nom-de-la-station.json";

// Minuscules, chiffres et tirets, comme une station déclarée le porte.
const FORME = /^[a-z0-9][a-z0-9-]*$/;

// Un nom écrit par le chef : minuscules, et tout le reste en tirets.
export const normaliserNom = (brut: string): string =>
  brut
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Le nom d'une machine, tel qu'une station le porte : son premier label (sans
// `.home` ni `.local`), normalisé, sans le numéro que macOS ajoute après un
// conflit (`macbook-air-de-benoit4`, `macbook-air-de-benoit-2`). Un nom fait
// de chiffres seuls les garde.
export function nomDeLHote(hote: string): string {
  const nom = normaliserNom(hote.split(".")[0] ?? "");
  const sansNumero = nom.replace(/-?\d+$/, "").replace(/-+$/, "");
  return sansNumero || nom || "station";
}

// Le nom retenu dans le répertoire de la station, ou rien : absent, illisible
// ou mal formé, il n'y en a pas.
export function lireNomRetenu(racine: string): string | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, FICHIER_NOM), "utf8")) as { nom?: unknown };
    return typeof lu.nom === "string" && FORME.test(lu.nom) ? lu.nom : null;
  } catch {
    return null;
  }
}

function retenir(racine: string, nom: string): void {
  mkdirSync(racine, { recursive: true });
  const fichier = join(racine, FICHIER_NOM);
  const provisoire = `${fichier}.${process.pid}`;
  writeFileSync(provisoire, `${JSON.stringify({ nom }, null, 2)}\n`);
  renameSync(provisoire, fichier);
}

// Le nom sous lequel la station se déclare. `BRIGADE_STATION_NOM`, s'il est
// défini, prime, sans rien écrire ; sinon le nom retenu ; à défaut — premier
// démarrage —, celui de la machine, retenu pour la suite.
export function nomDeLaStation(racine: string, env: Record<string, string | undefined>, hote: () => string = hostname): string {
  if (env.BRIGADE_STATION_NOM) return env.BRIGADE_STATION_NOM;
  const retenu = lireNomRetenu(racine);
  if (retenu !== null) return retenu;
  const nom = nomDeLHote(hote());
  retenir(racine, nom);
  return nom;
}

// Le nom qu'une cuisine de la station lui connaît, sans rien écrire : celui
// que `main.ts` a retenu avant d'ouvrir ses projets. Hors d'une station — rien
// de retenu —, celui de la machine, comme avant.
export const nomDeclare = (env: Record<string, string | undefined>): string =>
  env.BRIGADE_STATION_NOM || (env.BRIGADE_STATION_DIR ? lireNomRetenu(env.BRIGADE_STATION_DIR) : null) || identiteDeLaStation(env).nom;

// Renomme la station : le nouveau nom remplace le retenu, et c'est lui qu'elle
// déclare à son prochain démarrage. Rend l'ancien (ou rien, s'il n'y en avait
// pas) ; refuse un nom qui, normalisé, ne dit plus rien.
export function renommerLaStation(racine: string, brut: string): { ancien: string | null; nouveau: string } {
  const nouveau = normaliserNom(brut);
  if (!FORME.test(nouveau)) throw new Error(`nom de station invalide : ${JSON.stringify(brut)} — attendu des lettres, des chiffres ou des tirets`);
  const ancien = lireNomRetenu(racine);
  retenir(racine, nouveau);
  return { ancien, nouveau };
}
