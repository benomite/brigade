// Les gestes du chef depuis le téléphone, écrits sur GitHub même (#2502, épique #2498) : avec la session GitHub du chef
// (le ticket 2500, le jeton du coffre du téléphone), l'app Android écrit sur l'issue du ticket ce que le desktop y écrit
// pour le même geste — par le même code (main.ts, `gesteDeFiche`, `attente`, `repondreCarte`), et le même client
// (priorite.ts, `clientDeLaPriorite`) : seul ce qui porte la demande change, le HTTP natif de Capacitor
// (`ecritureParCapacitor`) au lieu du `fetch` du desktop. Aucune station n'est jointe, aucune adresse de station n'est
// demandée : chaque demande part à l'API de GitHub.
//
// Les trois gestes :
//   - répondre à une carte de TODO — la carte du chef lue de GitHub (tableau-gestes/reponse-github.ts) : la réponse
//     postée en commentaire sur l'issue, puis son geste joué (`resume`, `merge`, `drop`, `close`) ;
//   - reprendre (« resume ») — « back to the kitchen » sur la fiche : le label `waiting` retiré, le ticket revient sur le
//     rail (gestes-github.ts, `retirerLeLabel`) ;
//   - mettre en suspens (« put on hold ») — « remove from the rail » sur la fiche : le label `fire` retiré, plus aucune station ne le prend ;
//     le reposer le ramène ;
//   - les gestes de WAITING (#3075) — « waiting for… » sur une carte de TODO, « resume » et « it arrived, back to the
//     kitchen » sur une carte de WAITING : le téléphone ne joint aucun runtime, il les écrit sur l'issue comme le desktop
//     sans runtime ici (vue/attente/attente-github.ts, `attenteSurGithub`).
//   - « Resume » sur la ligne du disjoncteur, en tête de « Awaiting you » : `/resume` posté sur l'issue `brigade:breaker-open`
//     du dépôt (github/breaker-resume.ts), le même code que le desktop ;
//   - les deux gestes de la carte « Validate its screen » (ticket 3185) — « Validate » et « Send back to the kitchen » : le
//     téléphone ne porte pas la commande du runtime que le desktop joue, il écrit sur GitHub ce qu'elle y écrit
//     (vue/validation-design/validation-design-github.ts, `validerSurGithub`) — la PR mergée et la carte fermée, ou le
//     renvoi posté sur le ticket et la carte fermée.
//
// Une écriture que GitHub refuse, ou qui ne le joint pas, se dit en une ligne, ce que GitHub en a dit au survol, et rien
// ne la tient pour faite : la lecture n'est relancée qu'après une écriture que GitHub a prise (`ecrit`), comme le desktop
// oublie sa dernière lecture (`tableaux.oublier()`).
import type { Rendu } from "./carte-todo.ts";
import { ACTIONS, gestesDeCarte, type Actions, type Propose } from "./gestes-fiche.ts";
import { retirerLeLabel, SANS_FAIT, surGithub, type Ecrit } from "./gestes-github.ts";
import { clientDuDisjoncteurGitHub, reprendreLeDisjoncteur, type RenduDeLaReprise } from "./github/breaker-resume.ts";
import { clientDeLaPriorite, type EnvoiGitHub, type MethodeDEcriture } from "./priorite.ts";
import { corpsLu, type AppelGitHub } from "./tableau/client.ts";
import { attenteSurGithub } from "./vue/attente/attente-github.ts";
import type { TableauLu } from "./tableau/lecture.ts";
import type { CarteDuChef } from "./tableau/todo-github.ts";
import { repondreSurGithub } from "./tableau-gestes/reponse-github.ts";
import { validerSurGithub, type RenduDeValidation } from "./vue/validation-design/validation-design-github.ts";

export type Options = {
  // Le jeton GitHub du chef — celui du coffre du téléphone ; nul sans lui, et GitHub dit ce qu'il refuse.
  jeton: () => Promise<string | null>;
  // Le `GET` de la lecture du téléphone (lecture-github-telephone.ts) : la PR qu'une réponse `merge` nomme se lit par lui.
  appeler: AppelGitHub;
  // Ce qui porte une écriture à l'API de GitHub (`ecritureParCapacitor` sur le téléphone).
  envoyer: EnvoiGitHub;
  // Ce que la dernière lecture de GitHub dit d'un projet : son dépôt, son rail et TODO lus, la carte du chef d'un ticket.
  // Rien pour un projet qu'elle ne connaît pas, ou dont le rail ne s'est pas lu.
  depot: (projet: string) => string | undefined;
  dernier: (projet: string) => TableauLu | undefined;
  chef: (projet: string, ticket: unknown) => CarteDuChef | undefined;
  // Une écriture que GitHub a prise sur ce projet : sa prochaine lecture va à GitHub, et la montre.
  ecrit?: (projet: string) => void;
};

// Ce que le HTTP natif de Capacitor reçoit d'une écriture, et ce qu'il en rend : son code, son corps — un objet, ou du
// texte qu'il n'a pas lu en JSON. Il lève quand rien n'a répondu.
export type DemandeNative = { url: string; method: MethodeDEcriture; headers: Record<string, string>; data?: unknown };
export type ReponseNative = { status: number; data: unknown; headers?: Record<string, string> };

// L'envoi d'une écriture par le HTTP natif de Capacitor (`CapacitorHttp.request`) : la méthode, les en-têtes et le corps
// que le client compose (priorite.ts, `clientDeLaPriorite`), tels quels — le corps en objet, que Capacitor écrit en JSON.
export function ecritureParCapacitor(requete: (demande: DemandeNative) => Promise<ReponseNative>): EnvoiGitHub {
  return async (methode, adresse, entetes, corps) => {
    const { status, data } = await requete({ url: adresse, method: methode, headers: entetes, ...(corps === undefined ? {} : { data: corps }) });
    return { status, data: typeof data === "string" ? corpsLu(data) : data };
  };
}

// Les gestes de la fiche que le téléphone joue : ceux que le desktop écrit sur GitHub (gestes-github.ts,
// `LABELS_DES_GESTES`), dans l'ordre et avec le prix de la table du chef (gestes-fiche.ts).
const ACTIONS_DU_TELEPHONE: Actions = Object.fromEntries(Object.entries(ACTIONS).filter(([id]) => surGithub(id)));

const SANS_DEPOT = (projet: string) => `nothing was sent: this phone has not read which repository ${projet} is — read it again`;

export function ouvrirLesGestesGitHub(options: Options) {
  // Le client du desktop (main.ts, `clientDesLabels`) : la lecture par le `GET` du téléphone, l'écriture avec le même jeton.
  const client = clientDeLaPriorite({ jeton: options.jeton, appeler: options.appeler, envoyer: options.envoyer });

  // Reprendre ou mettre en suspens : le label du geste retiré de l'issue, sur le dernier rail lu de ce projet.
  async function retirer(projet: string, id: "retirer" | "cuisine", ticket: unknown): Promise<Ecrit> {
    const rendu = await retirerLeLabel(options.dernier(projet), id, ticket, client);
    if ("fait" in rendu) options.ecrit?.(projet);
    return rendu;
  }

  // Le client du disjoncteur : ses lectures par le `GET` du téléphone, son commentaire par l'écriture native.
  const disjoncteur = clientDuDisjoncteurGitHub({ jeton: options.jeton, appeler: options.appeler, poster: (adresse, entetes, corps) => options.envoyer("POST", adresse, entetes, corps) });

  return {
    // Les gestes de la fiche de cette carte que le téléphone joue.
    gestesDeFiche: (carte: unknown): Propose[] => gestesDeCarte(carte, ACTIONS_DU_TELEPHONE),

    // Un geste de la fiche : « remove from the rail » ou « back to the kitchen », sur GitHub.
    async geste(projet: string, id: unknown, ticket: unknown): Promise<Ecrit> {
      if (!surGithub(id)) return { refus: "nothing was sent: this phone does not play this action", detail: `“${String(id)}” is not a gesture this phone writes on GitHub` };
      return retirer(projet, id, ticket);
    },

    // Un geste de WAITING, écrit sur l'issue : « waiting for… » avec ce que le chef a rempli, « resume », « it arrived ».
    async attente(projet: string, id: unknown, ticket: unknown, saisie?: unknown): Promise<Ecrit> {
      const rendu = await attenteSurGithub({ id, ticket, saisie, aujourdhui: new Date(), lu: options.dernier(projet), client });
      if ("fait" in rendu) options.ecrit?.(projet);
      return rendu;
    },

    // La réponse du chef à une carte de TODO : la carte du chef que la dernière lecture porte, répondue sur son issue.
    // Toute autre carte ne se répond pas de l'app (`SANS_FAIT.carte`), sur le téléphone comme sur le desktop.
    async repondreCarte(projet: string, ticket: unknown, reponse: unknown): Promise<Rendu> {
      const chef = options.chef(projet, ticket);
      if (chef === undefined) return { refus: SANS_FAIT.carte, detail: "" };
      const depot = options.depot(projet);
      if (depot === undefined) return { refus: SANS_DEPOT(projet), detail: "" };
      const rendu = await repondreSurGithub({ depot, ticket, chef, reponse, client });
      if ("repondue" in rendu) options.ecrit?.(projet);
      return rendu;
    },

    // « Resume » sur la ligne du disjoncteur : `/resume` sur l'issue du disjoncteur du dépôt de ce projet. Rien n'est écrit
    // pour un projet dont la dernière lecture ne dit pas le dépôt.
    async reprendreLeDisjoncteur(projet: string): Promise<RenduDeLaReprise> {
      const depot = options.depot(projet);
      if (depot === undefined) return { refus: SANS_DEPOT(projet), detail: "" };
      return reprendreLeDisjoncteur(depot, disjoncteur);
    },

    // Un geste du chef sur la carte « Validate its screen » que la dernière lecture porte : valider, ou renvoyer en cuisine
    // avec son commentaire, écrit sur GitHub.
    async gesteDeValidation(projet: string, ticket: unknown, geste: unknown): Promise<RenduDeValidation> {
      const depot = options.depot(projet);
      if (depot === undefined) return { refus: SANS_DEPOT(projet), detail: "" };
      const rendu = await validerSurGithub({ depot, carte: ticket, design: options.chef(projet, ticket)?.design, geste, client });
      if ("fait" in rendu) options.ecrit?.(projet);
      return rendu;
    },
  };
}
