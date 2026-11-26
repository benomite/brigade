// Les gestes du chef depuis le téléphone, écrits sur GitHub même (#2502, épique #2498) : avec la session GitHub du chef
// (le ticket 2500, le jeton du coffre du téléphone), l'app Android écrit sur l'issue du ticket ce que le desktop y écrit
// pour le même geste — par le même code (main.ts, `gesteDeFiche`, `attente`, `repondreCarte`), et le même client
// (priority.ts, `clientDeLaPriorite`) : seul ce qui porte la demande change, le HTTP natif de Capacitor
// (`ecritureParCapacitor`) au lieu du `fetch` du desktop. Aucune station n'est jointe, aucune adresse de station n'est
// demandée : chaque demande part à l'API de GitHub.
//
// Les trois gestes :
//   - répondre à une carte de TODO — la carte du chef lue de GitHub (tableau-actions/answer-github.ts) : la réponse
//     postée en commentaire sur l'issue, puis son geste joué (`resume`, `merge`, `drop`, `close`) ;
//   - reprendre (« resume ») — « back to the kitchen » sur la fiche : le label `waiting` retiré, le ticket revient sur le
//     rail (actions-github.ts, `retirerLeLabel`) ;
//   - mettre en suspens (« put on hold ») — « remove from the rail » sur la fiche : le label `fire` retiré, plus aucune station ne le prend ;
//     le reposer le ramène ;
//   - les gestes de WAITING (#3075) — « waiting for… » sur une carte de TODO, « resume » et « it arrived, back to the
//     kitchen » sur une carte de WAITING : le téléphone ne joint aucun runtime, il les écrit sur l'issue comme le desktop
//     sans runtime ici (vue/wait/wait-github.ts, `attenteSurGithub`).
//   - les deux gestes de la carte « Validate its screen » (ticket 3185) — « Validate » et « Send back to the kitchen » : le
//     téléphone ne porte pas la commande du runtime que le desktop joue, il écrit sur GitHub ce qu'elle y écrit
//     (vue/validation-design/validation-design-github.ts, `validerSurGithub`) — la PR mergée et la carte fermée, ou le
//     renvoi posté sur le ticket et la carte fermée.
//
// Une écriture que GitHub refuse, ou qui ne le joint pas, se dit en une ligne, ce que GitHub en a dit au survol, et rien
// ne la tient pour faite : la lecture n'est relancée qu'après une écriture que GitHub a prise (`ecrit`), comme le desktop
// oublie sa dernière lecture (`tableaux.oublier()`).
import type { Rendu } from "./card-todo.ts";
import { ACTIONS, actionsDeCard, type Actions, type Propose } from "./card-actions.ts";
import { retirerLeLabel, SANS_FAIT, surGithub, type Ecrit } from "./actions-github.ts";
import { clientDeLaPriority, type EnvoiGitHub, type MethodeDEcriture } from "./priority.ts";
import { corpsLu, type CallGitHub } from "./tableau/client.ts";
import { waitSurGithub } from "./vue/wait/wait-github.ts";
import type { TableauLu } from "./tableau/read.ts";
import type { CardDuChef } from "./tableau/todo-github.ts";
import { repondreSurGithub } from "./tableau-actions/answer-github.ts";
import { validerSurGithub, type RenduDeValidation } from "./vue/validation-design/validation-design-github.ts";

export type Options = {
  // Le jeton GitHub du chef — celui du coffre du téléphone ; nul sans lui, et GitHub dit ce qu'il refuse.
  jeton: () => Promise<string | null>;
  // Le `GET` de la lecture du téléphone (read-github-phone.ts) : la PR qu'une réponse `merge` nomme se lit par lui.
  appeler: CallGitHub;
  // Ce qui porte une écriture à l'API de GitHub (`ecritureParCapacitor` sur le téléphone).
  envoyer: EnvoiGitHub;
  // Ce que la dernière lecture de GitHub dit d'un projet : son dépôt, son rail et TODO lus, la carte du chef d'un ticket.
  // Rien pour un projet qu'elle ne connaît pas, ou dont le rail ne s'est pas lu.
  depot: (project: string) => string | undefined;
  dernier: (project: string) => TableauLu | undefined;
  chef: (project: string, ticket: unknown) => CardDuChef | undefined;
  // Une écriture que GitHub a prise sur ce projet : sa prochaine lecture va à GitHub, et la montre.
  ecrit?: (project: string) => void;
};

// Ce que le HTTP natif de Capacitor reçoit d'une écriture, et ce qu'il en rend : son code, son corps — un objet, ou du
// texte qu'il n'a pas lu en JSON. Il lève quand rien n'a répondu.
export type RequestNative = { url: string; method: MethodeDEcriture; headers: Record<string, string>; data?: unknown };
export type AnswerNative = { status: number; data: unknown; headers?: Record<string, string> };

// L'envoi d'une écriture par le HTTP natif de Capacitor (`CapacitorHttp.request`) : la méthode, les en-têtes et le corps
// que le client compose (priority.ts, `clientDeLaPriorite`), tels quels — le corps en objet, que Capacitor écrit en JSON.
export function ecritureParCapacitor(requete: (request: RequestNative) => Promise<AnswerNative>): EnvoiGitHub {
  return async (methode, adresse, entetes, corps) => {
    const { status, data } = await requete({ url: adresse, method: methode, headers: entetes, ...(corps === undefined ? {} : { data: corps }) });
    return { status, data: typeof data === "string" ? corpsLu(data) : data };
  };
}

// Les gestes de la fiche que le téléphone joue : ceux que le desktop écrit sur GitHub (actions-github.ts,
// `LABELS_DES_GESTES`), dans l'ordre et avec le prix de la table du chef (card-actions.ts).
const ACTIONS_DU_PHONE: Actions = Object.fromEntries(Object.entries(ACTIONS).filter(([id]) => surGithub(id)));

const SANS_REPOSITORY = (project: string) => `nothing was sent: this phone has not read which repository ${project} is — read it again`;

export function ouvrirLesActionsGitHub(options: Options) {
  // Le client du desktop (main.ts, `clientDesLabels`) : la lecture par le `GET` du téléphone, l'écriture avec le même jeton.
  const client = clientDeLaPriority({ jeton: options.jeton, appeler: options.appeler, envoyer: options.envoyer });

  // Reprendre ou mettre en suspens : le label du geste retiré de l'issue, sur le dernier rail lu de ce projet.
  async function retirer(project: string, id: "retirer" | "cuisine", ticket: unknown): Promise<Ecrit> {
    const rendu = await retirerLeLabel(options.dernier(project), id, ticket, client);
    if ("fait" in rendu) options.ecrit?.(project);
    return rendu;
  }

  return {
    // Les gestes de la fiche de cette carte que le téléphone joue.
    gestesDeFiche: (card: unknown): Propose[] => actionsDeCard(card, ACTIONS_DU_PHONE),

    // Un geste de la fiche : « remove from the rail » ou « back to the kitchen », sur GitHub.
    async geste(project: string, id: unknown, ticket: unknown): Promise<Ecrit> {
      if (!surGithub(id)) return { refus: "nothing was sent: this phone does not play this action", detail: `“${String(id)}” is not a gesture this phone writes on GitHub` };
      return retirer(project, id, ticket);
    },

    // Un geste de WAITING, écrit sur l'issue : « waiting for… » avec ce que le chef a rempli, « resume », « it arrived ».
    async attente(project: string, id: unknown, ticket: unknown, saisie?: unknown): Promise<Ecrit> {
      const rendu = await waitSurGithub({ id, ticket, saisie, aujourdhui: new Date(), lu: options.dernier(project), client });
      if ("fait" in rendu) options.ecrit?.(project);
      return rendu;
    },

    // La réponse du chef à une carte de TODO : la carte du chef que la dernière lecture porte, répondue sur son issue.
    // Toute autre carte ne se répond pas de l'app (`SANS_FAIT.carte`), sur le téléphone comme sur le desktop.
    async repondreCarte(project: string, ticket: unknown, answer: unknown): Promise<Rendu> {
      const chef = options.chef(project, ticket);
      if (chef === undefined) return { refus: SANS_FAIT.carte, detail: "" };
      const repository = options.depot(project);
      if (repository === undefined) return { refus: SANS_REPOSITORY(project), detail: "" };
      const rendu = await repondreSurGithub({ depot: repository, ticket, chef, reponse: answer, client });
      if ("repondue" in rendu) options.ecrit?.(project);
      return rendu;
    },

    // Un geste du chef sur la carte « Validate its screen » que la dernière lecture porte : valider, ou renvoyer en cuisine
    // avec son commentaire, écrit sur GitHub.
    async gesteDeValidation(project: string, ticket: unknown, action: unknown): Promise<RenduDeValidation> {
      const repository = options.depot(project);
      if (repository === undefined) return { refus: SANS_REPOSITORY(project), detail: "" };
      const rendu = await validerSurGithub({ depot: repository, carte: ticket, design: options.chef(project, ticket)?.design, geste: action, client });
      if ("fait" in rendu) options.ecrit?.(project);
      return rendu;
    },
  };
}
