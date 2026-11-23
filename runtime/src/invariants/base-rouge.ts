// Invariant 4 (#4026) : un check rouge sur la base est relancé une fois, avant
// toute autre chose. Le tour qui le voit rouge le relance du geste `rerun`, et
// ne fait rien d'autre ; les tours suivants ne font rien tant que la relance
// n'a pas rendu son résultat (le check est `pending`), au plus
// `RESULTAT_DE_LA_RELANCE_MS`. Un check relancé ne l'est pas une seconde fois :
// rouge encore, il est à réparer (le geste `fix` du superviseur), plus à relancer.
// Un check qui n'est pas un job de GitHub Actions ne se relance pas : rien n'est
// retenu, sa réparation s'ouvre sans relance (superviseur/gestes.ts).
import type { CheckDeLaBase } from "../checks-de-la-branche.ts";
import type { Check } from "../events/pass.ts";
import { jobDuCheck } from "../github.ts";
import type { Invariant } from "./invariants.ts";

// Au-delà, une relance qui ne rend rien ne retient plus le tour.
export const RESULTAT_DE_LA_RELANCE_MS = 30 * 60_000;

// Relance les checks rouges ; rend ce qui a été relancé, ou nul quand aucun ne se relance.
export type RelancerLaBase = (rouges: readonly CheckDeLaBase[]) => Promise<string | null | void>;

// Un check, d'une tentative à l'autre : son run de GitHub Actions, ou son nom.
const cleDuCheck = (check: CheckDeLaBase) => {
  const run = jobDuCheck({ url: check.url ?? null } as Check)?.run;
  return run === undefined ? `check ${check.name ?? "?"}` : `run ${run}`;
};

export function baseRougeRelancee(relancer: RelancerLaBase): Invariant {
  // Les checks relancés, et l'instant de leur relance.
  const relances = new Map<string, number>();
  return async (tour) => {
    const maintenant = tour.maintenant.getTime();
    const enCours = tour.checksDeLaBase.some((check) => check.outcome === "pending" && maintenant - (relances.get(cleDuCheck(check)) ?? Number.NEGATIVE_INFINITY) < RESULTAT_DE_LA_RELANCE_MS);
    if (enCours) return tour.retenir();
    const rouges = tour.checksDeLaBase.filter((check) => check.outcome === "red" && !relances.has(cleDuCheck(check)));
    if (rouges.length === 0) return;
    const reparee = await tour.reparer({
      invariant: 4,
      ticket: null,
      cle: rouges.map(cleDuCheck).join(" "),
      casse: `${tour.base} is red (${rouges.map(({ name }) => name ?? "?").join(", ")})`,
      geste: async () => {
        const fait = await relancer(rouges);
        for (const check of rouges) relances.set(cleDuCheck(check), maintenant);
        return fait === undefined ? `reran the red checks of ${tour.base}` : fait;
      },
    });
    if (reparee) tour.retenir();
  };
}
