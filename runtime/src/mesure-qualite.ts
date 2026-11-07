// La qualité des tickets récents (épique #2673), en fonctions pures : la part
// livrée du premier coup, les réparations de la base par PR mergée, les motifs
// de renvoi les plus fréquents et les checks qui ont cassé la base. La fenêtre
// est celle des mesures de temps — `ticketsRecents` de `temps-max/mesure.ts` —,
// jamais une seconde : les deux mesures parlent des mêmes tickets.
//
// Elles reçoivent ce que l'appelant a lu : les enregistrements de temps, dans
// l'ordre des merges, et ce que le journal sait de la qualité de chaque ticket.
// Aucune ne lit ni n'écrit de fichier.
import { ticketsRecents } from "./temps-max/mesure.ts";

// Le seuil du premier coup, en %, sans `premierCoupMinPourcent` dans projet.json.
export const SEUIL_PREMIER_COUP_PAR_DEFAUT = 70;
// La limite des réparations : plus d'une par dix merges.
export const REPARATIONS_PAR_MERGE_MAX = 0.1;

// `projet` est le contenu déjà lu de projet.json : absent, mal formé ou sans
// clé valide (un nombre de 0 à 100), c'est le défaut.
export function seuilPremierCoup(projet: unknown): number {
  if (typeof projet !== "object" || projet === null || Array.isArray(projet)) return SEUIL_PREMIER_COUP_PAR_DEFAUT;
  const valeur = (projet as Record<string, unknown>).premierCoupMinPourcent;
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 && valeur <= 100 ? valeur : SEUIL_PREMIER_COUP_PAR_DEFAUT;
}

// Ce que le journal sait d'un ticket mergé. `renvois` : le motif de chacun de
// ses renvois par la pass. `cooksRates` : ses cooks qui n'ont rien livré.
// `reparation` : présent si le ticket répare la base, avec les checks qui
// l'avaient cassée.
export type QualiteDuTicket = { renvois: readonly string[]; cooksRates: number; reparation?: readonly string[] };

export type Compte = { nom: string; fois: number };

// La qualité sur la fenêtre. `tickets` : ceux de la fenêtre des temps, dans
// l'ordre des merges. `mesures` : ceux dont la qualité est connue — les seuls
// comptés ; les autres sont `inconnus`. Sans ticket mesuré, les parts sont
// nulles : inconnues, ni 0 ni 100 %.
export type Qualite = {
  tickets: number[];
  mesures: number;
  inconnus: number;
  premierCoup: number | null;
  seuilPremierCoup: number;
  sousLeSeuil: boolean | null;
  reparations: number;
  reparationsParMerge: number | null;
  tropDeReparations: boolean | null;
  motifsDeRenvoi: Compte[];
  checksCasses: Compte[];
};

// Livré du premier coup : mergé sans renvoi ni cook raté.
export const duPremierCoup = (q: QualiteDuTicket) => q.renvois.length === 0 && q.cooksRates === 0;

// La part des tickets livrés du premier coup, entre 0 et 1 ; null sans ticket.
export function partDuPremierCoup(qualites: readonly QualiteDuTicket[]): number | null {
  return qualites.length === 0 ? null : qualites.filter(duPremierCoup).length / qualites.length;
}

// Les réparations de la base par PR mergée ; null sans merge.
export function reparationsParMerge(reparations: number, merges: number): number | null {
  return merges === 0 ? null : reparations / merges;
}

// Les noms comptés, du plus fréquent au moins fréquent ; à égalité, le premier vu.
export function classer(noms: readonly string[]): Compte[] {
  const comptes = new Map<string, number>();
  for (const nom of noms) comptes.set(nom, (comptes.get(nom) ?? 0) + 1);
  return [...comptes].map(([nom, fois]) => ({ nom, fois })).sort((a, b) => b.fois - a.fois);
}

export function mesurerQualite<T extends { ticket: number; mergedAt?: string }>(temps: readonly T[], qualites: ReadonlyMap<number, QualiteDuTicket>, projet?: unknown): Qualite {
  const tickets = ticketsRecents(temps).map(({ ticket }) => ticket);
  const connues = tickets.flatMap((ticket) => qualites.get(ticket) ?? []);
  const premierCoup = partDuPremierCoup(connues);
  const seuil = seuilPremierCoup(projet);
  const reparations = connues.filter((q) => q.reparation !== undefined);
  const parMerge = reparationsParMerge(reparations.length, connues.length);
  return {
    tickets,
    mesures: connues.length,
    inconnus: tickets.length - connues.length,
    premierCoup,
    seuilPremierCoup: seuil,
    sousLeSeuil: premierCoup === null ? null : premierCoup * 100 < seuil,
    reparations: reparations.length,
    reparationsParMerge: parMerge,
    tropDeReparations: parMerge === null ? null : parMerge > REPARATIONS_PAR_MERGE_MAX,
    motifsDeRenvoi: classer(connues.flatMap((q) => q.renvois)),
    checksCasses: classer(reparations.flatMap((q) => q.reparation ?? [])),
  };
}
