// La veille du blocage (#4213, épique #4110) : le 2026-11-23, rien n'a été livré pendant 13 heures alors que des tickets
// attendaient, et personne ne l'a su. Quand rien n'a été mergé depuis `IDLE_WITHOUT_MERGE_MS` et qu'au moins un ticket
// attend, la veille lit les faits de la machine — la charge, les cooks en vol, ce que la porte de prise a sauté, les
// tickets qui bouclent, les restes des cooks partis (#4067, #4108), le disque —, et décide d'une cause :
//
// - les restes des cooks partis (processus orphelins, worktrees, flux) : elle les rend elle-même, et le dit en une
//   ligne de journal — la cause et l'action. Aucune carte ;
// - le disque plein, ou la machine saturée sans aucun cook de la cuisine en vol : la cuisine n'y peut rien, un humain
//   libère la machine. Une carte TODO pour le chef, en mots simples, une seule par cause tant qu'elle dure ; chaque
//   carte posée est une panne de la machine arrivée au chef, notée avec sa date (`outagesInLastSevenDays`) ;
// - sinon, aucune cause de machine : elle le dit une fois, et les tickets restent au superviseur (`superviseur/`).
//
// Sans horloge ni machine à elle : tout se lit par les fonctions qu'on lui donne (`brancher.ts` donne les vraies).
// Ce qu'elle garde d'un tour à l'autre — les causes déjà dites au chef, les pannes datées — vit dans `racine`.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configMachine } from "../machine.ts";

// Une heure sans merge, tickets en attente. Le superviseur se réveille à 30 min (`SANS_MERGE_MS`) et donne au manager
// les causes des tickets ; une demi-heure de plus lui laisse son run. Au-delà, ce qui reste est la machine : une heure
// est le double du seuil d'une panne de la spec (30 min), et treize fois moins que la panne du 2026-11-23.
export const IDLE_WITHOUT_MERGE_MS = 60 * 60_000;

const SEPT_JOURS_MS = 7 * 24 * 3_600_000;
const FICHIER = "stall-watchdog.json";

// Ce que la veille lit de la machine, à l'instant du diagnostic. `charge` : la charge moyenne par cœur. `portes` : ce
// que la porte de prise a dit des tickets qu'elle a sautés. `boucles` : les tickets pris sans livrer, encore et encore.
export type MachineFacts = {
  charge: number;
  cooks: number;
  portes: string[];
  boucles: number[];
  restes: { processus: number[]; fichiers: string[] };
  disquePlein: boolean;
};

export type Repair = { sorte: "restes"; processus: number[]; fichiers: string[] };
export type HumanCause = "disk" | "cpu";
export type WatchdogCard = { cause: HumanCause; texte: string };

export type WatchdogOptions = {
  // Le répertoire où elle garde les causes dites au chef et les pannes datées.
  racine: string;
  // L'instant, en millisecondes.
  maintenant: () => number;
  // D'où le temps sans livraison se compte ; null quand rien ne le dit.
  dernierMerge: () => number | null;
  // Combien de tickets attendent qu'un cook les prenne.
  attendent: () => number;
  faits: () => MachineFacts;
  // Rend les restes ; lève quand elle n'y arrive pas.
  reparer: (reparation: Repair) => void;
  // Pose la carte du chef ; `false` : une carte de la même cause l'attendait déjà, rien n'est posé.
  creerCarte: (carte: WatchdogCard) => void | boolean | Promise<void | boolean>;
  ecrire: (ligne: string) => void;
  // Le délai sans livraison ; `IDLE_WITHOUT_MERGE_MS` à défaut.
  delaiMs?: number;
  // La charge par cœur au-delà de laquelle la machine est saturée ; celle de la station à défaut.
  chargeParCoeur?: number;
};

type Panne = { cause: HumanCause; at: string };
type Memoire = { open: HumanCause[]; outages: Panne[] };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Absente, la mémoire est vide ; illisible, elle est refusée — jamais lue vide puis écrasée.
function lireMemoire(racine: string): Memoire {
  let brut: string;
  try {
    brut = readFileSync(join(racine, FICHIER), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return { open: [], outages: [] };
    throw erreur;
  }
  const lue = JSON.parse(brut) as Partial<Memoire>;
  if (!Array.isArray(lue.open) || !Array.isArray(lue.outages)) throw new Error(`${FICHIER} does not hold the watchdog's causes and outages`);
  return { open: lue.open, outages: lue.outages };
}

function ecrireMemoire(racine: string, memoire: Memoire): void {
  mkdirSync(racine, { recursive: true });
  const fichier = join(racine, FICHIER);
  writeFileSync(`${fichier}.tmp`, JSON.stringify(memoire));
  renameSync(`${fichier}.tmp`, fichier);
}

// Une panne de la machine arrivée au chef — une carte posée —, notée avec sa date. La garde du disque l'appelle aussi
// quand elle pose sa carte (#4091).
export function recordMachineOutage(racine: string, cause: HumanCause, quand: number): void {
  const memoire = lireMemoire(racine);
  ecrireMemoire(racine, { ...memoire, outages: [...memoire.outages, { cause, at: new Date(quand).toISOString() }] });
}

// Les pannes de la machine arrivées au chef dans les sept derniers jours.
export function outagesInLastSevenDays(racine: string, maintenant: number): number {
  return lireMemoire(racine).outages.filter(({ at }) => maintenant - Date.parse(at) < SEPT_JOURS_MS).length;
}

const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;

export function createWatchdog(options: WatchdogOptions): { verifier(): void } {
  const { racine, ecrire } = options;
  const delaiMs = options.delaiMs ?? IDLE_WITHOUT_MERGE_MS;
  const chargeParCoeur = options.chargeParCoeur ?? configMachine({}).chargeParCoeur;
  // La dernière ligne qu'un diagnostic sans geste a dite : elle ne se redit pas à chaque vérification.
  let dite: string | null = null;
  const direUneFois = (ligne: string) => {
    if (ligne !== dite) ecrire(ligne);
    dite = ligne;
  };
  // Les cartes dont la pose n'a pas encore répondu : aucune seconde ne part pour la même cause.
  const enCours = new Set<HumanCause>();

  const texteDe = (cause: HumanCause, faits: MachineFacts, depuis: string, attendent: number): string => {
    const constat = `Nothing has merged for ${depuis} while ${attendent} ticket(s) wait`;
    if (cause === "disk") return `${constat}, and the disk of this station is full. The kitchen cannot free it by itself: free some space on the machine (unused docker volumes or images, for instance). The kitchen takes tickets again by itself once the disk has room.`;
    return `${constat}: the machine is saturated (load ${faits.charge.toFixed(2)} per core, the limit is ${chargeParCoeur}) and no cook of the kitchen runs, so something outside the kitchen takes it. Stop what loads the machine; the kitchen takes tickets again by itself once it has room.`;
  };

  // La carte posée — ou déjà là — ouvre sa cause ; posée, elle est une panne notée.
  const ouvrir = (cause: HumanCause, posee: boolean | void, quand: number) => {
    try {
      const memoire = lireMemoire(racine);
      ecrireMemoire(racine, { ...memoire, open: [...memoire.open, cause] });
      if (posee === false) return ecrire(`brigade : watchdog — the chef already had a card for ${cause}; none is added`);
      recordMachineOutage(racine, cause, quand);
      ecrire(`brigade : watchdog — cause: ${cause}, which needs a human; action: one TODO card for the chef (${outagesInLastSevenDays(racine, quand)} machine outage(s) reached the chef in the last 7 days)`);
    } catch (erreur) {
      ecrire(`brigade : watchdog — the card for ${cause} is posted, but it was not noted (${message(erreur)})`);
    }
  };

  const diagnostiquer = (maintenant: number, depuis: string, attendent: number) => {
    let faits: MachineFacts;
    try {
      faits = options.faits();
    } catch (erreur) {
      return direUneFois(`brigade : watchdog — the machine facts could not be read (${message(erreur)}); nothing is repaired, checked again next time`);
    }
    const { processus, fichiers } = faits.restes;
    if (processus.length > 0 || fichiers.length > 0) {
      dite = null;
      const cause = `leftovers of exited cooks: process(es) ${processus.join(", ") || "none"}, file(s) ${fichiers.join(", ") || "none"}`;
      try {
        options.reparer({ sorte: "restes", processus, fichiers });
        return ecrire(`brigade : watchdog — nothing merged for ${depuis} while ${attendent} ticket(s) wait; cause: ${cause}; action: stopped and removed them`);
      } catch (erreur) {
        return ecrire(`brigade : watchdog — nothing merged for ${depuis} while ${attendent} ticket(s) wait; cause: ${cause}; the repair failed (${message(erreur)})`);
      }
    }
    const presentes: HumanCause[] = [];
    if (faits.disquePlein) presentes.push("disk");
    if (faits.charge >= chargeParCoeur && faits.cooks === 0) presentes.push("cpu");
    let memoire: Memoire;
    try {
      memoire = lireMemoire(racine);
      const restees = memoire.open.filter((cause) => presentes.includes(cause));
      if (restees.length !== memoire.open.length) ecrireMemoire(racine, { ...memoire, open: restees });
      memoire = { ...memoire, open: restees };
    } catch (erreur) {
      return direUneFois(`brigade : watchdog — ${FICHIER} could not be read (${message(erreur)}); no card is posted, checked again next time`);
    }
    const cause = presentes.find((presente) => !memoire.open.includes(presente) && !enCours.has(presente));
    if (cause === undefined) {
      if (presentes.length > 0) return;
      return direUneFois(`brigade : watchdog — nothing merged for ${minutes(delaiMs)} or more while ${attendent} ticket(s) wait, and no machine cause: load ${faits.charge.toFixed(2)} per core, ${faits.cooks} cook(s) running, take gate: ${faits.portes.join(" ; ") || "nothing skipped"}, looping tickets: ${faits.boucles.map((n) => `#${n}`).join(", ") || "none"} — the supervisor holds the tickets`);
    }
    dite = null;
    const echec = (erreur: unknown) => ecrire(`brigade : watchdog — cause: ${cause}; the TODO card could not be posted (${message(erreur)}), tried again next time`);
    try {
      const posee = options.creerCarte({ cause, texte: texteDe(cause, faits, depuis, attendent) });
      if (!(posee instanceof Promise)) return ouvrir(cause, posee, maintenant);
      enCours.add(cause);
      posee.then((lue) => ouvrir(cause, lue, maintenant), echec).finally(() => enCours.delete(cause));
    } catch (erreur) {
      echec(erreur);
    }
  };

  return {
    verifier() {
      const attendent = options.attendent();
      if (attendent === 0) return;
      const repere = options.dernierMerge();
      const maintenant = options.maintenant();
      if (repere === null || maintenant - repere < delaiMs) return;
      diagnostiquer(maintenant, minutes(maintenant - repere), attendent);
    },
  };
}
