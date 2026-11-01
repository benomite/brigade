// @ts-check
// Quand l'onglet Cooks dit « no station is known to serve this project yet » (ticket 1991, épique 1986) : seulement quand
// rien, nulle part, ne sert le projet. Le fichier des projets ne le dit servi (`servi`, `ici`) que si une station le
// déclare dans sa demande ; or la ligne « Cooks on » se lit aussi des stations déclarées sur le compte (`stationsVues`),
// et une box qui sert le projet y figure sans que le fichier le sache. Ces stations-là, même muettes, servent le projet :
// l'onglet les montre, ou dit laquelle ne se lit pas — il ne dit pas qu'aucune ne sert.
// Ce module ne touche pas `document` : il reçoit ce que la vue sait déjà.

export const AUCUNE_STATION = "the rail is not read: no station is known to serve this project yet — it appears as soon as one does";

/**
 * @param {{ servi?: true, ici?: true, sansStation?: true }} projet
 * @param {readonly { principale: boolean, bloquee: boolean }[]} stations celles que la ligne « Cooks on » montre pour ce projet
 */
export function aucuneStationNeSert(projet, stations) {
  if (projet.sansStation === true) return false;
  if (projet.servi === true || projet.ici === true) return false;
  return !stations.some(({ principale, bloquee }) => principale && !bloquee);
}
