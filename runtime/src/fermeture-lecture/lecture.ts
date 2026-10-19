// La fermeture, lue pour l'app : un objet, et non des lignes à découper. Ce
// que `closing` imprime au chef — l'observation de la branche d'intégration,
// les compteurs de la dérive, la dernière passe qui écrit et son bilan — est
// relu ici dans les mêmes fonctions, sans rien recompter d'autre ni rien
// inventer : le seuil de dérive est celui du relevé des mesures, que le bloc
// `journal` de l'observation reprend (docs/runtime/fermeture.md).
//
// Rien n'y écrit. Le journal est ouvert en lecture seule par la commande, le
// dépôt n'est lu que par l'observation : lire n'a jamais rien lancé.
import type { FaitFermeture, Laisse, Retrait } from "../events/closing.ts";
import type { Journal } from "../journal.ts";
import { direJaugeEn, franchis, SANS_SEUIL } from "../mesures.ts";
import { mergedDeliveries, seuilsEnVigueur } from "../projections/measures.ts";
import { demandeEnAttente, refus, reglagesEnVigueur, type Refus } from "../closing/condition.ts";
import type { Observation } from "../closing/observer.ts";
import { direRatio } from "../closing/ratio.ts";
import { direDemandeEn, direFinEn, direRefusEn } from "../closing/say.ts";

// Ce qui retient une demande, ou l'a refusée : son motif tel que le journal le
// porte, et la phrase que `closing` en dit.
export type Motif = { code: Refus["reason"]; observed: number | null; limit: number | null; detail: string | null; text: string };

// Une trouvaille de l'observation, sous le nom court que la passe lui donne
// (`D<n>`, `M<n>`) : un fichier et ses lignes, de `start` à `end`. Un doublon
// dit aussi où est sa copie ; un export mort n'occupe qu'une ligne.
export type Trouvaille =
  | { id: string; kind: "duplicate"; file: string; start: number; end: number; lines: number; copy: { file: string; start: number; end: number } }
  | { id: string; kind: "dead-export"; file: string; start: number; end: number; name: string; onlyTests: string[] };

// Une fenêtre du ratio : `ratio` nul quand rien n'a été retiré.
export type Fenetre = { window: number; merges: number; added: number; removed: number; ratio: number | null; reads: string };

// `readable` faux : la branche d'intégration ne se lit pas — l'observation
// n'a rien, le journal dit quand même ce qu'il sait.
export type ObservationLue =
  | { readable: true; ref: string; sha: string; lastMerge: string | null; mergesSinceCleanup: number; ratio: Fenetre[]; duplicates: number; deadExports: number; codeFiles: number; modules: number; skippedFiles: number }
  | { readable: false; error: string; mergesSinceCleanup: number };

type Fin = Extract<FaitFermeture, { type: "closing.ended" }>["payload"];

// La dernière demande de passe qui écrit, et où elle en est.
//   none       aucune n'a jamais été demandée
//   waiting    demandée, pas encore partie : `reason` dit ce qui la retient, nul quand plus rien — elle part au prochain réveil
//   running    partie, elle range
//   refused    refusée, avec son motif
//   cancelled  retirée par le chef avant de partir
//   done       finie : `outcome` dit comment ; livrée, `pr` est sa PR et `removed` ce qu'elle a retiré
export type Demande =
  | { state: "none" }
  | { state: "waiting"; since: string; stalledAt: string | null; reason: Motif | null; text: string }
  | { state: "running"; run: string; since: string; base: string; zone: string[]; candidates: number }
  | { state: "refused"; at: string; reason: Motif; text: string }
  | { state: "cancelled"; at: string }
  | {
      state: "done";
      run: string;
      at: string;
      outcome: Fin["outcome"];
      delivered: boolean;
      pr: string | null;
      removed: Retrait[];
      removedLines: number | null;
      addedLines: number | null;
      files: string[];
      kept: Laisse[];
      text: string;
    };

// La dérive : `crossed` vrai dès qu'une mesure du relevé franchit le seuil que
// le chef lui a déclaré. Aucun seuil déclaré : rien n'est franchi.
export type Derive = { declared: boolean; crossed: boolean; crossings: Array<{ measure: string; observed: number; limit: number; text: string }> };

// La réponse. Sans closer réglé, elle le dit, et rien d'autre : ni observation,
// ni trouvaille, ni demande.
export type LectureDeFermeture =
  | { configured: false; text: string }
  | {
      configured: true;
      closer: { model: string; effort: string; cooksBelow: number; tokens: number; removedLines: number };
      observation: ObservationLue;
      findings: Trouvaille[];
      request: Demande;
      drift: Derive;
    };

export const SANS_CLOSER = "the closer is not set on this project: no closing pass writes, there is nothing to observe for it";

const motif = (lu: Refus): Motif => ({ code: lu.reason, observed: lu.observed, limit: lu.limit, detail: lu.detail, text: direRefusEn(lu) });

// Les trouvailles, dans l'ordre et sous les noms que la passe leur donne
// (`closing/candidates.ts`) : les doublons d'abord, les plus longs en tête.
export function trouvailles({ doublons, morts }: Pick<Observation, "doublons" | "morts">): Trouvaille[] {
  return [
    ...doublons.map(({ lignes, passages: [premier, second] }, rang): Trouvaille => ({
      id: `D${rang + 1}`,
      kind: "duplicate",
      file: premier.chemin,
      start: premier.debut,
      end: premier.fin,
      lines: lignes,
      copy: { file: second.chemin, start: second.debut, end: second.fin },
    })),
    ...morts.map(({ chemin, ligne, nom, tests }, rang): Trouvaille => ({ id: `M${rang + 1}`, kind: "dead-export", file: chemin, start: ligne, end: ligne, name: nom, onlyTests: tests })),
  ];
}

// La dernière demande, lue comme le bloc `journal` de `closing` la lit : le
// plus récent des faits de la passe qui écrit dit où elle en est.
export function demande(journal: Journal): Demande {
  const dernier = <T extends "closing.requested" | "closing.refused" | "closing.cancelled" | "closing.started" | "closing.ended">(type: T) => journal.duType(type, 1)[0];
  const [demandee, refusee, retiree, partie, finie] = [dernier("closing.requested"), dernier("closing.refused"), dernier("closing.cancelled"), dernier("closing.started"), dernier("closing.ended")];
  const recent = Math.max(...[demandee, refusee, retiree, partie, finie].map((fait) => fait?.seq ?? 0));
  if (recent === 0) return { state: "none" };
  if (finie?.seq === recent) {
    const fin = finie.payload;
    return {
      state: "done",
      run: fin.run,
      at: finie.at,
      outcome: fin.outcome,
      delivered: fin.outcome === "delivered",
      pr: fin.pr ?? null,
      removed: fin.removed ?? [],
      removedLines: fin.removedLines ?? null,
      addedLines: fin.addedLines ?? null,
      files: fin.files ?? [],
      kept: fin.kept ?? [],
      text: direFinEn(fin),
    };
  }
  if (partie?.seq === recent) return { state: "running", run: partie.payload.run, since: partie.at, base: partie.payload.base, zone: partie.payload.zone, candidates: partie.payload.candidates };
  if (refusee?.seq === recent) return { state: "refused", at: refusee.at, reason: motif(refusee.payload), text: direRefusEn(refusee.payload) };
  if (retiree?.seq === recent) return { state: "cancelled", at: retiree.at };
  // La demande est la plus récente : elle attend. Ce qui la retient est relu à
  // l'instant, comme le runtime le relira à son prochain réveil.
  const attend = demandeEnAttente(journal.base) ?? { seq: demandee?.seq ?? 0, since: demandee?.at ?? "", sansIssue: null };
  const retenue = refus(journal.base, reglagesEnVigueur(journal), false);
  return { state: "waiting", since: attend.since, stalledAt: attend.sansIssue, reason: retenue === null ? null : motif(retenue), text: direDemandeEn(attend, retenue) };
}

// La dérive, telle que le relevé des mesures la tient : rien n'est recompté.
export function derive(journal: Journal): Derive {
  const seuils = seuilsEnVigueur(journal.base);
  const passes = franchis(mergedDeliveries(journal.base), seuils ?? SANS_SEUIL);
  return { declared: seuils !== null, crossed: passes.length > 0, crossings: passes.map((franchi) => ({ ...franchi, text: direJaugeEn(franchi) })) };
}

// Toute la lecture. `observation` : celle de la branche d'intégration, ou ce
// qui l'a empêchée — appelée seulement si le closer est réglé.
export function lireFermeture(journal: Journal, observation: () => Observation | { erreur: string }): LectureDeFermeture {
  const reglages = reglagesEnVigueur(journal);
  if (!reglages?.calibration) return { configured: false, text: SANS_CLOSER };
  const { calibration, cooksBelow, tokens, removedLines } = reglages;
  const mergesSinceCleanup = mergedDeliveries(journal.base).length;
  const lue = observation();
  return {
    configured: true,
    closer: { model: calibration.model, effort: calibration.effort, cooksBelow, tokens, removedLines },
    observation:
      "erreur" in lue
        ? { readable: false, error: lue.erreur, mergesSinceCleanup }
        : {
            readable: true,
            ref: lue.ref,
            sha: lue.sha,
            lastMerge: lue.dernierMerge,
            mergesSinceCleanup,
            ratio: lue.fenetres.map(({ fenetre, merges, ajoute, retire }) => ({ window: fenetre, merges, added: ajoute, removed: retire, ratio: retire === 0 ? null : ajoute / retire, reads: direRatio({ ajoute, retire }) })),
            duplicates: lue.doublons.length,
            deadExports: lue.morts.length,
            codeFiles: lue.fichiers,
            modules: lue.modules,
            skippedFiles: lue.ecartes,
          },
    findings: "erreur" in lue ? [] : trouvailles(lue),
    request: demande(journal),
    drift: derive(journal),
  };
}
