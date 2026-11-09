// Le rail de « parade » et, en tête, à côté de l'histogramme des 24 heures, ce qui est avant le rail (#1836) : une
// petite barre empilée, une part par état — pas lue, refusée incomplète, épique, prête sans `fire`, mise de côté —, sans
// un mot. Ce que la box publie dans son tableau de la cuisine (`avantLeRail`) est écrit ici mot pour mot ; ce que la vue
// en reçoit est calculé par l'app, comme main.ts le fait du tableau lu (tableau/rail.ts, amont.ts).
import type { Faits } from "../../../app/src/faits.ts";
import { COMMANDE, tenirAmont } from "../../../app/src/amont.ts";
import type { TableauLu } from "../../../app/src/tableau/lecture.ts";
import { lectureDuTableau } from "../../../app/src/tableau/rail.ts";
import { configuration, cuisine, demarrage, type Donnees, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const LU = "2026-10-13T10:03:58.000Z";
// Les faits de la cuisine figée, avec l'entrée de chaque ticket dans son état et l'histogramme des 24 heures (`cadence`).
const FAITS = PARADE.facts as Faits;
// L'entrée de chaque ticket dans son état, à l'horloge de la box — celle que `status` dit « since ».
const DEPUIS: Record<number, string> = {
  14: "2026-10-13T09:52:11.000Z",
  21: "2026-10-13T07:59:11.000Z",
  22: "2026-10-13T10:01:11.000Z",
  30: "2026-10-13T10:00:11.000Z",
  12: "2026-10-11T10:04:11.000Z",
};
// Les 24 heures piles, de 11:00 la veille à l'heure en cours : ce qui a été servi, et ce qui a raté.
const SERVIS: Record<number, number> = { 20: 1, 23: 1 };
const RATES: Record<number, number> = { 1: 1, 4: 2, 21: 1, 22: 2 };
const hours = Array.from({ length: 24 }, (_, rang) => ({
  at: new Date(Date.parse("2026-10-12T11:00:00.000Z") + rang * 3_600_000).toISOString(),
  served: SERVIS[rang] ?? 0,
  failed: RATES[rang] ?? 0,
}));

const FACTS = {
  ...FAITS,
  rail: FAITS.rail.map((ticket) => ({ ...ticket, depuis: DEPUIS[ticket.ticket] })),
  cadence: { hours, medianSeconds: { taken: 300, pass: 720 } },
} as Faits;

// Ce qui est avant le rail de « parade », tel que sa box le publie : douze issues, dans l'ordre où le manager les lit.
const AVANT_LE_RAIL = {
  lu: LU,
  issues: [
    { ticket: 41, titre: "Les tickets d'une épique dans l'ordre", priorite: 1, etat: "prete", dit: "calibrated (model:sonnet, effort:medium), without `fire`: the rail takes it once `fire` is set" },
    { ticket: 38, titre: "Le menu du soir", priorite: 1, etat: "epique", dit: "it carries `epic`: not split yet" },
    { ticket: 44, titre: "Exporter les commandes", priorite: 2, etat: "incomplete", dit: "refused (an incomplete ticket) — No acceptance criterion says what the export holds." },
    { ticket: 45, titre: "Le stock en temps réel", priorite: 2, etat: "non-lue", dit: "the manager has not judged it yet" },
    { ticket: 33, titre: "La carte des allergènes", priorite: 2, etat: "prete", dit: "put on the rail by the manager, sonnet / low — `fire` is not set on it yet" },
    { ticket: 47, titre: "Les réservations de groupe", priorite: 3, etat: "epique", dit: "split in progress, 1/4 tickets created and fired" },
    { ticket: 48, titre: "Un thème clair", priorite: null, etat: "mise-de-cote", dit: "it carries `served-elsewhere`: this kitchen does not serve it" },
    { ticket: 49, titre: "Les pourboires partagés", priorite: null, etat: "non-lue", dit: "the manager has not judged it yet" },
    { ticket: 50, titre: "Le bon de livraison imprimé", priorite: null, etat: "non-lue", dit: "returned to the manager, not rejudged yet" },
    { ticket: 51, titre: "Garder les tickets un an ?", priorite: null, etat: "mise-de-cote", dit: "set aside: it carries `question` — a question, left to you" },
    { ticket: 52, titre: "La caisse hors ligne", priorite: null, etat: "incomplete", dit: "refused (an incomplete ticket) — What happens to a payment taken offline is not said." },
    { ticket: 53, titre: "Le mode sombre de la caisse", priorite: null, etat: "prete", dit: "calibrated (model:haiku, effort:low), without `fire`: the rail takes it once `fire` is set" },
  ],
};

// Le tableau de la cuisine de « parade », lu de GitHub par l'app : seul ce que la lecture de ce qui est avant le rail
// y prend compte.
const TABLEAU = { lu: true, depot: "chef/parade", numero: 3, luLe: MAINTENANT, avantLeRail: AVANT_LE_RAIL } as unknown as TableauLu;

// Les données de l'écran : la cuisine figée, et, quand l'espace de « parade » s'ouvre, ce qui est avant son rail.
export function donnees(): Donnees {
  const envois = cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } });
  const vu = tenirAmont().recevoir(lectureDuTableau(TABLEAU, "parade", 0, [COMMANDE]));
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surAmont", args: [vu] }] } },
  };
}

export const ecran: Ecran = {
  dit: "Le rail de « parade » : à côté de l'histogramme des 24 heures, la barre empilée de ce qui est avant le rail — douze issues, une part par état, sans un mot",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees,
};
