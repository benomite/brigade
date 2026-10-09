// Le nettoyage : le worktree d'un cook part à la fin de ce cook, réussi ou
// non, une fois commité sur sa branche ce qui y traînait — rien n'est perdu,
// et c'est le worktree qui pèse, pas la branche. La station le range dès
// qu'elle a raconté la fin du cook ; le rattrapage range ce qui lui a échappé
// : les worktrees des cooks d'une vie précédente, et ceux qu'un premier essai
// a laissés. Ce qui ne se range pas est dit au journal, et se retrouve dans
// `status`. Il ne connaît que les worktrees que le journal raconte : aucun
// autre n'est touché.
//
// La branche locale, elle, part une fois le ticket servi ou sorti du rail, si
// tous ses commits sont sur l'origine. Sinon elle reste, sans bruit.
import { resolve } from "node:path";
import type { Depot } from "./depot.ts";
import type { FaitNettoyage } from "./evenements/nettoyage.ts";
import type { Journal } from "./journal.ts";
import { derniereSession } from "./projections/sessions.ts";

export const AUTEUR = "nettoyage";

export type OptionsNettoyage = {
  journal: Journal;
  projet: string;
  // Les worktrees se lisent au journal relatifs à ce répertoire.
  repertoireEtat: string;
  depot: Pick<Depot, "ranger" | "elaguer">;
  avertir: (message: string) => void;
  // Vrai dès que le runtime s'arrête : le nettoyage ne commence plus rien.
  arrete?: () => boolean;
};

export type Nettoyage = {
  // Range le worktree d'un cook qui vient de finir. Ne lève pas : ce qui ne
  // se range pas est gardé, et dit.
  ranger(ticket: number, worktree: string, branche: string): Promise<void>;
  // Range ce qui a échappé à la station, et élague les branches locales des
  // tickets servis ou partis. `tick` : ce qui a déjà résisté — un worktree
  // gardé, une branche qui porte des commits absents de l'origine — n'est
  // réessayé qu'au tick.
  rattraper(tick: boolean): Promise<void>;
};

type Candidat = { worktree: string; ticket: number; branch: string; kept: number };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirNettoyage(options: OptionsNettoyage): Nettoyage {
  const { journal, projet, depot, avertir } = options;
  const { base } = journal;
  const arrete = options.arrete ?? (() => false);
  const noter = (ticket: number, fait: FaitNettoyage) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });
  // Cache, pas état : les branches qui portaient, au dernier regard, des
  // commits absents de l'origine.
  const gardees = new Set<string>();

  const garde = (worktree: string) => base.lire<{ n: number }>("SELECT count(*) AS n FROM worktree_fates WHERE worktree = ? AND state = 'kept' AND reason = 'failed'", worktree)[0]?.n === 1;

  const ranger = async (ticket: number, worktree: string, branch: string) => {
    let harvest: string | null;
    try {
      harvest = await depot.ranger(resolve(options.repertoireEtat, worktree), branch);
    } catch (erreur) {
      // Le journal ne répète pas : un worktree déjà gardé l'est encore.
      if (garde(worktree)) return;
      noter(ticket, { type: "worktree.kept", payload: { worktree, branch, reason: "failed", detail: message(erreur) } });
      avertir(`brigade : worktree du ticket #${ticket} non rangé (${worktree}, branche ${branch}) — ${message(erreur)}`);
      return;
    }
    noter(ticket, { type: "worktree.removed", payload: { worktree, branch, harvest } });
  };

  // Les worktrees que rien ne dit rangés, et que plus aucun cook n'occupe :
  // ceux des cooks d'une vie précédente — la station range les siens —, et
  // ceux qu'elle n'a pas pu ranger. Un journal d'avant #164 peut raconter
  // plusieurs cooks dans un même worktree : il n'y figure qu'une fois.
  const aRanger = (tick: boolean) =>
    base
      .lire<Candidat>(
        `SELECT c.worktree, c.ticket, max(c.branch) AS branch, f.state IS 'kept' AS kept
         FROM station_cooks c
         LEFT JOIN worktree_fates f ON f.worktree = c.worktree
         WHERE c.ticket IS NOT NULL AND c.worktree IS NOT NULL AND c.branch IS NOT NULL
           AND f.state IS NOT 'removed'
         GROUP BY c.worktree
         HAVING kept OR max(c.launched_seq) < ?
         ORDER BY c.ticket, min(c.launched_seq)`,
        derniereSession(base)?.startedSeq ?? 0,
      )
      .filter((candidat) => tick || !candidat.kept);

  // Les branches locales des tickets servis, ou sortis du rail, dont tous les
  // worktrees sont rangés.
  const aElaguer = () =>
    base.lire<{ branch: string; ticket: number }>(
      `SELECT c.branch, c.ticket
       FROM station_cooks c
       LEFT JOIN rail r ON r.ticket = c.ticket
       LEFT JOIN rail_outcomes o ON o.ticket = c.ticket
       LEFT JOIN worktree_fates f ON f.worktree = c.worktree
       WHERE c.ticket IS NOT NULL AND c.worktree IS NOT NULL AND c.branch IS NOT NULL
         AND (r.state IS 'served' OR (r.ticket IS NULL AND o.outcome IS NOT NULL))
         AND c.branch NOT IN (SELECT branch FROM branch_fates)
       GROUP BY c.branch
       HAVING min(f.state IS 'removed') = 1
       ORDER BY c.ticket, min(c.launched_seq)`,
    );

  return {
    ranger,
    async rattraper(tick) {
      for (const { ticket, worktree, branch } of aRanger(tick)) {
        if (arrete()) return;
        await ranger(ticket, worktree, branch);
      }
      for (const { ticket, branch } of aElaguer()) {
        if (arrete()) return;
        if (!tick && gardees.has(branch)) continue;
        try {
          if (await depot.elaguer(branch)) {
            gardees.delete(branch);
            noter(ticket, { type: "branch.removed", payload: { branch } });
          } else gardees.add(branch);
        } catch (erreur) {
          if (!gardees.has(branch)) avertir(`brigade : branche locale ${branch} du ticket #${ticket} non retirée — ${message(erreur)}`);
          gardees.add(branch);
        }
      }
    },
  };
}
