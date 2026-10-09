// Le nettoyage : une fois un ticket servi, ou sorti du rail, le worktree et la
// branche locale de chacun de ses cooks sont retirés — sauf ce qui porte un
// travail qui n'est nulle part ailleurs, ou une PR encore ouverte. Ce qui reste
// est dit au journal, et se retrouve dans `status`. Il ne connaît que les
// worktrees que le journal raconte : aucun autre n'est touché.
//
// Tant que le ticket est sur le rail sans être servi, rien n'est retiré : il
// peut repartir, et un renvoi reprend le worktree de la livraison refusée.
import { resolve } from "node:path";
import type { Depot } from "./depot.ts";
import type { FaitNettoyage, MotifDeGarde } from "./evenements/nettoyage.ts";
import type { GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { cooksEnCours } from "./projections/garde-fous.ts";
import { direMotifDeGarde } from "./projections/nettoyage.ts";

export const AUTEUR = "nettoyage";

export type OptionsNettoyage = {
  journal: Journal;
  projet: string;
  // Les worktrees se lisent au journal relatifs à ce répertoire.
  repertoireEtat: string;
  depot: Pick<Depot, "liberer">;
  github: Pick<GitHub, "prDeBranche" | "commenter">;
  avertir: (message: string) => void;
  // Vrai dès que le runtime s'arrête : le nettoyage ne commence plus rien.
  arrete?: () => boolean;
};

// Un worktree à examiner. `served` : la livraison de son ticket est servie.
// `pr` : la PR que la station a connue à sa branche. `reason` : pourquoi il
// est gardé, s'il l'est déjà.
type Candidat = { worktree: string; ticket: number; branch: string; pr: string | null; served: number; reason: MotifDeGarde | null };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Rend de quoi nettoyer. `tick` : ce qui est déjà gardé n'est réexaminé, et
// GitHub n'est lu, qu'au tick.
export function ouvrirNettoyage(options: OptionsNettoyage): (tick: boolean) => Promise<void> {
  const { journal, projet, depot, github, avertir } = options;
  const { base } = journal;
  const arrete = options.arrete ?? (() => false);
  const noter = (ticket: number, fait: FaitNettoyage) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });
  // Cache, pas état : le rang de la dernière lecture de la PR de chaque
  // worktree, pour qu'un ticket à plusieurs PR les relise à tour de rôle.
  const lues = new Map<string, number>();
  let lectures = 0;

  // Les worktrees des cooks dont le ticket est servi, ou sorti du rail, et que
  // rien ne dit encore retirés. Un renvoi partage le worktree de la livraison
  // qu'il reprend : il n'y figure qu'une fois.
  const candidats = () =>
    base.lire<Candidat>(
      `SELECT c.worktree, c.ticket, max(c.branch) AS branch, max(c.pr) AS pr,
              max(r.state IS 'served' OR o.outcome IS 'served') AS served, f.reason
       FROM station_cooks c
       LEFT JOIN rail r ON r.ticket = c.ticket
       LEFT JOIN rail_outcomes o ON o.ticket = c.ticket
       LEFT JOIN worktree_fates f ON f.worktree = c.worktree
       WHERE c.ticket IS NOT NULL AND c.worktree IS NOT NULL AND c.branch IS NOT NULL
         AND (r.state IS 'served' OR (r.ticket IS NULL AND o.outcome IS NOT NULL))
         AND f.state IS NOT 'removed'
       GROUP BY c.worktree
       ORDER BY c.ticket, min(c.launched_seq)`,
    );

  const garder = ({ ticket, worktree, branch, reason }: Candidat, motif: MotifDeGarde, detail: string) => {
    // Le journal ne répète pas : un worktree gardé pour la même raison l'est déjà.
    if (reason === motif) return false;
    noter(ticket, { type: "worktree.kept", payload: { worktree, branch, reason: motif, detail } });
    avertir(`brigade : worktree du ticket #${ticket} gardé (${worktree}) — ${direMotifDeGarde(motif)} : ${detail}`);
    return true;
  };

  const direNonPousse = (gardes: Array<{ candidat: Candidat; reste: string }>) =>
    [
      "**Nettoyage — travail non poussé, gardé.** Ce ticket n'est plus en cuisine, mais ce que ses cooks ont laissé là n'est nulle part ailleurs : rien n'en a été retiré.",
      "",
      ...gardes.map(({ candidat, reste }) => `- \`${resolve(options.repertoireEtat, candidat.worktree)}\`, branche \`${candidat.branch}\` — ${reste}`),
      "",
      "À récupérer, il se pousse depuis ce worktree. À jeter, dans le clone de la station (`BRIGADE_REPO_DIR`) : `git worktree remove --force <worktree>`, puis `git branch -D <branche>`. Dans les deux cas, le runtime le constate au tick suivant et retire ce qui reste ; d'ici là, `status` le liste.",
    ].join("\n");

  const nettoyerTicket = async (ticket: number, worktrees: Candidat[], tick: boolean) => {
    // La PR d'un ticket parti sans être servi : une lecture par tick, celle qui
    // attend depuis le plus longtemps.
    const aLire = worktrees
      .filter((candidat) => !candidat.served && candidat.pr !== null && (candidat.reason === null || candidat.reason === "pr-open"))
      .sort((a, b) => (lues.get(a.worktree) ?? 0) - (lues.get(b.worktree) ?? 0));
    const lue = tick ? aLire[0] : undefined;
    const dejaDit = worktrees.some((candidat) => candidat.reason === "unpushed");
    const nonPousses: Array<{ candidat: Candidat; reste: string }> = [];
    for (const candidat of worktrees) {
      if (arrete()) return;
      // Déjà gardé : il ne se réexamine qu'au tick.
      if (candidat.reason !== null && !tick) continue;
      if (aLire.includes(candidat)) {
        if (candidat !== lue) continue;
        const pr = await github.prDeBranche(candidat.branch);
        lues.set(candidat.worktree, ++lectures);
        if (arrete()) return;
        if (pr !== null && pr.state === "open" && !pr.merged) {
          garder(candidat, "pr-open", pr.url);
          continue;
        }
      }
      let reste: string | null;
      try {
        reste = await depot.liberer(resolve(options.repertoireEtat, candidat.worktree), candidat.branch);
      } catch (erreur) {
        garder(candidat, "failed", message(erreur));
        continue;
      }
      if (reste === null) noter(ticket, { type: "worktree.removed", payload: { worktree: candidat.worktree, branch: candidat.branch } });
      else if (garder(candidat, "unpushed", reste)) nonPousses.push({ candidat, reste });
    }
    // Un commentaire par ticket : le chef le lit là où il lit le reste.
    if (nonPousses.length === 0 || dejaDit) return;
    try {
      await github.commenter(ticket, direNonPousse(nonPousses));
    } catch (erreur) {
      avertir(`brigade : commentaire du nettoyage non posté sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  return async (tick) => {
    // Un cook qui tourne encore écrit dans son worktree, et peut livrer : son
    // ticket attend la passe suivante, en entier.
    const enCuisine = new Set(cooksEnCours(base).map((cook) => cook.ticket));
    const parTicket = Map.groupBy(
      candidats().filter((candidat) => !enCuisine.has(candidat.ticket)),
      (candidat) => candidat.ticket,
    );
    for (const [ticket, worktrees] of parTicket) {
      if (arrete()) return;
      try {
        await nettoyerTicket(ticket, worktrees, tick);
      } catch (erreur) {
        // GitHub injoignable : rien n'est retiré, et le tick suivant y revient.
        if (!arrete()) avertir(`brigade : nettoyage du ticket #${ticket} interrompu — ${message(erreur)}`);
      }
    }
  };
}
