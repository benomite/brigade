// Ce que la lecture du rail tire de GitHub (#2059, épique #2053 ; vue/rail/github.ts) : l'état de chaque ticket du rail
// est celui que `etatDuTicket` tire de l'issue (ses labels), de sa PR et du statut de la base
// (runtime/src/github-etat/etats.ts) — ni boîte, ni relais, ni journal de station. Deux lecteurs qui voient les mêmes
// labels et la même PR disent le même état. Ce module en donne les mots, le ticket qu'une PR livre, l'état de la base,
// et les lectures conditionnelles (`If-None-Match`) : un 304 ne coûte rien au quota, la réponse gardée est reprise.
import { etatDeLaBase, type EtatDeLaBase, type EtatDuTicket } from "../../../runtime/src/github-etat/etats.ts";
import type { AppelGitHub } from "./client.ts";

// Les mots du rail (faits.ts, `TONS_DE_TICKET`) ; `base rouge` est celui d'un ticket en pass dont la base est rouge.
export const MOT_DE_L_ETAT: Readonly<Record<EtatDuTicket, string>> = { taken: "pris", pass: "en pass", waiting: "WAITING", "base-red": "base rouge" };

type Brut = Record<string, unknown>;

// Le ticket qu'une PR livre : son nom de branche `cook/<n>-…`, ou un `Closes #n` de son corps.
export function ticketDeLaPR(tete: string, corps: string): number | null {
  const branche = /^cook\/(\d+)(?:-|$)/.exec(tete)?.[1];
  const ferme = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(corps)?.[1];
  const numero = Number(branche ?? ferme);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

// Les checks d'un commit, d'après les *check runs* de GitHub. Une conclusion vide : le check court encore.
export function etatDeLaBaseGithub(runs: readonly Brut[]): EtatDeLaBase | null {
  const rouges = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);
  return etatDeLaBase(runs.map((run): { outcome: "green" | "red" | "pending" } => ({ outcome: typeof run.conclusion !== "string" ? "pending" : rouges.has(run.conclusion) ? "red" : "green" })));
}

// Ce que GitHub a rendu à chaque chemin, avec son ETag : une relecture le redemande (`If-None-Match`), et un 304 ne
// coûte rien au quota — la réponse gardée est reprise.
export type MemoireDesLectures = Map<string, { etag: string; data: unknown }>;

export function lectureConditionnelle(appeler: AppelGitHub, memoire: MemoireDesLectures): AppelGitHub {
  return async (chemin) => {
    const gardee = memoire.get(chemin);
    const reponse = await appeler(chemin, gardee === undefined ? undefined : { "If-None-Match": gardee.etag });
    if (reponse.status === 304 && gardee !== undefined) return { status: 200, data: gardee.data, etag: gardee.etag };
    if (reponse.status === 200 && reponse.etag !== undefined) memoire.set(chemin, { etag: reponse.etag, data: reponse.data });
    else if (reponse.status !== 200) memoire.delete(chemin);
    return reponse;
  };
}
