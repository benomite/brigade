// La machine sous la station : ce qui lui reste de processeur, de mémoire et
// de disque, et les seuils en deçà desquels la station cesse de prendre des
// tickets. C'est le vrai plafond du parallélisme : celui des cooks peut être
// très haut, ou absent.
import { statfsSync } from "node:fs";
import { availableParallelism, loadavg, totalmem } from "node:os";
import type { Manque, OrigineDuSeuil, Ressource } from "./events/station.ts";
import { lire } from "./plafonds.ts";

const MO = 1024 * 1024;

// Ce que la station regarde de la machine avant de prendre un ticket.
export type Machine = {
  // La charge moyenne sur une minute, et le nombre de cœurs qui la portent.
  charge: number;
  coeurs: number;
  // En octets. `memoireTotale` : celle de la machine, ou du cgroup du service
  // s'il en a moins — c'est d'elle que dérive le minimum de mémoire par défaut.
  memoireDisponible: number;
  memoireTotale: number;
  disqueLibre: number;
};

export type Seuils = {
  // La charge tolérée, par cœur.
  chargeParCoeur: number;
  // Ce qui doit rester, en Mo. Zéro : la ressource ne retient jamais.
  // `memoireMinMo` nul : rien n'est réglé, le minimum dérive de la mémoire
  // totale de la machine (`memoireMinParDefaut`).
  memoireMinMo: number | null;
  disqueMinMo: number;
};

export type Saturation = Manque;

// Une saturation ne se lève qu'avec de la marge : une charge qui oscille
// autour de son seuil ne fait pas clignoter la station.
const MARGE = 0.1;

export function configMachine(env: NodeJS.ProcessEnv): Seuils {
  const mo = (variable: string, defaut: number) =>
    lire(env, variable, defaut, "un nombre entier de Mo, zéro ou plus", (valeur) => Number.isSafeInteger(valeur) && valeur >= 0);
  const memoire = env.BRIGADE_MIN_FREE_MEMORY_MB;
  return {
    chargeParCoeur: lire(env, "BRIGADE_MAX_LOAD_PER_CORE", 1.5, "un nombre supérieur à zéro", (valeur) => Number.isFinite(valeur) && valeur > 0),
    memoireMinMo: memoire === undefined || memoire === "" ? null : mo("BRIGADE_MIN_FREE_MEMORY_MB", 0),
    disqueMinMo: mo("BRIGADE_MIN_FREE_DISK_MB", 5120),
  };
}

// Le minimum de mémoire disponible quand le chef n'a rien réglé : un dixième
// de la mémoire totale, un Go au moins. Le tueur de mémoire du noyau n'agit
// qu'à presque rien ; la station s'arrête de prendre bien avant, et ce qui
// reste tient `sshd`, le runtime qui publie son état, et les cooks qui
// tournent encore le temps qu'ils grossissent — 3 277 Mo sur 32 Go, 1 638 sur
// 16, 1 024 sur 8 et moins.
export const PART_MEMOIRE = 0.1;
export const MEMOIRE_MIN_MO = 1024;
export const memoireMinParDefaut = (totaleMo: number): number => Math.max(MEMOIRE_MIN_MO, Math.round(totaleMo * PART_MEMOIRE));

// Le minimum de mémoire qui vaut sur cette machine, en Mo, et d'où il vient.
export function seuilMemoire(machine: Pick<Machine, "memoireTotale">, seuils: Pick<Seuils, "memoireMinMo">): { mo: number; origine: OrigineDuSeuil } {
  if (seuils.memoireMinMo !== null) return { mo: seuils.memoireMinMo, origine: "env" };
  const totaleMo = Math.floor(machine.memoireTotale / MO);
  return { mo: memoireMinParDefaut(totaleMo), origine: { totalMb: totaleMo } };
}

// Ce qu'un cook tout juste parti pèsera, tant que la machine ne sait pas encore
// le dire : la charge moyenne est une moyenne sur une minute, et sa mémoire ne
// se remplit pas à l'instant où il naît. Une estimation, pas une mesure : elle
// ne sert qu'à ce qu'un rail plein ne parte pas d'un bloc.
export const JEUNE_MS = 60_000;
const RESERVE = { charge: 1, memoireMo: 512 };

// La machine telle qu'elle sera quand ces cooks-là pèseront.
export function reserver(machine: Machine, jeunes: number): Machine {
  return {
    ...machine,
    charge: machine.charge + jeunes * RESERVE.charge,
    memoireDisponible: machine.memoireDisponible - jeunes * RESERVE.memoireMo * MO,
  };
}

// Lit la machine. `repertoire` : là où vivent les worktrees des cooks — c'est
// son disque qui se remplit.
// La mémoire totale, en octets : celle du cgroup du service s'il la borne.
// Sans cgroup qui la borne, `constrainedMemory` rend zéro, ou plus que la
// machine n'en a.
export function lireMemoireTotale(): number {
  const borne = process.constrainedMemory();
  return borne > 0 && borne < totalmem() ? borne : totalmem();
}

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
    memoireTotale: lireMemoireTotale(),
    disqueLibre: disque.bavail * disque.bsize,
  };
}

// Tout ce dont la machine manque, dans l'ordre — processeur, mémoire, disque —,
// ou rien si elle tient. `tenues` : les ressources pour lesquelles la station
// se retient déjà — chacune ne se lève qu'avec de la marge.
export function saturations(machine: Machine, seuils: Seuils, tenues: readonly Ressource[] = []): Saturation[] {
  const marge = (resource: Ressource) => (tenues.includes(resource) ? MARGE : 0);
  const manques: Saturation[] = [];
  const charge = seuils.chargeParCoeur * machine.coeurs;
  if (machine.charge > charge * (1 - marge("cpu"))) manques.push({ resource: "cpu", observed: machine.charge, limit: charge });
  const reste = (octets: number) => Math.floor(octets / MO);
  const memoire = seuilMemoire(machine, seuils);
  if (machine.memoireDisponible < memoire.mo * MO * (1 + marge("memory"))) {
    manques.push({ resource: "memory", observed: reste(machine.memoireDisponible), limit: memoire.mo, limitFrom: memoire.origine });
  }
  if (machine.disqueLibre < seuils.disqueMinMo * MO * (1 + marge("disk"))) {
    manques.push({ resource: "disk", observed: reste(machine.disqueLibre), limit: seuils.disqueMinMo });
  }
  return manques;
}

// Ce dont la machine manque — la première ressource en cause —, ou null si
// elle tient. `tenue` : la ressource pour laquelle la station se retient déjà.
export function saturation(machine: Machine, seuils: Seuils, tenue: Ressource | null = null): Saturation | null {
  return saturations(machine, seuils, tenue === null ? [] : [tenue])[0] ?? null;
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

const nombreEn = (valeur: number) => valeur.toLocaleString("en-US", { maximumFractionDigits: 1 });

// D'où vient le minimum de mémoire, tel que le chef le lit : rien d'un fait
// écrit avant qu'il le dise.
const origineEn = (origine: OrigineDuSeuil | undefined) =>
  origine === undefined ? "" : origine === "env" ? " (set by BRIGADE_MIN_FREE_MEMORY_MB)" : ` (default: ${PART_MEMOIRE * 100}% of the machine's ${nombreEn(origine.totalMb)} MB)`;

const origineFr = (origine: OrigineDuSeuil | undefined) =>
  origine === undefined || origine === "env" ? "" : ` (par défaut : ${nombre(PART_MEMOIRE * 100)} % des ${nombre(origine.totalMb)} Mo de la machine)`;

// La même, en anglais : ce que dit `status`.
export function direSaturationEn({ resource, observed, limit, limitFrom }: Saturation): string {
  switch (resource) {
    case "cpu":
      return `load of ${nombreEn(observed)} for at most ${nombreEn(limit)}`;
    case "memory":
      return `${nombreEn(observed)} MB of memory available for at least ${nombreEn(limit)} MB${origineEn(limitFrom)}`;
    case "disk":
      return `${nombreEn(observed)} MB of disk free for at least ${nombreEn(limit)} MB`;
  }
}

const NOMS_EN: Record<Ressource, string> = { cpu: "CPU", memory: "memory", disk: "disk" };

// Les ressources en cause, nommées — `CPU`, `memory and CPU` dans l'ordre où
// elles manquent —, puis chacune avec ce qu'elle a et ce qu'elle doit avoir.
export function direSaturationsEn(manques: readonly Saturation[]): { ressources: string; detail: string } {
  const noms = manques.map(({ resource }) => NOMS_EN[resource]);
  return {
    ressources: noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} and ${noms.at(-1)}`,
    detail: manques.map(direSaturationEn).join(" · "),
  };
}

// Une saturation telle que le chef la lit.
export function direSaturation({ resource, observed, limit, limitFrom }: Saturation): string {
  switch (resource) {
    case "cpu":
      return `charge de ${nombre(observed)} pour ${nombre(limit)} au plus`;
    case "memory":
      return `${nombre(observed)} Mo de mémoire disponible pour ${nombre(limit)} au moins${origineFr(limitFrom)}`;
    case "disk":
      return `${nombre(observed)} Mo de disque libre pour ${nombre(limit)} au moins`;
  }
}

// Plusieurs saturations telles que le chef les lit.
export const direSaturations = (manques: readonly Saturation[]): string => manques.map(direSaturation).join(" ; ");
