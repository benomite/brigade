// La qualité des tickets récents (épique #2673), en fonctions pures : la part
// livrée du premier coup, les réparations de la base par PR mergée, les motifs
// de renvoi les plus fréquents et les checks qui ont cassé la base. La fenêtre
// est celle des mesures de temps — `ticketsRecents` de `temps-max/mesure.ts` —,
// jamais une seconde : les deux mesures parlent des mêmes tickets.
//
// Elles reçoivent ce que l'appelant a lu : les enregistrements de temps, dans
// l'ordre des merges, et ce que le journal sait de la qualité de chaque ticket.
// Aucune ne lit ni n'écrit de fichier. Les deux lectures — `qualitesDuJournal`
// et `projetDuClone` — sont à part, en fin de module : la cuisine les fait pour
// la passe de fermeture, qui dit la qualité à côté des temps.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Base } from "./base.ts";
import { CAUSES, classerEssai, SANS_SIGNAUX } from "./causes-des-ratages.ts";
import { parcoursDesTickets } from "./parcours-des-tickets.ts";
import { dureeDuTicket, ticketsRecents } from "./temps-max/mesure.ts";
import type { TempsTicket } from "./temps-ticket/ligne-status.ts";

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
    // En entiers : 7 sur 10 n'est pas sous 70 %, quoi que dise 0,7 × 100.
    sousLeSeuil: premierCoup === null ? null : connues.filter(duPremierCoup).length * 100 < seuil * connues.length,
    reparations: reparations.length,
    reparationsParMerge: parMerge,
    tropDeReparations: parMerge === null ? null : parMerge > REPARATIONS_PAR_MERGE_MAX,
    motifsDeRenvoi: classer(connues.flatMap((q) => q.renvois)),
    checksCasses: classer(reparations.flatMap((q) => q.reparation ?? [])),
  };
}

const pourcent = (part: number) => `${Math.round(part * 100)}%`;
const comptes = (liste: readonly Compte[]) => liste.map(({ nom, fois }) => `${nom} (${fois})`).join(", ");

// Les lignes de la qualité, telles que la passe de fermeture les donne.
export function direLaQualite(q: Qualite): string[] {
  const inconnus = q.inconnus === 0 ? "" : `, ${q.inconnus} more not known`;
  const premierCoup =
    q.premierCoup === null
      ? `- First try: unknown — none of the ${q.tickets.length} recent tickets is known to the log (threshold ${q.seuilPremierCoup}%).`
      : `- First try: ${pourcent(q.premierCoup)} of the ${q.mesures} recent tickets known to the log${inconnus} — ${q.sousLeSeuil ? "under" : "at or over"} the project's threshold of ${q.seuilPremierCoup}%.`;
  const reparations =
    q.reparationsParMerge === null
      ? "- Repairs of main: unknown — no merged PR to count."
      : `- Repairs of main: ${q.reparations} over ${q.mesures} merged PRs, ${q.reparationsParMerge.toFixed(3)} per merge — ${q.tropDeReparations ? "more than" : "within"} one per ten merges.`;
  return [
    premierCoup,
    reparations,
    `- Send-back reasons: ${q.motifsDeRenvoi.length === 0 ? "none" : comptes(q.motifsDeRenvoi)}.`,
    `- Checks that broke main: ${q.checksCasses.length === 0 ? "none" : comptes(q.checksCasses)}.`,
  ];
}

const titreDeCause = (cle: string) => CAUSES.find((cause) => cause.cle === cle)?.titre ?? cle;

// Ce que le journal sait de chaque ticket mergé, de son dernier parcours
// (`parcours-des-tickets.ts`) : tout essai avant le dernier a raté — renvoyé
// quand la pass l'a jugé rouge, avec la cause que `causes-des-ratages.ts` lui
// donne ; sinon un cook qui n'a rien livré. Le ticket de réparation de la base
// est celui d'un `base.repair-opened`, qui nomme les checks en échec. Un
// ticket mergé sans essai au journal n'y est pas : sa qualité est inconnue.
export function qualitesDuJournal(base: Base): Map<number, QualiteDuTicket> {
  const qualites = new Map<number, QualiteDuTicket>();
  for (const { ticket, end, attempts } of parcoursDesTickets(base)) {
    if (end?.kind !== "merged" || attempts.length === 0) continue;
    const rates = attempts.slice(0, -1);
    const renvois = rates.filter((essai) => essai.verdict === "red").map((essai) => titreDeCause(classerEssai(essai.signaux ?? SANS_SIGNAUX)));
    qualites.set(ticket, { renvois, cooksRates: rates.length - renvois.length });
  }
  for (const { ticket, payload } of base.lire<{ ticket: number; payload: string }>("SELECT ticket, payload FROM events WHERE type = 'base.repair-opened' AND ticket IS NOT NULL ORDER BY seq")) {
    const qualite = qualites.get(ticket);
    const { failures } = JSON.parse(payload) as { failures?: unknown };
    if (qualite !== undefined) qualites.set(ticket, { ...qualite, reparation: Array.isArray(failures) ? failures.filter((f): f is string => typeof f === "string") : [] });
  }
  return qualites;
}

// Le projet.json du clone, lu tel quel ; null s'il manque ou ne se lit pas.
export function projetDuClone(clone: string): unknown {
  try {
    return JSON.parse(readFileSync(join(clone, ".claude", "brigade", "projet.json"), "utf8"));
  } catch {
    return null;
  }
}

// La part des tickets récents (même fenêtre) mergés dans leur seuil de temps — `maxMin`,
// le max du projet, en minutes —, entre 0 et 1 ; null sans ticket. Pile au seuil, c'est dedans.
export function partDansLesSeuils(temps: readonly TempsTicket[], maxMin: number): number | null {
  const recents = ticketsRecents(temps);
  return recents.length === 0 ? null : recents.filter((t) => dureeDuTicket(t) <= maxMin * 60).length / recents.length;
}
