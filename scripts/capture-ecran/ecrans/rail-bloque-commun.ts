// Le rail bloqué de « parade » (#3358), projet GitHub seul : huit tickets `fire` (#4 à #11) qu'aucun manager n'a pris —
// ni prise du manager, ni `model:` ni `effort:` — depuis la veille à 20:00 UTC, quatorze heures avant la lecture. Sa
// seule station, box/claude, s'est arrêtée juste avant. La vue reçoit ce que l'app en tire (app/src/vue/rail/github.ts,
// `avecLeRail`) — `facts` et `status` passés par le code de l'app, rien écrit à la main.
import type { TableauLu } from "../../../app/src/tableau/lecture.ts";
import { avecLeRail, type RailSurGithub } from "../../../app/src/vue/rail/github.ts";
import { MAINTENANT, type Rendu } from "./commun.ts";
import { renduDeParade, signe, ticket } from "./github-seul-commun.ts";

const POSE = "2026-10-12T20:00:00.000Z";
const TITRES: Record<number, string> = { 4: "Le compteur de secondes", 5: "La remise à zéro", 6: "Le tour suivant", 7: "Le chrono en pause", 8: "Les temps par tour", 9: "L'export des tours", 10: "Le thème sombre", 11: "Le son du départ" };
const NUMEROS = [4, 5, 6, 7, 8, 9, 10, 11];

export const RAIL_BLOQUE: RailSurGithub = {
  lu: MAINTENANT,
  tickets: NUMEROS.map((numero) => ticket(numero, "en attente", { titre: TITRES[numero] as string, creeLe: POSE })),
  nonPris: NUMEROS.map((numero) => ({ ticket: numero, depuis: POSE })),
};

// box/claude : vue pour la dernière fois à 19:58 UTC, arrêtée à 19:59.
export const BOX_ARRETEE = { ...signe("box", "2026-10-12T19:58:00.000Z"), stoppedAt: "2026-10-12T19:59:00.000Z" };

// La lecture d'un projet sur GitHub seul avant son rail (app/src/tableau/lecture.ts, `vide`) : rien d'autre que GitHub.
const VIDE: TableauLu = {
  lu: true,
  depot: "chef/parade",
  luLe: MAINTENANT,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

export const RENDU_BLOQUE: Rendu = renduDeParade(avecLeRail(VIDE, RAIL_BLOQUE, { lus: [BOX_ARRETEE] }));
