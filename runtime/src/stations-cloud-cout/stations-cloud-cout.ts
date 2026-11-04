// Ce que coûte une station du nuage, par ticket servi (#2230, épique #2223) :
// l'hôte déclare le temps facturé d'une station (des heures, un prix à
// l'heure) et la cuisine sait quels tickets elle a servis. Ce module les
// rapproche en un coût par projet et par période — total, tickets servis, coût
// par ticket. Il ne lit ni hôte ni disque : l'app lui passe des valeurs
// simples et affiche ce qu'il rend. Sans E/S.

// Du temps facturé : `heures` au prix `prixHoraire`, daté de `au` (ISO 8601).
export type Facturation = {
  station: string;
  projet: string;
  au: string;
  heures: number;
  prixHoraire: number;
};

// Un ticket servi par une station, daté de `au` (ISO 8601).
export type TicketServi = {
  station: string;
  projet: string;
  au: string;
  ticket: number;
};

// La période : `du` inclus, `jusqua` exclu (ISO 8601). Un bord absent est ouvert.
export type Periode = { du?: string; jusqua?: string };

export type CoutParTicket = number | "n/a";

export type CoutDuProjet = {
  projet: string;
  coutTotal: number;
  ticketsServis: number;
  // « n/a » sans ticket servi : pas de division par zéro.
  coutParTicket: CoutParTicket;
};

const dans = (au: string, { du, jusqua }: Periode): boolean => {
  const instant = Date.parse(au);
  if (Number.isNaN(instant)) return false;
  if (du !== undefined && instant < Date.parse(du)) return false;
  if (jusqua !== undefined && instant >= Date.parse(jusqua)) return false;
  return true;
};

// Le coût d'un projet sur une période. Un ticket servi par deux stations, ou
// deux fois, ne compte qu'une fois ; le total est celui de toutes les stations
// facturées au projet dans la période, qu'elles aient servi ou non.
export function coutParTicket(
  projet: string,
  periode: Periode,
  facturations: readonly Facturation[],
  servis: readonly TicketServi[],
): CoutDuProjet {
  const coutTotal = facturations
    .filter((f) => f.projet === projet && dans(f.au, periode))
    .reduce((somme, f) => somme + f.heures * f.prixHoraire, 0);
  const tickets = new Set(servis.filter((s) => s.projet === projet && dans(s.au, periode)).map((s) => s.ticket));
  const ticketsServis = tickets.size;
  return { projet, coutTotal, ticketsServis, coutParTicket: ticketsServis === 0 ? "n/a" : coutTotal / ticketsServis };
}
