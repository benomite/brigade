// La carte de TODO (#1281, épique #1277) : une carte du chef lue de GitHub — un ticket parqué pour lui (`parked:chef`,
// runtime/src/kitchen/), une question du manager, une validation de design — porte une seule question,
// ses choix et, pour un écran, ses captures avant et après. La carte du rail la montre telle quelle : la question, un bouton
// par choix, un champ pour répondre en texte libre, et les captures quand il y en a.
//
// Un clic sur un choix, ou le texte envoyé, est la réponse du chef : elle est lue ici (`reponseLue`). Aucune box ne lit
// plus de tableau de la cuisine (#2061) : seule la carte du chef lue de GitHub (#2434, `carteDuChefDeTodo`) se répond, sur
// son issue, par le `gh` du chef (board-actions/answer-github.ts). La vue nomme le ticket, la question qu'elle montre, et
// le rang du choix ou le texte.
import type { CapturesOfCard } from "./captures.ts";
import { LENGTH_MAX } from "./discussion.ts";
import { KIND_PARKED_CHEF } from "./board/parked-chef-github.ts";
import { shapeOfChef, type CardOfChef } from "./board/todo-github.ts";
import { capturesOfTheValidation, KIND_OF_VALIDATION } from "./vue/validation-design/validation-design-github.ts";
import { tellThePrByItsTicket } from "./vue/pr-of-ticket.js";

// La carte telle que la réponse du chef se contrôle : sa sorte, sa question, ses choix — chacun son texte et sa suite
// (`resume`, `merge`, `drop`, `close`), numérotés à partir de 1.
export type ChoiceRead = { texte: string; suite: string };
export type CardRead = { type: string; question: string | null; choix: ChoiceRead[] };

// La dernière réponse du chef à la carte, que la vue sait montrer (vue/card-todo.js, #1841) : son commentaire, la
// réponse dite en mots, son heure, et ce que la box en a fait. Aucune lecture ne la porte plus : le tableau de la cuisine
// qui la donnait n'est plus écrit (#2061).
export type SendSeen = { commentaire: number; reponse: string; le: string } & ({ etat: "attente" } | { etat: "joue"; dit: string } | { etat: "refuse"; dit: string; raison: string });

// La carte telle que la vue la pose : sa sorte, ce qui se passe, sa question — nulle sur une carte à un
// seul geste —, ses choix — chacun avec son prix, qui passe au survol —, le prix d'une réponse en texte
// libre, ses captures, absentes sans écran.
export type ChoiceOfCard = { texte: string; prix: string };
// `contexte` : ce que le commentaire d'une carte du chef lue de GitHub dit après sa question (#2434) — absent ailleurs.
// `validation` : la carte « Validate its screen » (vue/validation-design/, ticket 3185) — la PR qu'elle valide, ou pourquoi
// son issue ne la dit pas (`illisible`) — absente ailleurs.
export type ValidationOfCard = { pr: number; ticket: number } | { illisible: string };
// `brief` : en tête du détail en grand d'une carte « Validate its screen » (ticket 3330), ce que le ticket demandait et ce
// que le cook a changé à l'écran — `fait` nul, il n'en a rien dit.
export type BriefOfCard = { demande: string; fait: string[] | null };
// `recommandation` : sur la carte d'un écart du manager (#3434), le rang — à partir de 1 — du choix qu'il recommande, et
// pourquoi en une ligne ; nulle, il n'en recommande aucun : aucun choix n'est mis en avant. Absente ailleurs : le premier
// choix est la réponse recommandée (ticket 2922).
export type RecommendationOfCard = { rang: number; pourquoi: string };
// `repondre` : le libellé du bouton de la réponse libre, quand ce n'est pas « send » ; `surGithub` : la carte a son bouton
// « Open on GitHub » — celle d'un ticket que la nouvelle cuisine parque pour le chef (#4474), absents ailleurs.
export type CardOfTodo = { sorte: string; resume?: string; question: string | null; contexte?: string; choix: ChoiceOfCard[]; prixDuTexte: string; repondre?: string; surGithub?: true; recommandation?: RecommendationOfCard | null; captures?: CapturesOfCard; envoi?: SendSeen; validation?: ValidationOfCard; brief?: BriefOfCard };

// Ce que la vue envoie : la question qu'elle montre — nulle sur une carte à un seul geste ; rien ne part
// sur une carte qui a changé sous les yeux du chef —, et le rang d'un choix, à partir de 1, ou le texte
// du chef.
export type Answer = { question: string | null } & ({ choix: number } | { texte: string });
// Ce qu'il en est advenu : la réponse est écrite — `dit`, ce que la box en dit —, ou rien ne l'est, et
// pourquoi, en une ligne, ce que la box a rendu au survol.
// `commentaire` : celui que la réponse a posté — la carte attend la cuisine jusqu'à ce qu'une lecture dise ce qu'il en
// est de lui, ou d'une réponse plus récente.
export type Rendered = { repondue: true; dit: string; commentaire?: number } | { refus: string; detail: string };

// Une carte du chef lue de GitHub (#2434, board/todo-github.ts) : l'app joue elle-même le geste sur GitHub, par le `gh`
// du chef (board-actions/answer-github.ts) — aucune box, aucune station ne le joue.
const POSTED = "your answer is posted on the issue from your GitHub account";
const PRICE_ON_GITHUB: Readonly<Record<string, string>> = {
  resume: `${POSTED}, and the app removes what holds the ticket (\`chef-todo\`, \`parked\`, \`served-elsewhere\`): it resumes exactly where it was and its cook reads your answer`,
  merge: `${POSTED}, and the app merges the PR the card names under your GitHub account — a merge is not undone from the app`,
  drop: `${POSTED}, and the app removes \`fire\`: the ticket is off the rail, no cook takes it, its issue stays open`,
  close: `${POSTED}, and the app closes the issue: the ticket is not cooked`,
  rail: `${POSTED}, and the app puts the \`prio:\` label the choice names on the issue: a stranger's issue goes on the rail`,
  wait: `${POSTED}, and the app parks the ticket for the one the choice names, until a date seven days away, and it leaves your TODO: nothing takes it before they answer or that date comes`,
};
// Answer, sur la carte d'un ticket parqué pour le chef par la nouvelle cuisine (#4474).
const PRICE_PARKED_CHEF = `${POSTED}, and the app removes \`parked:chef\`: the ticket goes back on the rail, and its cook reads your answer`;

// La situation d'une carte du chef, en une ligne (#3086) : la première phrase de ce que son commentaire dit après la question,
// entière — jamais coupée en son milieu. Le reste du commentaire est derrière « details ». Rien quand il ne dit rien.
function situationOf(context: string): string | undefined {
  const line = context.split("\n").find((one) => one.trim() !== "")?.trim();
  if (line === undefined) return undefined;
  return line.split(/(?<=[.!?])\s+/)[0];
}

// La carte du chef dans la forme de toute carte de TODO : sa question, un bouton par choix — chacun son prix —, le champ
// libre, qui joue `resume`, et ce que le commentaire dit d'autre. Rien pour une issue sans commentaire marqué, ni pour un
// commentaire vide : il n'y a rien à quoi répondre.
// La question d'une carte du chef telle que le chef la lit : celle d'une validation de design nomme sa PR par son numéro —
// la carte la dit par son ticket (ticket 3716).
export function questionOfChef({ texte: text, design }: CardOfChef): string | null {
  const { question } = shapeOfChef(text);
  return question === null || design === undefined ? question : tellThePrByItsTicket(question, design.ticket, design.pr);
}

export function cardOfChefOfTodo(card: CardOfChef): CardOfTodo | undefined {
  const { sorte: kind, texte: text, design, recommandee: recommended } = card;
  const { choix: choice, contexte: context } = shapeOfChef(text);
  const question = questionOfChef(card);
  if (question === null) return undefined;
  // La carte « Validate its screen » (ticket 3185) : sa question, ses captures et sa PR, et ses deux gestes — valider, ou
  // renvoyer en cuisine avec un commentaire —, ni choix ni réponse libre. Son lien de PR est dit sur la carte, pas en
  // contexte. Une issue dont le corps ne dit pas sa PR ne se valide pas d'ici : la carte le dit.
  if (kind === KIND_OF_VALIDATION) {
    return {
      sorte: kind,
      question,
      choix: [],
      prixDuTexte: "",
      ...(design === undefined
        ? { validation: { illisible: "its issue does not say which pull request it validates: validate it on GitHub" } }
        : { validation: { pr: design.pr, ticket: design.ticket }, captures: capturesOfTheValidation(design), ...(design.brief === undefined ? {} : { brief: design.brief }) }),
    };
  }
  // Un ticket que la nouvelle cuisine parque pour le chef (#4474) : ce qu'elle en dit, un seul geste — Answer, qui poste le
  // texte du chef et retire `parked:chef` —, et « Open on GitHub ». Aucun choix : le commentaire de la cuisine n'en propose pas.
  if (kind === KIND_PARKED_CHEF) {
    return { sorte: kind, question, ...(context === "" ? {} : { contexte: context }), choix: [], prixDuTexte: PRICE_PARKED_CHEF, repondre: "Answer", surGithub: true };
  }
  const situation = situationOf(context);
  // Le choix que le manager recommande, par son rang : un libellé qui n'est plus parmi les choix n'en recommande aucun.
  const rank = recommended == null ? 0 : choice.findIndex(({ texte: wording }) => wording === recommended.texte) + 1;
  const recommendation = recommended === undefined ? {} : { recommandation: recommended === null || rank === 0 ? null : { rang: rank, pourquoi: recommended.pourquoi } };
  return {
    sorte: kind,
    ...(situation === undefined ? {} : { resume: situation }),
    question,
    ...(context === "" ? {} : { contexte: context }),
    choix: choice.map(({ texte: wording, suite }) => ({ texte: wording, prix: PRICE_ON_GITHUB[suite] as string })),
    prixDuTexte: PRICE_ON_GITHUB.resume as string,
    ...recommendation,
  };
}

// La même carte telle que la réponse du chef se contrôle (`reponseLue`) : sa question et ses choix, chacun son geste.
export function cardReadOfChef({ sorte: kind, texte: text }: CardOfChef): CardRead | undefined {
  const { question, choix: readOnes } = shapeOfChef(text);
  // La carte d'un ticket parqué par la nouvelle cuisine n'a que sa réponse libre (#4474).
  const choice = kind === KIND_PARKED_CHEF ? [] : readOnes;
  // La carte « Validate its screen » ne se répond pas : ses deux gestes sont la commande du runtime (vue/validation-design/).
  return question === null || kind === KIND_OF_VALIDATION ? undefined : { type: kind, question, choix: choice };
}

const text = (value: unknown): value is string => typeof value === "string";
const object = (value: unknown): Record<string, unknown> | undefined => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);

// La réponse du chef dite en mots : le texte du choix qu'il a pris, ou ce qu'il a écrit.
export const answerSaid = (choice: readonly { texte: string }[], answer: { choix: number } | { texte: string }): string =>
  "choix" in answer ? (choice[answer.choix - 1]?.texte ?? `choice ${answer.choix}`) : answer.texte;

export const UNKNOWN = "nothing was sent: this card is not in the latest facts read — it was answered elsewhere, or it left TODO";
export const CHANGED = "nothing was sent: the card's question changed since you read it — read it again";
export const EMPTY = "nothing was sent: your answer is empty — write something to send";

// La réponse du chef à la carte de TODO de `ticket`, lue de ce que la vue envoie : le rang d'un choix, ou son texte —
// ou pourquoi rien ne part. `connue` : la carte que les derniers faits lus portent pour ce ticket — sans elle, ou sur une
// autre question, rien ne part.
export function answerRead(known: CardRead | undefined, ticket: unknown, raw: unknown): { ticket: number; choix: number } | { ticket: number; texte: string } | { refus: string; detail: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1 || known === undefined) return { refus: UNKNOWN, detail: "" };
  const answer = object(raw);
  if (answer === undefined || answer.question !== known.question) return { refus: CHANGED, detail: "" };
  if ("choix" in answer) {
    const { choix: choice } = answer;
    if (typeof choice !== "number" || !Number.isSafeInteger(choice) || choice < 1 || choice > known.choix.length) return { refus: `nothing was sent: the card offers choices 1 to ${known.choix.length}`, detail: "" };
    return { ticket, choix: choice };
  }
  // Les retours à la ligne du poste sont ceux de GitHub : `\n`.
  const typed = text(answer.texte) ? answer.texte.trim().replace(/\r\n?/g, "\n") : "";
  if (typed === "") return { refus: EMPTY, detail: "" };
  if (typed.includes("\0")) return { refus: "nothing was sent: your answer carries a NUL character", detail: "" };
  if (typed.length > LENGTH_MAX) return { refus: `nothing was sent: GitHub refuses a comment longer than ${LENGTH_MAX} characters — this one has ${typed.length}`, detail: "" };
  return { ticket, texte: typed };
}
