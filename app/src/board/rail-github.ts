// Ce que la lecture du rail tire de GitHub (#2059, épique #2053 ; vue/rail/github.ts) : l'état de chaque ticket du rail
// est celui que `etatDuTicket` tire de l'issue (ses labels), de sa PR et du statut de la base
// (runtime/src/github-etat/etats.ts) — ni boîte, ni relais, ni journal de station. Deux lecteurs qui voient les mêmes
// labels et la même PR disent le même état. Ce module en donne les mots, le ticket qu'une PR livre, l'état de la base,
// et les lectures conditionnelles (`If-None-Match`) : un 304 ne coûte rien au quota, la réponse gardée est reprise.
import { etatDeLaBase, type EtatDeLaBase, type EtatDuTicket } from "../../../runtime/src/github-etat/etats.ts";
import type { CallGitHub } from "./client.ts";

// Les mots du rail (facts.ts, `TONS_DE_TICKET`) ; `base rouge` est celui d'un ticket en pass dont la base est rouge.
export const WORD_OF_THE_STATE: Readonly<Record<EtatDuTicket, string>> = { taken: "pris", pass: "en pass", parked: "WAITING", "base-red": "base rouge" };

type Raw = Record<string, unknown>;

// Le ticket qu'une PR livre : son nom de branche `cook/<n>-…`, ou un `Closes #n` de son corps — la règle même du
// récapitulatif du runtime (#3581), qui lit les tickets servis sur les mêmes PR que la colonne Served.
export { ticketDeLaPR } from "../../../runtime/src/recap/servis.ts";

// Les checks d'un commit, d'après les *check runs* de GitHub. Une conclusion vide : le check court encore.
export function stateOfTheBaseGithub(runs: readonly Raw[]): EtatDeLaBase | null {
  const red = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);
  return etatDeLaBase(runs.map((run): { outcome: "green" | "red" | "pending" } => ({ outcome: typeof run.conclusion !== "string" ? "pending" : red.has(run.conclusion) ? "red" : "green" })));
}

// Ce que GitHub a rendu à chaque chemin, avec son ETag : une relecture le redemande (`If-None-Match`), et un 304 ne
// coûte rien au quota — la réponse gardée est reprise.
export type MemoryOfReads = Map<string, { etag: string; data: unknown }>;

export function readConditional(call: CallGitHub, memory: MemoryOfReads): CallGitHub {
  return async (path) => {
    const keptOne = memory.get(path);
    const answer = await call(path, keptOne === undefined ? undefined : { "If-None-Match": keptOne.etag });
    if (answer.status === 304 && keptOne !== undefined) return { status: 200, data: keptOne.data, etag: keptOne.etag };
    if (answer.status === 200 && answer.etag !== undefined) memory.set(path, { etag: answer.etag, data: answer.data });
    else if (answer.status !== 200) memory.delete(path);
    return answer;
  };
}
