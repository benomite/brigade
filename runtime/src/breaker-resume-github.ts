// Le chef reprend une cuisine retenue par son disjoncteur depuis GitHub, sans
// `ssh` (#2134) : un commentaire `/resume` sur l'issue ouverte qui porte le
// label `brigade:breaker-open` referme le disjoncteur au sondage suivant. Ce qui
// le referme est `guardrails resume` lui-même, joué dans ce process sur le
// journal du projet (tableau/gestes-boite/jouer.ts) : la même commande, les
// mêmes faits, la même réponse.
//
// Seul compte un commentaire dont le corps est `/resume`, rien d'autre, posé
// par qui a la main sur le dépôt (DE_CONFIANCE), après l'ouverture du
// disjoncteur : un `/resume` d'avant visait une ouverture déjà refermée.
//
// Rien n'est tenu ici : tout se relit, du journal et de GitHub. Le disjoncteur
// fermé, rien n'est lu sur GitHub. Ouvert, l'issue se cherche parmi celles qui
// ont bougé depuis son ouverture — un commentaire posé depuis la fait bouger.
// Pas d'issue labellisée : rien à faire.
import { dirname } from "node:path";
import { DE_CONFIANCE } from "./alimenter.ts";
import type { Base } from "./base.ts";
import type { GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { etatDesGardeFous } from "./projections/guardrails.ts";
import { jouerUnGesteDeBoite } from "./tableau/gestes-boite/jouer.ts";

// Le label de l'issue qui dit, sur GitHub, que la cuisine est retenue par son disjoncteur.
export const LABEL_DU_DISJONCTEUR = "brigade:breaker-open";
// Le seul corps de commentaire qui reprend la cuisine.
export const REPRENDRE = "/resume";

// Le commentaire qui reprend la cuisine, et l'issue qui le porte.
export type Reprise = { issue: number; author: string; createdAt: string };

// Ce qu'un sondage a fait : rien — disjoncteur fermé, ni issue ni `/resume`
// qui compte —, la cuisine reprise, ou une reprise que la commande a refusée.
export type IssueDeLaReprise = { quoi: "rien" } | ({ quoi: "reprise"; dit: string } & Reprise) | ({ quoi: "refusee"; reason: string } & Reprise);

// Le répertoire d'état : le runtime ne le dit pas, la base si (comme garde-fous.ts).
function repertoireDEtat(base: Base): string {
  const fichier = base.lire<{ file: string }>("PRAGMA database_list")[0]?.file;
  if (!fichier) throw new Error("journal sans fichier : impossible de situer le répertoire d'état");
  return dirname(fichier);
}

// Le premier `/resume` qui compte, sur les issues ouvertes labellisées qui ont
// bougé depuis l'ouverture du disjoncteur.
export async function repriseDemandee(github: GitHub, ouvertLe: string): Promise<Reprise | null> {
  const depuis = Date.parse(ouvertLe);
  const issues = (await github.issuesDepuis(ouvertLe)).filter((issue) => issue.state === "open" && issue.labels.includes(LABEL_DU_DISJONCTEUR));
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    const commentaire = (await github.commentaires(issue.number)).find(
      (lu) => lu.body.trim() === REPRENDRE && DE_CONFIANCE.includes(lu.association) && Date.parse(lu.createdAt) > depuis,
    );
    if (commentaire) return { issue: issue.number, author: commentaire.author, createdAt: commentaire.createdAt };
  }
  return null;
}

// Un sondage : le disjoncteur ouvert et un `/resume` qui compte, la cuisine reprend.
export async function reprendreParGitHub(journal: Journal, github: GitHub): Promise<IssueDeLaReprise> {
  const ouvertLe = etatDesGardeFous(journal.base).breakerOpenedAt;
  if (ouvertLe === null) return { quoi: "rien" };
  const reprise = await repriseDemandee(github, ouvertLe);
  // Le disjoncteur a pu être refermé pendant la lecture : rien ne se rejoue.
  if (reprise === null || etatDesGardeFous(journal.base).breakerOpenedAt !== ouvertLe) return { quoi: "rien" };
  const joue = await jouerUnGesteDeBoite({ nom: "resume", commande: "guardrails", args: ["resume"] }, repertoireDEtat(journal.base));
  if (!joue.done) {
    console.error(`brigade : \`${REPRENDRE}\` de @${reprise.author} sur #${reprise.issue} non joué — ${joue.reason}`);
    return { quoi: "refusee", reason: joue.reason, ...reprise };
  }
  console.log(`brigade : \`${REPRENDRE}\` de @${reprise.author} sur #${reprise.issue} — ${joue.dit}`);
  return { quoi: "reprise", dit: joue.dit, ...reprise };
}
