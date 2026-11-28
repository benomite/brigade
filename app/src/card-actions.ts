// Les gestes de la fiche d'un ticket : ouvrir l'issue, ouvrir la PR (s'il y en a une), demander au second, chacun avec son
// prix (#639) — nul, rien ne change ni ne se dépense. Jamais une commande à recopier ni à envoyer : un bouton, qui la joue.
// Un geste n'apparaît que si son action est branchée (`ACTIONS`). Ce module ne lance rien : il dit ce qui se propose.

export type CardId = "issue" | "pr" | "second";

// Comment une action se joue, une fois branchée : l'app la joue elle-même (ouvrir une adresse, écrire dans le second).
export type Plugging = { app: true; si?: (card: CardTile) => boolean };
export type Actions = Readonly<Partial<Record<CardId, Plugging>>>;

export const ACTIONS: Actions = {
  issue: { app: true },
  pr: { app: true },
  second: { app: true },
};

// Ce que la fiche lit de la carte cliquée (facts.ts, `Carte`) : si elle s'ouvre sur son issue, si elle t'attend, sa PR.
export type CardTile = { ticket: number; etat?: string; ouvrable: boolean; attendu: boolean; pr?: boolean };

// Un geste proposé : son nom, ce que son bouton dit, son prix — nul, il ne coûte rien, et rien ne le dit.
export type Proposes = { id: CardId; libelle: string; prix: string | null };

// Ce que chaque geste coûte, dans les mots de l'app. Nul : ouvrir une adresse, écrire dans le second sans Entrée.
export const PRICE = {
  issue: null,
  pr: null,
  second: null,
} as const satisfies Record<CardId, string | null>;

const WORDINGS: Record<CardId, string> = {
  issue: "open the issue",
  pr: "open the merged PR",
  second: "ask the second",
};

// Les gestes de la fiche de cette carte, dans l'ordre où elle les pose, chacun seulement si son action est branchée.
export function cardActions(card: CardTile, actions: Actions = ACTIONS): Proposes[] {
  const branch = (id: CardId) => {
    const action = actions[id];
    return action !== undefined && (action.si === undefined || action.si(card));
  };
  // L'issue ne se propose que si elle s'ouvre ; la PR, que s'il y en a une qui s'ouvre.
  const possible = (id: CardId) => branch(id) && (id !== "issue" || card.ouvrable) && (id !== "pr" || card.pr === true);
  const all: CardId[] = ["issue", "pr", "second"];
  return all.filter(possible).map((id) => ({ id, libelle: WORDINGS[id], prix: PRICE[id] }));
}

const text = (value: unknown): value is string => typeof value === "string";

// La même, d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste.
export function actionsOfCard(card: unknown, actions: Actions = ACTIONS): Proposes[] {
  if (typeof card !== "object" || card === null) return [];
  const { ticket, etat: state, ouvrable: openable, attendu: expected, pr } = card as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket)) return [];
  return cardActions({ ticket, ...(text(state) ? { etat: state } : {}), ouvrable: openable === true, attendu: expected === true, ...(typeof pr === "boolean" ? { pr } : {}) }, actions);
}
