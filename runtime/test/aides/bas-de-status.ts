// L'état d'exemple du bas de `status` (#940) : celui du haut (`exemple`, test/aides/haut-de-status.ts)
// et, par-dessus, tout ce que le rail, les cooks, ce qu'ils ont consommé, les worktrees,
// la dérive et les transcripts peuvent dire. Chaque ligne du bas de `status` y paraît au moins une fois.
import type { TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { etatDAvant, exemple, STATION } from "./haut-de-status.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const SEUILS = { tests: 500, testsSeconds: null, gatesSeconds: null, contextKb: null, repoMb: null, merges: null, growthPercent: null };

// Ajoute à l'état d'exemple du haut ce qui fait paraître le bas : à utiliser sur le journal de `exemple(t)`
// ou, avec `etatDAvant`, sur le journal d'avant — l'un et l'autre portent le même rail.
export function ajouterLeBas(journal: ReturnType<typeof etatDAvant>["journal"]): void {
  // Tout s'écrit à l'instant où l'état du haut s'arrête (10:02) : la lecture est à 10:04.
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, title: string, card?: { waitsFor: number[]; zone: string[]; problems: string[] }) =>
    noter({ type: "ticket.arrived", payload: { title, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, ...(card === undefined ? {} : { card }) } }, ticket, "github");
  const station = `station:${STATION}`;

  // Un ticket qui en attend un autre, un autre qui attend un 86 sans heure de retour (bloqué), un troisième
  // dont la zone est tenue par un ticket pris, et un ticket que le chef a mis en attente d'un tiers.
  arriver(31, "Holds the zone", { waitsFor: [], zone: ["runtime/src/etat.ts"], problems: [] });
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-10-12T10:30:00.000Z" } }, 31, station);
  arriver(32, "Same zone", { waitsFor: [], zone: ["runtime/src/etat.ts"], problems: [] });
  arriver(33, "Awaits a 86", { waitsFor: [18], zone: [], problems: [] });
  arriver(34, "Awaits another", { waitsFor: [24], zone: [], problems: [] });
  arriver(35, "At the customer", undefined);
  noter({ type: "ticket.waiting", payload: { what: "the customer's answer", who: "the customer", followUp: "2026-10-14T18:00:00.000Z" } }, 35, "chef");

  // Un 86 sans heure de retour, que la pass n'a pas jugé (gelé), et celui qui l'attend : bloqué par lui. Un 86 dont l'heure
  // de retour est passée sans que le tick l'ait encore rendu, et un ticket pris dont le bail est échu.
  arriver(36, "Frozen");
  noter({ type: "ticket.86", payload: { reason: "pass:unjudged", until: null } }, 36);
  arriver(37, "Awaits the frozen", { waitsFor: [36], zone: [], problems: [] });
  arriver(38, "Return passed");
  noter({ type: "ticket.86", payload: { reason: "quota", until: "2026-10-12T09:00:00.000Z" } }, 38);
  arriver(39, "Expired lease");
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-10-12T10:00:00.000Z" } }, 39, station);
  // Un ticket servi : pris, en pass, mergé.
  arriver(41, "Served");
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-10-12T10:30:00.000Z" } }, 41, station);
  noter({ type: "ticket.passing", payload: { station: STATION } }, 41, station);
  noter({ type: "ticket.served", payload: {} }, 41, "pass");

  // Les cooks : un ticket pris qui travaille, un jugement du manager, un cook qui n'a pas encore de relevé.
  const lancer = (run: string, ticket: number | null, autres: object) =>
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, ...autres } }, ticket);
  lancer("31-aa", 31, { station: STATION, model: "opus", effort: "high", branch: "cook/31-aa", worktree: "worktrees/31-aa" });
  lancer("23-bb", 23, { station: STATION, model: "sonnet", effort: "medium" });
  lancer("juge-9-cc", null, { station: "manager", model: "haiku", effort: "low" });
  noter({ type: "cook.progressed", payload: { run: "31-aa", turns: 12, tokens: 184_000, activity: { doing: "reading", target: "runtime/src/etat.ts", since: "2026-10-12T10:02:00.000Z" } } }, 31);
  // Ce que les cooks ont consommé : une relecture, un jugement, des lancements finis.
  for (const [run, ticket, station, turns, tokens] of [["r-1", 17, "reviewer", 4, 30_000], ["j-1", null, "manager", 2, 9_000], ["c-1", 20, STATION, 40, 600_000]] as const) {
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station } }, ticket);
    noter({ type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns, tokens, durationMs: 5000 } }, ticket);
  }

  // La machine sature, la station se retient, son arbitre ne répond plus.
  noter({ type: "station.saturated", payload: { station: STATION, resource: "cpu", observed: 16.24, limit: 15 } });
  noter({ type: "station.held", payload: { station: STATION, reason: "ramp" } }, null, station);
  noter({ type: "station.unarbitrated", payload: { station: STATION, reason: "connection refused" } }, null, station);

  // Les worktrees que le nettoyage n'a pas pu ranger, et le dernier rangement des transcripts.
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/21-n", branch: "cook/21-n", reason: "failed", detail: "git worktree: fatal: lock held" } }, 21, "nettoyage");
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/22-n", branch: "cook/22-n", reason: "pr-open", detail: "cook/22-n" } }, 22, "nettoyage");
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/22-o", branch: "cook/22-o", reason: "unpushed", detail: "2 commits" } }, 22, "nettoyage");
  noter({ type: "transcripts.tidied", payload: { removed: 12, freedBytes: 48 * 1024 * 1024, kept: 1_027, keptBytes: 112 * 1024 * 1024, keepMs: 7 * 24 * 3_600_000 } }, null, "nettoyage");

  // La dérive : un seuil de tests franchi par une livraison mergée.
  noter({ type: "drift.configured", payload: { limits: SEUILS } });
  noter({ type: "pass.replayed", payload: { sha: "sha-m", base: "base-2", gates: { outcome: "green", code: 0, failures: [], tail: "", measures: { tests: 622, gates_s: 21 } }, findings: [] } }, 40, "pass");
  noter({ type: "merge.done", payload: { pr: "https://github.com/o/r/pull/40", sha: "sha-m", by: "pass", reconciled: false } }, 40, "pass");

  // Les événements qui portent du texte écrit par le journal en français (`how`, de `service.held`) sont au-delà des quinze
  // derniers : `latest events` n'en montre que ces quinze, et le texte de l'exemple n'y a rien de français.
  for (let i = 0; i < 8; i++) noter({ type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
}

// L'état d'exemple du bas : l'état d'exemple du haut, et le bas par-dessus. Le journal est celui de `exemple(t)`.
export function exempleDuBas(t: TestContext, repertoire?: string) {
  const journal = exemple(t, repertoire);
  ajouterLeBas(journal);
  return journal;
}
