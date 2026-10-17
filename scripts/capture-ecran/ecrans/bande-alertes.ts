// L'espace de « parade », sa bande d'alertes pleine (#907) : la cuisine retenue par la connexion Max
// tombée et par sa base rouge, le grant `merge` éteint seul — et le manager allumé. Ce que la box
// rend de plus que la cuisine figée tient dans `status` et l'état `retenue` de `facts`, mot pour mot.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

// Les lignes de tête de `status` que la bande lit (runtime/src/etat.ts, `decrireEtat`), en tête de celui de la cuisine figée.
export const STATUS_EN_PANNE = [
  "projet     parade",
  "cuisine    retenue",
  "connexion  Max DÉCONNECTÉE depuis 18 min sur box/claude (session expirée) — plus aucun ticket n'est pris : `claude /login` sous le compte du service — la cuisine reprend seule dans la minute, sans « resume »",
  "base       ROUGE depuis 1 h 10 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge",
  "           rejouer ses gates sans attendre un commit : brigade parade base replay",
  "grant      merge ÉTEINT SEUL il y a 40 min — son échéance est passée : la pass s'arrête à la PR ouverte, plus rien n'est mergé sans toi",
  ...PARADE.status.split("\n").slice(2),
].join("\n");

export const PARADE_EN_PANNE: Rendu = { ...PARADE, facts: { ...PARADE.facts, etat: "retenue" }, status: STATUS_EN_PANNE, manager: MANAGER_ALLUME };

export const ecran: Ecran = {
  dit: "L'espace de « parade », sa bande d'alertes pleine : connexion Max tombée, base rouge, grant `merge` éteint seul, manager allumé",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: PARADE_EN_PANNE }),
  }),
};
