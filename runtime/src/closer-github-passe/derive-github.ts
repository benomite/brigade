// The drift on the GitHub-only path (#2361): what the closer's pass reads of
// the project's cost, once the log no longer sees a merge. The `drift` line of
// `status` comes from `franchis` over the merged deliveries of the log
// (`etat.ts`); with the switch on, that log is stale and its gauges freeze on
// the day the switch was turned on. The closer's pass takes the drift over: at
// its cadence, it builds the merged deliveries from what the clone says (the
// merge commits of the integration branch, one per ticket) and from what the
// GitHub-only cooks of this station said (their streams, kept by the station
// under `<state>/github-seul/`), measures them against the chef's thresholds
// with the same gauges, and leaves the result where `status` reads it.
//
// What the streams cannot tell is not carried: the gates' measures (tests,
// repo, context, gates duration) — a GitHub-only delivery is judged by the CI,
// whose measures nothing reads yet — and the cooks of another station.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDuTicket } from "../brigade-github.ts";
import type { Seuils } from "../events/drift.ts";
import { FENETRE_DE_PENTE, franchis, type Franchi } from "../mesures.ts";
import type { CookMesure, Delivery } from "../projections/measures.ts";

// A merge of the integration branch: when, and the ticket its branch carried.
export type MergeDuClone = { at: string; ticket: number | null };

// The cooks of a merged ticket, in launch order: what each spent and whether it delivered.
export type CoutsDesCooks = (ticket: number) => CookMesure[];

// What the pass leaves for `status`: the thresholds crossed, at the last reading.
export type DeriveGithub = { at: string; franchis: Franchi[] };

export const FICHIER_DERIVE_GITHUB = "derive-github.json";

const BRANCHE_DU_TICKET = /\/cook\/(\d+)-/;

// The ticket of a merge, from its subject (`Merge pull request #<pr> from <owner>/cook/<n>-github`).
export function ticketDuMerge(sujet: string): number | null {
  const numero = BRANCHE_DU_TICKET.exec(sujet)?.[1];
  return numero === undefined ? null : Number(numero);
}

const nombre = (valeur: unknown) => (typeof valeur === "number" ? valeur : 0);

// The launches of a stream, one per `claude` the station started for this
// ticket: the stream is appended to, and each launch opens with its `init`.
// Tokens are counted as the supervisor counts them (`superviseur.ts`): one
// message spread over several lines counts its last usage, and cache reads do
// not count. A launch delivered when its result is not an error.
export function lancementsDuFlux(contenu: string): CookMesure[] {
  const lancements: Array<{ calibration: string | null; usages: Map<string, number>; delivered: boolean }> = [];
  let courant: (typeof lancements)[number] | undefined;
  for (const ligne of contenu.split("\n")) {
    let evenement;
    try {
      evenement = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (evenement === null || typeof evenement !== "object") continue;
    if ((evenement.type === "system" && evenement.subtype === "init") || courant === undefined) {
      courant = { calibration: null, usages: new Map(), delivered: false };
      lancements.push(courant);
      if (evenement.type === "system") {
        courant.calibration = typeof evenement.model === "string" ? evenement.model : null;
        continue;
      }
    }
    if (evenement.type === "assistant") {
      const message = evenement.message ?? {};
      const id = typeof message.id === "string" ? message.id : `sans-id-${courant.usages.size}`;
      courant.usages.set(id, nombre(message.usage?.input_tokens) + nombre(message.usage?.output_tokens) + nombre(message.usage?.cache_creation_input_tokens));
    } else if (evenement.type === "result") {
      courant.delivered = evenement.is_error === false;
    }
  }
  return lancements.map(({ calibration, usages, delivered }) => ({
    calibration: calibration ?? "github",
    turns: usages.size,
    durationMs: null,
    tokens: [...usages.values()].reduce((somme, usage) => somme + usage, 0),
    delivered,
  }));
}

// The cooks of a ticket, from the streams of the GitHub-only station.
export function coutsDesFlux(repertoire: string): CoutsDesCooks {
  return (ticket) => {
    const chemin = join(repertoire, `${runDuTicket(ticket)}.flux.jsonl`);
    return existsSync(chemin) ? lancementsDuFlux(readFileSync(chemin, "utf8")) : [];
  };
}

// The merged deliveries, the oldest first, as the gauges read them. Only the
// last `FENETRE_DE_PENTE` carry their cooks: the cost gauges read no further.
export function livraisonsDuClone(merges: MergeDuClone[], couts: CoutsDesCooks): Delivery[] {
  const recentes = merges.length - FENETRE_DE_PENTE;
  return merges.map(({ at, ticket }, i) => ({ ticket, at, measures: {}, state: {}, gatesS: null, cooks: ticket === null || i < recentes ? [] : couts(ticket) }));
}

// The thresholds the merges since the last closing pass cross. `merges`: the
// clone's, the most recent first; `depuis`: when the last pass was opened.
export function releverDerive(merges: MergeDuClone[], depuis: number, couts: CoutsDesCooks, seuils: Seuils): Franchi[] {
  const depuisLaPasse = merges.filter(({ at }) => Date.parse(at) > depuis).reverse();
  return franchis(livraisonsDuClone(depuisLaPasse, couts), seuils);
}

export function noterDeriveGithub(repertoireEtat: string, derive: DeriveGithub): void {
  const chemin = join(repertoireEtat, FICHIER_DERIVE_GITHUB);
  mkdirSync(repertoireEtat, { recursive: true });
  writeFileSync(`${chemin}.tmp`, JSON.stringify(derive));
  renameSync(`${chemin}.tmp`, chemin);
}

// Nothing when the file is missing or unreadable: no pass has read the drift yet.
export function lireDeriveGithub(repertoireEtat: string | undefined): DeriveGithub | null {
  if (!repertoireEtat) return null;
  try {
    const lu: unknown = JSON.parse(readFileSync(join(repertoireEtat, FICHIER_DERIVE_GITHUB), "utf8"));
    if (typeof lu !== "object" || lu === null) return null;
    const { at, franchis: lus } = lu as Record<string, unknown>;
    if (typeof at !== "string" || !Array.isArray(lus)) return null;
    const valides = lus.filter((f): f is Franchi => typeof f?.measure === "string" && typeof f?.observed === "number" && typeof f?.limit === "number");
    return { at, franchis: valides };
  } catch {
    return null;
  }
}
