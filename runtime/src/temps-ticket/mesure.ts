// Le temps de chaque ticket servi, de son dépôt — ou de `fire`, s'il a été
// déposé bien avant d'être mis sur le rail — à son merge (#2662, épique #2659 ;
// d'abord de sa prise, #2342), partagé en ses phases : l'attente de la
// qualification, l'attente d'une prise (une place, une dépendance, une zone
// tenue), chaque cook — ceux qui n'ont rien livré compris —, chaque renvoi,
// l'attente de la pass, la relecture, la CI, le merge.
//
// La station marque chaque passage d'une phase à la suivante au moment où elle
// le fait (`chronometre`) ; au merge, elle lit sur GitHub quand l'issue a été
// déposée et mise sur le rail, le parcours se mesure (`mesurer`) et s'ajoute à
// `.claude/brigade/temps-tickets.json` du projet (`enregistrerTemps`), avec le
// résumé des tickets récents (`resume`) : le contrat que lisent la synthèse,
// l'alerte du temps perdu (`temps-max/`, #2670) et l'app.
//
// Une phase dure de sa marque à la marque suivante, la dernière jusqu'au
// merge : leur somme est le temps du dépôt au merge. Une phase que la station
// n'a pas vue passer vaut 0 — rien n'est estimé à sa place.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dureeDuTicket, medianePerdueDesRecents, perteLaPlusLourde, phaseLaPlusLenteDesTickets, seuilDuProjet, ticketsRecents } from "../temps-max/mesure.ts";
import type { EnregistrementTemps, Pertes } from "./synthese.ts";

export const FICHIER_DES_TEMPS = ".claude/brigade/temps-tickets.json";

// Les phases d'un ticket, dans l'ordre où il les traverse, et leur nom dans
// `phases`. `cuissonRatee` est un cook qui n'a rien livré ; `renvoi`, le temps
// d'une livraison renvoyée jusqu'au cook suivant. `cuissonTests` n'en est pas
// une : c'est une part de `cuisson`.
export const ETAPES = ["attenteQualification", "attentePrise", "cuissonRatee", "cuisson", "renvoi", "attentePasse", "revue", "ci", "merge"] as const;
export type Etape = (typeof ETAPES)[number];
export const NOMS_DES_ETAPES: Record<Etape, string> = {
  attenteQualification: "qualification wait",
  attentePrise: "claim wait",
  cuissonRatee: "failed cook",
  cuisson: "cooking",
  renvoi: "send-back",
  attentePasse: "pass wait",
  revue: "review",
  ci: "CI",
  merge: "merge",
};

// Une issue mise sur le rail (`fire`) plus d'une heure après son dépôt y a été
// mise plus tard : son temps part de `fire`, sans attente de qualification.
// Sous l'heure, il part du dépôt et l'attente jusqu'à `fire` est celle du manager.
export const RAIL_PLUS_TARD_MS = 60 * 60 * 1000;

// Quand l'issue a été déposée et, si GitHub le dit, mise sur le rail (ISO).
export type DepotDuTicket = { deposeAt: string; fireAt?: string | null };

// À partir de `at` (ISO), le ticket est dans `etape`, jusqu'à la marque suivante.
export type Marque = { etape: Etape; at: string };

// Le parcours d'un ticket tel que la station l'a vu : ses marques, dans
// l'ordre, et ce que les tests et les gates du cook ont pris, en millisecondes.
// Sa première marque est sa prise — ou, si la station ne l'a pas vue (un autre
// l'a prise, ou la station a redémarré depuis), la première phase qu'elle a vue.
export type Parcours = { ticket: number; marques: Marque[]; testsMs: number };

const minutes = (secondes: number) => Math.round(secondes / 6) / 10;

// Les marques d'avant la prise, tirées du dépôt : l'attente de la
// qualification jusqu'à `fire`, puis celle d'une prise.
function marquesDuDepot(depot: DepotDuTicket | undefined): Marque[] {
  const depose = Date.parse(depot?.deposeAt ?? "");
  if (depot === undefined || Number.isNaN(depose)) return [];
  const fire = Date.parse(depot.fireAt ?? "");
  if (Number.isNaN(fire) || fire <= depose) return [{ etape: "attentePrise", at: depot.deposeAt }];
  if (fire - depose > RAIL_PLUS_TARD_MS) return [{ etape: "attentePrise", at: new Date(fire).toISOString() }];
  return [
    { etape: "attenteQualification", at: depot.deposeAt },
    { etape: "attentePrise", at: new Date(fire).toISOString() },
  ];
}

// Le parcours mesuré jusqu'au merge (`mergedAt`, ISO), depuis le dépôt quand
// il est connu, sinon depuis la première marque. Les secondes sont arrondies
// sur les instants, pas sur les durées : la somme des phases est le temps
// arrondi du début au merge, à la seconde près.
export function mesurer(parcours: Parcours, mergedAt: string, depot?: DepotDuTicket): EnregistrementTemps {
  const premiere = parcours.marques[0];
  const claimedAt = premiere?.at ?? mergedAt;
  const avant = marquesDuDepot(depot).filter((m) => premiere === undefined || Date.parse(m.at) < Date.parse(premiere.at));
  const marques = [...avant, ...parcours.marques];
  const depuis = marques[0]?.at ?? mergedAt;
  const debut = Date.parse(depuis);
  const fin = Math.max(debut, Date.parse(mergedAt));
  const seconde = (instant: number) => Math.round((Math.min(Math.max(instant, debut), fin) - debut) / 1000);
  const durees = Object.fromEntries(ETAPES.map((e) => [e, 0])) as Record<Etape, number>;
  const phases: { nom: string; minutes: number }[] = [];
  // Le temps perdu (#2670) : tout sauf le cook qui a livré — la dernière
  // cuisson — et ce qui la suit. Avant elle, une cuisson, une pass ou une CI
  // sont celles d'une livraison renvoyée : un renvoi.
  const livree = marques.map((m) => m.etape).lastIndexOf("cuisson");
  const perdu: Pertes = { attente: 0, ratees: 0, renvois: 0 };
  let derniere: { etape: Etape; secondes: number } | null = null;
  const fermer = () => {
    if (derniere !== null && derniere.secondes > 0) phases.push({ nom: NOMS_DES_ETAPES[derniere.etape], minutes: minutes(derniere.secondes) });
  };
  marques.forEach((marque, rang) => {
    const suivante = marques[rang + 1];
    const secondes = seconde(suivante === undefined ? fin : Date.parse(suivante.at)) - seconde(Date.parse(marque.at));
    durees[marque.etape] += secondes;
    if (marque.etape === "attenteQualification" || marque.etape === "attentePrise") perdu.attente += secondes;
    else if (marque.etape === "cuissonRatee") perdu.ratees += secondes;
    else if (marque.etape === "renvoi" || rang < livree) perdu.renvois += secondes;
    if (derniere?.etape === marque.etape) derniere.secondes += secondes;
    else {
      fermer();
      derniere = { etape: marque.etape, secondes };
    }
  });
  fermer();
  const cuissonTests = Math.min(Math.max(0, Math.round(parcours.testsMs / 1000)), durees.cuisson);
  return {
    ticket: parcours.ticket,
    depuis,
    claimedAt,
    mergedAt,
    attenteQualification: durees.attenteQualification,
    attentePrise: durees.attentePrise,
    cuissonsRatees: durees.cuissonRatee,
    cuisson: durees.cuisson,
    cuissonTests,
    renvois: durees.renvoi,
    attentePasse: durees.attentePasse,
    revue: durees.revue,
    ci: durees.ci,
    merge: durees.merge,
    phases,
    perdu,
  };
}

// Le centile `p` (0 à 1) de valeurs, la valeur au rang ⌈p·(n−1)⌉ (la méthode
// « higher » de numpy) : sur 40 tickets, le p75 est le 31e. C'est le p75 de
// 47 min que l'épique #2659 lit sur les 40 tickets du 6 et du 7 novembre
// (`test/fixtures/temps-tickets-40`). 0 sans valeur.
export function centile(valeurs: readonly number[], p: number): number {
  const triees = [...valeurs].sort((x, y) => x - y);
  return triees[Math.max(0, Math.ceil(p * (triees.length - 1)))] ?? 0;
}

type PhaseResumee = { nom: string; medianMin: number; partPct: number };
export type Resume = { n: number; medianMin: number; p75Min: number; perduMedianMin: number; lostTimeMaxMin: number; phaseLaPlusLongue: PhaseResumee; perteLaPlusLourde: PhaseResumee | null };

// Le résumé des tickets récents (`temps-max/mesure.ts`), du dépôt au merge :
// combien, leur médiane, leur 75e centile, la phase où ils ont passé le plus de
// temps, avec sa médiane par ticket et sa part du tout ; leur temps perdu
// médian contre le seuil du projet (#2670), et la perte qui pèse le plus
// (null sans temps perdu), sa part du temps perdu. Les minutes y sont
// entières, sauf le temps perdu, au dixième : son seuil est de 2 min.
export function resumer(enregistrements: readonly EnregistrementTemps[], lostTimeMaxMin: number): Resume {
  const recents = ticketsRecents(enregistrements);
  const durees = recents.map(dureeDuTicket);
  const lente = phaseLaPlusLenteDesTickets(recents);
  const lourde = perteLaPlusLourde(recents);
  const triees = [...durees].sort((x, y) => x - y);
  const milieu = triees.length >> 1;
  const mediane = triees.length === 0 ? 0 : triees.length % 2 === 1 ? (triees[milieu] ?? 0) : ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
  return {
    n: recents.length,
    medianMin: Math.round(mediane / 60),
    p75Min: Math.round(centile(durees, 0.75) / 60),
    perduMedianMin: Math.round((medianePerdueDesRecents(recents) ?? 0) / 6) / 10,
    lostTimeMaxMin,
    phaseLaPlusLongue: { nom: lente.nom, medianMin: Math.round(lente.mediane / 60), partPct: Math.round(lente.part * 100) },
    perteLaPlusLourde: lourde === null ? null : { nom: lourde.nom, medianMin: Math.round(lourde.mediane / 6) / 10, partPct: Math.round(lourde.part * 100) },
  };
}

// Les enregistrements d'un fichier des temps déjà lu : le tableau d'avant
// #2662, ou `tickets` de l'objet d'aujourd'hui. Null pour tout autre contenu.
export function ticketsDuFichier(contenu: unknown): unknown[] | null {
  if (Array.isArray(contenu)) return contenu;
  if (typeof contenu === "object" && contenu !== null && Array.isArray((contenu as { tickets?: unknown }).tickets)) return (contenu as { tickets: unknown[] }).tickets;
  return null;
}

// Ajoute l'enregistrement au fichier du projet dont `dossier` est la racine,
// et y récrit le résumé des tickets récents, sur le seuil du temps perdu de
// son projet.json.
// Le même ticket n'y est qu'une fois : un enregistrement plus ancien du ticket
// est remplacé. Un fichier illisible n'est pas écrasé : l'appel lève. Le
// tableau d'avant #2662 se lit, et se récrit en objet.
export function enregistrerTemps(dossier: string, enregistrement: EnregistrementTemps): void {
  const fichier = join(dossier, FICHIER_DES_TEMPS);
  let texte: string | undefined;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") throw erreur;
  }
  const lus = ticketsDuFichier(texte === undefined || texte.trim() === "" ? [] : JSON.parse(texte));
  if (lus === null) throw new Error(`${fichier} holds neither a JSON array nor { tickets }: it is left as is`);
  const autres = lus.filter((lu) => typeof lu !== "object" || lu === null || (lu as { ticket?: unknown }).ticket !== enregistrement.ticket);
  const tickets = [...autres, enregistrement];
  let projet: unknown = null;
  try {
    projet = JSON.parse(readFileSync(join(dirname(fichier), "projet.json"), "utf8"));
  } catch {}
  const mesures = tickets.filter((t): t is EnregistrementTemps => typeof t === "object" && t !== null && typeof (t as { ticket?: unknown }).ticket === "number");
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify({ resume: resumer(mesures, seuilDuProjet(projet)), tickets }, null, 2)}\n`);
  renameSync(provisoire, fichier);
}

// Ce que la station tient du parcours de ses tickets, en mémoire.
export type Chronometre = {
  // Le ticket est pris : son parcours s'ouvre, en cuisson. Repris après un
  // cook sans livraison ou un renvoi, il garde le parcours ouvert.
  prendre(ticket: number): void;
  // Le ticket entre dans `etape`. Sans parcours ouvert, il s'en ouvre un ici.
  marquer(ticket: number, etape: Etape): void;
  // Le cook du ticket s'arrête sans livraison : sa cuisson était un cook raté,
  // et le ticket attend une nouvelle prise.
  rater(ticket: number): void;
  // Les tests et les gates qu'un cook du ticket a joués, en millisecondes.
  tests(ticket: number, ms: number): void;
  // Le ticket est mergé : son parcours se mesure, depuis son dépôt quand il
  // est connu, et se ferme. Rien si aucun parcours n'est ouvert.
  servir(ticket: number, depot?: DepotDuTicket): EnregistrementTemps | null;
  // Le ticket sort de la cuisine sans être mergé : son parcours est oublié.
  oublier(ticket: number): void;
};

// Un cook sans livraison : sa dernière cuisson devient un cook raté, suivi de l'attente d'une prise.
// Rien hors d'une cuisson : un ticket déjà livré n'attend pas de prise.
export function rater(marques: Marque[], at: string): void {
  const derniere = marques.at(-1);
  if (derniere?.etape !== "cuisson") return;
  derniere.etape = "cuissonRatee";
  marques.push({ etape: "attentePrise", at });
}

export function chronometre(maintenant: () => Date = () => new Date()): Chronometre {
  const parcours = new Map<number, Parcours>();
  const marquer = (ticket: number, etape: Etape) => {
    const ouvert = parcours.get(ticket);
    const at = maintenant().toISOString();
    if (ouvert === undefined) parcours.set(ticket, { ticket, marques: [{ etape, at }], testsMs: 0 });
    else if (ouvert.marques.at(-1)?.etape !== etape) ouvert.marques.push({ etape, at });
  };
  return {
    prendre: (ticket) => marquer(ticket, "cuisson"),
    marquer,
    rater: (ticket) => {
      const ouvert = parcours.get(ticket);
      if (ouvert !== undefined) rater(ouvert.marques, maintenant().toISOString());
    },
    tests: (ticket, ms) => {
      const ouvert = parcours.get(ticket);
      if (ouvert !== undefined && Number.isFinite(ms) && ms > 0) ouvert.testsMs += ms;
    },
    servir: (ticket, depot) => {
      const ouvert = parcours.get(ticket);
      if (ouvert === undefined) return null;
      parcours.delete(ticket);
      return mesurer(ouvert, maintenant().toISOString(), depot);
    },
    oublier: (ticket) => {
      parcours.delete(ticket);
    },
  };
}
