// Ce qu'engage l'allumage du manager, dit au moment du geste « allumer » :
// l'avertissement de docs/runtime/manager.md, « Le manager », mot pour mot, et deux
// nombres — les issues ouvertes du projet, et celles qui portent
// `blocked-on-human`. Les nombres viennent de la box, par le geste qui existe
// (`ssh <hote> brigade <nom> manager backlog`, box.ts) : une commande du runtime
// qui lit GitHub et n'écrit rien (runtime/src/manager-cli.ts). L'app ne joint
// pas GitHub elle-même, et ne demande rien de plus à la box.
// Rien n'y est deviné : une sortie sans la ligne `backlog`, une box pas jointe,
// un runtime qui ne connaît pas la commande — ce n'est jamais « aucune issue ».
// **L'avertissement est le prix de la confirmation** : « allumer » est un geste
// confirmé (gestes.ts), et sa confirmation dit cet avertissement, puis ces deux
// nombres, demandés à la box dès qu'elle s'ouvre (confirmation.ts) — rien ne part
// avant le « oui » du chef, et ce « oui » n'attend pas les nombres. Ce module
// n'écrit dans aucun terminal.
import { echecDe, lancerGeste, type Reglages, type Served } from "./box.ts";
import { titreDEchec } from "./facts.ts";

// Le geste du socle (gestes.ts) qui engage, et la lecture qui le chiffre.
export const GESTE = "manager-allumer";
export const COMMANDE = "manager backlog";

// docs/runtime/manager.md, « Le manager » : son avertissement, sans sa mise en gras, dit en anglais
// côté app (la doc, elle, est en français).
export const AVERTISSEMENT =
  "Once on, it judges the whole open backlog, and whatever it judges executable goes to the kitchen right away. Before turning it on, put `blocked-on-human` on whatever must not go: an issue carrying it is never judged, an epic carrying it is never split.";

// Ce que la confirmation pose dès qu'elle s'ouvre, avant que la box ait répondu : la vue
// les nomme, elle n'en écrit aucun.
export const ALLUMAGE = {
  geste: GESTE,
  commande: COMMANDE,
  enCours: "this project's open issues, and those carrying `blocked-on-human`: reading from the station…",
  parti: "the two numbers were not read: the app could not ask this project's station for them. This is not “no issue”: look at the backlog yourself before saying yes",
} as const;

export type Backlog = { ouvertes: number; retenues: number };

// La ligne `backlog` : `<n> open issue(s), of which <m> carry/carries `blocked-on-human` — <suite>`.
// D'avant #951 : `<n> issue(s) ouverte(s), dont <m> porte(nt) `blocked-on-human` — <suite>`.
const LIGNE = /^backlog {2,}(\d+) open issues?, of which (\d+) carr(?:y|ies) `blocked-on-human`/;
const LIGNE_D_AVANT = /^backlog {2,}(\d+) issues? ouvertes?, dont (\d+) porte(?:nt)? `blocked-on-human`/;

// Ce que cette sortie de `manager backlog` compte — ou en quoi elle n'en a pas la forme.
export function backlogDe(sortie: string): Backlog | { informe: string } {
  const lignes = sortie.split("\n").filter((ligne) => ligne === "backlog" || ligne.startsWith("backlog "));
  const [ligne] = lignes;
  if (ligne === undefined) return { informe: "it has no `backlog` line" };
  if (lignes.length > 1) return { informe: "it has more than one `backlog` line" };
  const [, lues, portees] = LIGNE.exec(ligne) ?? LIGNE_D_AVANT.exec(ligne) ?? [];
  const [ouvertes, retenues] = [Number(lues), Number(portees)];
  if (lues === undefined || portees === undefined || !Number.isSafeInteger(ouvertes) || !Number.isSafeInteger(retenues)) return { informe: `its \`backlog\` line does not give the two numbers in the expected form: “${ligne}”` };
  if (retenues > ouvertes) return { informe: `its \`backlog\` line counts more \`blocked-on-human\` issues than open issues: “${ligne}”` };
  return { ouvertes, retenues };
}

// Ce que la vue pose une fois la box revenue : elle n'y calcule rien. `a` : l'instant de la lecture.
// `dit` : le prix d'« allumer », en une phrase, d'après les deux nombres — ce que le manager va juger :
// les issues ouvertes, moins celles que `blocked-on-human` retient, qu'il ne juge jamais (#906).
// `sans` : pourquoi ils ne sont pas posés — ce n'est jamais « aucune issue » ; `obtenu` : ce que
// l'app a eu à leur place, tel quel.
export type Compte = { projet: string; a: string } & ((Backlog & { dit: string }) | { sans: string; obtenu: string });

const issues = (combien: number) => `${combien} open issue${combien > 1 ? "s" : ""}`;
// La phrase des deux nombres : exportée pour l'outil de capture, qui la pose comme la box la ferait dire.
export function dire({ ouvertes, retenues }: Backlog): string {
  if (ouvertes === 0) return "it will judge no issue: none is open";
  if (retenues === 0) return `it will judge the ${issues(ouvertes)}`;
  if (retenues === ouvertes) return `it will judge no issue: ${ouvertes > 1 ? `all ${issues(ouvertes)} carry` : "the only open issue carries"} \`blocked-on-human\``;
  return `it will judge ${ouvertes - retenues} of the ${issues(ouvertes)} — ${retenues} ${retenues > 1 ? "carry" : "carries"} \`blocked-on-human\``;
}

const PAS_LUS = "the two numbers were not read";
const PAS_AUCUNE = "This is not “no issue”: look at the backlog yourself before saying yes";

// Lance `manager backlog` sur la box du projet, une fois, et dit ce qu'il en est advenu. Jamais
// d'exception. Ses codes sont ceux d'une commande du runtime : 0, les nombres ; 1, GitHub n'a
// pas été lu ; 2, elle a été refusée — par un runtime d'avant elle, qui ne connaît pas `backlog`.
// Tout autre vient du geste, ou de `ssh`.
export async function compter(reglages: Reglages, served: Served): Promise<Compte> {
  const rendu = await lancerGeste(reglages, served, COMMANDE);
  const [projet, a] = [served.nom, new Date().toISOString()];
  const { erreur } = rendu;
  if (erreur === null) {
    const backlog = backlogDe(rendu.sortie);
    if ("informe" in backlog) return { projet, a, sans: `${PAS_LUS} in what the station returned: ${backlog.informe}. ${PAS_AUCUNE}`, obtenu: `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}` };
    return { projet, a, ...backlog, dit: dire(backlog) };
  }
  const echec = echecDe({ ...rendu, erreur }, reglages.delaiMs);
  const refusee = erreur.killed !== true && erreur.code === 2;
  const sansGitHub = erreur.killed !== true && erreur.code === 1;
  const pourquoi = refusee
    ? "the station's runtime refused `manager backlog` (code 2) — if it is older than this app, it does not know this reading yet: update brigade on the station"
    : sansGitHub
      ? "the station answered, but `manager backlog` did not read GitHub (code 1) — what it says is below"
      : `${titreDEchec(echec, "REACHED, BUT `manager backlog` DID NOT ANSWER")} — what the app got is below`;
  return { projet, a, sans: `${PAS_LUS}: ${pourquoi}. ${PAS_AUCUNE}`, obtenu: echec.erreur };
}
