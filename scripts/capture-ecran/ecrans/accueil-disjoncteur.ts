// « Tous les projets » avec « parade » dont le disjoncteur est ouvert (#3602) : sa ligne dit « held: breaker open ». Chaque ligne est celle que l'app tire de leurs `facts`.
import { ligneDeProjet, type Accueil } from "../../../app/src/accueil.ts";
import { comprendre, type Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_DISJONCTEUR } from "./rail-disjoncteur-commun.ts";

const RENDUS_RETENUS: Record<string, Rendu> = { ...RENDUS, parade: RENDU_DISJONCTEUR };
const ligne = (nom: string) => {
  const rendu = RENDUS_RETENUS[nom] as Rendu;
  const faits = comprendre(JSON.stringify(rendu.facts)) as Faits;
  return ligneDeProjet({ nom, servi: true }, { a: MAINTENANT, faits }, { texte: rendu.status });
};

export const ecran: Ecran = {
  dit: "« Tous les projets » : « parade » retenu par son disjoncteur — « held: breaker open » ; « cantine » calme (#3602)",
  largeur: 1280,
  hauteur: 700,
  etapes: [],
  donnees: () => {
    const accueil: Accueil = { projets: [ligne("parade"), ligne("cantine")], stations: [], sante: { ton: "vert", dit: "", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), accueil } }, envois: cuisine(RENDUS_RETENUS) };
  },
};
