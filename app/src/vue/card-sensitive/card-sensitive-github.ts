// Le ticket sensible (ticket 3224, épique 3214) : un ticket au label `sensitive` (docs/sensitive-tickets.md). Sa carte du
// rail le dit (label.ts, `estSensible`, lu de ses labels par vue/rail/github.ts) ; sa livraison verte, la pass ne la merge pas : le
// runtime (runtime/src/sensible/, ticket 3223) la retient sur une carte « review before merge », une issue au label
// `chef-todo` :
//   - son commentaire de carte (`<!-- brigade:todo kind=review-before-merge -->`) dit la question et le lien de la PR —
//     l'app le lit comme toute carte du chef (board/todo-github.ts) ;
//   - son corps commence par `<!-- brigade:sensitive-review pr=<PR> ticket=<ticket> sha=<sha> -->`, puis porte la question
//     et le lien de la PR.
// Ce module lit le corps (`revueDuCorps`) : la PR, son adresse et le ticket. Puis il joue les deux réponses du chef par la
// commande du runtime (`npm --prefix runtime run sensitive`, runtime/src/sensible/commande.ts), que le process principal
// importe et joue dans le sien (`jouerLaRevue`) : `merge <owner>/<repo>#<PR>` merge la PR et ferme la carte ;
// `send-back <owner>/<repo>#<PR> --note <…>` renvoie le ticket à un cook avec la note, et ferme la carte. Une note vide ne
// part pas.
import { playTheCommand, type CommandLoaded, type RenderedOfValidation } from "../validation-design/validation-design-github.ts";
import { PR_OF_TICKET } from "../pr-of-ticket.js";

// La sorte de la carte, telle que le runtime l'écrit (runtime/src/sensible/sensible.ts, `SORTE_DE_CARTE`). Le label du
// ticket est dans label.ts.
export const KIND_SENSITIVE = "review-before-merge";

// Ce que la carte retient : sa PR et son adresse, le ticket livré, la tête jugée verte.
export type ReviewSensitive = { pr: number; ticket: number; sha: string; url: string };

// Le marqueur du corps de la carte, ou celui de la revue demandée sur le ticket même, en tête de son commentaire (ticket
// 3615, runtime/src/validation-sur-ticket/) : `<!-- brigade:todo kind=review-before-merge pr=… ticket=… sha=… -->`.
const BRAND = /^\s*<!-- brigade:(?:sensitive-review|todo kind=review-before-merge) pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;

// La carte que le corps de l'issue porte, pour le projet de `depot` — nulle si son marqueur n'y est pas.
export function reviewOfBody(repository: string, body: string): ReviewSensitive | null {
  const readOne = BRAND.exec(body);
  if (readOne === null) return null;
  const [, pr, ticket, sha] = readOne as unknown as [string, string, string, string];
  return { pr: Number(pr), ticket: Number(ticket), sha, url: `https://github.com/${repository}/pull/${pr}` };
}

// La même carte relue des faits (facts.ts, `chefLu`) — ou rien, si elle n'en a pas la forme.
export function reviewRead(raw: unknown): ReviewSensitive | undefined {
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (readOne === undefined || !whole(readOne.pr) || !whole(readOne.ticket) || typeof readOne.sha !== "string" || typeof readOne.url !== "string") return undefined;
  return { pr: readOne.pr, ticket: readOne.ticket, sha: readOne.sha, url: readOne.url };
}

// ── Les deux réponses ──

// Ce que la vue envoie : merger, ou renvoyer avec la note du chef. Ce qu'il en est advenu se dit comme pour la carte
// « Validate its screen » : fait, ou rien n'est fait et pourquoi.
export type ActionSensitive = { geste: "merger" } | { geste: "renvoyer"; note: string };
export type RenderedSensitive = RenderedOfValidation;

export const WITHOUT_NOTE = "nothing was sent: the note says what to change — write it first";
export const UNKNOWN = "nothing was sent: this card is not in the latest reading — it was answered elsewhere, or it left TODO";

// Le geste que la vue envoie, contrôlé : rien ne part sans la carte, ni pour un renvoi sans note.
function actionRead(review: ReviewSensitive | undefined, action: unknown): ActionSensitive | { refus: string; detail: string } {
  if (review === undefined) return { refus: UNKNOWN, detail: "" };
  const readOne = typeof action === "object" && action !== null ? (action as Record<string, unknown>) : {};
  if (readOne.geste === "merger") return { geste: "merger" };
  if (readOne.geste !== "renvoyer") return { refus: "nothing was sent: the app does not know this answer", detail: String(readOne.geste) };
  const note = typeof readOne.note === "string" ? readOne.note.trim().replace(/\r\n?/g, "\n") : "";
  return note === "" ? { refus: WITHOUT_NOTE, detail: "" } : { geste: "renvoyer", note };
}

// La réponse du chef sur la carte `revue` du projet de `depot`, jouée par la commande `sensitive` du runtime.
export async function playTheReview({ depot: repository, revue: review, geste: action, commande: command, env }: { depot: string; revue: ReviewSensitive | undefined; geste: unknown; commande: () => Promise<CommandLoaded>; env: Record<string, string | undefined> }): Promise<RenderedSensitive> {
  const readOne = actionRead(review, action);
  if ("refus" in readOne || review === undefined) return "refus" in readOne ? readOne : { refus: UNKNOWN, detail: "" };
  const target = `${repository}#${review.pr}`;
  const args = readOne.geste === "merger" ? ["merge", target] : ["send-back", target, "--note", readOne.note];
  return playTheCommand({ args, commande: command, env, parDefaut: readOne.geste === "merger" ? `the ${PR_OF_TICKET(review.ticket)} merged` : `the ${PR_OF_TICKET(review.ticket)} sent back`, livraison: review });
}
