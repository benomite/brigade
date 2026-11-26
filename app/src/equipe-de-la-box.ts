// L'équipe d'un projet que lit la vue (ticket 4327, suite du 4029) : un enregistrement par agent, tel que `facts` le publie
// sous `equipe` (runtime/src/autonomie/agents/agents.ts), lancé là où la cuisine du projet tourne. Rien n'y est deviné : un
// refus de la commande, une sortie qui ne se lit pas, une équipe que le runtime dit illisible ou qu'il ne publie pas encore
// font échouer la lecture — la vue dit alors `The agents not reached.`, jamais une équipe vide.
import type { Lu, Rendu } from "./box.ts";
import { detailDe, sansLaCommande } from "./reglages-du-projet.ts";

const COMMANDE = "facts";

// Les agents du projet ; `undefined` pour un projet qui ne cuit pas sur cet ordinateur : sa cuisine ne s'y lit pas.
export async function lireLesAgents(lu: Lu | undefined, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<unknown[] | undefined> {
  if (lu === undefined) return undefined;
  const rendu = await lancer(lu, COMMANDE);
  if (sansLaCommande(rendu)) throw new Error("this station's runtime does not serve the agents yet — update it");
  if (rendu.erreur !== null) throw new Error(`\`${COMMANDE}\` failed on this computer's station: ${detailDe(rendu).slice(0, 400)}`);
  let faits: unknown;
  try {
    faits = JSON.parse(rendu.sortie);
  } catch {
    throw new Error(`the answer of \`${COMMANDE}\` could not be read: ${rendu.sortie.trim().slice(0, 200)}`);
  }
  const equipe = (faits as { equipe?: unknown } | null)?.equipe;
  if (Array.isArray(equipe)) return equipe;
  const illisible = (equipe as { illisible?: unknown } | undefined)?.illisible;
  throw new Error(typeof illisible === "string" ? `the runtime cannot read the agents: ${illisible}` : "this station's runtime does not publish the agents yet — update it");
}
