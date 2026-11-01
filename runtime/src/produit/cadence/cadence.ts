// The kitchen wakes the product role on its own (#1955): at each tick of the
// runtime, independently of any screen, when the rail is empty for a cook — or
// an outside issue has waited more than a day for an answer —, the role runs
// once, within the day's cap (`declencheur.ts`). Off in one gesture
// (`interrupteur.ts`); `status` shows where it stands (`etat.ts`).
//
// Each project's runtime holds its own cadence: its log, its cap, its GitHub.
// Nothing here names a project or a path.
import { etatDesGardeFous } from "../../projections/guardrails.ts";
import { lireRail } from "../../projections/rail.ts";
import { compteRetenu } from "../../projections/stations.ts";
import { etatDeLInterrupteur } from "../../projections/switch.ts";
import type { Runtime } from "../../runtime.ts";
import { decider, railVide, type Decision } from "./declencheur.ts";
import { etatDeLaCadence } from "./etat.ts";
import type { FaitCadence } from "./evenements.ts";
import type { ReglagesCadence } from "./reglages.ts";
import type { LancerLeRole } from "./role.ts";

const AUTEUR = "runtime";
export const SONDAGE_DU_DEHORS_MS = 3_600_000;

export type OptionsCadence = ReglagesCadence & {
  lancer: LancerLeRole;
  // The issues carrying `filed-by:product` created on that UTC day.
  deposesLe: (jour: string) => Promise<number>;
  // The outside issues overdue for an answer.
  enRetard: (maintenant: Date) => Promise<number[]>;
  maintenant?: () => Date;
  // Where what the cadence has to say outside the log goes (journald).
  avertir?: (message: string) => void;
};

export type Cadence = {
  // One tick's turn: what was decided, or null when a turn was already running.
  tour(): Promise<Decision | null>;
  arreter(): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirCadence(runtime: Pick<Runtime, "journal" | "projet">, options: OptionsCadence): Cadence {
  const { journal, projet } = runtime;
  const { base } = journal;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const noter = (fait: FaitCadence) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });

  // The settings this runtime applies, written when they changed: `status`
  // reads the cap from the log.
  const intervalHours = options.intervalleMs / 3_600_000;
  const ecrits = etatDeLaCadence(base, maintenant());
  if (ecrits.plafond !== options.plafond || ecrits.intervalleMs !== options.intervalleMs) noter({ type: "product.settings", payload: { cap: options.plafond, intervalHours } });

  // The project may cook: switch on, no "stop", breaker closed, account free.
  const projetAllume = (instant: Date) => {
    const garde = etatDesGardeFous(base);
    return etatDeLInterrupteur(base)?.on !== false && garde.stoppedAt === null && garde.breakerOpenedAt === null && !compteRetenu(base, instant);
  };

  // On a busy rail, the outside issues are polled once an hour, not at every
  // tick: a day late is what wakes the role, an hour more changes nothing.
  let sondeesA = Number.NEGATIVE_INFINITY;
  const enRetard = async (instant: Date, vide: boolean) => {
    if (!vide && instant.getTime() - sondeesA < SONDAGE_DU_DEHORS_MS) return [];
    sondeesA = instant.getTime();
    return options.enRetard(instant);
  };

  let arrete = false;
  let enCours = false;
  const tour = async (): Promise<Decision | null> => {
    if (arrete || enCours) return null;
    enCours = true;
    try {
      const instant = maintenant();
      const etat = etatDeLaCadence(base, instant);
      const vide = railVide(lireRail(base));
      const decision = await decider({
        allume: etat.on,
        projetAllume: projetAllume(instant),
        railVide: vide,
        enRetard: () => enRetard(instant, vide),
        dernierRun: etat.dernierRun,
        intervalleMs: options.intervalleMs,
        deposesAujourdhui: () => options.deposesLe(etat.jour),
        plafond: options.plafond,
        plafondDejaDit: etat.plafondDit ? etat.deposesAujourdhui : null,
        maintenant: instant,
      });
      if (arrete) return decision;
      if (decision.quoi === "plafond") {
        if (!etat.plafondDit) {
          noter({ type: "product.cap-reached", payload: { day: etat.jour, filedToday: decision.deposes, cap: options.plafond } });
          avertir(`brigade : product role — daily cap reached (${decision.deposes}/${options.plafond} filed on ${etat.jour}, UTC): nothing more is filed today`);
        }
        return decision;
      }
      if (decision.quoi !== "lancer") return decision;
      const restant = options.plafond - decision.deposes;
      const fait = await options.lancer({ raison: decision.raison, enRetard: decision.enRetard, restant, jour: etat.jour });
      // Refused by the chef's "stop" or the breaker: nothing ran.
      if (fait === null || arrete) return decision;
      noter({
        type: "product.ran",
        payload: {
          run: fait.run,
          reason: decision.raison,
          outcome: fait.outcome,
          day: etat.jour,
          filed: fait.filed,
          filedToday: decision.deposes + fait.filed.length,
          cap: options.plafond,
          overdue: decision.enRetard,
          detail: fait.detail,
        },
      });
      return decision;
    } catch (erreur) {
      // GitHub down: nothing is decided, the next tick tries again.
      if (!arrete) avertir(`brigade : the product role's cadence stumbled — ${message(erreur)}`);
      return null;
    } finally {
      enCours = false;
    }
  };
  return {
    tour,
    arreter() {
      arrete = true;
    },
  };
}

// Gives the runtime its product cadence: a turn at each tick, never at a log
// wake — the role is a judgement of the quota, not a reaction.
export function brancherCadence<R extends Runtime>(runtime: R, options: OptionsCadence): R {
  const cadence = ouvrirCadence(runtime, options);
  const desabonner = runtime.surReveil((cause) => void (cause === "tick" && cadence.tour()));
  return {
    ...runtime,
    arreter(signal) {
      cadence.arreter();
      desabonner();
      runtime.arreter(signal);
    },
  };
}
