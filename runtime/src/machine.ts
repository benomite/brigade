// La machine sous la station : ce qui lui reste de processeur, de mémoire et
// de disque, et les seuils en deçà desquels la station cesse de prendre des
// tickets. C'est le vrai plafond du parallélisme : celui des cooks peut être
// très haut, ou absent.
import { statfsSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import type { Ressource } from "./evenements/station.ts";
import { lire } from "./plafonds.ts";

const MO = 1024 * 1024;

// Ce que la station regarde de la machine avant de prendre un ticket.
export type Machine = {
  // La charge moyenne sur une minute, et le nombre de cœurs qui la portent.
  charge: number;
  coeurs: number;
  // En octets.
  memoireDisponible: number;
  disqueLibre: number;
};

export type Seuils = {
  // La charge tolérée, par cœur.
  chargeParCoeur: number;
  // Ce qui doit rester, en Mo. Zéro : la ressource ne retient jamais.
  memoireMinMo: number;
  disqueMinMo: number;
};

// `observed`, `limit` : la charge et son plafond (cpu) ; ce qui reste et le
// minimum exigé, en Mo (memory, disk).
export type Saturation = { resource: Ressource; observed: number; limit: number };

// Une saturation ne se lève qu'avec de la marge : une charge qui oscille
// autour de son seuil ne fait pas clignoter la station.
const MARGE = 0.1;

export function configMachine(env: NodeJS.ProcessEnv): Seuils {
  const mo = (variable: string, defaut: number) =>
    lire(env, variable, defaut, "un nombre entier de Mo, zéro ou plus", (valeur) => Number.isSafeInteger(valeur) && valeur >= 0);
  return {
    chargeParCoeur: lire(env, "BRIGADE_MAX_LOAD_PER_CORE", 1.5, "un nombre supérieur à zéro", (valeur) => Number.isFinite(valeur) && valeur > 0),
    memoireMinMo: mo("BRIGADE_MIN_FREE_MEMORY_MB", 1024),
    disqueMinMo: mo("BRIGADE_MIN_FREE_DISK_MB", 5120),
  };
}

// Lit la machine. `repertoire` : là où vivent les worktrees des cooks — c'est
// son disque qui se remplit.
export function lireMachine(repertoire: string): Machine {
  const disque = statfsSync(repertoire);
  return {
    charge: loadavg()[0] ?? 0,
    coeurs: availableParallelism(),
    // Pas `os.freemem()` : sur macOS elle ne compte pas la mémoire que le
    // système rendrait à la demande, et rend quelques centaines de Mo sur une
    // machine qui respire. Sous Linux, c'est `MemAvailable`, ou ce que laisse
    // le cgroup du service.
    memoireDisponible: process.availableMemory(),
    disqueLibre: disque.bavail * disque.bsize,
  };
}

// Ce dont la machine manque — la première ressource en cause —, ou null si
// elle tient. `tenue` : la ressource pour laquelle la station se retient déjà.
export function saturation(machine: Machine, seuils: Seuils, tenue: Ressource | null = null): Saturation | null {
  const marge = (resource: Ressource) => (tenue === resource ? MARGE : 0);
  const charge = seuils.chargeParCoeur * machine.coeurs;
  if (machine.charge > charge * (1 - marge("cpu"))) return { resource: "cpu", observed: machine.charge, limit: charge };
  const reste = (octets: number) => Math.floor(octets / MO);
  if (machine.memoireDisponible < seuils.memoireMinMo * MO * (1 + marge("memory"))) {
    return { resource: "memory", observed: reste(machine.memoireDisponible), limit: seuils.memoireMinMo };
  }
  if (machine.disqueLibre < seuils.disqueMinMo * MO * (1 + marge("disk"))) {
    return { resource: "disk", observed: reste(machine.disqueLibre), limit: seuils.disqueMinMo };
  }
  return null;
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

// Une saturation telle que le chef la lit.
export function direSaturation({ resource, observed, limit }: Saturation): string {
  switch (resource) {
    case "cpu":
      return `charge de ${nombre(observed)} pour ${nombre(limit)} au plus`;
    case "memory":
      return `${nombre(observed)} Mo de mémoire disponible pour ${nombre(limit)} au moins`;
    case "disk":
      return `${nombre(observed)} Mo de disque libre pour ${nombre(limit)} au moins`;
  }
}
