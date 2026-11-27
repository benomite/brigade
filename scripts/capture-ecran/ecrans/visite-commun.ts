// La visite d'une vraie cuisine (#4087), choisie sur le premier écran d'un PC neuf : la cuisine visitée est celle que les
// autres captures figent pour « parade », rangée par les modules de l'app comme le process principal la range
// (app/src/visit.ts) et rendue par le pont à `lireLaCuisineVisitee`. Les écrans `visite*` en sont tirés.
import { putAPart } from "../../../app/src/awaiting.ts";
import type { Reading } from "../../../app/src/box.ts";
import { holdFacts, type Board } from "../../../app/src/facts.ts";
import type { Ecran, Etape } from "./commun.ts";
import { MAINTENANT } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { LISTEES, premierLancement } from "./premier-lancement-commun.ts";

function cuisineVisitee(): { tableau: Board } {
  const rendu = RENDUS.parade;
  if (rendu === undefined) throw new Error("pas de cuisine figée pour parade");
  const faits = holdFacts();
  const lecture = (sorties: Record<string, string>): Reading => ({ projet: "brigade", demande: 0, a: MAINTENANT, sorties: Object.entries(sorties).map(([commande, texte]) => ({ commande, texte })) });
  const recue = faits.recevoir(lecture({ facts: JSON.stringify(rendu.facts) }));
  const dessinable = faits.attendre(putAPart(lecture({ status: rendu.status }))) ?? recue;
  if (!("tableau" in dessinable)) throw new Error("la cuisine figée ne se range pas");
  return { tableau: dessinable.tableau };
}

// Le premier écran, « visit a real kitchen » cliqué, puis les étapes qui suivent.
export function visite(dit: string, etapes: Etape[] = []): Ecran {
  return premierLancement(dit, LISTEES, [{ cliquer: 'button[data-choix="visiter"]' }, ...etapes], { lireLaCuisineVisitee: cuisineVisitee() });
}
