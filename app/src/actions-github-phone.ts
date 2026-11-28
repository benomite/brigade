// Les gestes du chef depuis le téléphone, écrits sur GitHub même (#2502, épique #2498) : avec la session GitHub du chef
// (le ticket 2500, le jeton du coffre du téléphone), l'app Android écrit sur l'issue du ticket ce que le desktop y écrit
// pour le même geste — par le même code (main.ts, `repondreCarte`), et le même client
// (priority.ts, `clientDeLaPriorite`) : seul ce qui porte la demande change, le HTTP natif de Capacitor
// (`ecritureParCapacitor`) au lieu du `fetch` du desktop. Aucune station n'est jointe, aucune adresse de station n'est
// demandée : chaque demande part à l'API de GitHub.
//
// Les deux gestes :
//   - répondre à une carte de TODO — la carte du chef lue de GitHub (board-actions/answer-github.ts) : la réponse
//     postée en commentaire sur l'issue, puis son geste joué (`resume`, `merge`, `drop`, `close`) ;
//   - les deux gestes de la carte « Validate its screen » (ticket 3185) — « Validate » et « Send back to the kitchen » : le
//     téléphone ne porte pas la commande du runtime que le desktop joue, il écrit sur GitHub ce qu'elle y écrit
//     (vue/validation-design/validation-design-github.ts, `validerSurGithub`) — la PR mergée et la carte fermée, ou le
//     renvoi posté sur le ticket et la carte fermée.
//
// Une écriture que GitHub refuse, ou qui ne le joint pas, se dit en une ligne, ce que GitHub en a dit au survol, et rien
// ne la tient pour faite : la lecture n'est relancée qu'après une écriture que GitHub a prise (`ecrit`), comme le desktop
// oublie sa dernière lecture (`tableaux.oublier()`).
import type { Rendered } from "./card-todo.ts";
import { WITHOUT_DONE } from "./actions-github.ts";
import { clientOfThePriority, type SendGitHub, type MethodOfWriting } from "./priority.ts";
import { bodyRead, type CallGitHub } from "./board/client.ts";
import type { BoardRead } from "./board/read.ts";
import type { CardOfChef } from "./board/todo-github.ts";
import { answerOnGithub } from "./board-actions/answer-github.ts";
import { validateOnGithub, type RenderedOfValidation } from "./vue/validation-design/validation-design-github.ts";

export type Options = {
  // Le jeton GitHub du chef — celui du coffre du téléphone ; nul sans lui, et GitHub dit ce qu'il refuse.
  jeton: () => Promise<string | null>;
  // Le `GET` de la lecture du téléphone (read-github-phone.ts) : la PR qu'une réponse `merge` nomme se lit par lui.
  appeler: CallGitHub;
  // Ce qui porte une écriture à l'API de GitHub (`ecritureParCapacitor` sur le téléphone).
  envoyer: SendGitHub;
  // Ce que la dernière lecture de GitHub dit d'un projet : son dépôt, son rail et TODO lus, la carte du chef d'un ticket.
  // Rien pour un projet qu'elle ne connaît pas, ou dont le rail ne s'est pas lu.
  depot: (project: string) => string | undefined;
  dernier: (project: string) => BoardRead | undefined;
  chef: (project: string, ticket: unknown) => CardOfChef | undefined;
  // Une écriture que GitHub a prise sur ce projet : sa prochaine lecture va à GitHub, et la montre.
  ecrit?: (project: string) => void;
};

// Ce que le HTTP natif de Capacitor reçoit d'une écriture, et ce qu'il en rend : son code, son corps — un objet, ou du
// texte qu'il n'a pas lu en JSON. Il lève quand rien n'a répondu.
export type RequestNative = { url: string; method: MethodOfWriting; headers: Record<string, string>; data?: unknown };
export type AnswerNative = { status: number; data: unknown; headers?: Record<string, string> };

// L'envoi d'une écriture par le HTTP natif de Capacitor (`CapacitorHttp.request`) : la méthode, les en-têtes et le corps
// que le client compose (priority.ts, `clientDeLaPriorite`), tels quels — le corps en objet, que Capacitor écrit en JSON.
export function writingByCapacitor(request: (ask: RequestNative) => Promise<AnswerNative>): SendGitHub {
  return async (method, address, headers, body) => {
    const { status, data } = await request({ url: address, method: method, headers: headers, ...(body === undefined ? {} : { data: body }) });
    return { status, data: typeof data === "string" ? bodyRead(data) : data };
  };
}

const WITHOUT_REPOSITORY = (project: string) => `nothing was sent: this phone has not read which repository ${project} is — read it again`;

export function openTheActionsGitHub(options: Options) {
  // Le client du desktop (main.ts, `clientDesLabels`) : la lecture par le `GET` du téléphone, l'écriture avec le même jeton.
  const client = clientOfThePriority({ jeton: options.jeton, appeler: options.appeler, envoyer: options.envoyer });

  return {
    // La réponse du chef à une carte de TODO : la carte du chef que la dernière lecture porte, répondue sur son issue.
    // Toute autre carte ne se répond pas de l'app (`SANS_FAIT.carte`), sur le téléphone comme sur le desktop.
    async repondreCarte(project: string, ticket: unknown, answer: unknown): Promise<Rendered> {
      const chef = options.chef(project, ticket);
      if (chef === undefined) return { refus: WITHOUT_DONE.carte, detail: "" };
      const repository = options.depot(project);
      if (repository === undefined) return { refus: WITHOUT_REPOSITORY(project), detail: "" };
      const rendered = await answerOnGithub({ depot: repository, ticket, chef, reponse: answer, client });
      if ("repondue" in rendered) options.ecrit?.(project);
      return rendered;
    },

    // Un geste du chef sur la carte « Validate its screen » que la dernière lecture porte : valider, ou renvoyer en cuisine
    // avec son commentaire, écrit sur GitHub.
    async gesteDeValidation(project: string, ticket: unknown, action: unknown): Promise<RenderedOfValidation> {
      const repository = options.depot(project);
      if (repository === undefined) return { refus: WITHOUT_REPOSITORY(project), detail: "" };
      const rendered = await validateOnGithub({ depot: repository, carte: ticket, design: options.chef(project, ticket)?.design, geste: action, client });
      if ("fait" in rendered) options.ecrit?.(project);
      return rendered;
    },
  };
}
