// Le chef reprend une cuisine retenue par son disjoncteur depuis GitHub, sans
// `ssh` (#2134) : un commentaire `/resume` sur l'issue ouverte qui porte le
// label `brigade:breaker-open` referme le disjoncteur au sondage suivant. Ce qui
// le referme est `guardrails resume` lui-même, joué dans ce process sur le
// journal du projet (`garde-fous-cli.ts`) : la même commande, les mêmes faits,
// la même réponse. Le sondage passe à chaque tick (`brancherRepriseParGitHub`).
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
import { Sortie, type Appel } from "./appel.ts";
import { principal as gardeFous } from "./garde-fous-cli.ts";
import type { Runtime } from "./runtime.ts";

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

// `guardrails resume` joué dans ce process : sa réponse sur une ligne, ou
// pourquoi il a refusé.
type ResultatDeLaCommande = { done: true; dit: string } | { done: false; reason: string };
const enUneLigne = (lignes: string[]) => lignes.join(" ").replace(/\s+/g, " ").replace(/^brigade : /, "").trim();
function reprendreLesGardeFous(repertoireEtat: string): ResultatDeLaCommande {
  const dit: string[] = [];
  const redit: string[] = [];
  const appel: Appel = { args: ["resume"], env: { BRIGADE_STATE_DIR: repertoireEtat }, dire: (ligne) => dit.push(ligne), redire: (ligne) => redit.push(ligne) };
  let code = 0;
  try {
    gardeFous(appel);
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) return { done: false, reason: `it failed (${erreur instanceof Error ? erreur.message : String(erreur)})` };
    code = erreur.code;
  }
  if (code === 0) return { done: true, dit: enUneLigne(dit) };
  return { done: false, reason: enUneLigne(redit.length > 0 ? redit : dit) || `the command stopped with code ${code}` };
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
  const joue = reprendreLesGardeFous(repertoireDEtat(journal.base));
  if (!joue.done) {
    console.error(`brigade : \`${REPRENDRE}\` de @${reprise.author} sur #${reprise.issue} non joué — ${joue.reason}`);
    return { quoi: "refusee", reason: joue.reason, ...reprise };
  }
  console.log(`brigade : \`${REPRENDRE}\` de @${reprise.author} sur #${reprise.issue} — ${joue.dit}`);
  return { quoi: "reprise", dit: joue.dit, ...reprise };
}

// Le sondage à chaque tick, un à la fois : un échec (GitHub injoignable) se
// dit, et le tick suivant réessaie. Son `arreter` l'emporte.
export function brancherRepriseParGitHub<R extends Runtime>(runtime: R, options: { github: GitHub; avertir?: (message: string) => void }): R {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  let arrete = false;
  let enCours = false;
  const desabonner = runtime.surReveil((cause) => {
    if (cause !== "tick" || arrete || enCours) return;
    enCours = true;
    void reprendreParGitHub(runtime.journal, options.github)
      .catch((erreur) => {
        if (!arrete) avertir(`brigade : \`${REPRENDRE}\` non lu sur GitHub — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      })
      .finally(() => {
        enCours = false;
      });
  });
  return {
    ...runtime,
    arreter(signal: string) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
