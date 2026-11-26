// Ce que la station publie de ses pannes, à chaque signe de vie : la dernière
// mise à jour quand elle a raté et que la station est revenue en arrière
// (mise-a-jour/etat.ts), et la connexion Max de la machine (connexion-max/).
// L'app les lit sur GitHub et les dit en une ligne, avec un bouton, sur la
// ligne de la station (app/src/pannes/). Rien d'autre ne part : ni le motif
// d'un échec, ni la raison d'une perte, ni le geste qu'un terminal ferait.
import type { ConnexionMax } from "../connexion-max/connexion.ts";
import type { EtatMiseAJour } from "../mise-a-jour/etat.ts";
import type { EtatsPublies, MiseAJourRevenue } from "./document.ts";

export function miseAJourRevenue(etat: EtatMiseAJour | null): MiseAJourRevenue | null {
  const derniere = etat?.derniere;
  if (derniere === null || derniere === undefined || derniere.quoi !== "revenue") return null;
  return { visee: derniere.visee, restauree: derniere.restauree, le: derniere.le, retourRate: derniere.retour !== null };
}

export function etatsPublies(miseAJour: EtatMiseAJour | null, connexion: ConnexionMax | null): EtatsPublies {
  return { miseAJour: miseAJourRevenue(miseAJour), connexionMax: connexion === null ? null : { etat: connexion.etat, depuis: connexion.depuis } };
}
