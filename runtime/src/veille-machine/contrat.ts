// Garder le Mac éveillé tant qu'un cook cuit (#3642, épique #3641) : ce que la station et l'app se partagent, deux
// fichiers sous le répertoire de la station (`BRIGADE_STATION_DIR`), à côté de ses autres réglages de cet ordinateur.
//
// - **Le réglage**, `veille-machine.json` : `{ "garderEveille": false }`. Écrit par l'icône de fond de l'app (le menu de
//   la station, « Keep this computer awake while cooking »), relu par la station chaque seconde (`veille.ts`). Absent, il
//   est allumé : c'est le défaut que le ticket fixe. Illisible, il se dit, et rien ne l'écrase.
// - **L'état**, `veille-machine-etat.json` : `{ "tenue": true, "caffeinate": <pid>, "station": <pid> }` tant que la
//   station tient l'assertion, `{ "tenue": false }` sinon. Écrit par la station seule, d'un coup (fichier temporaire, puis
//   renommé). Lu par l'app : la ligne du menu et de la carte de la station ne se montre que si les deux process vivent —
//   une station tuée laisse un fichier qui dit « tenue », mais plus aucun `caffeinate` (il suit son pid, `-w`).
//
// Hors d'un Mac, rien de tout cela n'existe : `lireVeille` le dit (`sorte: "sans"`), et la station n'écrit rien.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REGLAGE = "veille-machine.json";
export const ETAT = "veille-machine-etat.json";
// Le défaut : allumé (#3642).
const PAR_DEFAUT = true;

export type Reglage = { garderEveille: boolean } | { illisible: string };
export type EtatEcrit = { tenue: true; caffeinate: number; station: number } | { tenue: false };
// Ce que l'app lit : rien hors d'un Mac ; sur un Mac, le réglage, et si l'assertion est tenue à l'instant.
export type Veille = { sorte: "sans" } | { sorte: "mac"; reglage: Reglage; tenue: boolean };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le réglage lu : absent, allumé ; un fichier qui ne dit pas `garderEveille` en booléen est illisible.
export function lireReglage(racine: string): Reglage {
  const fichier = join(racine, REGLAGE);
  let brut: string;
  try {
    brut = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return { garderEveille: PAR_DEFAUT };
    return { illisible: `${fichier} cannot be read — ${message(erreur)}` };
  }
  try {
    const lu: unknown = JSON.parse(brut);
    const garder = typeof lu === "object" && lu !== null ? (lu as { garderEveille?: unknown }).garderEveille : undefined;
    if (typeof garder === "boolean") return { garderEveille: garder };
    return { illisible: `${fichier} does not say garderEveille as true or false` };
  } catch (erreur) {
    return { illisible: `${fichier} is not JSON — ${message(erreur)}` };
  }
}

const ecrireDUnCoup = (fichier: string, contenu: unknown) => {
  const temporaire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(temporaire, `${JSON.stringify(contenu)}\n`);
  renameSync(temporaire, fichier);
};

// Le geste du chef : le réglage écrit. Un fichier illisible n'est pas écrasé — le refus dit pourquoi.
export function ecrireReglage(racine: string, garderEveille: boolean): { fait: true } | { refus: string } {
  const lu = lireReglage(racine);
  if ("illisible" in lu) return { refus: `nothing was changed: ${lu.illisible}` };
  try {
    ecrireDUnCoup(join(racine, REGLAGE), { garderEveille });
    return { fait: true };
  } catch (erreur) {
    return { refus: `the setting could not be written — ${message(erreur)}` };
  }
}

// L'état, écrit par la station à chaque prise et chaque relâche.
export const ecrireEtat = (racine: string, etat: EtatEcrit): void => ecrireDUnCoup(join(racine, ETAT), etat);

const vivant = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    // EPERM : le process vit, sous un autre compte.
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
};

const pidValide = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isInteger(valeur) && valeur > 0;

// L'assertion est-elle tenue à l'instant : l'état le dit, et la station comme son `caffeinate` vivent. Un état absent ou
// illisible n'en tient aucune — la station l'écrit d'un coup à chaque prise, rien d'autre ne l'écrit.
export function assertionTenue(racine: string, enVie: (pid: number) => boolean = vivant): boolean {
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(join(racine, ETAT), "utf8"));
  } catch {
    return false;
  }
  if (typeof lu !== "object" || lu === null) return false;
  const { tenue, caffeinate, station } = lu as { tenue?: unknown; caffeinate?: unknown; station?: unknown };
  return tenue === true && pidValide(caffeinate) && pidValide(station) && enVie(caffeinate) && enVie(station);
}

// Ce que l'app montre : rien hors d'un Mac.
export function lireVeille(racine: string, plateforme: NodeJS.Platform, enVie: (pid: number) => boolean = vivant): Veille {
  if (plateforme !== "darwin") return { sorte: "sans" };
  return { sorte: "mac", reglage: lireReglage(racine), tenue: assertionTenue(racine, enVie) };
}
