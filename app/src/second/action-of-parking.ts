// Ce que joue la commande de parking du second (parking.ts, #4262) : les deux mêmes fonctions que les boutons de l'app — `parquer`
// (vue/wait/wait-github.ts) et `deparquer` (actions-github.ts) —, écrites sur l'issue du ticket, sur tout dépôt
// GitHub, sans commande ni shell de la box, par le jeton du `gh` de ce poste. Un ticket parqué ou déparqué par le second
// est donc dans l'état exact où l'app le met. Le second la lance sous la forme que son début de session lui donne
// (`contexte`, par le crochet de hook-of-parking.ts) :
//   node parking.ts park <owner>/<repo>#<n> --who <who> --what <what> --until <YYYY-MM-DD>
//   node parking.ts unpark <owner>/<repo>#<n>
// Ce qui est écrit, ou pourquoi rien ne l'est, se dit sur une ligne ; le code de sortie dit lequel : 0 fait, 1 refusé —
// par la saisie ou par GitHub —, 2 une commande mal formée.
import { sep } from "node:path";
import { unpark, type Written } from "../actions-github.ts";
import type { ClientOfThePriority } from "../priority.ts";
import { park } from "../vue/wait/wait-github.ts";
import { inputRead } from "../vue/wait/input.ts";
import { cite1 } from "./hook-of-the-file.ts";

const USAGE = [
  "usage: parking.ts park <owner>/<repo>#<issue> --who <who it waits for> --what <what it waits for> --until <YYYY-MM-DD>",
  "       parking.ts unpark <owner>/<repo>#<issue>",
].join("\n");

// Ce que la commande touche : le client GitHub du poste, le jour du poste — qui borne la date —, et ses deux sorties.
export type World = { client: ClientOfThePriority; aujourdhui: Date; dire: (line: string) => void; redire: (line: string) => void };

const TARGET = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+)#([1-9][0-9]*)$/;
const OPTIONS = ["--who", "--what", "--until"];

// Les options de `park`, chacune une fois et avec sa valeur — ou rien, pour une forme qui n'en est pas une.
function optionsRead(suite: readonly string[]): Map<string, string> | null {
  const readEntries = new Map<string, string>();
  for (let rank = 0; rank < suite.length; rank += 2) {
    const [option = "", value] = [suite[rank], suite[rank + 1]];
    if (!OPTIONS.includes(option) || readEntries.has(option) || value === undefined) return null;
    readEntries.set(option, value);
  }
  return readEntries;
}

// Joue le geste que les mots nomment ; rend le code de sortie.
export async function principal(args: readonly string[], { client, aujourdhui: today, dire: tell, redire }: World): Promise<number> {
  const [action, target, ...suite] = args;
  const [, repository, number] = TARGET.exec(target ?? "") ?? [];
  const options = optionsRead(suite);
  const formed = repository !== undefined && options !== null && (action === "park" ? options.size === OPTIONS.length : action === "unpark" && options.size === 0);
  if (!formed) {
    redire(USAGE);
    return 2;
  }
  const ticket = Number(number);
  let written: Written;
  if (action === "unpark") written = await unpark(repository, ticket, client);
  else {
    const readEntry = inputRead({ quoi: options.get("--what"), qui: options.get("--who"), relance: options.get("--until") }, today);
    if ("refus" in readEntry) {
      redire(readEntry.refus);
      return 1;
    }
    written = await park(repository, ticket, readEntry, today, client);
  }
  if ("refus" in written) {
    redire(written.detail === "" ? written.refus : `${written.refus} — ${written.detail}`);
    return 1;
  }
  tell(`${written.fait} — ${written.detail}`);
  return 0;
}

// Ce que le second reçoit à chaque début de session : la commande exacte, avec le `node` et le chemin de ce poste, et le
// dépôt du projet quand l'app le connaît.
export function context(repository: string, node: string, script: string, separator: string = sep): string {
  const launch = `${cite1(node, separator)} ${cite1(script, separator)}`;
  const ticket = `${repository === "" ? "<owner>/<repo>" : repository}#<n>`;
  return [
    "To park a ticket — it waits for someone: who, for what, until when — or to unpark it, run exactly this command. It writes on the ticket's issue what the app's buttons write, on any project, with no box command:",
    `  ${launch} park ${ticket} --who '<who>' --what '<what>' --until <YYYY-MM-DD>`,
    `  ${launch} unpark ${ticket}`,
    "Its one line says what was written, or why nothing was; relay it word for word.",
  ].join("\n");
}
