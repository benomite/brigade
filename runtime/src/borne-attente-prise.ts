// L'attente d'une prise ne peut pas dépasser l'intervalle réel entre
// l'ouverture du ticket et son premier commentaire `brigade:prise` (#2784,
// épique #2782) : espace#822 affichait 8,2 min d'attente sur 8,3, quand git
// plaçait le commit et le merge à 3,8 min l'un de l'autre.
//
// Une mesure qui dépasse cette borne est rejetée (null), pas corrigée : rien
// n'est estimé à sa place. Sans prise connue (`priseAt` absent ou null), il n'y
// a pas de borne à opposer : la mesure passe telle quelle, l'attente étant déjà
// contenue entre `depuis` et le merge.
//
// La borne ne tient que l'attente d'avant la première prise : celle qui suit
// un cook rendu sans livraison (`reprises`, en secondes) n'est pas entre
// l'ouverture et la première prise, et ne s'y compare pas (#2954). Comptée,
// elle rejetait la mesure de tout ticket dont un cook avait été rendu.
import type { EnregistrementTemps } from "./temps-ticket/synthese.ts";

// Les secondes sont arrondies sur les instants (`mesurer`) : une seconde de jeu.
const JEU_S = 1;

export function accepterLaMesure(mesure: EnregistrementTemps, reprises = 0): EnregistrementTemps | null {
  const ouverture = Date.parse(mesure.depuis ?? "");
  const prise = Date.parse(mesure.priseAt ?? "");
  if (Number.isNaN(ouverture) || Number.isNaN(prise)) return mesure;
  // Une prise lue avant le début de l'attente d'une prise, ou après la première
  // phase vue par la station, n'est pas retenue par la mesure : pas de borne.
  const debutAttente = ouverture + (mesure.attenteQualification ?? 0) * 1000;
  if (prise < debutAttente || prise > Date.parse(mesure.claimedAt ?? "")) return mesure;
  const borne = (prise - ouverture) / 1000;
  return (mesure.attentePrise ?? 0) - reprises > borne + JEU_S ? null : mesure;
}
