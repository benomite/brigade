// A stale claim (#2751): a `taken` ticket whose cook is gone stays blocked
// until a human clears it. Given the tickets of a project and the set of live
// cooks, this releases every `taken` ticket that has had no live cook for more
// than 45 minutes: `taken` is removed (`fire` stays, so the ticket is back on
// the rail) and a comment says why. Not wired into the pass loop.
import type { GitHub } from "../github.ts";
import { LABEL_TAKEN } from "../github-etat/etats.ts";
import type { TicketLu } from "../brigade-github.ts";

export const DELAI_CLAIM_PERIME_MS = 45 * 60 * 1000;

export type GitHubDuClaim = Pick<GitHub, "delabelliser" | "commenter">;

export type OptionsClaimPerime = {
  github: GitHubDuClaim;
  // In milliseconds; the system clock by default. Tests put theirs.
  maintenant?: () => number;
  delaiMs?: number;
};

export type BilanDuClaim = {
  // The tickets released at this tick.
  liberes: number[];
  // The tickets whose release GitHub refused: they are retried at the next tick.
  echecs: { ticket: number; message: string }[];
};

export function ouvrirClaimPerime(options: OptionsClaimPerime) {
  const { github } = options;
  const maintenant = options.maintenant ?? Date.now;
  const delaiMs = options.delaiMs ?? DELAI_CLAIM_PERIME_MS;
  // Since when each `taken` ticket has been seen with no live cook.
  const sansCookDepuis = new Map<number, number>();

  return {
    // `vivants`: the numbers of the tickets a live cook is on.
    async passer(tickets: Pick<TicketLu, "number" | "labels">[], vivants: ReadonlySet<number>): Promise<BilanDuClaim> {
      const bilan: BilanDuClaim = { liberes: [], echecs: [] };
      const maintenantMs = maintenant();
      const pris = new Set<number>();
      for (const ticket of tickets) {
        if (!ticket.labels.includes(LABEL_TAKEN)) continue;
        pris.add(ticket.number);
        if (vivants.has(ticket.number)) {
          sansCookDepuis.delete(ticket.number);
          continue;
        }
        const depuis = sansCookDepuis.get(ticket.number) ?? maintenantMs;
        sansCookDepuis.set(ticket.number, depuis);
        const minutes = Math.floor((maintenantMs - depuis) / 60_000);
        if (maintenantMs - depuis <= delaiMs) continue;
        try {
          await github.delabelliser(ticket.number, LABEL_TAKEN);
          sansCookDepuis.delete(ticket.number);
          bilan.liberes.push(ticket.number);
          await github.commenter(
            ticket.number,
            `The kitchen released the claim (\`${LABEL_TAKEN}\`) on this ticket: no live cook has held it for ${minutes} minutes (limit ${Math.round(delaiMs / 60_000)}). It is back on the rail.`,
          );
        } catch (erreur) {
          if (!bilan.liberes.includes(ticket.number)) bilan.echecs.push({ ticket: ticket.number, message: erreur instanceof Error ? erreur.message : String(erreur) });
        }
      }
      // A ticket no longer `taken` forgets its clock.
      for (const numero of sansCookDepuis.keys()) if (!pris.has(numero)) sansCookDepuis.delete(numero);
      return bilan;
    },
  };
}
