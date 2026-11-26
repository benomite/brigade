// Les deux réparations mécaniques que les invariants du rail jouent d'eux-mêmes (#4026) : relancer les jobs rouges de
// la base (invariant 4) et réveiller un ticket mis de côté dont la date est passée (invariant 3). Ce sont des gestes du
// rail, pas du superviseur : le superviseur ne relance jamais un ticket (#4233).
import { LABEL_IN_PASS, LABEL_TAKEN } from "../github-etat/etats.ts";
import type { Check } from "../events/pass.ts";
import { jobDuCheck, LABEL, MIS_DE_COTE, type GitHub } from "../github.ts";
import { exigerNonParque } from "../rail.ts";

// Relance les jobs en échec des checks rouges de la base, et dit ce qu'il a relancé ; nul quand aucun n'est un job de GitHub Actions.
export async function relancerLesRouges(github: Pick<GitHub, "relancerLesEchecs">, branche: string, rouges: readonly { name?: string; url?: string | null }[]): Promise<string | null> {
  const runs = [...new Set(rouges.flatMap((check) => jobDuCheck({ url: check.url ?? null } as Check)?.run ?? []))];
  if (runs.length === 0) return null;
  for (const run of runs) await github.relancerLesEchecs(run);
  return `reran the failed jobs of ${branche} (${rouges.map(({ name }) => name).join(", ")}; run ${runs.join(", ")})`;
}

export async function remettreSurLeRail({ github }: { github: Pick<GitHub, "issue" | "labelliser" | "delabelliser"> }, ticket: number, note: string): Promise<{ ticket: number; fait: string }> {
  const issue = await github.issue(ticket);
  if (issue === null || issue.pr === true) throw new Error(`#${ticket} is not an issue of the repository`);
  if (issue.state !== "open") throw new Error(`#${ticket} is closed`);
  const tenu = [LABEL_TAKEN, LABEL_IN_PASS].find((label) => issue.labels.includes(label));
  if (tenu !== undefined) throw new Error(`#${ticket} carries \`${tenu}\`: the kitchen holds it`);
  exigerNonParque(issue.labels, ticket);
  const retenus = MIS_DE_COTE.filter((label) => issue.labels.includes(label));
  const sansFeu = !issue.labels.includes(LABEL);
  if (retenus.length === 0 && !sansFeu) throw new Error(`#${ticket} is already on the rail: nothing holds it`);
  if (sansFeu) await github.labelliser(ticket, [LABEL]);
  for (const label of retenus) await github.delabelliser(ticket, label);
  const faits = [...(sansFeu ? [`\`${LABEL}\` added`] : []), ...retenus.map((label) => `\`${label}\` removed`)];
  return { ticket, fait: `put #${ticket} back on the rail (${faits.join(", ")}). Note: ${note}` };
}
