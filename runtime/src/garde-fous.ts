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
// Le curseur de celui qui guette les « stop » du chef dans le journal.
const CONSOMMATEUR = "garde-fous";

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
  const noter = (ticket: number | null, fait: FaitGardeFous) =>
    journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  let repertoireRuns: string;
  try {
    // Le flux brut des cooks s'écrit dans runs/, à côté du journal. Le runtime
    // ne dit pas où est son répertoire d'état : la base, si.
    const fichierJournal = base.lire<{ file: string }>("PRAGMA database_list")[0]?.file;
    if (!fichierJournal) throw new Error("journal sans fichier : impossible de situer le répertoire d'état");
    repertoireRuns = join(dirname(fichierJournal), "runs");
    base.transaction(() => {
      // Réconciliation : un lancement sans fin au journal est celui d'un cook
      // mort avec le runtime précédent.
      for (const cook of cooksEnCours(base)) noter(cook.ticket, { type: "cook.interrupted", payload: { run: cook.run } });
      // Un « stop » d'avant ce démarrage ne vise aucun cook d'aujourd'hui.
      journal.consommer(CONSOMMATEUR, () => {});
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

  // Les cooks qui tournent, chacun avec le numéro de séquence de son lancement.
  const cooks = new Map<Supervise, number>();
  // Les mêmes, avec ce qu'il faut pour écrire leur relevé.
  const releves = new Map<Supervise, { ticket: number; run: string }>();
  let arrete = false;

  // Écrit la fin d'un cook et, dans la même transaction, ouvre le disjoncteur
  // si elle porte les échecs d'affilée à son seuil.
  const noterFin = (ticket: number, run: string, resultat: Fin, outcome: Issue) => {
    base.transaction(() => {
      noter(ticket, {
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
  };

  // Le « stop » est écrit par un autre process (la CLI) : le runtime le voit à
  // son prochain réveil, une seconde au plus. Il lit les faits, pas l'état :
  // un « stop » aussitôt suivi d'un « reprendre » arrête quand même les cooks
  // qui tournaient — et eux seuls, pas ceux lancés depuis la reprise.
  const desabonner = runtime.surReveil((cause) => {
    let dernierStop = 0;
    journal.consommer(CONSOMMATEUR, (evenement) => {
      if (evenement.type === "kitchen.stopped") dernierStop = evenement.seq;
    });
    for (const [cook, lancement] of cooks) {
      if (lancement < dernierStop) cook.arreter();
    }
    // Au tick, chaque cook en cours laisse au journal ce qu'il a consommé :
    // c'est là que le chef lit son budget avant la fin. Après le « stop » :
    // un relevé ne retarde jamais un arrêt — et s'il ne peut pas s'écrire, il
    // manque au chef, pas au runtime.
    if (cause === "tick") {
      try {
        base.transaction(() => {
          for (const [cook, { ticket, run }] of releves) noter(ticket, { type: "cook.progressed", payload: { run, ...cook.mesure() } });
        });
      } catch (erreur) {
        console.error(`brigade : relevé des cooks non journalisé — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
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
      const lancement = base.transaction(() => {
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
        return noter(demande.ticket, { type: "cook.launched", payload: { run, limits: reglages.plafonds, stream } })?.seq ?? 0;
      });

      let cook: Supervise;
      try {
        mkdirSync(repertoireRuns, { recursive: true });
        cook = superviser({
          commande: demande.commande,
          args: demande.args,
          cwd: demande.cwd,
          env: demande.env,
          plafonds: reglages.plafonds,
          graceMs: reglages.graceMs,
          flux: join(repertoireRuns, fichier),
          surArret: (arret) => {
            if (!arrete) noter(demande.ticket, { type: "guard.tripped", payload: { run, ...arret } });
          },
        });
      } catch (erreur) {
        // L'intention est au journal : elle y reçoit sa fin, un échec, plutôt
        // que de passer pour un cook en cours jusqu'au prochain redémarrage.
        const resultat: Fin = {
          code: null,
          signal: null,
          turns: 0,
          tokens: 0,
          durationMs: 0,
          arret: null,
          erreur: erreur instanceof Error ? erreur.message : String(erreur),
        };
        noterFin(demande.ticket, run, resultat, "failed");
        return { run, pid: undefined, fin: Promise.resolve({ ...resultat, outcome: "failed" }) };
      }
      cooks.set(cook, lancement);
      releves.set(cook, { ticket: demande.ticket, run });

      const fin = cook.fin.then((resultat): FinDeCook => {
        cooks.delete(cook);
        releves.delete(cook);
        if (arrete) return { ...resultat, outcome: "interrupted" };
        const outcome: Issue = resultat.arret
          ? resultat.arret.reason === "stop"
            ? "stop"
            : "guard"
          : resultat.erreur !== null
            ? "failed"
            : (demande.juger ?? jugerParDefaut)(resultat);
        noterFin(demande.ticket, run, resultat, outcome);
        return { ...resultat, outcome };
      });
      return { run, pid: cook.pid, fin };
    },
    arreter(signal) {
      if (!arrete) {
        arrete = true;
        desabonner();
        for (const cook of cooks.keys()) cook.abandonner();
      }
      runtime.arreter(signal);
    },
  };
}
