// What the cooks of the GitHub-only station spent on a ticket, read from the streams the station
// keeps under `<state>/github-seul/`, for the `measures` report: the journal no longer sees a cook
// of this path.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runDuTicket } from "../brigade-github.ts";
import type { CookMesure } from "../projections/measures.ts";

// The cooks of a merged ticket, in launch order: what each spent and whether it delivered.
type CoutsDesCooks = (ticket: number) => CookMesure[];

const nombre = (valeur: unknown) => (typeof valeur === "number" ? valeur : 0);

// The launches of a stream, one per `claude` the station started for this
// ticket: the stream is appended to, and each launch opens with its `init`.
// Tokens are counted as the supervisor counts them (`superviseur.ts`): one
// message spread over several lines counts its last usage, and cache reads do
// not count. A launch delivered when its result is not an error.
function lancementsDuFlux(contenu: string): CookMesure[] {
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
