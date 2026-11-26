// Ce que joue la commande de parking du second (parking.ts, #4262) : les deux mêmes fonctions que les boutons de l'app — `parquer`
// (vue/wait/wait-github.ts) et `deparquer` (actions-github.ts) —, écrites sur l'issue du ticket, sur tout dépôt
// GitHub, sans commande ni shell de la box, par le jeton du `gh` de ce poste. Un ticket parqué ou déparqué par le second
// est donc dans l'état exact où l'app le met. Le second la lance sous la forme que son début de session lui donne
// (`contexte`, par le crochet de hook-du-parking.ts) :
//   node parking.ts park <owner>/<repo>#<n> --who <who> --what <what> --until <YYYY-MM-DD>
//   node parking.ts unpark <owner>/<repo>#<n>
// Ce qui est écrit, ou pourquoi rien ne l'est, se dit sur une ligne ; le code de sortie dit lequel : 0 fait, 1 refusé —
// par la saisie ou par GitHub —, 2 une commande mal formée.
import { sep } from "node:path";
import { deparquer, type Ecrit } from "../actions-github.ts";
import type { ClientDeLaPriority } from "../priority.ts";
import { parquer } from "../vue/wait/wait-github.ts";
import { saisieLue } from "../vue/wait/saisie.ts";
import { cite1 } from "./hook-de-la-file.ts";

const USAGE = [
  "usage: parking.ts park <owner>/<repo>#<issue> --who <who it waits for> --what <what it waits for> --until <YYYY-MM-DD>",
  "       parking.ts unpark <owner>/<repo>#<issue>",
].join("\n");

// Ce que la commande touche : le client GitHub du poste, le jour du poste — qui borne la date —, et ses deux sorties.
export type Monde = { client: ClientDeLaPriority; aujourdhui: Date; dire: (line: string) => void; redire: (line: string) => void };

const CIBLE = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+)#([1-9][0-9]*)$/;
const OPTIONS = ["--who", "--what", "--until"];

// Les options de `park`, chacune une fois et avec sa valeur — ou rien, pour une forme qui n'en est pas une.
function optionsLues(suite: readonly string[]): Map<string, string> | null {
  const lues = new Map<string, string>();
  for (let rang = 0; rang < suite.length; rang += 2) {
    const [option = "", valeur] = [suite[rang], suite[rang + 1]];
    if (!OPTIONS.includes(option) || lues.has(option) || valeur === undefined) return null;
    lues.set(option, valeur);
  }
  return lues;
}

// Joue le geste que les mots nomment ; rend le code de sortie.
export async function principal(args: readonly string[], { client, aujourdhui, dire: tell, redire }: Monde): Promise<number> {
  const [action, cible, ...suite] = args;
  const [, repository, numero] = CIBLE.exec(cible ?? "") ?? [];
  const options = optionsLues(suite);
  const formee = repository !== undefined && options !== null && (action === "park" ? options.size === OPTIONS.length : action === "unpark" && options.size === 0);
  if (!formee) {
    redire(USAGE);
    return 2;
  }
  const ticket = Number(numero);
  let ecrit: Ecrit;
  if (action === "unpark") ecrit = await deparquer(repository, ticket, client);
  else {
    const lue = saisieLue({ quoi: options.get("--what"), qui: options.get("--who"), relance: options.get("--until") }, aujourdhui);
    if ("refus" in lue) {
      redire(lue.refus);
      return 1;
    }
    ecrit = await parquer(repository, ticket, lue, aujourdhui, client);
  }
  if ("refus" in ecrit) {
    redire(ecrit.detail === "" ? ecrit.refus : `${ecrit.refus} — ${ecrit.detail}`);
    return 1;
  }
  tell(`${ecrit.fait} — ${ecrit.detail}`);
  return 0;
}

// Ce que le second reçoit à chaque début de session : la commande exacte, avec le `node` et le chemin de ce poste, et le
// dépôt du projet quand l'app le connaît.
export function context(repository: string, node: string, script: string, separateur: string = sep): string {
  const lancer = `${cite1(node, separateur)} ${cite1(script, separateur)}`;
  const ticket = `${repository === "" ? "<owner>/<repo>" : repository}#<n>`;
  return [
    "To park a ticket — it waits for someone: who, for what, until when — or to unpark it, run exactly this command. It writes on the ticket's issue what the app's buttons write, on any project, with no box command:",
    `  ${lancer} park ${ticket} --who '<who>' --what '<what>' --until <YYYY-MM-DD>`,
    `  ${lancer} unpark ${ticket}`,
    "Its one line says what was written, or why nothing was; relay it word for word.",
  ].join("\n");
}
