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

// Le label du ticket qui répare la saturation de la machine (#4100) : la porte
// de prise le laisse passer quand la machine est à court — sinon la réparation
// attendrait la fin du mal qu'elle répare.
export const LABEL_REPARATION_SATURATION = "repair:saturation";

// Ce qui a échoué, tel que les gates le nomment : leurs lignes `FAIL`, sans le
// mot. Sans ligne `FAIL`, ce que leur sortie dit d'elles.
export function echecsDesGates(gates: Gates): string[] {
  const nommes = gates.failures.map((ligne) => ligne.replace(/^FAIL\s+/, "").trim()).filter((ligne) => ligne !== "");
  if (nommes.length > 0) return nommes;
  return [gates.outcome === "timeout" ? "gates arrêtées à leur plafond de durée" : `gates sorties en ${gates.code ?? "erreur"}`];
}
