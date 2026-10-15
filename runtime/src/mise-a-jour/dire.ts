// La mise à jour de la station telle que le chef la lit, dite d'un seul
// endroit : la ligne de la file après chaque passage — « passée en version X
// à 14 h 02 », ou le retour en arrière d'une version qui n'a pas démarré —, et
// l'état que la commande `etat` montre.
import type { EtatMiseAJour, Issue } from "./etat.ts";

const deux = (nombre: number) => String(nombre).padStart(2, "0");

// L'heure d'un instant, à la minute, à l'heure de la machine : « 14 h 02 ».
export const heureEnClair = (instant: string): string => {
  const lu = new Date(instant);
  return `${deux(lu.getHours())} h ${deux(lu.getMinutes())}`;
};

// Ce qu'une mise à jour a donné, en une ligne.
export function direIssue(issue: Issue): string {
  if (issue.quoi === "passee") return `passée en version ${issue.version} à ${heureEnClair(issue.le)}`;
  const tete = `mise à jour vers la version ${issue.visee} ratée à ${heureEnClair(issue.le)} : ${issue.motif}`;
  if (issue.retour === null) return `${tete} — revenue en version ${issue.restauree} ; ${issue.visee} n'est pas réessayée, la suivante le sera`;
  return `${tete} — le retour en version ${issue.restauree} a échoué aussi : ${issue.retour}`;
}

// L'état exposé, pour la commande `etat`.
export function decrireEtatMiseAJour(etat: EtatMiseAJour | null): string[] {
  if (etat === null) return ["mise à jour : aucun passage encore"];
  const tete = etat.installee === null ? "installée   aucune version (le paquet n'est pas installé tout à fait)" : `installée   ${etat.installee}`;
  return [
    tete,
    `publiée     ${etat.disponible ?? "aucune version lue"}`,
    `gel         ${etat.gelee ? "oui — aucune nouvelle version n'est installée" : "non — la station suit les versions publiées"}`,
    `vérifiée    ${etat.verifieeLe}${etat.verification === null ? "" : ` — ${etat.verification}`}`,
    ...(etat.retenue === null ? [] : [`retenue     ${etat.retenue}`]),
    ...(etat.ratees.length === 0 ? [] : [`ratées      ${etat.ratees.join(", ")}`]),
    `dernière    ${etat.derniere === null ? "aucune mise à jour encore" : direIssue(etat.derniere)}`,
  ];
}
