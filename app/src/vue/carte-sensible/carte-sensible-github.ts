// Le ticket sensible (ticket 3224, épique 3214) : un ticket au label `sensitive` (docs/sensitive-tickets.md). Sa carte du
// rail le dit (label.ts, `estSensible`, lu de ses labels par vue/rail/github.ts) ; sa livraison verte, la pass ne la merge pas : le
// runtime (runtime/src/sensible/, ticket 3223) la retient sur une carte « review before merge », une issue au label
// `chef-todo` :
//   - son commentaire de carte (`<!-- brigade:todo kind=review-before-merge -->`) dit la question et le lien de la PR —
//     l'app le lit comme toute carte du chef (tableau/todo-github.ts) ;
//   - son corps commence par `<!-- brigade:sensitive-review pr=<PR> ticket=<ticket> sha=<sha> -->`, puis porte la question
//     et le lien de la PR.
// Ce module lit le corps (`revueDuCorps`) : la PR, son adresse et le ticket. Puis il joue les deux réponses du chef par la
// commande du runtime (`npm --prefix runtime run sensitive`, runtime/src/sensible/commande.ts), que le process principal
// importe et joue dans le sien (`jouerLaRevue`) : `merge <owner>/<repo>#<PR>` merge la PR et ferme la carte ;
// `send-back <owner>/<repo>#<PR> --note <…>` renvoie le ticket à un cook avec la note, et ferme la carte. Une note vide ne
// part pas.
import { jouerLaCommande, type CommandeChargee, type RenduDeValidation } from "../validation-design/validation-design-github.ts";

// La sorte de la carte, telle que le runtime l'écrit (runtime/src/sensible/sensible.ts, `SORTE_DE_CARTE`). Le label du
// ticket est dans label.ts.
export const SORTE_SENSIBLE = "review-before-merge";

// Ce que la carte retient : sa PR et son adresse, le ticket livré, la tête jugée verte.
export type RevueSensible = { pr: number; ticket: number; sha: string; url: string };

const MARQUE = /^\s*<!-- brigade:sensitive-review pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;

// La carte que le corps de l'issue porte, pour le projet de `depot` — nulle si son marqueur n'y est pas.
export function revueDuCorps(depot: string, corps: string): RevueSensible | null {
  const lu = MARQUE.exec(corps);
  if (lu === null) return null;
  const [, pr, ticket, sha] = lu as unknown as [string, string, string, string];
  return { pr: Number(pr), ticket: Number(ticket), sha, url: `https://github.com/${depot}/pull/${pr}` };
}

// La même carte relue des faits (faits.ts, `chefLu`) — ou rien, si elle n'en a pas la forme.
export function revueLue(brut: unknown): RevueSensible | undefined {
  const lu = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : undefined;
  const entier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur > 0;
  if (lu === undefined || !entier(lu.pr) || !entier(lu.ticket) || typeof lu.sha !== "string" || typeof lu.url !== "string") return undefined;
  return { pr: lu.pr, ticket: lu.ticket, sha: lu.sha, url: lu.url };
}

// ── Les deux réponses ──

// Ce que la vue envoie : merger, ou renvoyer avec la note du chef. Ce qu'il en est advenu se dit comme pour la carte
// « Validate its screen » : fait, ou rien n'est fait et pourquoi.
export type GesteSensible = { geste: "merger" } | { geste: "renvoyer"; note: string };
export type RenduSensible = RenduDeValidation;

export const SANS_NOTE = "nothing was sent: the note says what to change — write it first";
export const INCONNUE = "nothing was sent: this card is not in the latest reading — it was answered elsewhere, or it left TODO";

// Le geste que la vue envoie, contrôlé : rien ne part sans la carte, ni pour un renvoi sans note.
function gesteLu(revue: RevueSensible | undefined, geste: unknown): GesteSensible | { refus: string; detail: string } {
  if (revue === undefined) return { refus: INCONNUE, detail: "" };
  const lu = typeof geste === "object" && geste !== null ? (geste as Record<string, unknown>) : {};
  if (lu.geste === "merger") return { geste: "merger" };
  if (lu.geste !== "renvoyer") return { refus: "nothing was sent: the app does not know this answer", detail: String(lu.geste) };
  const note = typeof lu.note === "string" ? lu.note.trim().replace(/\r\n?/g, "\n") : "";
  return note === "" ? { refus: SANS_NOTE, detail: "" } : { geste: "renvoyer", note };
}

// La réponse du chef sur la carte `revue` du projet de `depot`, jouée par la commande `sensitive` du runtime.
export async function jouerLaRevue({ depot, revue, geste, commande, env }: { depot: string; revue: RevueSensible | undefined; geste: unknown; commande: () => Promise<CommandeChargee>; env: Record<string, string | undefined> }): Promise<RenduSensible> {
  const lu = gesteLu(revue, geste);
  if ("refus" in lu || revue === undefined) return "refus" in lu ? lu : { refus: INCONNUE, detail: "" };
  const cible = `${depot}#${revue.pr}`;
  const args = lu.geste === "merger" ? ["merge", cible] : ["send-back", cible, "--note", lu.note];
  return jouerLaCommande({ args, commande, env, parDefaut: lu.geste === "merger" ? `PR #${revue.pr} merged` : `PR #${revue.pr} sent back` });
}
