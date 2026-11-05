// Le temps maximum d'un ticket, réglé par projet (#2343, épique #2336) : la clé
// `tempsMaxTicketMin` (en minutes) de `.claude/brigade/projet.json`. Absente ou
// invalide, c'est le défaut. Fonctions pures : l'appelant lit le fichier.

export const TEMPS_MAX_TICKET_DEFAUT_MIN = 15;

// `projet` est le contenu déjà lu de projet.json (n'importe quoi : un fichier
// absent, illisible ou mal formé donne le défaut).
export function tempsMaxTicketMin(projet: unknown): number {
  if (typeof projet !== "object" || projet === null || Array.isArray(projet)) return TEMPS_MAX_TICKET_DEFAUT_MIN;
  const valeur = (projet as Record<string, unknown>).tempsMaxTicketMin;
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? valeur : TEMPS_MAX_TICKET_DEFAUT_MIN;
}

// Le texte de projet.json, lu tel quel : un JSON invalide donne le défaut.
export function tempsMaxTicketMinDuTexte(texte: string | undefined): number {
  if (texte === undefined) return TEMPS_MAX_TICKET_DEFAUT_MIN;
  try {
    return tempsMaxTicketMin(JSON.parse(texte));
  } catch {
    return TEMPS_MAX_TICKET_DEFAUT_MIN;
  }
}
