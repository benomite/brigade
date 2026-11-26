// Un ticket mis de côté, lu de GitHub, pour un projet GitHub seul (#2075) : la station ou le chef pose sur son issue
// `served-elsewhere` (trop de renvois, trop de cooks sans livraison : un humain décide) ou `out-of-kitchen`, et la station
// dit pourquoi dans un commentaire, en posant le label. Un ticket qui attend quelqu'un est parqué (#4129) : le label
// `parked`, ou `chef-todo` pour le chef — jamais une mise de côté.
//
// Le commentaire lu est le dernier qui nomme le label que l'issue porte, d'un auteur du dépôt
// (`author_association` OWNER, MEMBER ou COLLABORATOR : tout le monde peut commenter une issue publique), hors ceux du
// manager (`<!-- brigade:manager -->`), qui nomment les labels sans en être la raison. Aucun : la carte le dit
// (`SANS_RAISON`).
//
// Ce qui entre dans TODO (#2422) : seul ce qui demande quelque chose au chef. `served-elsewhere` n'en est une que si un
// commentaire marqué `<!-- brigade:todo kind=product-question -->` (#2217, todo-github.ts) en pose une ; pour une cause
// technique (renvois épuisés, cooks sans livraison), le ticket reste sur le rail, dans sa colonne de mise de côté, avec sa
// ligne : c'est le travail du second. Un `kitchen-board` n'est jamais une carte.
//
// Les commentaires de la station (runtime/src/brigade-github.ts, runtime/src/github-seul/renvois/renvois.ts) se disent en
// une ligne courte ; tout autre commentaire, par sa première ligne. Un `#N` de la ligne s'ouvre sur son issue, ou sa PR :
// GitHub mène de l'une à l'autre.

import { LABEL_PARKED } from "../../../runtime/src/attente-github/marque.ts";
import type { ZoneTenue } from "../vue/banner-stop/stop-du-rail.ts";
import { cardDuComment, formeDuChef, type CardDuChef, type ChoiceDuChef, type Recommandee } from "./todo-github.ts";
import { tellLaPrParSonTicket } from "../vue/pr-du-ticket.js";

export const SERVED_ELSEWHERE = "served-elsewhere";
// Celui de la station (runtime/src/github.ts, `MIS_DE_COTE`) : `out-of-kitchen` met aussi de côté.
export const OUT_OF_KITCHEN = "out-of-kitchen";
// Dans l'ordre où la carte les nomme quand l'issue porte les deux.
export const LABELS_DE_MISE_DE_SIDE = [SERVED_ELSEWHERE, OUT_OF_KITCHEN] as const;
// L'issue du tableau de la cuisine : jamais une carte, ni sur le rail ni dans TODO.
export const LABEL_DU_TABLEAU_DE_LA_KITCHEN = "kitchen-board";
// La ligne d'un ticket mis de côté sans commentaire qui dise pourquoi : un label posé à la main. Ici, et non dans facts.ts,
// pour que la lecture du rail (vue/rail/github.ts) n'en charge rien d'autre que GitHub.
export const SANS_RAISON = "set aside by hand — no reason on the issue";
const PRODUCT_QUESTION = "product-question";
const DE_CONFIANCE = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MARQUE_DU_MANAGER = "<!-- brigade:manager";
const MARQUE_DE_ANSWER = /^\s*<!--\s*brigade:reponse\b/;
// Au-delà, la ligne s'arrête au mot, d'un « … » : le reste est sur l'issue.
const LONGUEUR_MAX = 160;

// Un `#N` de la ligne, et l'adresse qu'il ouvre.
export type LienDeLine = { numero: number; url: string };
// Ce que la carte dit d'un ticket mis de côté : le label qui le met de côté, la ligne qui dit pourquoi — nulle quand aucun
// commentaire ne la porte —, et les `#N` qu'elle nomme. `auChef` : le ticket lui pose une question, donc entre dans TODO ;
// `chef` : la question marquée d'un `served-elsewhere`, avec ses boutons.
// `complete` : le commentaire de la station en entier, sans ses marques — la carte le garde derrière « details ».
// `zoneTenue` : la zone que sa fiche déclare et que sa PR ouverte tient, et depuis quand (vue/banner-stop/, ticket 3924).
export type MiseDeSide = { label: string; raison: string | null; complete?: string; liens: LienDeLine[]; auChef?: boolean; chef?: CardDuChef; zoneTenue?: ZoneTenue };

type Brut = Record<string, unknown>;

// Le label qui met l'issue de côté, ou rien. `parked` l'emporte : le ticket attend quelqu'un d'autre que le chef (#4129).
export function labelDeMiseDeSide(labels: readonly string[]): string | null {
  if (labels.includes(LABEL_PARKED)) return null;
  return LABELS_DE_MISE_DE_SIDE.find((label) => labels.includes(label)) ?? null;
}

const nomme = (corps: string, label: string) => new RegExp(`(?<![\\w-])${label}(?![\\w-])`).test(corps);

// Le texte d'un commentaire, sans ses marques, sa mise en forme, ni le « Station `x`: » qui l'ouvre.
const nettoyer = (texte: string) =>
  texte
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
const sansStation = (texte: string) => texte.replace(/^Station [^:\n]*:\s*/, "");
// Une raison du runtime en une phrase : sa première ligne, jusqu'à son détail — après le premier « : ».
const motif = (raison: string) =>
  (raison.split("\n")[0] ?? "")
    .replace(/:(\s.*)?$/, "")
    .trim();

function couper(line: string): string {
  const une = line.replace(/\s+/g, " ").trim();
  if (une.length <= LONGUEUR_MAX) return une;
  const coupee = une.slice(0, LONGUEUR_MAX);
  const space = coupee.lastIndexOf(" ");
  return `${(space > LONGUEUR_MAX / 2 ? coupee.slice(0, space) : coupee).replace(/[\s,;:—-]+$/, "")}…`;
}

// La ligne qu'un commentaire de mise de côté donne à la carte. Avec `ticket`, la PR qu'elle nomme est la livraison du
// ticket, dite par lui (pr-du-ticket.js, ticket 3716).
export function lineDuComment(corps: string, ticket?: number): string | null {
  const dite = (line: string) => (ticket === undefined ? line : tellLaPrParSonTicket(line, ticket));
  const texte = sansStation(nettoyer(corps));
  const tete = texte.split(/\n\s*\n/)[0] ?? "";
  // Les renvois épuisés (renvois.ts, brigade-github.ts) : « still not mergeable after 2 sends back — <raison> ».
  const sendBacks = /^still not mergeable after (\d+) sends? back — ([\s\S]*)$/.exec(tete);
  if (sendBacks !== null) {
    const pourquoi = motif(sendBacks[2] as string);
    return dite(couper(`off the kitchen after ${sendBacks[1]} sends back${pourquoi === "" ? "" : ` — ${pourquoi}`}`));
  }
  // Les cooks sans livraison (brigade-github.ts) : « the cook stopped without a delivery — <échec> », puis leur nombre.
  const failure = /^the cook stopped without a delivery — ([\s\S]*)$/.exec(tete);
  const cooks = /after (\d+) cooks without a delivery/.exec(texte);
  if (failure !== null && cooks !== null) return dite(couper(`off the kitchen after ${cooks[1]} cooks without a delivery — ${(failure[1] as string).split("\n")[0]?.trim()}`));
  const first = texte
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#+|>|[-*])\s*/, "").trim())
    .find((line) => line !== "");
  return first === undefined ? null : dite(couper(first));
}

// La question que le dernier commentaire marqué d'un auteur du dépôt pose au chef — rien si ce n'est pas une
// `product-question`, ni si une réponse du chef la suit (`<!-- brigade:reponse`, #2434, tableau-actions/answer-github.ts) :
// répondue, elle n'attend plus rien de lui, quel que soit le geste que la réponse a joué.
function questionDuChef(commentaires: readonly Brut[]): { carte: CardDuChef; commentaire: Brut } | null {
  const dits = [...commentaires].reverse().filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && DE_CONFIANCE.has(association));
  for (const comment of dits) {
    if (MARQUE_DE_ANSWER.test(comment.body as string)) return null;
    const card = cardDuComment(comment.body as string);
    if (card !== null) return card.sorte === PRODUCT_QUESTION ? { carte: card, commentaire: comment } : null;
  }
  return null;
}

// Le commentaire qui dit la mise de côté — la question marquée d'un `served-elsewhere`, sinon le dernier qui la nomme —, et la
// question, quand c'en est une.
function sourceDeLaMiseDeSide(label: string, commentaires: readonly Brut[]): { dit: Brut | undefined; question: CardDuChef | null } {
  const dit =
    [...commentaires]
      .reverse()
      .filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && DE_CONFIANCE.has(association) && !body.includes(MARQUE_DU_MANAGER) && nomme(body, label))
      .find(({ body }) => lineDuComment(body as string) !== null);
  const question = label === SERVED_ELSEWHERE ? questionDuChef(commentaires) : null;
  return { dit: question?.commentaire ?? dit, question: question?.carte ?? null };
}

// La carte du chef d'un ticket parqué pour lui par un label d'attente d'avant parked (#4129, la liste
// `LABELS_D_AVANT_PARKED_POUR_LE_CHEF` de runtime/src/github-etat/etats.ts ; d'abord les écarts du manager, #3370,
// wait-du-chef.ts) : la question du manager, un bouton par choix, et le champ libre. La question est la dernière
// ligne qui finit par « ? » du dernier commentaire d'un auteur du dépôt qui en porte une — hors ceux qu'une station écrit en
// prenant le ticket (`<!-- brigade:manager-prise`) —, tant qu'aucune réponse du chef (`<!-- brigade:reponse`) ne la suit ;
// ses choix sont les lignes `- [<geste>] <libellé>` qui la suivent (todo-github.ts, `formeDuChef`), et le reste du
// commentaire la précise. Sans choix : `Back to the kitchen` — `resume` retire le label qui le parque
// (tableau-actions/answer-github.ts) : il reprend où il était — et `Close it`. Aucune question sur l'issue : la carte
// demande ce que son label attend, avec ces deux choix.
// La réponse que le manager recommande (#3434) est la ligne `Recommended: <libellé d'un choix> — <pourquoi>` qui suit la
// question (runtime/src/manager.ts) : elle quitte le reste du commentaire pour la carte (`recommandee`). Sans elle — le
// manager n'avait rien pour en recommander une, ou la carte retombe sur ses deux choix —, la carte n'en recommande aucune :
// jamais `Back to the kitchen` par défaut.
const MARQUE_DE_TAKING = "<!-- brigade:manager-prise";
const questionDeLEcart = (label: string) => `It carries \`${label}\`, a waiting label of before parked: what do you decide?`;
const CHOICE_DE_L_ECART = ["- [resume] Back to the kitchen", "- [close] Close it"];
const QUESTION = /\?\s*$/;
const CHOICE = /^\s*[-*]\s*\[[a-z]+\]\s/i;
// La sorte de sa carte, quel que soit le label d'avant qui la parque.
export const SORTE_DE_L_ECART = "manager-parked";
const RECOMMANDEE = "Recommended: ";

// La ligne du contexte qui recommande l'un des choix, et ce qui la précise : le choix et pourquoi — rien sans elle, ni pour
// un libellé qui n'est pas celui d'un choix, ni sans pourquoi.
export function recommandeeDe(context: string, choice: readonly ChoiceDuChef[]): { recommandee: Recommandee; contexte: string } | null {
  const lines = context.split("\n");
  for (const [rang, line] of lines.entries()) {
    const dite = line.trim();
    if (!dite.startsWith(RECOMMANDEE)) continue;
    const taken = choice.find(({ texte }) => dite.startsWith(`${RECOMMANDEE}${texte} — `));
    const pourquoi = taken === undefined ? "" : dite.slice(`${RECOMMANDEE}${taken.texte} — `.length).trim();
    if (taken === undefined || pourquoi === "") return null;
    const reste = [...lines.slice(0, rang), ...lines.slice(rang + 1)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { recommandee: { texte: taken.texte, pourquoi }, contexte: reste };
  }
  return null;
}

export function cardDeLEcart(label: string, commentaires: readonly Brut[]): CardDuChef {
  const dits = [...commentaires].reverse().filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && DE_CONFIANCE.has(association) && !body.includes(MARQUE_DE_TAKING));
  for (const { body } of dits) {
    if (MARQUE_DE_ANSWER.test(body as string)) break;
    const lines = nettoyer(body as string).split(/\r?\n/);
    const rang = lines.findLastIndex((line) => !CHOICE.test(line) && QUESTION.test(line));
    if (rang === -1) continue;
    const forme = formeDuChef(lines.slice(rang).join("\n"));
    const { question, choix: choice } = forme;
    if (question === null || question === "") continue;
    const recommandee = recommandeeDe(forme.contexte, choice);
    const context = recommandee?.contexte ?? forme.contexte;
    const avant = lines.slice(0, rang).join("\n").trim();
    const precise = [avant, context].filter((texte) => texte !== "").join("\n\n");
    const boutons = choice.length === 0 ? CHOICE_DE_L_ECART : choice.map(({ texte, suite }) => `- [${suite}] ${texte}`);
    return { sorte: SORTE_DE_L_ECART, texte: [question, ...boutons, ...(precise === "" ? [] : ["", precise])].join("\n"), recommandee: recommandee?.recommandee ?? null };
  }
  return { sorte: SORTE_DE_L_ECART, texte: [questionDeLEcart(label), ...CHOICE_DE_L_ECART].join("\n"), recommandee: null };
}

// Depuis quand un ticket mis de côté par `label` l'est : l'heure du commentaire qui le dit (ce qui attend le chef,
// wait-du-chef.ts) — nulle quand aucun ne le dit.
export function miseDeSideLe(label: string, commentaires: readonly Brut[]): string | null {
  const le = sourceDeLaMiseDeSide(label, commentaires).dit?.created_at;
  return typeof le === "string" && !Number.isNaN(Date.parse(le)) ? le : null;
}

// Ce que la carte dit du ticket `ticket` mis de côté par `label`, d'après les commentaires de son issue, du plus ancien au
// plus récent, tels que l'API de GitHub les rend.
export function miseDeSideDe(repository: string, label: string, commentaires: readonly Brut[], ticket: number): MiseDeSide {
  const source = sourceDeLaMiseDeSide(label, commentaires);
  const question = source.question;
  const dit = question === null ? source.dit : undefined;
  const raison = question !== null ? couper(question.texte.split("\n")[0] ?? "") || null : dit === undefined ? null : lineDuComment(dit.body as string, ticket);
  const numeros = [...new Set([...(raison ?? "").matchAll(/#(\d+)\b/g)].map((trouve) => Number(trouve[1])))];
  const liens = numeros.map((numero) => ({ numero, url: `https://github.com/${repository}/issues/${numero}` }));
  const complete = label !== SERVED_ELSEWHERE || question !== null || dit === undefined ? "" : tellLaPrParSonTicket(sansStation(nettoyer(dit.body as string)), ticket);
  return { label, raison, ...(complete === "" ? {} : { complete }), liens, auChef: question !== null, ...(question === null ? {} : { chef: question }) };
}
