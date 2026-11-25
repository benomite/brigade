// La réparation d'une base rouge : le ticket `fix` que le superviseur ouvre
// pour un check rouge de la base, une fois sa relance restée rouge
// (superviseur/gestes.ts, #3945). Il passe devant tout le rail (`prio:0`), part
// sans geste du chef — il porte `fire` et son calibrage —, et sa livraison se
// juge et se merge malgré la base rouge qu'elle répare.
import type { Gates } from "./events/pass.ts";
import { LABEL } from "./github.ts";

// La priorité qui passe devant toutes les autres : celle de la réparation.
export const PRIO_REPARATION = "prio:0";
// Le calibrage d'une réparation : la base retient toute la cuisine, `opus`
// donc, mais en `medium` comme la table du manager (#2575) : l'effort `high`
// fait réfléchir le modèle davantage à chaque tour, et la base attend d'autant.
export const CALIBRAGE_REPARATION = { model: "opus", effort: "medium" } as const;
export const LABELS_REPARATION = [LABEL, PRIO_REPARATION, `model:${CALIBRAGE_REPARATION.model}`, `effort:${CALIBRAGE_REPARATION.effort}`];

// La marque d'un ticket `fix` du superviseur : la cause qu'il répare. Celle
// d'une réparation est `check:<le check rouge>`.
export const marqueDeCause = (cause: string) => `<!-- brigade:supervisor-cause ${cause.replace(/-->/g, "--\\u003e")} -->`;
export const causeDuCheck = (check: string) => `check:${check}`;
const CHECK_REPARE = /^<!-- brigade:supervisor-cause check:(.+?) -->$/gm;

// Les checks rouges qu'un corps dit réparer, par sa marque.
export const checksRepares = (corps: string): string[] => [...corps.matchAll(CHECK_REPARE)].map(([, check]) => check as string);

// Une réparation de la base : sa priorité, et la marque du check qu'elle répare.
export const estUneReparation = (corps: string, labels: readonly string[]): boolean => labels.includes(PRIO_REPARATION) && checksRepares(corps).length > 0;

import { etiquettesALaCreation, LABEL_REPARATION_SATURATION } from "./liberer-la-machine.ts";
export { LABEL_REPARATION_SATURATION };

// Ce qui a échoué, tel que les gates le nomment : leurs lignes `FAIL`, sans le
// mot. Sans ligne `FAIL`, ce que leur sortie dit d'elles.
export function echecsDesGates(gates: Gates): string[] {
  const nommes = gates.failures.map((ligne) => ligne.replace(/^FAIL\s+/, "").trim()).filter((ligne) => ligne !== "");
  if (nommes.length > 0) return nommes;
  return [gates.outcome === "timeout" ? "gates arrêtées à leur plafond de durée" : `gates sorties en ${gates.code ?? "erreur"}`];
}

// --- La réparation de la saturation (#4173) : la retenue ne bloque jamais sa propre réparation.

export { etiquettesALaCreation, type AuteurDeTicket } from "./liberer-la-machine.ts";

// Le ticket que le superviseur dépose quand la machine retient la station et qu'aucune réparation n'attend.
export const TITRE_DE_REPARATION_DE_SATURATION = "Reclaim leftover worktrees, processes and caches to free the saturated machine";
export const CORPS_DE_REPARATION_DE_SATURATION = [
  "## Context",
  "",
  "The station is held for machine saturation and no ticket repairs it: nothing can be launched until the machine is freed.",
  "",
  "## Acceptance criteria",
  "",
  "- Reclaim the disk, processes and caches the kitchen left behind (leftover worktrees of merged tickets, orphan processes, stale caches).",
  "- The station is released from its saturation hold once the machine has room again.",
].join("\n");

export type OuvertDeReparation = { numero: number; labels: readonly string[] };

// Station retenue pour la machine : une réparation cookable existe, sinon le superviseur en dépose une.
export async function garantirUneReparationDeSaturation({
  retenue,
  ouverts,
  creer,
}: {
  retenue: "machine" | "breaker" | null;
  ouverts: readonly OuvertDeReparation[];
  creer: (ticket: { titre: string; corps: string; labels: string[] }) => Promise<number>;
}): Promise<{ cookable: number | null; deposee: number | null }> {
  if (retenue !== "machine") return { cookable: null, deposee: null };
  const existante = ouverts.find(({ labels }) => labels.includes(LABEL_REPARATION_SATURATION));
  if (existante !== undefined) return { cookable: existante.numero, deposee: null };
  const numero = await creer({
    titre: TITRE_DE_REPARATION_DE_SATURATION,
    corps: CORPS_DE_REPARATION_DE_SATURATION,
    labels: etiquettesALaCreation({ titre: TITRE_DE_REPARATION_DE_SATURATION, corps: CORPS_DE_REPARATION_DE_SATURATION, labels: [LABEL, "tech", "prio:1", `model:${CALIBRAGE_REPARATION.model}`, `effort:${CALIBRAGE_REPARATION.effort}`] }),
  });
  return { cookable: numero, deposee: numero };
}

// Une heure de retenue pour la machine, sans réparation cuisinée : la cuisine force la réparation.
export const HEURE_DE_RETENUE_MS = 3_600_000;

export function suiteDeLaSaturation({ heldAt, maintenant, reparationCuisinee }: { heldAt: string; maintenant: Date; reparationCuisinee: boolean }): "attendre" | "forcer-la-reparation" {
  const depuis = Date.parse(heldAt);
  if (Number.isNaN(depuis) || reparationCuisinee) return "attendre";
  return maintenant.getTime() - depuis > HEURE_DE_RETENUE_MS ? "forcer-la-reparation" : "attendre";
}
