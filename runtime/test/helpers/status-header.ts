// L'état de la box d'avant la traduction du haut de `status` (#928), et l'état d'exemple qu'on
// bâtit dessus. Le journal d'avant est rejoué sans être édité ; l'exemple y ajoute des événements.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

export const ETAT_D_AVANT = join(import.meta.dirname, "../fixtures/state-before-927");
export const LU_LE = new Date("2026-10-12T10:04:00.000Z");
export const STATION = "box/claude";

// Le journal de l'état d'avant, rejoué dans un répertoire neuf : chaque événement à son instant,
// dans son ordre. `noter` en ajoute, à l'instant donné. Rien de l'état d'avant n'est édité.
export function etatDAvant(t: TestContext, repertoire = repertoireTemporaire(t)) {
  let instant = new Date(0);
  const journal = ouvrirJournal(repertoire, { maintenant: () => instant });
  t.after(() => journal.fermer());
  for (const ligne of readFileSync(join(ETAT_D_AVANT, "evenements.ndjson"), "utf8").trim().split("\n")) {
    const { at, project, ticket, type, author, payload, dedupKey } = JSON.parse(ligne);
    instant = new Date(at);
    journal.ajouter({ project, ticket, type, author, payload, ...(dedupKey === undefined ? {} : { dedupKey }) });
  }
  const noter = (hhmm: string, fait: Fait, ticket: number | null = null, author = "runtime") => {
    instant = new Date(`2026-10-12T${hhmm}:00.000Z`);
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  };
  return { journal, noter };
}

// L'état d'exemple : tout ce qui arrête la cuisine, sur l'état d'avant. La station est annoncée, puis
// sa connexion Max tombe, la base rouge a son ticket de réparation.
export function exemple(t: TestContext, repertoire?: string) {
  const { journal, noter } = etatDAvant(t, repertoire);
  noter("10:00", { type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  noter("10:00", { type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  noter("10:00", { type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } }, null, `station:${STATION}`);
  noter("10:00", { type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts: [], base: "ba5e0001ffff" } }, 24, `station:${STATION}`);
  noter("10:00", { type: "aside.blocked", payload: { station: STATION, reason: "secrets-unavailable", base: "base-1" } }, 24);
  noter("10:00", { type: "base.checked", payload: { sha: "abc1234def", outcome: "red", gates: { outcome: "red", code: 1, failures: ["FAIL  tests"], tail: "" }, tickets: [] } }, null, "pass");
  noter("10:00", { type: "base.repair-opening", payload: { sha: "abc1234def" } }, null, "pass");
  noter("10:00", { type: "base.repair-opened", payload: { sha: "abc1234def", failures: ["FAIL  tests"], reconciled: false } }, 30, "pass");
  noter("10:00", { type: "ticket.arrived", payload: { title: "Réparer la base", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/30" } }, 30, "github");
  noter("10:01", { type: "grant.activated", payload: { action: "merge", until: "2026-10-12T10:30:00.000Z" } }, null, "chef");
  noter("10:02", { type: "backup.completed", payload: { name: "2026-10-09T10-00-00Z", lastSeq: 7, events: 7, streams: 0 } }, null, "sauvegarde");
  return journal;
}

