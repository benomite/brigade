// L'équipe d'un projet que lit la vue (ticket 4327, suite du 4029) : un enregistrement par agent, tel que `facts` le publie
// sous `equipe` (runtime/src/autonomie/agents/agents.ts), lancé là où la cuisine du projet tourne. Rien n'y est deviné : un
// refus de la commande, une sortie qui ne se lit pas, une équipe que le runtime dit illisible ou qu'il ne publie pas encore
// font échouer la lecture — la vue dit alors `The agents not reached.`, jamais une équipe vide.
import type { Lu, Rendu } from "./box.ts";
import { detailDe, sansLaCommand } from "./settings-du-project.ts";

const COMMAND = "facts";

// Les agents du projet ; `undefined` pour un projet qui ne cuit pas sur cet ordinateur : sa cuisine ne s'y lit pas.
export async function lireLesAgents(lu: Lu | undefined, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<unknown[] | undefined> {
  if (lu === undefined) return undefined;
  const rendu = await lancer(lu, COMMAND);
  if (sansLaCommand(rendu)) throw new Error("this station's runtime does not serve the agents yet — update it");
  if (rendu.erreur !== null) throw new Error(`\`${COMMAND}\` failed on this computer's station: ${detailDe(rendu).slice(0, 400)}`);
  let facts: unknown;
  try {
    facts = JSON.parse(rendu.sortie);
  } catch {
    throw new Error(`the answer of \`${COMMAND}\` could not be read: ${rendu.sortie.trim().slice(0, 200)}`);
  }
  const team = (facts as { equipe?: unknown } | null)?.equipe;
  if (Array.isArray(team)) return team;
  const illisible = (team as { illisible?: unknown } | undefined)?.illisible;
  throw new Error(typeof illisible === "string" ? `the runtime cannot read the agents: ${illisible}` : "this station's runtime does not publish the agents yet — update it");
}
