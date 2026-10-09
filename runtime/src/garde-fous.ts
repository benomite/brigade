// Les garde-fous d'un projet, branchés sur son runtime : aucun cook ne se
// lance sans passer par ici. Mécanique, pas jugement — des plafonds, une
// minuterie d'inactivité, un disjoncteur et la commande « stop » du chef.
//
// Rien n'est gardé en mémoire que les process eux-mêmes : le disjoncteur et
// le « stop » se lisent dans le journal, donc tiennent après un redémarrage.
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContexteCook, FaitGardeFous, Issue } from "./evenements/garde-fous.ts";
import type { Reglages } from "./plafonds.ts";
import { cooksEnCours, etatDesGardeFous } from "./projections/garde-fous.ts";
import type { Runtime } from "./runtime.ts";
import { superviser, type Arret, type Fin, type Supervise } from "./superviseur.ts";

export { lireReglages, type Reglages } from "./plafonds.ts";

const AUTEUR = "runtime";
// Le curseur de celui qui guette les « stop » du chef dans le journal.
const CONSOMMATEUR = "garde-fous";

// Ce que la station dit d'une fin que les garde-fous n'ont pas provoquée.
// `neutral` : ni échec ni réussite pour le disjoncteur — le quota épuisé (86).
// `refused` : pas davantage, mais dit à part au journal — le modèle a refusé
// de répondre.
export type Verdict = "ok" | "failed" | "neutral" | "refused";

export type DemandeCook = {
  // Nul : le cook ne tient aucun ticket du rail — un jugement du manager.
  ticket: number | null;
  // Le nom du run, quand celui qui lance en a besoin avant le lancement (pour
  // nommer un worktree). Par défaut : `<ticket>-<8 caractères>`.
  run?: string;
  // Porté tel quel par `cook.launched`.
  contexte?: Partial<ContexteCook>;
  commande: string;
  args: string[];
  cwd?: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
  // Le masque des secrets que ce cook a reçus : son flux brut ne les garde pas.
  // La forme des identifiants de Claude, elle, y est masquée quoi qu'il arrive.
  masquer?: (texte: string) => string;
  // Par défaut : code de sortie 0 → réussite, tout autre → échec. Appelé aussi
  // pour un cook qu'un garde-fou a arrêté (`fin.arret`) : seul « ok » en fait
  // alors autre chose qu'un arrêt par garde-fou.
  juger?: (fin: Fin) => Verdict;
};

// `interrupted` : le runtime s'est arrêté pendant que le cook tournait. Rien
// n'en est écrit sur le moment — le démarrage suivant le note.
export type FinDeCook = Fin & { outcome: Issue | "interrupted" };

export type CookLance = {
  run: string;
  pid: number | undefined;
  // Arrête ce cook, et lui seul. Sans motif, sa fin sera un « stop » ; avec,
  // c'est un arrêt de garde-fou, donc jugé. Sans effet sur un cook déjà mort.
  arreter(motif?: Arret): void;
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
  // Le verdict de la pass sur la livraison d'une relance du manager. Rouge,
  // c'est un échec d'affilée de plus, qui ouvre le disjoncteur au seuil.
  jugerRelance(ticket: number, run: string, verdict: "green" | "red"): void;
};

export const nomDeRun = (ticket: number | null) => `${ticket ?? "sans-ticket"}-${randomUUID().slice(0, 8)}`;

const jugerParDefaut = (fin: Fin): Verdict => (fin.code === 0 ? "ok" : "failed");

// Le « stop » du chef et un lancement impossible ne se jugent pas. Tout le
// reste, si : même arrêté par un garde-fou, un cook peut avoir livré — c'est à
// celui qui l'a lancé de le dire. S'il ne le dit pas, l'arrêt reste un arrêt.
function issue(resultat: Fin, juger: (fin: Fin) => Verdict): Issue {
  if (resultat.arret?.reason === "stop") return "stop";
  if (resultat.erreur !== null) return "failed";
  const verdict = juger(resultat);
  return resultat.arret && verdict !== "ok" ? "guard" : verdict;
}

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
  const releves = new Map<Supervise, { ticket: number | null; run: string }>();
  let arrete = false;

  // Ouvre le disjoncteur si les échecs d'affilée ont atteint son seuil. Dans la
  // transaction du fait qui vient de les compter.
  const disjoncter = () => {
    const etat = etatDesGardeFous(base);
    if (etat.breakerOpenedAt === null && etat.failures >= reglages.seuilDisjoncteur) {
      noter(null, { type: "breaker.opened", payload: { failures: etat.failures, threshold: reglages.seuilDisjoncteur } });
    }
  };

  // Écrit la fin d'un cook et, dans la même transaction, ouvre le disjoncteur
  // si elle porte les échecs d'affilée à son seuil.
  const noterFin = (ticket: number | null, run: string, resultat: Fin, outcome: Issue) => {
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
          ...(resultat.masques === undefined ? {} : { credentialsMasked: resultat.masques }),
        },
      });
      disjoncter();
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
      const run = demande.run ?? nomDeRun(demande.ticket);
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
        return noter(demande.ticket, { type: "cook.launched", payload: { run, limits: reglages.plafonds, stream, ...demande.contexte } })?.seq ?? 0;
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
          masquer: demande.masquer,
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
        return { run, pid: undefined, arreter: () => {}, fin: Promise.resolve({ ...resultat, outcome: "failed" }) };
      }
      cooks.set(cook, lancement);
      releves.set(cook, { ticket: demande.ticket, run });

      const fin = cook.fin.then((resultat): FinDeCook => {
        cooks.delete(cook);
        releves.delete(cook);
        if (arrete) return { ...resultat, outcome: "interrupted" };
        const outcome = issue(resultat, demande.juger ?? jugerParDefaut);
        noterFin(demande.ticket, run, resultat, outcome);
        return { ...resultat, outcome };
      });
      return { run, pid: cook.pid, arreter: cook.arreter, fin };
    },
    jugerRelance(ticket, run, verdict) {
      base.transaction(() => {
        noter(ticket, { type: "relaunch.judged", payload: { run, verdict } });
        disjoncter();
      });
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
