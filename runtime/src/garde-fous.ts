// Les garde-fous d'un projet, branchés sur son runtime : aucun cook ne se
// lance sans passer par ici. Mécanique, pas jugement — des plafonds, une
// minuterie d'inactivité, un disjoncteur et la commande « stop » du chef.
//
// Rien n'est gardé en mémoire que les process eux-mêmes : le disjoncteur et
// le « stop » se lisent dans le journal, donc tiennent après un redémarrage.
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FaitGardeFous, Issue } from "./evenements/garde-fous.ts";
import type { Reglages } from "./plafonds.ts";
import { cooksEnCours, etatDesGardeFous } from "./projections/garde-fous.ts";
import type { Runtime } from "./runtime.ts";
import { superviser, type Fin, type Supervise } from "./superviseur.ts";

export { lireReglages, type Reglages } from "./plafonds.ts";

const AUTEUR = "runtime";

// Ce que la station dit d'une fin que les garde-fous n'ont pas provoquée.
// `neutral` : ni échec ni réussite pour le disjoncteur — le quota épuisé (86).
export type Verdict = "ok" | "failed" | "neutral";

export type DemandeCook = {
  ticket: number;
  commande: string;
  args: string[];
  cwd?: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
  // Par défaut : code de sortie 0 → réussite, tout autre → échec.
  juger?: (fin: Fin) => Verdict;
};

// `interrupted` : le runtime s'est arrêté pendant que le cook tournait. Rien
// n'en est écrit sur le moment — le démarrage suivant le note.
export type FinDeCook = Fin & { outcome: Issue | "interrupted" };

export type CookLance = {
  run: string;
  pid: number | undefined;
  // Résolue une fois la fin du cook écrite au journal.
  fin: Promise<FinDeCook>;
};

export class LancementRefuse extends Error {
  readonly motif: "breaker" | "stopped";

  constructor(motif: "breaker" | "stopped", message: string) {
    super(message);
    this.name = "LancementRefuse";
    this.motif = motif;
  }
}

export type GardeFous = {
  // Lance un cook sous surveillance. Lève `LancementRefuse`, sans rien lancer
  // ni rien écrire, si le disjoncteur est ouvert ou si le chef a dit « stop ».
  lancer(demande: DemandeCook): CookLance;
};

const jugerParDefaut = (fin: Fin): Verdict => (fin.code === 0 ? "ok" : "failed");

// Rend le runtime, augmenté du lancement gardé. Son `arreter` emporte les
// cooks avec lui : un cook meurt avec le runtime.
export function brancherGardeFous<R extends Runtime>(reglages: Reglages, runtime: R): R & GardeFous {
  const { journal, projet } = runtime;
  const base = journal.base;
  // Le flux brut des cooks s'écrit dans runs/, à côté du journal.
  const repertoireRuns = join(dirname(base.lire<{ file: string }>("PRAGMA database_list")[0]?.file ?? ""), "runs");
  const noter = (ticket: number | null, fait: FaitGardeFous) =>
    journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  try {
    base.transaction(() => {
      // Réconciliation : un lancement sans fin au journal est celui d'un cook
      // mort avec le runtime précédent.
      for (const cook of cooksEnCours(base)) noter(cook.ticket, { type: "cook.interrupted", payload: { run: cook.run } });
      const etat = etatDesGardeFous(base);
      const enVigueur = { limits: reglages.plafonds, breakerThreshold: reglages.seuilDisjoncteur };
      const connus = { limits: etat.limits, breakerThreshold: etat.breakerThreshold };
      if (JSON.stringify(connus) !== JSON.stringify(enVigueur)) noter(null, { type: "guard.configured", payload: enVigueur });
    });
  } catch (erreur) {
    // Un runtime sans garde-fous ne tourne pas.
    try {
      runtime.arreter("garde-fous");
    } catch {}
    throw erreur;
  }

  const cooks = new Set<Supervise>();
  let arrete = false;

  // Le « stop » est écrit par un autre process (la CLI) : le runtime le voit à
  // son prochain réveil, une seconde au plus.
  const desabonner = runtime.surReveil(() => {
    if (etatDesGardeFous(base).stoppedAt === null) return;
    for (const cook of cooks) cook.arreter();
  });

  return {
    ...runtime,
    lancer(demande) {
      if (arrete) throw new Error("runtime arrêté : aucun cook ne peut être lancé");
      const run = `${demande.ticket}-${randomUUID().slice(0, 8)}`;
      const fichier = `${run}.jsonl`;
      const stream = join("runs", fichier);
      // Vérifier et écrire l'intention dans une seule transaction : un
      // « stop » qui arrive entre les deux ne peut pas être manqué.
      base.transaction(() => {
        const etat = etatDesGardeFous(base);
        if (etat.stoppedAt !== null) {
          throw new LancementRefuse("stopped", `cuisine arrêtée par le chef le ${etat.stoppedAt} : aucun cook n'est lancé avant « reprendre »`);
        }
        if (etat.breakerOpenedAt !== null) {
          throw new LancementRefuse(
            "breaker",
            `disjoncteur ouvert le ${etat.breakerOpenedAt} après ${etat.failures} échecs d'affilée : aucun cook n'est lancé avant « reprendre »`,
          );
        }
        noter(demande.ticket, { type: "cook.launched", payload: { run, limits: reglages.plafonds, stream } });
      });

      const flux = join(repertoireRuns, fichier);
      mkdirSync(repertoireRuns, { recursive: true });
      const cook = superviser({
        commande: demande.commande,
        args: demande.args,
        cwd: demande.cwd,
        env: demande.env,
        plafonds: reglages.plafonds,
        graceMs: reglages.graceMs,
        flux,
        surArret: (arret) => {
          if (!arrete) noter(demande.ticket, { type: "guard.tripped", payload: { run, ...arret } });
        },
      });
      cooks.add(cook);

      const fin = cook.fin.then((resultat): FinDeCook => {
        cooks.delete(cook);
        if (arrete) return { ...resultat, outcome: "interrupted" };
        const outcome: Issue = resultat.arret
          ? resultat.arret.reason === "stop"
            ? "stop"
            : "guard"
          : resultat.erreur !== null
            ? "failed"
            : (demande.juger ?? jugerParDefaut)(resultat);
        base.transaction(() => {
          noter(demande.ticket, {
            type: "cook.exited",
            payload: {
              run,
              outcome,
              code: resultat.code,
              signal: resultat.signal,
              turns: resultat.turns,
              tokens: resultat.tokens,
              durationMs: resultat.durationMs,
              ...(resultat.erreur === null ? {} : { error: resultat.erreur }),
            },
          });
          const etat = etatDesGardeFous(base);
          if (etat.breakerOpenedAt === null && etat.failures >= reglages.seuilDisjoncteur) {
            noter(null, { type: "breaker.opened", payload: { failures: etat.failures, threshold: reglages.seuilDisjoncteur } });
          }
        });
        return { ...resultat, outcome };
      });
      return { run, pid: cook.pid, fin };
    },
    arreter(signal) {
      if (!arrete) {
        arrete = true;
        desabonner();
        for (const cook of cooks) cook.abandonner();
      }
      runtime.arreter(signal);
    },
  };
}
