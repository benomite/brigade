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
// Les commentaires de la station (ses renvois épuisés, ses cooks sans livraison) se disent en une ligne courte ; tout autre commentaire, par sa première ligne. Un `#N` de la ligne s'ouvre sur son issue, ou sa PR :
// GitHub mène de l'une à l'autre.

import { LABELS } from "../../../runtime/src/kitchen/decide.ts";
import { cardOfComment, type CardOfChef, type ChoiceOfChef, type Recommended } from "./todo-github.ts";
import { tellThePrByItsTicket } from "../vue/pr-of-ticket.js";

export const SERVED_ELSEWHERE = "served-elsewhere";
// Celui de la station : `out-of-kitchen` met aussi de côté.
export const OUT_OF_KITCHEN = "out-of-kitchen";
// Dans l'ordre où la carte les nomme quand l'issue porte les deux.
export const LABELS_OF_SET_ASIDE = [SERVED_ELSEWHERE, OUT_OF_KITCHEN] as const;
// L'issue du tableau de la cuisine : jamais une carte, ni sur le rail ni dans TODO.
export const LABEL_OF_BOARD_OF_THE_KITCHEN = "kitchen-board";
// La ligne d'un ticket mis de côté sans commentaire qui dise pourquoi : un label posé à la main. Ici, et non dans facts.ts,
// pour que la lecture du rail (vue/rail/github.ts) n'en charge rien d'autre que GitHub.
export const WITHOUT_REASON = "set aside by hand — no reason on the issue";
const PRODUCT_QUESTION = "product-question";
const OF_TRUST = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const BRAND_OF_MANAGER = "<!-- brigade:manager";
const BRAND_OF_ANSWER = /^\s*<!--\s*brigade:reponse\b/;
// Au-delà, la ligne s'arrête au mot, d'un « … » : le reste est sur l'issue.
const LENGTH_MAX = 160;

// Un `#N` de la ligne, et l'adresse qu'il ouvre.
export type LinkOfLine = { numero: number; url: string };
// Ce que la carte dit d'un ticket mis de côté : le label qui le met de côté, la ligne qui dit pourquoi — nulle quand aucun
// commentaire ne la porte —, et les `#N` qu'elle nomme. `auChef` : le ticket lui pose une question, donc entre dans TODO ;
// `chef` : la question marquée d'un `served-elsewhere`, avec ses boutons.
// `complete` : le commentaire de la station en entier, sans ses marques — la carte le garde derrière « details ».
export type SetAside = { label: string; raison: string | null; complete?: string; liens: LinkOfLine[]; auChef?: boolean; chef?: CardOfChef };

type Raw = Record<string, unknown>;

// Le label qui met l'issue de côté, ou rien. `parked` l'emporte : le ticket attend quelqu'un d'autre que le chef (#4129).
export function labelOfSetAside(labels: readonly string[]): string | null {
  if (labels.includes(LABELS.parked)) return null;
  return LABELS_OF_SET_ASIDE.find((label) => labels.includes(label)) ?? null;
}

const named = (body: string, label: string) => new RegExp(`(?<![\\w-])${label}(?![\\w-])`).test(body);

// Le texte d'un commentaire, sans ses marques, sa mise en forme, ni le « Station `x`: » qui l'ouvre.
const clean = (text: string) =>
  text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
const withoutStation = (text: string) => text.replace(/^Station [^:\n]*:\s*/, "");
// Une raison du runtime en une phrase : sa première ligne, jusqu'à son détail — après le premier « : ».
const motive = (reason: string) =>
  (reason.split("\n")[0] ?? "")
    .replace(/:(\s.*)?$/, "")
    .trim();

function couper(line: string): string {
  const one = line.replace(/\s+/g, " ").trim();
  if (one.length <= LENGTH_MAX) return one;
  const cut = one.slice(0, LENGTH_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > LENGTH_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, "")}…`;
}

// La ligne qu'un commentaire de mise de côté donne à la carte. Avec `ticket`, la PR qu'elle nomme est la livraison du
// ticket, dite par lui (pr-of-ticket.js, ticket 3716).
export function lineOfComment(body: string, ticket?: number): string | null {
  const saidOne = (line: string) => (ticket === undefined ? line : tellThePrByItsTicket(line, ticket));
  const text = withoutStation(clean(body));
  const head = text.split(/\n\s*\n/)[0] ?? "";
  // Les renvois épuisés (renvois.ts, brigade-github.ts) : « still not mergeable after 2 sends back — <raison> ».
  const sendBacks = /^still not mergeable after (\d+) sends? back — ([\s\S]*)$/.exec(head);
  if (sendBacks !== null) {
    const why = motive(sendBacks[2] as string);
    return saidOne(couper(`off the kitchen after ${sendBacks[1]} sends back${why === "" ? "" : ` — ${why}`}`));
  }
  // Les cooks sans livraison (brigade-github.ts) : « the cook stopped without a delivery — <échec> », puis leur nombre.
  const failure = /^the cook stopped without a delivery — ([\s\S]*)$/.exec(head);
  const cooks = /after (\d+) cooks without a delivery/.exec(text);
  if (failure !== null && cooks !== null) return saidOne(couper(`off the kitchen after ${cooks[1]} cooks without a delivery — ${(failure[1] as string).split("\n")[0]?.trim()}`));
  const first = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#+|>|[-*])\s*/, "").trim())
    .find((line) => line !== "");
  return first === undefined ? null : saidOne(couper(first));
}

// La question que le dernier commentaire marqué d'un auteur du dépôt pose au chef — rien si ce n'est pas une
// `product-question`, ni si une réponse du chef la suit (`<!-- brigade:reponse`, #2434, board-actions/answer-github.ts) :
// répondue, elle n'attend plus rien de lui, quel que soit le geste que la réponse a joué.
function questionOfChef(comments: readonly Raw[]): { carte: CardOfChef; commentaire: Raw } | null {
  const saidOnes = [...comments].reverse().filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && OF_TRUST.has(association));
  for (const comment of saidOnes) {
    if (BRAND_OF_ANSWER.test(comment.body as string)) return null;
    const card = cardOfComment(comment.body as string);
    if (card !== null) return card.sorte === PRODUCT_QUESTION ? { carte: card, commentaire: comment } : null;
  }
  return null;
}

// Le commentaire qui dit la mise de côté — la question marquée d'un `served-elsewhere`, sinon le dernier qui la nomme —, et la
// question, quand c'en est une.
function sourceOfTheSetAside(label: string, comments: readonly Raw[]): { dit: Raw | undefined; question: CardOfChef | null } {
  const said =
    [...comments]
      .reverse()
      .filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && OF_TRUST.has(association) && !body.includes(BRAND_OF_MANAGER) && named(body, label))
      .find(({ body }) => lineOfComment(body as string) !== null);
  const question = label === SERVED_ELSEWHERE ? questionOfChef(comments) : null;
  return { dit: question?.commentaire ?? said, question: question?.carte ?? null };
}

// La réponse que le manager recommande (#3434) est la ligne `Recommended: <libellé d'un choix> — <pourquoi>` qui suit la
// question d'une carte du chef : elle quitte le reste du commentaire pour la carte (`recommandee`). Sans elle, la carte n'en
// recommande aucune.
const RECOMMENDED = "Recommended: ";

// La ligne du contexte qui recommande l'un des choix, et ce qui la précise : le choix et pourquoi — rien sans elle, ni pour
// un libellé qui n'est pas celui d'un choix, ni sans pourquoi.
export function recommendedOf(context: string, choice: readonly ChoiceOfChef[]): { recommandee: Recommended; contexte: string } | null {
  const lines = context.split("\n");
  for (const [rank, line] of lines.entries()) {
    const saidOne = line.trim();
    if (!saidOne.startsWith(RECOMMENDED)) continue;
    const taken = choice.find(({ texte: text }) => saidOne.startsWith(`${RECOMMENDED}${text} — `));
    const why = taken === undefined ? "" : saidOne.slice(`${RECOMMENDED}${taken.texte} — `.length).trim();
    if (taken === undefined || why === "") return null;
    const remains = [...lines.slice(0, rank), ...lines.slice(rank + 1)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { recommandee: { texte: taken.texte, pourquoi: why }, contexte: remains };
  }
  return null;
}

// Depuis quand un ticket mis de côté par `label` l'est : l'heure du commentaire qui le dit (ce qui attend le chef,
// wait-of-chef.ts) — nulle quand aucun ne le dit.
export function setAsideOn(label: string, comments: readonly Raw[]): string | null {
  const the = sourceOfTheSetAside(label, comments).dit?.created_at;
  return typeof the === "string" && !Number.isNaN(Date.parse(the)) ? the : null;
}

// Ce que la carte dit du ticket `ticket` mis de côté par `label`, d'après les commentaires de son issue, du plus ancien au
// plus récent, tels que l'API de GitHub les rend.
export function setAsideOf(repository: string, label: string, comments: readonly Raw[], ticket: number): SetAside {
  const source = sourceOfTheSetAside(label, comments);
  const question = source.question;
  const said = question === null ? source.dit : undefined;
  const reason = question !== null ? couper(question.texte.split("\n")[0] ?? "") || null : said === undefined ? null : lineOfComment(said.body as string, ticket);
  const numbers = [...new Set([...(reason ?? "").matchAll(/#(\d+)\b/g)].map((finds) => Number(finds[1])))];
  const links = numbers.map((number) => ({ numero: number, url: `https://github.com/${repository}/issues/${number}` }));
  const complete = label !== SERVED_ELSEWHERE || question !== null || said === undefined ? "" : tellThePrByItsTicket(withoutStation(clean(said.body as string)), ticket);
  return { label, raison: reason, ...(complete === "" ? {} : { complete }), liens: links, auChef: question !== null, ...(question === null ? {} : { chef: question }) };
}
