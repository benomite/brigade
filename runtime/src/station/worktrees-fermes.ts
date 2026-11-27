// Retire les worktrees dont le ticket est fermé ou mergé (#4658). Le worktree d'un
// cook sorti part déjà à sa sortie (`restes-du-cook.ts`) ; celui d'une livraison
// gardée pour un renvoi, ou d'un cook dont la station a été coupée, resterait
// jusqu'à la fin des temps. Un ticket ouvert, illisible ou en cuisine garde le sien.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// `<n>-github`, ou `<geste>-<n>-github` (`gates-`, `review-`, `reprise-`…). Les
// worktrees de PR externes (`…-pr-<n>-github`) ne sont pas ceux d'un ticket.
export function ticketDuWorktree(nom: string): number | null {
  if (/-pr-\d+-github$/.test(nom)) return null;
  const numero = /^(?:[a-z][a-z-]*-)?(\d+)-github$/.exec(nom)?.[1];
  return numero === undefined ? null : Number(numero);
}

export type WorktreesFermes = {
  dossier: string;
  // Vrai si le ticket est lu fermé ; faux ou illisible : il compte pour ouvert.
  ferme: (ticket: number) => Promise<boolean>;
  enCuisine: (ticket: number) => boolean;
  // Retire un worktree que git connaît ; s'il ne le connaît plus, le répertoire part quand même.
  retirer: (chemin: string) => void;
  avertir?: (message: string) => void;
};

// Les worktrees retirés. Ne lève jamais : un échec est dit, le suivant est tenté.
export async function retirerLesWorktreesDesTicketsFermes({ dossier, ferme, enCuisine, retirer, avertir = (m) => console.error(m) }: WorktreesFermes): Promise<string[]> {
  let noms: string[];
  try {
    noms = readdirSync(dossier);
  } catch {
    return [];
  }
  const retires: string[] = [];
  for (const nom of noms) {
    const ticket = ticketDuWorktree(nom);
    if (ticket === null || enCuisine(ticket)) continue;
    const chemin = join(dossier, nom);
    try {
      if (!(await ferme(ticket))) continue;
      try {
        retirer(chemin);
      } catch {
        // git ne le connaît plus : ce qu'il en reste part quand même.
      }
      rmSync(chemin, { recursive: true, force: true });
      retires.push(chemin);
    } catch (erreur) {
      avertir(`brigade : worktree ${nom} of a closed ticket could not be removed — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return retires;
}
