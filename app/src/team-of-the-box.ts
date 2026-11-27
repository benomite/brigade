// L'équipe d'un projet que lit la vue (ticket 4327, suite du 4029) : un enregistrement par agent, tel que `facts` le publie
// sous `equipe`, lancé là où la cuisine du projet tourne. Rien n'y est deviné : un
// refus de la commande, une sortie qui ne se lit pas, une équipe que le runtime dit illisible ou qu'il ne publie pas encore
// font échouer la lecture — la vue dit alors `The agents not reached.`, jamais une équipe vide.
import type { Read, Rendered } from "./box.ts";
import { detailOf, withoutTheCommand } from "./settings-of-project.ts";

const COMMAND = "facts";

// Les agents du projet ; `undefined` pour un projet qui ne cuit pas sur cet ordinateur : sa cuisine ne s'y lit pas.
export async function readTheAgents(readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<unknown[] | undefined> {
  if (readOne === undefined) return undefined;
  const rendered = await launch(readOne, COMMAND);
  if (withoutTheCommand(rendered)) throw new Error("this station's runtime does not serve the agents yet — update it");
  if (rendered.erreur !== null) throw new Error(`\`${COMMAND}\` failed on this computer's station: ${detailOf(rendered).slice(0, 400)}`);
  let facts: unknown;
  try {
    facts = JSON.parse(rendered.sortie);
  } catch {
    throw new Error(`the answer of \`${COMMAND}\` could not be read: ${rendered.sortie.trim().slice(0, 200)}`);
  }
  const team = (facts as { equipe?: unknown } | null)?.equipe;
  if (Array.isArray(team)) return team;
  const unreadable = (team as { illisible?: unknown } | undefined)?.illisible;
  throw new Error(typeof unreadable === "string" ? `the runtime cannot read the agents: ${unreadable}` : "this station's runtime does not publish the agents yet — update it");
}
