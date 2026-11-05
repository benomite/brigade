// Le temps de chaque ticket servi, de sa prise à son merge, partagé en ses
// phases (#2342, épique #2336) : la cuisson — dont les tests et les gates du
// cook, à part —, l'attente de la pass, la relecture, la CI, le merge.
//
// La station marque chaque passage d'une phase à la suivante au moment où elle
// le fait (`chronometre`) ; au merge, le parcours se mesure (`mesurer`) et
// s'ajoute à `.claude/brigade/temps-tickets.json` du projet
// (`enregistrerTemps`), le contrat que lit la synthèse (`synthese.ts`).
//
// Une phase dure de sa marque à la marque suivante, la dernière jusqu'au
// merge : leur somme est le temps de la prise au merge. Une phase que la
// station n'a pas vue passer vaut 0 — rien n'est estimé à sa place.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EnregistrementTemps } from "./synthese.ts";

export const FICHIER_DES_TEMPS = ".claude/brigade/temps-tickets.json";

// Les phases d'un ticket, dans l'ordre où il les traverse. `cuissonTests`
// n'en est pas une : c'est une part de `cuisson`.
export const ETAPES = ["cuisson", "attentePasse", "revue", "ci", "merge"] as const;
export type Etape = (typeof ETAPES)[number];

// À partir de `at` (ISO), le ticket est dans `etape`, jusqu'à la marque suivante.
export type Marque = { etape: Etape; at: string };

// Le parcours d'un ticket tel que la station l'a vu : ses marques, dans
// l'ordre, et ce que les tests et les gates du cook ont pris, en millisecondes.
// Sa première marque est sa prise — ou, si la station ne l'a pas vue (un autre
// l'a prise, ou la station a redémarré depuis), la première phase qu'elle a vue.
export type Parcours = { ticket: number; marques: Marque[]; testsMs: number };

// Le parcours mesuré jusqu'au merge (`mergedAt`, ISO). Les secondes sont
// arrondies sur les instants, pas sur les durées : la somme des phases est le
// temps arrondi de la prise au merge, à la seconde près.
export function mesurer(parcours: Parcours, mergedAt: string): EnregistrementTemps {
  const premiere = parcours.marques[0];
  const claimedAt = premiere?.at ?? mergedAt;
  const debut = Date.parse(claimedAt);
  const fin = Math.max(debut, Date.parse(mergedAt));
  const seconde = (instant: number) => Math.round((Math.min(Math.max(instant, debut), fin) - debut) / 1000);
  const durees: Record<Etape, number> = { cuisson: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 };
  parcours.marques.forEach((marque, rang) => {
    const suivante = parcours.marques[rang + 1];
    durees[marque.etape] += seconde(suivante === undefined ? fin : Date.parse(suivante.at)) - seconde(Date.parse(marque.at));
  });
  const cuissonTests = Math.min(Math.max(0, Math.round(parcours.testsMs / 1000)), durees.cuisson);
  return { ticket: parcours.ticket, claimedAt, mergedAt, cuisson: durees.cuisson, cuissonTests, attentePasse: durees.attentePasse, revue: durees.revue, ci: durees.ci, merge: durees.merge };
}

// Ajoute l'enregistrement au fichier du projet dont `dossier` est la racine.
// Le même ticket n'y est qu'une fois : un enregistrement plus ancien du ticket
// est remplacé. Un fichier illisible n'est pas écrasé : l'appel lève.
export function enregistrerTemps(dossier: string, enregistrement: EnregistrementTemps): void {
  const fichier = join(dossier, FICHIER_DES_TEMPS);
  let texte: string | undefined;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") throw erreur;
  }
  const lus: unknown = texte === undefined || texte.trim() === "" ? [] : JSON.parse(texte);
  if (!Array.isArray(lus)) throw new Error(`${fichier} is not a JSON array: it is left as is`);
  const autres = lus.filter((lu) => typeof lu !== "object" || lu === null || (lu as { ticket?: unknown }).ticket !== enregistrement.ticket);
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify([...autres, enregistrement], null, 2)}\n`);
  renameSync(provisoire, fichier);
}

// Ce que la station tient du parcours de ses tickets, en mémoire.
export type Chronometre = {
  // Le ticket est pris : son parcours s'ouvre, en cuisson. Repris après un
  // cook sans livraison ou un renvoi, il garde le parcours ouvert.
  prendre(ticket: number): void;
  // Le ticket entre dans `etape`. Sans parcours ouvert, il s'en ouvre un ici.
  marquer(ticket: number, etape: Etape): void;
  // Les tests et les gates qu'un cook du ticket a joués, en millisecondes.
  tests(ticket: number, ms: number): void;
  // Le ticket est mergé : son parcours se mesure et se ferme. Rien si aucun
  // parcours n'est ouvert.
  servir(ticket: number): EnregistrementTemps | null;
  // Le ticket sort de la cuisine sans être mergé : son parcours est oublié.
  oublier(ticket: number): void;
};

export function chronometre(maintenant: () => Date = () => new Date()): Chronometre {
  const parcours = new Map<number, Parcours>();
  const marquer = (ticket: number, etape: Etape) => {
    const ouvert = parcours.get(ticket);
    const at = maintenant().toISOString();
    if (ouvert === undefined) parcours.set(ticket, { ticket, marques: [{ etape, at }], testsMs: 0 });
    else if (ouvert.marques.at(-1)?.etape !== etape) ouvert.marques.push({ etape, at });
  };
  return {
    prendre: (ticket) => marquer(ticket, "cuisson"),
    marquer,
    tests: (ticket, ms) => {
      const ouvert = parcours.get(ticket);
      if (ouvert !== undefined && Number.isFinite(ms) && ms > 0) ouvert.testsMs += ms;
    },
    servir: (ticket) => {
      const ouvert = parcours.get(ticket);
      if (ouvert === undefined) return null;
      parcours.delete(ticket);
      return mesurer(ouvert, maintenant().toISOString());
    },
    oublier: (ticket) => {
      parcours.delete(ticket);
    },
  };
}
