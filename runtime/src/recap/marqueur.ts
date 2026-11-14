// Le marqueur « vu jusqu'à » du récapitulatif d'un projet (#3581) : l'instant
// jusqu'où le chef a vu ce que la cuisine a fait. Il vit dans le répertoire
// d'état du projet (`recap.json`), là où sa cuisine tourne : il survit au
// redémarrage du runtime comme à la fermeture de l'app.
//
// Il n'avance que quand l'app dit avoir montré le récapitulatif
// (`recap <owner>/<repo> seen <until>`), jusqu'à l'instant que ce
// récapitulatif couvrait — jamais en arrière, jamais au-delà de maintenant.
// Chaque écriture réécrit le fichier d'un coup (`.tmp` puis renommage). Un
// fichier illisible lève `MarqueurIllisible` : rien ne le réécrit à sa place.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FICHIER_DU_RECAP = "recap.json";

export class MarqueurIllisible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarqueurIllisible";
  }
}

// Une avance que le marqueur refuse : un instant qui n'en est pas un, ou à venir.
export class AvanceRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvanceRefusee";
  }
}

const cheminDuMarqueur = (repertoireEtat: string) => join(repertoireEtat, FICHIER_DU_RECAP);

// L'instant jusqu'où le chef a vu, en ISO ; null tant qu'aucun récapitulatif n'a été montré.
export function lireLeMarqueur(repertoireEtat: string): string | null {
  let texte: string;
  try {
    texte = readFileSync(cheminDuMarqueur(repertoireEtat), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new MarqueurIllisible(`${FICHIER_DU_RECAP} cannot be read: ${(erreur as Error).message}`);
  }
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new MarqueurIllisible(`${FICHIER_DU_RECAP} is not JSON`);
  }
  const vu = typeof brut === "object" && brut !== null ? (brut as { seenUntil?: unknown }).seenUntil : undefined;
  if (typeof vu !== "string" || Number.isNaN(Date.parse(vu))) throw new MarqueurIllisible(`${FICHIER_DU_RECAP} does not read as {seenUntil: <instant>}`);
  return new Date(vu).toISOString();
}

// Avance le marqueur jusqu'à `jusqua`, s'il est plus loin ; rend le marqueur après.
export function avancerLeMarqueur(repertoireEtat: string, jusqua: string, maintenant: Date): string {
  const instant = Date.parse(jusqua);
  if (Number.isNaN(instant)) throw new AvanceRefusee(`“${jusqua}” is not an instant`);
  if (instant > maintenant.getTime()) throw new AvanceRefusee(`${jusqua} is still to come: a recap is never marked seen beyond now`);
  const actuel = lireLeMarqueur(repertoireEtat);
  if (actuel !== null && Date.parse(actuel) >= instant) return actuel;
  const vu = new Date(instant).toISOString();
  mkdirSync(repertoireEtat, { recursive: true });
  const chemin = cheminDuMarqueur(repertoireEtat);
  writeFileSync(`${chemin}.${process.pid}.tmp`, `${JSON.stringify({ seenUntil: vu })}\n`);
  renameSync(`${chemin}.${process.pid}.tmp`, chemin);
  return vu;
}
