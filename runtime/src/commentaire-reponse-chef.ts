// Ce que le commentaire d'une carte dit de la réponse du chef (#3135). La
// phrase « Your answer is written » n'existe qu'ici et ne sort que si une
// réponse est trouvée sur l'issue : sans elle, le commentaire dit qu'aucune
// réponse n'y est encore, et ne dit pas que le label est levé.

export const REPONSE_ECRITE = "Your answer is written on the issue";

// Une issue retenue par un label du chef : avec sa réponse, le label part et le
// manager rejuge ; sans, le label reste.
export function commentaireRetenue(reponseTrouvee: boolean): string {
  return reponseTrouvee
    ? `${REPONSE_ECRITE} and the label removed, so the manager judges it again.`
    : "No answer was found on the issue yet, so the label stays until you answer.";
}

// Un jugement ou un découpage que le manager n'a pas su lire.
export function commentaireIllisible(reponseTrouvee: boolean): string {
  return reponseTrouvee ? `${REPONSE_ECRITE} for it to read.` : "No answer was found on the issue yet for it to read.";
}
