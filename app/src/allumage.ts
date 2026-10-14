// Ce qu'engage l'allumage du manager, dit au moment du geste « allumer » :
// l'avertissement de docs/runtime.md, « Le manager », mot pour mot, et deux
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
import { echecDe, lancerGeste, type Reglages, type Servi } from "./box.ts";
import { titreDEchec } from "./faits.ts";

// Le geste du socle (gestes.ts) qui engage, et la lecture qui le chiffre.
export const GESTE = "manager-allumer";
export const COMMANDE = "manager backlog";

// docs/runtime.md, « Le manager » : son avertissement, sans sa mise en gras.
export const AVERTISSEMENT =
  "Allumé, il juge tout le backlog ouvert, et ce qu'il juge exécutable part aussitôt en cuisine. Avant d'allumer, pose `blocked-on-human` sur ce qui ne doit pas partir : une issue qui le porte n'est jamais jugée, une épique qui le porte n'est jamais découpée.";

// Ce que la confirmation pose dès qu'elle s'ouvre, avant que la box ait répondu : la vue
// les nomme, elle n'en écrit aucun.
export const ALLUMAGE = {
  geste: GESTE,
  commande: COMMANDE,
  enCours: "les issues ouvertes de ce projet, et celles qui portent `blocked-on-human` : lecture en cours sur la box…",
  parti: "les deux nombres n'ont pas été lus : l'app n'a pas pu les demander à la box de ce projet. Ce n'est pas « aucune issue » : regarde le backlog toi-même avant de dire oui",
} as const;

export type Backlog = { ouvertes: number; retenues: number };

// La ligne `backlog` : `<n> issue(s) ouverte(s), dont <m> porte(nt) `blocked-on-human` — <suite>`.
const LIGNE = /^backlog {2,}(\d+) issues? ouvertes?, dont (\d+) porte(?:nt)? `blocked-on-human`/;

// Ce que cette sortie de `manager backlog` compte — ou en quoi elle n'en a pas la forme.
export function backlogDe(sortie: string): Backlog | { informe: string } {
  const lignes = sortie.split("\n").filter((ligne) => ligne === "backlog" || ligne.startsWith("backlog "));
  const [ligne] = lignes;
  if (ligne === undefined) return { informe: "elle n'a pas de ligne `backlog`" };
  if (lignes.length > 1) return { informe: "elle a plus d'une ligne `backlog`" };
  const [, lues, portees] = LIGNE.exec(ligne) ?? [];
  const [ouvertes, retenues] = [Number(lues), Number(portees)];
  if (lues === undefined || portees === undefined || !Number.isSafeInteger(ouvertes) || !Number.isSafeInteger(retenues)) return { informe: `sa ligne \`backlog\` ne donne pas les deux nombres dans la forme attendue : « ${ligne} »` };
  if (retenues > ouvertes) return { informe: `sa ligne \`backlog\` compte plus d'issues \`blocked-on-human\` que d'issues ouvertes : « ${ligne} »` };
  return { ouvertes, retenues };
}

// Ce que la vue pose une fois la box revenue : elle n'y calcule rien. `a` : l'instant de la lecture.
// `dit` : les deux nombres, en une phrase. `sans` : pourquoi ils ne sont pas posés — ce n'est jamais
// « aucune issue » ; `obtenu` : ce que l'app a eu à leur place, tel quel.
export type Compte = { projet: string; a: string } & ((Backlog & { dit: string }) | { sans: string; obtenu: string });

const dire = ({ ouvertes, retenues }: Backlog) =>
  `${ouvertes} issue${ouvertes > 1 ? "s" : ""} ouverte${ouvertes > 1 ? "s" : ""} sur ce projet, dont ${retenues} porte${retenues > 1 ? "nt" : ""} \`blocked-on-human\``;

const PAS_LUS = "les deux nombres n'ont pas été lus";
const PAS_AUCUNE = "Ce n'est pas « aucune issue » : regarde le backlog toi-même avant de dire oui";

// Lance `manager backlog` sur la box du projet, une fois, et dit ce qu'il en est advenu. Jamais
// d'exception. Ses codes sont ceux d'une commande du runtime : 0, les nombres ; 1, GitHub n'a
// pas été lu ; 2, elle a été refusée — par un runtime d'avant elle, qui ne connaît pas `backlog`.
// Tout autre vient du geste, ou de `ssh`.
export async function compter(reglages: Reglages, servi: Servi): Promise<Compte> {
  const rendu = await lancerGeste(reglages, servi, COMMANDE);
  const [projet, a] = [servi.nom, new Date().toISOString()];
  const { erreur } = rendu;
  if (erreur === null) {
    const backlog = backlogDe(rendu.sortie);
    if ("informe" in backlog) return { projet, a, sans: `${PAS_LUS} dans ce que la box a rendu : ${backlog.informe}. ${PAS_AUCUNE}`, obtenu: `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}` };
    return { projet, a, ...backlog, dit: dire(backlog) };
  }
  const echec = echecDe({ ...rendu, erreur }, reglages.delaiMs);
  const refusee = erreur.killed !== true && erreur.code === 2;
  const sansGitHub = erreur.killed !== true && erreur.code === 1;
  const pourquoi = refusee
    ? "le runtime de la box a refusé `manager backlog` (code 2) — s'il est plus ancien que cette app, il ne connaît pas encore cette lecture : mets brigade à jour sur la box"
    : sansGitHub
      ? "la box a répondu, mais `manager backlog` n'a pas lu GitHub (code 1) — ce qu'elle en dit est dessous"
      : `${titreDEchec(echec, "JOINT, MAIS `manager backlog` N'A PAS RÉPONDU")} — ce que l'app a obtenu est dessous`;
  return { projet, a, sans: `${PAS_LUS} : ${pourquoi}. ${PAS_AUCUNE}`, obtenu: echec.erreur };
}
