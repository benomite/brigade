// When the runtime runs the product role on its own, read without network:
// the chef's switch, the project's, the guardrails, the gap since the last
// run, and the rail. What needs GitHub — an outside issue left unanswered, the
// issues filed today — is read after, and only when this lets it through.
import type { Base } from "../../base.ts";
import { attendentUneCapaciteOuUnTiers } from "../../cuisine-oisive.ts";
import type { Commentaire, IssueOuverte } from "../../github.ts";
import { etatDesGardeFous } from "../../projections/guardrails.ts";
import { lireRail } from "../../projections/rail.ts";
import { etatDeLInterrupteur } from "../../projections/switch.ts";
import type { EtatCadence } from "./etat.ts";

// The shortest gap between two runs. An empty rail stays empty a while after
// a run — what the role files goes to the manager, not straight to the rail —,
// and a run that found nothing to file would find nothing a minute later.
export const ECART_MIN_MS = 3 * 60 * 60 * 1000;
// An issue opened by someone other than the chef, left unanswered this long,
// is overdue: the role runs even with tickets on the rail.
export const RETARD_MS = 24 * 60 * 60 * 1000;

// The links to the repository that make an author the chef's side, as GitHub
// names them.
const DU_DEPOT = ["OWNER", "MEMBER", "COLLABORATOR"];

// Why the role does not run now. `off`: the chef turned it off. `project-off`:
// the project switch is off. `stopped`, `breaker`: the chef's "stop", the
// breaker. `gap`: it ran less than `ECART_MIN_MS` ago.
export type Retenue = "off" | "project-off" | "stopped" | "breaker" | "gap";

export function retenue(base: Base, etat: EtatCadence, maintenant: Date): Retenue | null {
  if (!etat.allume) return "off";
  if (etatDeLInterrupteur(base)?.on === false) return "project-off";
  const gardeFous = etatDesGardeFous(base);
  if (gardeFous.stoppedAt !== null) return "stopped";
  if (gardeFous.breakerOpenedAt !== null) return "breaker";
  if (etat.dernierPassage !== null && maintenant.getTime() - Date.parse(etat.dernierPassage) < ECART_MIN_MS) return "gap";
  return null;
}

// The rail is empty for the kitchen when no ticket is left to cook: served
// ones are done, and those that wait for a third party or a capacity do not
// wait for the kitchen (#1927).
export function railVide(base: Base): boolean {
  const rail = lireRail(base).filter(({ state }) => state !== "served");
  const enAttente = attendentUneCapaciteOuUnTiers(rail);
  return rail.every(({ ticket }) => enAttente.has(ticket));
}

// An issue opened by someone other than the chef's side.
export const externe = (issue: Pick<IssueOuverte, "association">): boolean => !DU_DEPOT.includes(issue.association);

// Opened by someone outside, longer ago than `RETARD_MS`, and still without an
// answer: no comment from the chef's side nor from one of brigade's
// identities (a GitHub App, `<name>[bot]`).
export function enRetard(issue: Pick<IssueOuverte, "association" | "createdAt">, commentaires: Commentaire[], maintenant: Date): boolean {
  if (!externe(issue) || maintenant.getTime() - Date.parse(issue.createdAt) < RETARD_MS) return false;
  return !commentaires.some(({ author, association }) => DU_DEPOT.includes(association) || author.endsWith("[bot]"));
}
