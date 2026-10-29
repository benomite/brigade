// Des tickets servis, écrits au journal comme le runtime les écrit : ce que
// lisent la mesure des domaines et les propositions de profils.
import type { TestContext } from "node:test";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

export const PROJET = "brigade";

export function journalDeTest(t: TestContext): Journal {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  return journal;
}

// Un ticket à servir. `zone` : celle de sa fiche, absente s'il n'en porte
// pas. `essais` : le nombre de cooks lancés avant sa fin. `merge` : faux s'il
// est servi sans diff. `titre` : son titre, où se lit son type.
export type Service = { ticket: number; zone?: string[]; essais?: number; merge?: boolean; titre?: string; illisible?: boolean };

let runs = 0;
export function servir(journal: Journal, { ticket, zone, essais = 1, merge = true, titre = `ticket ${ticket}`, illisible = false }: Service): void {
  const noter = (fait: object) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait } as never);
  const card = zone === undefined ? null : { waitsFor: [], zone, problems: illisible ? ["clé inconnue « zones »"] : [] };
  noter({ type: "ticket.arrived", payload: { title: titre, priority: 3, createdAt: `${JOUR_HORLOGE}T09:00:00.000Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card } });
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
  for (let i = 0; i < essais; i++) {
    const run = `run-${++runs}`;
    noter({ type: "cook.launched", payload: { run, limits: { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, stream: `runs/${run}.jsonl`, station: "box/claude" } });
    noter({ type: "cook.exited", payload: { run, outcome: i === essais - 1 ? "ok" : "failed", code: i === essais - 1 ? 0 : 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  }
  if (merge) noter({ type: "merge.done", payload: { pr: `https://github.com/acme/brigade/pull/${ticket}`, sha: null, by: "pass", reconciled: false } });
  else noter({ type: "pass.served", payload: { verdict: 1 } });
}

// Des tickets d'une zone, dont `premiers` livrés du premier coup et les autres
// au deuxième essai, numérotés à partir de `depuis`.
export const tickets = (depuis: number, combien: number, premiers: number, zone: string[], reste: Partial<Service> = {}): Service[] =>
  Array.from({ length: combien }, (_, i) => ({ ticket: depuis + i, zone, essais: i < premiers ? 1 : 2, ...reste }));
