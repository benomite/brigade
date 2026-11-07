// Les gestes de la fiche d'un ticket : ceux qu'il est possible de faire sur lui à cet instant, et
// seulement ceux-là, chacun avec son prix (#639) — nul quand rien ne change ni ne se dépense. La
// table est celle du chef, fermée :
//   - tous les états : ouvrir l'issue, ouvrir la PR (s'il y en a une), demander au second, changer
//     la priorité ;
//   - en attente ou BLOQUÉ : en plus, le retirer du rail, et le mettre en WAITING (#588) ;
//   - pris ou en pass : rien de plus — on ne touche pas à un ticket en cours ;
//   - servi : en plus, le voir dans le navigateur (#620), s'il y a un écran ;
//   - qui t'attend : d'abord, les gestes qui tranchent ce qu'on attend de toi (decision.ts) — le
//     premier est le recommandé : la sortir du rail, ouvrir l'issue, la
//     renvoyer en cuisine. Jamais une commande à recopier ni à envoyer : un bouton, qui la joue.
// Un geste n'apparaît que si son action est branchée (`ACTIONS`) : la table dit ce qui est
// permis, le branchement ce qui se fait. Une action qui n'est pas livrée n'a pas de branchement,
// et son geste n'est jamais proposé — ni grisé, ni promis. Celles qui manquent aujourd'hui :
// « mettre en WAITING » (#588) et « voir dans le navigateur » (#620) — leur épique n'est pas
// livrée ; elle se branche ici à sa livraison, d'une ligne, sans rien toucher d'autre.
// Ce module ne lance rien : il dit ce qui se propose.
import { attenduDe, decisionLue, type Decision } from "./decision.ts";
import { PRIORITES } from "./priorite.ts";

export type IdDeFiche = "issue" | "pr" | "second" | "retirer" | "cuisine" | "priorite" | "waiting" | "navigateur";

// Comment une action se joue, une fois branchée : l'app la joue elle-même (ouvrir une adresse,
// écrire dans le second, écrire sur GitHub). `si` : ce que l'action demande de plus à la carte pour
// se proposer — l'écran d'une livraison, pour le navigateur.
export type Branchement = { app: true; si?: (carte: CarteDeFiche) => boolean };
export type Actions = Readonly<Partial<Record<IdDeFiche, Branchement>>>;

// Ce qui est branché aujourd'hui. Ouvrir l'issue et la PR, demander au second : l'app les joue
// elle-même ; changer la priorité aussi — elle remplace le label `prio:` de l'issue sur GitHub
// (priorite.ts, #1739), sans la box ; renvoyer en cuisine un ticket revenu de WAITING et le retirer
// du rail aussi — elle retire de son issue `waiting` ou `fire` (gestes-github.ts, #2061). Merger la
// livraison se fait sur sa PR, sur GitHub : le geste n'est pas proposé. Les autres attendent leur
// action (en tête de ce fichier).
export const ACTIONS: Actions = {
  issue: { app: true },
  pr: { app: true },
  second: { app: true },
  priorite: { app: true },
  cuisine: { app: true },
  retirer: { app: true },
};

// Ce que la fiche lit de la carte cliquée (faits.ts, `Carte`) : son mot d'état, si elle s'ouvre
// sur son issue, si elle t'attend et ce que `faits` dit de la décision attendue, sa PR.
export type CarteDeFiche = { ticket: number; etat?: string; ouvrable: boolean; attendu: boolean; decision?: Decision; pr?: boolean };

// Un geste proposé : son nom, ce que son bouton dit, son prix — nul, il ne coûte rien, et rien ne
// le dit. `recommande` : le geste qu'on attend de toi d'abord. `valeurs` : celles entre lesquelles
// le chef choisit avant de le jouer.
export type Propose = { id: IdDeFiche; libelle: string; prix: string | null; recommande?: true; valeurs?: readonly string[] };

// Ce que chaque geste coûte, dans les mots de l'app — ceux du runtime pour ses actions
// (runtime/src/geste-ticket.ts, `price`). Nul : rien ne change sur la box, ou seulement l'ordre
// de service, et rien ne se dépense — ouvrir une adresse, écrire dans le second sans Entrée,
// changer le label `prio:` d'une issue.
export const PRIX = {
  issue: null,
  pr: null,
  second: null,
  retirer: "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent",
  cuisine: "a cook takes it again and spends what a cook spends; it leaves your queue",
  priorite: null,
  waiting: null,
  navigateur: null,
} as const satisfies Record<IdDeFiche, string | null>;

const LIBELLES: Record<IdDeFiche, string> = {
  issue: "open the issue",
  pr: "open the merged PR",
  second: "ask the second",
  retirer: "remove from the rail",
  cuisine: "back to the kitchen",
  priorite: "change the priority",
  waiting: "waiting for…",
  navigateur: "view in the browser",
};

// La table du chef : ce que chaque mot d'état ajoute aux gestes de tous. Un mot qu'elle ne
// nomme pas — 86, WAITING, un mot inconnu — n'ajoute rien.
const EN_PLUS: Readonly<Record<string, readonly IdDeFiche[]>> = {
  "en attente": ["retirer", "waiting"],
  BLOQUÉ: ["retirer", "waiting"],
  pris: [],
  "en pass": [],
  servi: ["navigateur"],
};

// Les gestes de la fiche de cette carte, dans l'ordre où elle les pose : ceux qui tranchent ce
// qu'on attend de toi, s'il t'attend, puis ceux que la table du chef permet pour son état — chacun
// une fois, et seulement si son action est branchée.
export function gestesDeLaFiche(carte: CarteDeFiche, actions: Actions = ACTIONS): Propose[] {
  const branche = (id: IdDeFiche) => {
    const action = actions[id];
    return action !== undefined && (action.si === undefined || action.si(carte));
  };
  // L'issue ne se propose que si elle s'ouvre ; la PR, que s'il y en a une qui s'ouvre.
  const possible = (id: IdDeFiche) => branche(id) && (id !== "issue" || carte.ouvrable) && (id !== "pr" || carte.pr === true);
  const attendus = carte.attendu ? attenduDe(carte.decision).gestes.filter(possible) : [];
  const enPlus = carte.etat === undefined ? [] : (EN_PLUS[carte.etat] ?? []);
  const tous: IdDeFiche[] = [
    ...attendus,
    "issue",
    "pr",
    "second",
    // Un ticket sans mot d'état n'est pas sur le rail : il n'a pas de priorité à changer.
    ...(carte.etat === undefined ? [] : (["priorite"] as const)),
    ...enPlus,
  ];
  return [...new Set(tous)]
    .filter(possible)
    .map((id) => ({ id, libelle: LIBELLES[id], prix: PRIX[id], ...(id === attendus[0] ? { recommande: true as const } : {}), ...(id === "priorite" ? { valeurs: PRIORITES } : {}) }));
}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";

// La même, d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste.
export function gestesDeCarte(carte: unknown, actions: Actions = ACTIONS): Propose[] {
  if (typeof carte !== "object" || carte === null) return [];
  const { ticket, etat, ouvrable, attendu, decision, pr } = carte as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket)) return [];
  const lue = decisionLue(decision);
  return gestesDeLaFiche({ ticket, ...(texte(etat) ? { etat } : {}), ouvrable: ouvrable === true, attendu: attendu === true, ...(lue === undefined ? {} : { decision: lue }), ...(typeof pr === "boolean" ? { pr } : {}) }, actions);
}
