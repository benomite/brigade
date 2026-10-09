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
//
// Sous cloison, le `~/.claude` du projet est aussi à lui : les transcripts que
// `claude` y laisse partent une fois passée leur durée de garde. Sans cloison,
// ils vont sous le `~/.claude` du compte, qui n'est pas au runtime : rien n'y
// est touché.
import { resolve } from "node:path";
import type { Depot } from "./depot.ts";
import type { FaitNettoyage } from "./evenements/nettoyage.ts";
import type { Journal } from "./journal.ts";
import { lire } from "./plafonds.ts";
import { cooksEnCours } from "./projections/garde-fous.ts";
import { rangementDesTranscripts } from "./projections/nettoyage.ts";
import { derniereSession } from "./projections/sessions.ts";
import { lireTranscripts, retirerDossierVide, retirerTranscript } from "./transcripts.ts";

export const AUTEUR = "nettoyage";

const JOUR_MS = 24 * 3_600_000;
// Le rangement des transcripts relit tout un répertoire : il passe au
// démarrage, puis une fois par jour — pas à chaque tick.
const CADENCE_TRANSCRIPTS_MS = JOUR_MS;

// Lit `BRIGADE_TRANSCRIPTS_KEEP_DAYS` : combien de temps un transcript reste
// après sa dernière écriture, dans le `~/.claude` d'un projet cloisonné.
export function configTranscripts(env: NodeJS.ProcessEnv): { gardeMs: number } {
  const jours = lire(env, "BRIGADE_TRANSCRIPTS_KEEP_DAYS", 7, "un nombre de jours supérieur à zéro, 3650 au plus", (valeur) => valeur > 0 && valeur <= 3650);
  return { gardeMs: Math.round(jours * JOUR_MS) };
}

export type OptionsNettoyage = {
  journal: Journal;
  projet: string;
  // Les worktrees se lisent au journal relatifs à ce répertoire.
  repertoireEtat: string;
  depot: Pick<Depot, "ranger" | "elaguer">;
  avertir: (message: string) => void;
  // Vrai dès que le runtime s'arrête : le nettoyage ne commence plus rien.
  arrete?: () => boolean;
  // Le `~/.claude` du projet, sous cloison, et la durée de garde de ses
  // transcripts. Absent : rien n'est cloisonné, aucun transcript n'est rangé.
  transcripts?: { claude: string; gardeMs: number } | null;
  maintenant?: () => Date;
};

export type Nettoyage = {
  // Range le worktree d'un cook qui vient de finir. Ne lève pas : ce qui ne
  // se range pas est gardé, et dit.
  ranger(ticket: number, worktree: string, branche: string): Promise<void>;
  // Range ce qui a échappé à la station — un worktree gardé est réessayé à
  // chaque passage —, et élague les branches locales des tickets servis ou
  // partis. Une branche qui porte des commits absents de l'origine n'est
  // regardée qu'une fois par vie du runtime : rien ne l'y fera pousser. Et,
  // une fois par jour, range les transcripts du projet cloisonné.
  rattraper(): Promise<void>;
};

type Candidat = { worktree: string; ticket: number; branch: string; kept: number };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirNettoyage(options: OptionsNettoyage): Nettoyage {
  const { journal, projet, depot, avertir } = options;
  const { base } = journal;
  const arrete = options.arrete ?? (() => false);
  const maintenant = options.maintenant ?? (() => new Date());
  const noter = (ticket: number, fait: FaitNettoyage) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });
  // Cache, pas état : les branches déjà regardées dans cette vie, et restées
  // — des commits absents de l'origine, ou un `git` qui a refusé. Sans lui,
  // chaque branche de cook raté coûterait deux `git` par tick, pour toujours.
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
  const aRanger = () =>
    base.lire<Candidat>(
        `SELECT c.worktree, c.ticket, max(c.branch) AS branch, f.state IS 'kept' AS kept
         FROM station_cooks c
         LEFT JOIN worktree_fates f ON f.worktree = c.worktree
         WHERE c.ticket IS NOT NULL AND c.worktree IS NOT NULL AND c.branch IS NOT NULL
           AND f.state IS NOT 'removed'
         GROUP BY c.worktree
         HAVING kept OR max(c.launched_seq) < ?
         ORDER BY c.ticket, min(c.launched_seq)`,
        derniereSession(base)?.startedSeq ?? 0,
      );

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

  // Un transcript part quand rien ne l'a écrit depuis la durée de garde. Celui
  // d'un lancement en cours n'est jamais touché : il a été écrit depuis le
  // départ de ce lancement, et rien d'écrit depuis le départ du plus ancien
  // lancement en cours ne part — cook, relecture ou jugement, le journal les
  // raconte tous. Ce qui ne se retire pas reste, et se dit une fois par vie.
  let prochain = 0;
  let averti = false;
  const rangerTranscripts = () => {
    const { transcripts } = options;
    const instant = maintenant().getTime();
    if (!transcripts || instant < prochain) return;
    prochain = instant + CADENCE_TRANSCRIPTS_MS;
    const limite = Math.min(instant - transcripts.gardeMs, ...cooksEnCours(base).map((cook) => Date.parse(cook.launchedAt)));
    const bilan = { removed: 0, freedBytes: 0, kept: 0, keptBytes: 0 };
    const lus = lireTranscripts(transcripts.claude);
    for (const transcript of lus.transcripts) {
      let parti = transcript.ecritMs < limite;
      if (parti) {
        try {
          retirerTranscript(transcript);
        } catch (erreur) {
          parti = false;
          if (!averti) avertir(`brigade : transcript non rangé (${transcript.chemins[0]}) — ${message(erreur)}`);
          averti = true;
        }
      }
      bilan[parti ? "removed" : "kept"] += 1;
      bilan[parti ? "freedBytes" : "keptBytes"] += transcript.octets;
    }
    // Le répertoire d'un worktree parti, une fois vidé : rien n'y naîtra plus.
    for (const dossier of lus.dossiers) if (dossier.ecritMs < limite) retirerDossierVide(dossier);
    journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "transcripts.tidied", payload: { ...bilan, keepMs: transcripts.gardeMs } });
  };

  // Un projet qui a tourné cloisonné puis redémarre sans cloison ne range plus
  // rien : le dernier passage au journal ne se lirait plus que comme un mensonge.
  if (!options.transcripts && rangementDesTranscripts(base)) {
    journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "transcripts.released", payload: {} });
  }

  return {
    ranger,
    async rattraper() {
      for (const { ticket, worktree, branch } of aRanger()) {
        if (arrete()) return;
        await ranger(ticket, worktree, branch);
      }
      for (const { ticket, branch } of aElaguer()) {
        if (arrete()) return;
        if (gardees.has(branch)) continue;
        try {
          if (await depot.elaguer(branch)) noter(ticket, { type: "branch.removed", payload: { branch } });
          else gardees.add(branch);
        } catch (erreur) {
          avertir(`brigade : branche locale ${branch} du ticket #${ticket} non retirée — ${message(erreur)}`);
          gardees.add(branch);
        }
      }
      // En dernier : le premier ticket attend les worktrees, pas les transcripts.
      if (!arrete()) rangerTranscripts();
    },
  };
}
