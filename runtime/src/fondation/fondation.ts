// Les gates d'un projet neuf, tant que son ticket de fondation n'est pas servi
// (#3188, épique #3183). `/brigade:init` prépare un dépôt sans code (#3186) :
// il n'y a encore aucun test à jouer, et il dépose le ticket de fondation —
// labellisé `foundation`, titré « Lay the project's foundation with <stack> » —
// qui apporte la commande de test. Il le note par une ligne des bindings de
// `CLAUDE.md` :
//
//   - **Gates provisoires** : until #<n> ("Lay the project's foundation with <stack>") is merged — …
//
// Des gates qui ne jouent rien ne disent jamais vert : tant que la ligne est
// là et que #<n> n'est pas servi (fermé), aucune livraison ne se merge sur
// elles — elles rendent « nothing checked », et pourquoi. Seule la livraison
// du ticket `foundation` passe : elle apporte les vraies gates, que la station
// joue sur sa branche, et la relecture la juge sur ses propres critères. Le
// ticket de fondation servi, les gates sont les vraies, ligne oubliée ou non.
// Sans numéro dans la ligne (le ticket n'a pas pu être déposé), elles restent
// provisoires jusqu'à ce qu'une livraison la retire.
//
// Branché sur les gates que joue la station (`brigade-github.ts`) : celles de
// la tête d'une PR, avant son merge, et celles de la base, qui prouvent un
// ticket déjà servi (#3146). Une PR externe n'est jamais mergée par la cuisine
// (#2933) : ses gates ne passent pas par ici.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "../github.ts";

export const LABEL_FONDATION = "foundation";
export const RIEN_VERIFIE = "nothing checked";

// La ligne des bindings, et le ticket de fondation qu'elle nomme.
const LIGNE = /^\s*-\s*\*\*Gates provisoires\*\*\s*:(.*)$/m;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les gates provisoires que ce `CLAUDE.md` déclare, et le ticket de fondation
// qui les rend réelles (null : la ligne n'en nomme aucun) ; null sans la ligne.
export function gatesProvisoires(claudeMd: string): { fondation: number | null } | null {
  const ligne = LIGNE.exec(claudeMd)?.[1];
  if (ligne === undefined) return null;
  const numero = /#(\d+)/.exec(ligne)?.[1];
  return { fondation: numero === undefined ? null : Number(numero) };
}

export type LireIssue = (numero: number) => Promise<Pick<Issue, "state"> | null>;

// Pourquoi les gates de ce worktree ne peuvent pas juger la livraison de
// `ticket`, en une phrase ; null : elles sont les vraies, qu'on les joue.
// Ne lève pas : un `CLAUDE.md` illisible ou un ticket de fondation que GitHub
// ne rend pas ne se tranchent pas ici — ils se disent, et rien ne se merge.
export async function gatesQuiNeJugentPas(worktree: string, ticket: Pick<Issue, "labels">, lireIssue: LireIssue): Promise<string | null> {
  if (ticket.labels.includes(LABEL_FONDATION)) return null;
  let claudeMd: string;
  try {
    claudeMd = readFileSync(join(worktree, "CLAUDE.md"), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return null;
    return `the \`CLAUDE.md\` of the delivery could not be read to know whether its gates are provisional: ${message(erreur)}`;
  }
  const provisoires = gatesProvisoires(claudeMd);
  if (provisoires === null) return null;
  const { fondation } = provisoires;
  const rien = (jusqua: string) => `${RIEN_VERIFIE} — the gates run nothing until ${jusqua} (the \`Gates provisoires\` binding of \`CLAUDE.md\`): no delivery but the \`${LABEL_FONDATION}\` ticket's is merged on them`;
  if (fondation === null) return rien("the foundation ticket is filed and merged");
  let lue: Pick<Issue, "state"> | null;
  try {
    lue = await lireIssue(fondation);
  } catch (erreur) {
    return `the foundation ticket #${fondation} could not be read on GitHub to know whether it is served: ${message(erreur)}`;
  }
  if (lue?.state === "closed") return null;
  return rien(lue === null ? `the foundation ticket #${fondation}, which no longer exists, is merged` : `the foundation ticket #${fondation} is merged`);
}
