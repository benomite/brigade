// Les faits de la fermeture qui écrit : la passe que le chef commande, ce qui
// la refuse, ce qu'elle tient pendant qu'elle range, et comment elle finit.
// La fermeture qui observe n'en écrit aucun : elle ne touche à rien.
import type { Calibrage } from "../calibrage.ts";

// Les réglages d'une passe. `calibration` nul : le projet ne règle pas le
// closer, aucune passe ne part. `cooksBelow` : la passe part quand moins de
// cooks que cela sont en vol. `tokens`, `removedLines` : ses plafonds — ce
// qu'elle peut consommer, et les lignes qu'elle peut retirer.
export type ReglagesDeFermeture = { calibration: Calibrage | null; cooksBelow: number; tokens: number; removedLines: number };

// Pourquoi une passe demandée n'est pas partie. `unconfigured` : le closer
// n'est pas réglé. `busy` : une passe range déjà. `stopped`, `breaker` : le
// « stop » du chef, le disjoncteur. `cooks` : sa condition d'exécution — trop
// de cooks en vol (`observed`) pour son seuil (`limit`), et un rail qui n'est
// pas vide. `zoneless` : un cook en vol ne déclare aucune zone, la passe ne
// peut pas savoir ce qu'il tient. `depot` : la base ne se lit pas. `nothing` :
// rien de ce que l'observation repère n'est hors de ce que les cooks tiennent.
// `restarted` : le runtime a redémarré avant de la prendre — une passe ne part
// pas d'une demande d'une autre vie, elle se redemande.
export type MotifDeRefus = "unconfigured" | "busy" | "stopped" | "breaker" | "cooks" | "zoneless" | "depot" | "nothing" | "restarted";

// Comment une passe a fini. `delivered` : ce qu'elle a retiré est dans une PR.
// `nothing` : elle n'a rien retiré. `tokens`, `removals`, `idle`, `duration`,
// `turns` : un garde-fou l'a arrêtée. `stop` : le chef. `breaker` : le
// disjoncteur s'est ouvert pendant qu'elle rangeait. `zone` : elle a écrit hors
// de ce qu'elle tenait, ou dans ce qu'un cook tient — rien n'est livré.
// `failed` : son cook a échoué, ou sa livraison n'a pas pu partir.
// `interrupted` : le runtime est mort pendant qu'elle rangeait.
export type FinDePasse = "delivered" | "nothing" | "tokens" | "removals" | "idle" | "duration" | "turns" | "stop" | "breaker" | "zone" | "failed" | "interrupted";

// Un candidat de l'observation que la passe n'a pas retiré : lequel, et
// pourquoi. `before` : écarté avant qu'elle ne parte — un cook le tenait, ou
// la passe en avait déjà assez ; sinon c'est le closer qui l'a laissé, faute
// d'être sûr. `reason` nul : il n'a pas dit pourquoi.
export type Laisse = { id: string; what: string; reason: string | null; before: boolean };

// Un candidat que la passe a retiré : lequel, et ce que l'observation en
// disait — où il était, et pourquoi il était à retirer.
export type Retrait = { id: string; what: string };

// Ce que les `merges` derniers merges de la base ont ajouté et retiré, dans
// une fenêtre de `window` merges, à l'instant où la passe est partie.
export type Pente = { window: number; merges: number; added: number; removed: number };

export type FaitFermeture =
  // Les réglages en vigueur, écrits quand ils changent : c'est ici que la
  // commande du chef les lit.
  | { type: "closing.configured"; payload: ReglagesDeFermeture }
  // Le geste du chef : lui seul fait partir une passe qui écrit. Aucun autre
  // fait ne la lance — ni un seuil franchi, ni une horloge.
  | { type: "closing.requested"; payload: Record<string, never> }
  // La passe demandée ne part pas — refusée par la commande du chef, ou par
  // le runtime si la cuisine a changé entre-temps. `detail` : ce qui précise
  // le motif — les tickets en cause, combien le rail en porte, ce que git a dit.
  | { type: "closing.refused"; payload: { reason: MotifDeRefus; observed: number | null; limit: number | null; detail: string | null } }
  // La passe part. `base` : le commit de la branche d'intégration dont elle
  // part. `zone` : les fichiers qu'elle tient tant qu'elle range — aucun cook
  // ne démarre dessus, et elle n'écrit nulle part ailleurs. `held` : les
  // chemins que des cooks tenaient, et qu'elle s'interdit. `candidates` : ce
  // que l'observation lui propose.
  | { type: "closing.started"; payload: { run: string; base: string; zone: string[]; held: string[]; candidates: number; limits: { tokens: number; removedLines: number } } }
  // La fin. `observed`, `limit` : la mesure et le plafond du garde-fou qui l'a
  // arrêtée. `files` : ce qu'elle a écrit — ou, sur `zone`, ce qu'elle n'avait
  // pas à écrire. `kept` : ce qu'elle n'a pas retiré, avec son motif.
  // `removed` : ce qu'elle a retiré de ce qui lui était proposé. `addedLines` :
  // les lignes qu'elle a ajoutées, en regard de `removedLines`. `slope` : la
  // pente de la base dont elle est partie — de quoi dire, sur les mêmes
  // merges, ce que la passe y change. Une passe finie avant que le bilan
  // n'existe ne porte aucun des trois.
  | {
      type: "closing.ended";
      payload: {
        run: string;
        outcome: FinDePasse;
        observed?: number | null;
        limit?: number | null;
        branch?: string;
        pr?: string;
        sha?: string;
        removedLines?: number;
        addedLines?: number;
        files?: string[];
        removed?: Retrait[];
        kept?: Laisse[];
        slope?: Pente[];
        detail?: string;
      };
    };
