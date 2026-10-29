// Ce que l'app dessine : les faits que la box rend dans une forme faite pour un
// programme (`brigade <projet> faits` — docs/runtime/etat-et-mesures.md, « Les faits, pour un
// programme »). L'app n'y déduit rien : un état est un mot lu, un compteur un
// nombre lu. Une sortie qui n'est pas cette forme n'est pas dessinée du tout —
// ce que la box a rendu se lit à sa place. Et une couleur ne se pose que sur un
// mot des deux listes fermées : un mot inconnu s'affiche tel quel, sans couleur.
// Le rail se range en six colonnes : quatre d'après le mot d'état de chaque
// ticket ; TODO — ce que le chef peut trancher maintenant — d'après `attend`, que
// la forme donne, et les numéros en tête des lignes du bloc `attend` de `status`
// (attend.ts), qui dit le geste en mots ; WAITING — ce qui attend un tiers —
// d'après ce que la forme dit de chaque ticket (`tiers`). Chaque carte porte ce que la file dit du ticket : sa station
// et où elle cuit — box ou Mac — d'après la forme, le reste d'après sa ligne sous `rail`, dans `status` (bon.ts).
// Ce sont les deux seules choses lues hors de la forme.
import type { GesteDAttente } from "./attente.ts";
import { ditDe, ticketsDe, type Montree } from "./attend.ts";
import { lieuDe, lignesDuRail, porter, priorite, type Porte } from "./bon.ts";
import { ligneAuTravail, ligneDeTete, ligneEnAttente, ligneEnWaiting, ligneIllisible, ligneLivree, ligneMiseDeCote, ligneQuiMAttend, ligneRepondue, type LigneDeCarte } from "./ligne-carte.ts";
import type { StationDesFaits } from "./ordinaires.ts";
import type { Echec, Lecture } from "./box.ts";
import { capturesDeCarte, type CapturesDeCarte, type CapturesLues, type Moment } from "./captures.ts";
import { carteDeCorrection, correctionsLues, estInforme, type CarteDeCorrection, type CorrectionLue } from "./correction.ts";
import { triageDe, triageLu, type JourDeTriage, type JourLu } from "./triage.ts";
import { reculDe, reculInforme, reculsLus, type Recul, type ReculLu } from "./recul.ts";
import { apprentissageDe, apprentissageInforme, apprentissageLu, ligneOuvrable, type Apprentissage, type ApprentissageLu } from "./apprentissage.ts";
import { carteDeProfil, profilInforme, profilsLus, type CarteDeProfil, type ProfilLu } from "./profil.ts";
import { attenduDe, decisionLue, livraisonLue, teteDe, type Decision, type Livraison as LivraisonAttendue } from "./decision.ts";
import { entete, type Entete } from "./fiche.ts";
import { cuissonDe, type CuissonDuProjet } from "./cuisson.ts";
import { anciennete, cadenceLue, histogramme, type Anciennete, type CadenceLue, type Histogramme } from "./cadence.ts";
import { plafondVu, type PlafondLu, type PlafondVu } from "./plafond-de-calibrage.ts";
import { LABEL_RETENUE } from "./question.ts";
import { carteDeTodo, carteLue, type CarteDeTodo, type CarteLue } from "./carte-todo.ts";
import type { Repondue } from "./repondues.ts";
import type { EnvoiDeCarte } from "./tableau/envois.ts";
import type { PrioriteMontree } from "./priorite.ts";
import type { RailDuProjet } from "../../runtime/src/appairage/rail-du-projet.ts";

export const COMMANDE = "facts";

// Un cook en cours : son ticket, le titre de ce ticket — vide s'il a quitté le
// rail pendant la cuisson —, sa station.
export type Cook = { ticket: number; titre: string; station: string };

// Ce que la cuisine du projet a fait de ses tickets sur une fenêtre, en tickets (runtime/src/activite-cuisine/comptes.ts) :
// servis, renvoyés à un cook, remontés au chef — et la dernière heure et le dernier jour.
export type ComptesDeCuisine = { served: number; sentBack: number; escalated: number };
export type ActiviteCuisine = { lastHour: ComptesDeCuisine; lastDay: ComptesDeCuisine };

// Le champ `activiteCuisine` d'un `facts` : deux fenêtres de trois nombres. Un champ qui n'a pas cette forme n'est pas
// lu — l'onglet Cooks se dessine sans, comme pour un runtime d'avant ce champ.
export function activiteCuisineLue(brut: unknown): ActiviteCuisine | undefined {
  const compte = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
  const fenetre = (valeur: unknown): ComptesDeCuisine | undefined => {
    if (typeof valeur !== "object" || valeur === null) return undefined;
    const { served, sentBack, escalated } = valeur as Record<string, unknown>;
    return compte(served) && compte(sentBack) && compte(escalated) ? { served, sentBack, escalated } : undefined;
  };
  if (typeof brut !== "object" || brut === null) return undefined;
  const lastHour = fenetre((brut as Record<string, unknown>).lastHour);
  const lastDay = fenetre((brut as Record<string, unknown>).lastDay);
  return lastHour === undefined || lastDay === undefined ? undefined : { lastHour, lastDay };
}

// Un rôle de la cuisine du projet (runtime/src/roles-cuisine/roles.ts, ticket 1274) : son nom, la ligne qui dit ce qu'il
// fait, et sa dernière action sur le projet — une courte phrase, son ticket et son heure —, nulle s'il n'a rien fait.
export type ActionDeRole = { what: string; ticket: number | null; at: string };
export type RoleDeCuisine = { role: string; does: string; latest: ActionDeRole | null };

// Le champ `rolesCuisine` d'un `facts` : une liste de rôles. Un rôle qui n'a pas cette forme n'est pas lu, ni une liste
// qui n'en est pas une — l'onglet Cooks se dessine sans, comme pour un runtime d'avant ce champ.
export function rolesCuisineLus(brut: unknown): RoleDeCuisine[] | undefined {
  const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.length > 0;
  const action = (valeur: unknown): ActionDeRole | null | undefined => {
    if (valeur === null) return null;
    if (typeof valeur !== "object") return undefined;
    const { what, ticket, at } = valeur as Record<string, unknown>;
    const numero = ticket === null || (typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket > 0);
    return texte(what) && numero && texte(at) && !Number.isNaN(Date.parse(at)) ? { what, ticket: ticket as number | null, at } : undefined;
  };
  if (!Array.isArray(brut)) return undefined;
  return brut.flatMap((un: unknown) => {
    if (typeof un !== "object" || un === null) return [];
    const { role, does, latest } = un as Record<string, unknown>;
    const lue = action(latest);
    return texte(role) && texte(does) && lue !== undefined ? [{ role, does, latest: lue }] : [];
  });
}

// Ce que coûtent les gates du projet face à son budget (runtime/src/cout-des-gates.ts, ticket 1315) : le budget d'un
// passage, en durée et en processeur — `parLeChef` faux, c'est le défaut —, le dernier passage — nul sans passage ; son
// processeur nul quand il n'a pas été dit —, son dépassement tel que le runtime le juge, les passages des dernières
// 24 h, et le ticket que la cuisine a ouvert seule pour les ramener sous le budget (ticket 1316) — nul sans ticket ouvert.
// Et, d'un runtime qui les donne (ticket 1318), les passages de la dernière heure, ce que coûte un passage en moyenne
// sur l'heure et sur le jour — nul sans passage —, et la tendance de l'heure face au jour — nulle quand l'une manque.
export type FenetreDesGates = { runs: number; durationSeconds: number; cpuSeconds: number };
export type MoyennesDesGates = { durationSeconds: number | null; cpuSeconds: number | null };
export type TendanceDesGates = "up" | "down" | "steady";
export type RecentDesGates = { lastHour: FenetreDesGates; averages: { lastHour: MoyennesDesGates; lastDay: MoyennesDesGates }; trend: { durationSeconds: TendanceDesGates | null; cpuSeconds: TendanceDesGates | null } };
export type BudgetDesGates = { durationSeconds: number; cpuSeconds: number; parLeChef: { durationSeconds: boolean; cpuSeconds: boolean } };
export type PassageDesGates = { durationSeconds: number; cpuSeconds: number | null; at: string };
export type TicketDuBudget = { number: number; openedAt: string };
// Le run complet sur la base, face à son budget à lui : absent d'un runtime d'avant la séparation des deux budgets.
export type CoutDeLaBase = { budget: BudgetDesGates; latest: PassageDesGates | null; overBudget: boolean };
export type CoutDesGates = { budget: BudgetDesGates; latest: PassageDesGates | null; overBudget: boolean; lastDay: FenetreDesGates; ticket: TicketDuBudget | null; base?: CoutDeLaBase } & Partial<RecentDesGates>;

// Le champ `coutDesGates` d'un `facts`. Un champ qui n'a pas cette forme n'est pas lu — la file et l'onglet Cooks se
// dessinent sans, comme pour un runtime d'avant ce champ. Ce que le runtime y met de plus n'est pas repris.
export function coutDesGatesLu(brut: unknown): CoutDesGates | undefined {
  const champs = (valeur: unknown): Record<string, unknown> | undefined => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : undefined);
  const secondes = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;
  const instant = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
  const racine = champs(brut);
  const budget = champs(racine?.budget);
  const pose = champs(budget?.parLeChef);
  const jour = champs(racine?.lastDay);
  if (racine === undefined || budget === undefined || pose === undefined || jour === undefined) return undefined;
  if (!secondes(budget.durationSeconds) || !secondes(budget.cpuSeconds) || typeof pose.durationSeconds !== "boolean" || typeof pose.cpuSeconds !== "boolean") return undefined;
  if (typeof racine.overBudget !== "boolean" || !(typeof jour.runs === "number" && Number.isSafeInteger(jour.runs) && jour.runs >= 0) || !secondes(jour.durationSeconds) || !secondes(jour.cpuSeconds)) return undefined;
  const passage = (valeur: unknown): PassageDesGates | null | undefined => {
    if (valeur === null) return null;
    const lu = champs(valeur);
    if (lu === undefined || !secondes(lu.durationSeconds) || !(lu.cpuSeconds === null || secondes(lu.cpuSeconds)) || !instant(lu.at)) return undefined;
    return { durationSeconds: lu.durationSeconds, cpuSeconds: lu.cpuSeconds, at: lu.at };
  };
  const latest = passage(racine.latest);
  if (latest === undefined) return undefined;
  const budgetLu = (valeur: unknown): BudgetDesGates | undefined => {
    const lu = champs(valeur);
    const posee = champs(lu?.parLeChef);
    return lu !== undefined && posee !== undefined && secondes(lu.durationSeconds) && secondes(lu.cpuSeconds) && typeof posee.durationSeconds === "boolean" && typeof posee.cpuSeconds === "boolean"
      ? { durationSeconds: lu.durationSeconds, cpuSeconds: lu.cpuSeconds, parLeChef: { durationSeconds: posee.durationSeconds, cpuSeconds: posee.cpuSeconds } }
      : undefined;
  };
  // Le run complet sur la base : lu en entier, ou pas du tout — un runtime d'avant ne le donne pas.
  const deLaBase = champs(racine.base);
  const budgetDeLaBase = budgetLu(deLaBase?.budget);
  const dernierDeLaBase = passage(deLaBase?.latest);
  const base: CoutDeLaBase | undefined =
    deLaBase !== undefined && budgetDeLaBase !== undefined && dernierDeLaBase !== undefined && typeof deLaBase.overBudget === "boolean"
      ? { budget: budgetDeLaBase, latest: dernierDeLaBase, overBudget: deLaBase.overBudget }
      : undefined;
  // La dernière heure, les moyennes et la tendance se lisent ensemble, ou pas du tout : un runtime d'avant elles.
  const fenetre = (valeur: unknown): FenetreDesGates | undefined => {
    const lu = champs(valeur);
    return lu !== undefined && typeof lu.runs === "number" && Number.isSafeInteger(lu.runs) && lu.runs >= 0 && secondes(lu.durationSeconds) && secondes(lu.cpuSeconds) ? { runs: lu.runs, durationSeconds: lu.durationSeconds, cpuSeconds: lu.cpuSeconds } : undefined;
  };
  const moyennes = (valeur: unknown): MoyennesDesGates | undefined => {
    const lu = champs(valeur);
    const ouRien = (une: unknown): une is number | null => une === null || secondes(une);
    return lu !== undefined && ouRien(lu.durationSeconds) && ouRien(lu.cpuSeconds) ? { durationSeconds: lu.durationSeconds, cpuSeconds: lu.cpuSeconds } : undefined;
  };
  const sens = (valeur: unknown): valeur is TendanceDesGates | null => valeur === null || valeur === "up" || valeur === "down" || valeur === "steady";
  const heure = fenetre(racine.lastHour);
  const auHeure = moyennes(champs(racine.averages)?.lastHour);
  const auJour = moyennes(champs(racine.averages)?.lastDay);
  const vers = champs(racine.trend);
  const recent: RecentDesGates | undefined =
    heure !== undefined && auHeure !== undefined && auJour !== undefined && vers !== undefined && sens(vers.durationSeconds) && sens(vers.cpuSeconds)
      ? { lastHour: heure, averages: { lastHour: auHeure, lastDay: auJour }, trend: { durationSeconds: vers.durationSeconds, cpuSeconds: vers.cpuSeconds } }
      : undefined;
  let ticket: TicketDuBudget | null = null;
  if (racine.ticket !== null && racine.ticket !== undefined) {
    const lu = champs(racine.ticket);
    if (lu === undefined || !(typeof lu.number === "number" && Number.isSafeInteger(lu.number) && lu.number > 0) || !instant(lu.openedAt)) return undefined;
    ticket = { number: lu.number, openedAt: lu.openedAt };
  }
  return {
    budget: { durationSeconds: budget.durationSeconds, cpuSeconds: budget.cpuSeconds, parLeChef: { durationSeconds: pose.durationSeconds, cpuSeconds: pose.cpuSeconds } },
    latest,
    overBudget: racine.overBudget,
    lastDay: { runs: jour.runs, durationSeconds: jour.durationSeconds, cpuSeconds: jour.cpuSeconds },
    ...(recent ?? {}),
    ...(base === undefined ? {} : { base }),
    ticket,
  };
}

// Un ticket que le bloc `attend` nomme, et ce que `faits` en donne : son titre —
// vide s'il n'est pas sur le rail, le journal ne le connaît pas — et l'adresse de
// son issue, que la box donne : nulle quand elle n'en a pas. L'app n'en compose aucune.
// `decision` : ce que le chef a à trancher, en champs (decision.ts) — absente d'un
// runtime d'avant ce champ.
// `livraison` : pour une livraison qui attend, ce que la pass en a consigné (decision.ts) — absente
// quand elle n'a rien consigné, et d'un runtime d'avant ce champ.
// `carte` : pour une carte entrée par la porte de TODO, sa question, ses choix et ses captures
// (carte-todo.ts) — absente pour toute autre entrée, et d'un runtime d'avant ce champ.
export type Attendu = { ticket: number; titre: string; url: string | null; decision?: Decision; livraison?: LivraisonAttendue; carte?: CarteLue; illisible?: string };

// Un ticket servi dans les 24 h avant la lecture, que la box garde après la
// fermeture de son issue : `livre`, l'heure de son service ; `station`, celle qui
// l'a cuisiné — nulle quand aucune ne l'a envoyé en pass ; `pr`, la PR mergée —
// nulle pour un ticket servi sans merge ; `url`, son issue, nulle quand la box ne
// la connaît pas ; `relecture`, ce que le reviewer a dit de ce qui a été servi —
// nulle quand aucune relecture lisible ne porte dessus, absente d'un runtime
// d'avant ce champ.
// `captures` : pour un ticket d'interface, l'écran avant et après de sa livraison (captures.ts) —
// absentes pour tout autre ticket, et d'un runtime d'avant ce champ.
export type Livre = { ticket: number; titre: string; url: string | null; livre: string; station: string | null; pr: string | null; relecture?: Relecture | null; captures?: CapturesLues; illisible?: string };
// Le résumé du reviewer et ses constats, dans ses mots (runtime/src/reviewer.ts).
export type Constat = { gravite: string; fichier: string | null; constat: string };
export type Relecture = { resume: string; constats: Constat[] };

// Ce que la cuisine fait d'un ticket pris ou en pass : le geste, en mots du chef ;
// ce qu'il vise — un fichier, une commande —, nul s'il ne vise rien ; l'heure où
// elle s'y est mise, à l'horloge de la box.
export type Activite = { fait: string; cible: string | null; depuis: string };

// Ce qu'un ticket mis de côté attend, comme le runtime le dit : `raison` en clair
// (« attend : setup du projet impossible »), `colonne` : celle du rail où il est.
export type Attente = { raison: string; colonne: string; retour: string | null };

// Ce qu'un ticket en WAITING attend d'un tiers, comme le runtime le donne : `quoi`, dans
// les mots du chef ; `qui` ; `depuis`, sa mise en attente, et `relance`, quand y revenir,
// à l'horloge de la box ; `aLArrivee`, ce que « c'est arrivé » fera de lui, en clair. Un ticket mis de côté faute de
// station y est aussi : le chef n'a posé aucune attente, donc `relance` est nulle et la carte n'a rien à reprendre.
export type Tiers = { quoi: string; qui: string; depuis: string; relance: string | null; aLArrivee: string };

// Une décision du chef qui retient toute la cuisine, comme le runtime la donne
// (runtime/src/etat.ts, `DecisionUrgente`) : `decision`, ce qui la nomme en tête
// de sa ligne du bloc `attend` (`#535`, une station, `base`, `setup`) ; `ticket`,
// nul hors ticket ; `cause`, son mot ; `geste`, sa ligne du bloc — ce qui attend,
// puis le geste du chef ; `url`, l'adresse de son issue, nulle sans elle.
export type DecisionUrgente = { decision: string; ticket: number | null; cause: string; geste: string; url: string | null };
// L'urgence : plus rien ne cuit, et c'est le chef que toute la cuisine attend.
// `depuis` : le début de l'arrêt total, à l'horloge de la box ; `retenus` : les
// tickets à l'arrêt ; `autres` : les autres décisions qui en retiennent aussi ;
// `alerte` : celle que le runtime a émise pour cette urgence, nulle tant qu'il ne
// l'a pas annoncée, absente d'un runtime d'avant ce champ.
export type Urgence = DecisionUrgente & { depuis: string; retenus: number[]; autres: DecisionUrgente[]; alerte?: AlerteUrgence | null };
// Une décision du chef qui retient des tickets, et eux seuls : `retenus`, ceux qui l'attendent. Les
// autres tickets cuisent (runtime/src/etat.ts, `Faits.retenues`).
export type Retenue = DecisionUrgente & { retenus: number[] };
// L'alerte d'urgence émise (runtime/src/etat.ts, `AlerteExposee`) : sa ligne, sa
// première émission, la dernière, rappel compris, et le nombre de rappels.
export type AlerteUrgence = { libelle: string; emiseLe: string; derniereLe: string; rappels: number };
// La cuisine oisive (runtime/src/cuisine-oisive.ts, `CuisineOisive`) : `depuis`, le dernier repère d'où l'oisiveté se
// compte, à l'horloge de la box ; `cartes`, les tickets qui devraient cuire, dans l'ordre du rail.
export type CuisineOisive = { depuis: string; cartes: number[] };

// Les appels de la box à GitHub sur la dernière heure : le total, et ce qui en a fait le plus (nul quand rien n'a été appelé).
export type AppelsGithub = { total: number; topProject: { name: string; calls: number } | null; topKind: { name: string; calls: number } | null };

// La forme, telle que le runtime la fige (runtime/src/etat.ts, `Faits`).
// `cooks`, `attend`, `livres`, `urgence` : absents, c'est un runtime d'avant ce
// champ — les seuls que la forme laisse manquer. `urgence` nulle : la
// cuisine n'attend pas le chef tout entière — une décision qui ne retient qu'une partie
// du rail n'en est pas une.
export type Faits = {
  etat: string;
  lu: string;
  dernierTick: string | null;
  // Quand GitHub limite les appels du compte : l'instant où il les rend (runtime, `limiteGithub`) ; absent sinon, et d'un runtime d'avant ce champ.
  limiteGithub?: string;
  // Les appels de la box à GitHub sur l'heure glissante (runtime, `appelsGithub`) : leur total, le projet et la lecture qui en ont fait le plus ; absent d'un runtime d'avant ce champ.
  appelsGithub?: AppelsGithub;
  compteurs: { rail: number; auTravail: number; aLaPass: number; attend: number; livres24h: number };
  dernierEvenement: { seq: number; at: string; type: string; ticket: number | null } | null;
  // `activite` : nulle, la box ne sait pas ce qu'on en fait ; absente, c'est un
  // runtime d'avant ce champ.
  // `attente` : pour un ticket mis de côté (86), sa raison en clair, la colonne où il
  // attend et l'heure de son retour — nulle pour un autre, absente d'un runtime d'avant.
  // `tiers` : pour un ticket en WAITING, ce qu'il attend d'un tiers — nul pour un autre,
  // absent d'un runtime d'avant WAITING.
  // `revenu` : pourquoi un ticket est revenu de WAITING (« relance du 21/10 : pas de
  // réponse », « nouveau sur l'issue — de … »), dans les mots du runtime — nul pour un
  // autre, et pour un ticket que le chef a repris lui-même ; absent d'un runtime d'avant.
  // `captures` : pour un ticket d'interface en pass ou servi, l'écran avant et après de sa
  // dernière livraison (captures.ts) — absentes pour tout autre ticket.
  // `raison` : pour le ticket en tête de la file seulement, s'il ne part pas, pourquoi, dans les mots du runtime
  // (`zone held by #12 (src)`, `machine saturated`) — nulle pour tout autre, absente d'un runtime d'avant ce champ.
  // `depuis` : l'heure de son entrée dans cet état — sa prise, son entrée en pass… (#1811) ; absent d'un runtime d'avant.
  // Le rail est dans l'ordre où il se sert : la priorité de l'issue, puis son âge.
  rail: { ticket: number; etat: string; titre: string; url: string; depuis?: string; activite?: Activite | null; attente?: Attente | null; tiers?: Tiers | null; revenu?: string | null; raison?: string | null; captures?: CapturesLues; illisible?: string }[];
  cooks?: Cook[];
  attend?: Attendu[];
  livres?: Livre[];
  urgence?: Urgence | null;
  // Les décisions du chef qui retiennent des tickets sans arrêter la cuisine : absent, c'est un
  // runtime d'avant ce champ.
  retenues?: Retenue[];
  // La cuisine oisive, des cartes sur le rail (runtime/src/cuisine-oisive.ts, #1862) : la ligne `fault` de `status`.
  // Nulle quand la panne ne tient pas ; absent d'un runtime d'avant ce champ.
  cuisineOisive?: CuisineOisive | null;
  // Les stations que le projet déclare et ce qu'elles font des tickets ordinaires (ordinaires.ts) ; absent d'un runtime d'avant ce champ.
  stations?: StationDesFaits[];
  // Le plafond de calibrage du manager, et si le chef l'a posé (plafond-de-calibrage.ts) ; absent d'un runtime
  // d'avant ce champ.
  plafondDeCalibrage?: PlafondLu;
  // Ce que le triage a fait chacun des sept derniers jours (UTC), le plus ancien d'abord (triage.ts) ; absent d'un runtime d'avant ce champ.
  triage?: JourLu[];
  // Ce que la cuisine du projet a servi, renvoyé et remonté au chef dans la dernière heure et le dernier jour (ticket
  // 1272) : six nombres, à zéro sans activité ; absent d'un runtime d'avant ce champ.
  activiteCuisine?: ActiviteCuisine;
  // À quelle allure elle sert (cadence.ts, ticket 1811) : servis et ratés heure par heure sur les 24 dernières, et le temps
  // ordinaire d'un ticket pris, puis en pass ; absent d'un runtime d'avant ce champ.
  cadence?: CadenceLue;
  // Les rôles de la cuisine du projet, chacun avec sa ligne et sa dernière action (ticket 1274) ; absent d'un runtime
  // d'avant ce champ.
  rolesCuisine?: RoleDeCuisine[];
  // Ce que coûtent les gates du projet face à son budget, et le ticket que la cuisine a ouvert seule (ticket 1318) ;
  // absent d'un runtime d'avant ce champ.
  coutDesGates?: CoutDesGates;
  // Les corrections proposées des consignes du projet, que le chef tranche (correction.ts) : absent
  // quand il n'y en a aucune, et d'un runtime d'avant ce champ.
  corrections?: CorrectionLue[];
  // Ce que chaque correction acceptée a fait de sa cause, avant et après son merge (recul.ts) : absent
  // quand aucune n'a été acceptée, et d'un runtime d'avant ce champ.
  reculs?: ReculLu[];
  // Les profils de cook proposés, que le chef tranche (profil.ts) : absent quand il n'y en a aucun, et
  // d'un runtime d'avant ce champ.
  profils?: ProfilLu[];
  // Ce que les cooks ont appris au projet, ses leçons et ses profils (apprentissage.ts) : absent quand il
  // n'a ni leçon ni profil, et d'un runtime d'avant ce champ.
  apprentissage?: ApprentissageLu;
};

// Ce que la vue dessine d'un projet, prêt à poser : elle n'y calcule rien.
// `ton` : la couleur du mot d'état — absente, le mot n'est pas de la liste fermée.
// `arretee` : la bannière d'arrêt se pose.
// Une carte du rail : `ouvrable`, ce ticket s'ouvre sur son issue ; `attendu`, il
// attend une décision du chef, et il est dans TODO ; `attend`, ce que le bloc
// `attend` dit de lui, entrée par entrée, mot pour mot — une entrée et ce qui la
// précise dessous d'un seul tenant, ses lignes comprises. Sans `etat` ni `titre` :
// il attend, et il n'est pas sur le rail que `faits` rend. Et ce qu'elle porte de
// la file (bon.ts) : ce qu'elle dit du ticket, ce qu'elle n'en dit pas, sa ligne
// telle quelle quand l'app n'a pas su la découper. Dans Livré, `pr` : la PR mergée
// du ticket s'ouvre — faux, son adresse n'est pas en https ; absent, il n'en a pas.
// Et `livraison` : ce qui a été livré. `fiche` : l'en-tête de sa fiche, qu'un clic sur
// la carte ouvre par-dessus le rail (fiche.ts) — pour une carte qui t'attend, ce qu'on attend
// de toi, en une phrase (decision.ts). `decision` : ce que `faits` en donne, d'où se lisent
// cette phrase et les gestes de la fiche ; absente d'un runtime d'avant ce champ. `gestes` : ceux de WAITING que la carte
// porte (attente.ts) — « waiting for… » sur une carte de TODO que le runtime laisse attendre,
// « resume » et « it arrived » sur une carte de WAITING ; absent, elle n'en porte aucun.
// `captures` : celles d'un ticket d'interface livré, avant et après (captures.ts) — absentes,
// le ticket n'est pas d'interface ou n'a rien livré, et la carte n'en dit rien.
// `question` : sur une carte de TODO, son issue porte une question du manager — avant de découper
// une épique, ou qui la retient (`blocked-on-human`) —, que la carte dit en deux lignes (question.ts).
// `todo` : sur une carte de TODO entrée par la porte du runtime, sa question, ses choix et ses captures
// (carte-todo.ts) — ce que le chef tranche sur la carte même, d'un clic ou d'un texte.
// `repondue` : sur une carte de WAITING, sa question est répondue, et elle attend que le manager lise
// la réponse (repondues.ts) — qui y a répondu, et quand.
// `prio` : sa priorité, telle que sa ligne de `status` l'écrit (`prio:2`), `no prio` quand son issue n'en porte
// pas — absente, la ligne n'est pas lue.
// `age` : sur une carte de Taken ou de Pass, depuis combien de temps elle y est (cadence.ts) — absent pour une autre, et
// d'un runtime qui ne dit pas l'entrée du ticket dans sa colonne.
// Et ce qu'elle dit, elle, en deux lignes (ligne-carte.ts) : `ligne`, ce qui se passe ; `signal`, ce qui demande
// l'attention ; `repere`, la file ne dit pas tout — le détail est dans la fiche, avec `dit` et `sans`.
export type Carte = Partial<LigneDeCarte> & { ticket: number; etat?: string; ton?: string; titre?: string; ouvrable: boolean; attendu: boolean; attend: string[]; decision?: Decision; pr?: boolean; livraison?: Livraison; captures?: CapturesDeCarte; fiche: Entete; gestes?: GesteDAttente[]; question?: true; todo?: CarteDeTodo; repondue?: { par: string; a: string }; prio?: string; age?: Anciennete } & Porte;
// Ce qui a été livré, sur une carte de Livré : le résumé de la relecture, mot pour
// mot, et ses constats sous leur nombre dit en clair (`remarques`) — ou, sans
// relecture, pourquoi elle n'est pas là. Rien n'est mis à sa place.
export type Livraison = { resume: string; remarques: string; constats: Constat[] } | { sans: string };
// `compte` : le nombre de ses cartes — ou `?`, pour TODO, tant que rien ne dit
// qui attend. `vide` : ce qui se lit à la place des cartes quand il n'y en a pas.
// `defile` : ses cartes défilent dans une hauteur bornée — longue, la colonne ne
// pousse rien sous les autres.
export type Colonne = { nom: string; ton: string; compte: string; cartes: Carte[]; vide: string; defile?: true };
// `hors` : les tickets que `faits` rend et qu'aucune colonne ne prend. `attendLu` :
// l'heure de la lecture de `status` dont vient le bloc — absente, il n'a pas été pris.
// `railLu` : celle dont viennent les lignes que les cartes portent — absente, la
// ligne `rail` de `status` n'a pas été lue. `aucunTicket` : aucune carte, hors Livré — rien à
// cuire, rien en cuisson, rien qui t'attende : c'est là que se dit ce qui est en amont (amont.ts).
// `corrections` : les corrections proposées des consignes du projet, chacune une carte de la file que
// le chef tranche d'un « yes » ou d'un « no » (correction.ts), la plus ancienne d'abord — absent
// quand il n'y en a aucune.
// `profils` : les profils de cook proposés, chacun une carte de la file que le chef tranche de même
// (profil.ts), le plus ancien d'abord — absent quand il n'y en a aucun.
// `cadence` : l'histogramme des 24 dernières heures, servis et ratés (cadence.ts) — absent d'un runtime d'avant ce champ.
export type Rail = { colonnes: Colonne[]; hors: Carte[]; aucunTicket?: true; attendLu?: string; railLu?: string; corrections?: CarteDeCorrection[]; profils?: CarteDeProfil[]; cadence?: Histogramme };
// Le bloc `attend` d'un projet, tel que `status` l'a écrit, et l'heure de sa lecture.
export type BlocLu = { bloc: string; a: string };
// Ce que `status` a rendu pour un projet, son bloc `attend` mis à part, et l'heure de sa lecture.
export type StatusLu = { texte: string; a: string };
// La panne que la tête du rail pose en rouge : sa ligne, et son survol.
export type Panne = { dit: string; survol: string };
// `vide` : ce qui se lit à la place des cooks quand il n'y en a pas à poser.
export type Tableau = {
  etat: string;
  ton?: string;
  arretee: boolean;
  tick: string;
  compteurs: { libelle: string; nombre: number }[];
  cooks: { enCours: Cook[]; vide: string };
  evenement: string;
  // La ligne « nothing cooks: base red since …, repair #N in progress » (« rien ne cuit : base rouge depuis …, réparation #N en cours » avant #928) que `status` écrit
  // en tête, mot pour mot — absente quand `status` n'est pas lu ou ne la porte pas.
  rienNeCuit?: string;
  // La panne d'une cuisine oisive, des cartes sur le rail (#1863) : la tête du rail la pose en rouge — `dit`, sa
  // ligne ; `survol`, ce qu'elle sait de plus. Absente quand `facts` ne la porte pas.
  panne?: Panne;
  rail: Rail;
  // Ce que chaque station du projet en fait, ses cooks et son geste, et la ligne d'alerte de l'onglet Rail
  // (cuisson.ts) — absent d'un runtime qui ne donne pas les stations.
  stations?: CuissonDuProjet;
  // Le plafond de calibrage du projet, d'où vient sa valeur, et de quoi le régler (plafond-de-calibrage.ts) —
  // absent d'un runtime qui ne le donne pas.
  plafondDeCalibrage?: PlafondVu;
  // Ce que le triage a fait chaque jour, le plus récent d'abord : la file le pose en tête (triage.ts) — absent d'un runtime qui ne le donne pas.
  triage?: JourDeTriage[];
  // Les six nombres de la cuisine du projet, en tête de l'onglet Cooks — absent d'un runtime qui ne les donne pas.
  activiteCuisine?: ActiviteCuisine;
  // Les rôles de la cuisine du projet, sur l'onglet Cooks — absent d'un runtime qui ne les donne pas.
  rolesCuisine?: RoleDeCuisine[];
  // Ce que coûtent les gates du projet face à son budget : la file le pose en tête, l'onglet Cooks ses 24 h (ticket
  // 1318) — absent d'un runtime qui ne le donne pas.
  coutDesGates?: CoutDesGates;
  // Ce que chaque correction acceptée des consignes du projet a fait de sa cause, avant et après son
  // merge (recul.ts), la plus ancienne d'abord : la page Reliability la pose. Absent quand il n'y en a aucune.
  reculs?: Recul[];
  // Ce que les cooks ont appris au projet (apprentissage.ts) : ses leçons et ses profils, que la page
  // Reliability pose sous les causes corrigées — vides, elle le dit en une phrase.
  apprentissage: Apprentissage;
};

// Ce qu'une lecture de `faits` donne à la vue : le tableau ; ou, sous un `titre`
// qui dit lequel, ce que la box a `rendu` à la place des faits, mot pour mot, et
// en quoi ce n'est pas la forme (`informe`) ; ou l'échec de la veille, tel quel.
export type Dessinable = { projet: string; demande: number; a: string } & ({ tableau: Tableau } | { titre: string; informe: string; rendu: string } | ({ titre: string } & Echec));

class Informe extends Error {}

// Un élément d'une liste que l'app ne sait pas lire — une valeur d'une box plus récente — ne gâte que sa carte : son
// numéro seul est exigé, car sans lui il n'y a pas de carte. `rendre` en lit la forme ; `sinon`, la carte qu'on en
// dessine à la place, avec la raison de l'échec.
export const ILLISIBLE_ETAT = "unreadable";
const sansNumero = (lu: Record<string, unknown>, lequel: string) => ({ ticket: entier(lu.ticket, `${lequel}.ticket`), titre: typeof lu.titre === "string" ? lu.titre : "" });
function sauf<T>(lu: Record<string, unknown>, lequel: string, rendre: () => T, sinon: (base: { ticket: number; titre: string }, raison: string) => T): T {
  const base = sansNumero(lu, lequel);
  try {
    return rendre();
  } catch (erreur) {
    if (erreur instanceof Informe || estInforme(erreur) || reculInforme(erreur) || profilInforme(erreur) || apprentissageInforme(erreur)) return sinon(base, erreur.message);
    throw erreur;
  }
}

const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`“${champ}” is not ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "an object");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "a string"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "a non-negative integer"));
const heure = (valeur: unknown, champ: string): string => (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)) ? valeur : refuser(champ, "a time"));
const ouRien = <T>(valeur: unknown, champ: string, lire: (valeur: unknown, champ: string) => T): T | null => (valeur === null ? null : lire(valeur, champ));
const booleen = (valeur: unknown, champ: string): boolean => (typeof valeur === "boolean" ? valeur : refuser(champ, "true or false"));

const nomme = (valeur: unknown, champ: string): { name: string; calls: number } => {
  const lu = objet(valeur, champ);
  return { name: texte(lu.name, `${champ}.name`), calls: entier(lu.calls, `${champ}.calls`) };
};
const appelsLus = (valeur: unknown): AppelsGithub => {
  const lu = objet(valeur, "appelsGithub");
  return { total: entier(lu.total, "appelsGithub.total"), topProject: ouRien(lu.topProject, "appelsGithub.topProject", nomme), topKind: ouRien(lu.topKind, "appelsGithub.topKind", nomme) };
};

// Une station que le projet déclare, et ce qu'elle fait des tickets ordinaires (ordinaires.ts).
function plafondLu(valeur: unknown): PlafondLu {
  const lu = objet(valeur, "plafondDeCalibrage");
  const pose = objet(lu.parLeChef, "plafondDeCalibrage.parLeChef");
  return {
    modele: texte(lu.modele, "plafondDeCalibrage.modele"),
    effort: texte(lu.effort, "plafondDeCalibrage.effort"),
    parLeChef: { modele: booleen(pose.modele, "plafondDeCalibrage.parLeChef.modele"), effort: booleen(pose.effort, "plafondDeCalibrage.parLeChef.effort") },
  };
}

function comprendreStation(valeur: unknown, champ: string): StationDesFaits {
  const lu = objet(valeur, champ);
  return {
    station: texte(lu.station, `${champ}.station`),
    distante: booleen(lu.distante, `${champ}.distante`),
    plafond: ouRien(lu.plafond, `${champ}.plafond`, entier),
    ordinaires: booleen(lu.ordinaires, `${champ}.ordinaires`),
    bacASable: ouRien(lu.bacASable, `${champ}.bacASable`, (bac, lequel) => {
      const dit = objet(bac, lequel);
      return {
        disponible: booleen(dit.disponible, `${lequel}.disponible`),
        raison: ouRien(dit.raison, `${lequel}.raison`, texte),
        version: ouRien(dit.version, `${lequel}.version`, texte),
        depuis: heure(dit.depuis, `${lequel}.depuis`),
      };
    }),
    prendOrdinaires: booleen(lu.prendOrdinaires, `${champ}.prendOrdinaires`),
    // Ce que la station fait du projet (#1183) : absent d'un runtime d'avant ce champ.
    ...(lu.cuisson === undefined ? {} : { cuisson: texte(lu.cuisson, `${champ}.cuisson`) }),
    ...(lu.arreteeDepuis === undefined ? {} : { arreteeDepuis: ouRien(lu.arreteeDepuis, `${champ}.arreteeDepuis`, heure) }),
    ...(lu.refus === undefined
      ? {}
      : {
          refus: ouRien(lu.refus, `${champ}.refus`, (refus, lequel) => {
            const dit = objet(refus, lequel);
            return { code: texte(dit.code, `${lequel}.code`), message: texte(dit.message, `${lequel}.message`), action: texte(dit.action, `${lequel}.action`) };
          }),
        }),
    ...(lu.cooks === undefined
      ? {}
      : {
          cooks: (Array.isArray(lu.cooks) ? lu.cooks : refuser(`${champ}.cooks`, "a list")).map((cook: unknown, rang) => {
            const lequel = `${champ}.cooks[${rang}]`;
            const dit = objet(cook, lequel);
            return { ticket: entier(dit.ticket, `${lequel}.ticket`), titre: texte(dit.titre, `${lequel}.titre`), station: texte(dit.station, `${lequel}.station`) };
          }),
        }),
    // Ce que la principale sait d'elle (#1830) : absent d'un runtime d'avant ces champs.
    ...(lu.fournit === undefined ? {} : { fournit: (Array.isArray(lu.fournit) ? lu.fournit : refuser(`${champ}.fournit`, "a list")).map((capacite: unknown, rang) => texte(capacite, `${champ}.fournit[${rang}]`)) }),
    ...(lu.presente === undefined ? {} : { presente: booleen(lu.presente, `${champ}.presente`) }),
    ...(lu.vueLe === undefined ? {} : { vueLe: ouRien(lu.vueLe, `${champ}.vueLe`, heure) }),
  };
}

// Ce que la cuisine fait d'un ticket : un geste, ce qu'il vise ou rien, une heure.
function comprendreActivite(valeur: unknown, champ: string): Activite {
  const lu = objet(valeur, champ);
  return { fait: texte(lu.fait, `${champ}.fait`), cible: ouRien(lu.cible, `${champ}.cible`, texte), depuis: heure(lu.depuis, `${champ}.depuis`) };
}

// Ce que le reviewer a dit d'une livraison servie : son résumé, ses constats dans son ordre.
function comprendreRelecture(valeur: unknown, champ: string): Relecture {
  const lu = objet(valeur, champ);
  return {
    resume: texte(lu.resume, `${champ}.resume`),
    constats: (Array.isArray(lu.constats) ? lu.constats : refuser(`${champ}.constats`, "une liste")).map((brut: unknown, rang) => {
      const lequel = `${champ}.constats[${rang}]`;
      const constat = objet(brut, lequel);
      return { gravite: texte(constat.gravite, `${lequel}.gravite`), fichier: ouRien(constat.fichier, `${lequel}.fichier`, texte), constat: texte(constat.constat, `${lequel}.constat`) };
    }),
  };
}

function comprendreDecision(valeur: unknown, champ: string): DecisionUrgente {
  const lu = objet(valeur, champ);
  return {
    decision: texte(lu.decision, `${champ}.decision`),
    ticket: ouRien(lu.ticket, `${champ}.ticket`, entier),
    cause: texte(lu.cause, `${champ}.cause`),
    geste: texte(lu.geste, `${champ}.geste`),
    url: ouRien(lu.url, `${champ}.url`, texte),
  };
}

// L'urgence : la décision qui retient le plus de tickets, depuis quand tout est à l'arrêt,
// les tickets retenus, les autres décisions.
function comprendreUrgence(valeur: unknown, champ: string): Urgence {
  const lu = objet(valeur, champ);
  const liste = (brut: unknown, nom: string): unknown[] => (Array.isArray(brut) ? brut : refuser(nom, "a list"));
  return {
    ...comprendreDecision(lu, champ),
    depuis: heure(lu.depuis, `${champ}.depuis`),
    retenus: liste(lu.retenus, `${champ}.retenus`).map((ticket, rang) => entier(ticket, `${champ}.retenus[${rang}]`)),
    autres: liste(lu.autres, `${champ}.autres`).map((autre, rang) => comprendreDecision(autre, `${champ}.autres[${rang}]`)),
    ...(lu.alerte === undefined ? {} : { alerte: ouRien(lu.alerte, `${champ}.alerte`, comprendreAlerteUrgence) }),
  };
}

function comprendreRetenue(valeur: unknown, champ: string): Retenue {
  const lu = objet(valeur, champ);
  const retenus = Array.isArray(lu.retenus) ? lu.retenus : refuser(`${champ}.retenus`, "a list");
  return { ...comprendreDecision(lu, champ), retenus: retenus.map((ticket: unknown, rang: number) => entier(ticket, `${champ}.retenus[${rang}]`)) };
}

// La cuisine oisive : depuis quand, et les cartes qui devraient cuire.
function comprendreCuisineOisive(valeur: unknown, champ: string): CuisineOisive {
  const lu = objet(valeur, champ);
  const cartes = Array.isArray(lu.cartes) ? lu.cartes : refuser(`${champ}.cartes`, "a list");
  return { depuis: heure(lu.depuis, `${champ}.depuis`), cartes: cartes.map((ticket: unknown, rang: number) => entier(ticket, `${champ}.cartes[${rang}]`)) };
}

// L'alerte émise pour l'urgence : sa ligne, ses deux heures, ses rappels.
function comprendreAlerteUrgence(valeur: unknown, champ: string): AlerteUrgence {
  const lu = objet(valeur, champ);
  return {
    libelle: texte(lu.libelle, `${champ}.libelle`),
    emiseLe: heure(lu.emiseLe, `${champ}.emiseLe`),
    derniereLe: heure(lu.derniereLe, `${champ}.derniereLe`),
    rappels: entier(lu.rappels, `${champ}.rappels`),
  };
}

// Les captures d'une livraison d'interface : si elle les porte toutes, et chaque écran avec
// l'adresse de sa capture avant et de sa capture après, nulle quand elle manque.
function comprendreCaptures(brut: unknown, lequel: string): CapturesLues {
  const lu = objet(brut, lequel);
  if (typeof lu.complet !== "boolean") refuser(`${lequel}.complet`, "a boolean");
  return {
    complet: lu.complet as boolean,
    ecrans: (Array.isArray(lu.ecrans) ? lu.ecrans : refuser(`${lequel}.ecrans`, "a list")).map((ecran: unknown, rang) => {
      const sien = `${lequel}.ecrans[${rang}]`;
      const lue = objet(ecran, sien);
      return { ecran: texte(lue.ecran, `${sien}.ecran`), avant: ouRien(lue.avant, `${sien}.avant`, texte), apres: ouRien(lue.apres, `${sien}.apres`, texte) };
    }),
  };
}

function comprendreAttente(brut: unknown, lequel: string): Attente {
  const lu = objet(brut, lequel);
  return { raison: texte(lu.raison, `${lequel}.raison`), colonne: texte(lu.colonne, `${lequel}.colonne`), retour: ouRien(lu.retour, `${lequel}.retour`, texte) };
}

function comprendreTiers(brut: unknown, lequel: string): Tiers {
  const lu = objet(brut, lequel);
  return {
    quoi: texte(lu.quoi, `${lequel}.quoi`),
    qui: texte(lu.qui, `${lequel}.qui`),
    depuis: heure(lu.depuis, `${lequel}.depuis`),
    relance: ouRien(lu.relance, `${lequel}.relance`, heure),
    aLArrivee: texte(lu.aLArrivee, `${lequel}.aLArrivee`),
  };
}

// La sortie de `faits`, champ pour champ — ou en quoi elle n'est pas la forme.
// Rien n'y est complété : un champ qui manque refuse la forme entière — sauf
// `cooks`, `attend`, `livres`, `urgence`, `cuisineOisive` et l'`activite`,
// l'`attente` et les `tiers` d'un ticket, qu'un runtime d'avant eux ne rend pas,
// et qui manquent alors ici aussi — et `corrections`, `reculs` et `profils`, absents quand il n'y en a aucun,
// comme `apprentissage` quand le projet n'a ni leçon ni profil.
// Un champ de plus est laissé de côté, un mot d'état inconnu est gardé.
export function comprendre(sortie: string): Faits | { informe: string } {
  if (sortie.trim() === "") return { informe: "the command returned nothing" };
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return { informe: "this is not JSON" };
  }
  try {
    const racine = typeof lu === "object" && lu !== null && !Array.isArray(lu) ? (lu as Record<string, unknown>) : refuser("the output", "an object");
    const compteurs = objet(racine.compteurs, "compteurs");
    const evenement = ouRien(racine.dernierEvenement, "dernierEvenement", objet);
    return {
      etat: texte(racine.etat, "etat"),
      lu: heure(racine.lu, "lu"),
      dernierTick: ouRien(racine.dernierTick, "dernierTick", heure),
      ...(racine.limiteGithub === undefined ? {} : { limiteGithub: heure(racine.limiteGithub, "limiteGithub") }),
      ...(racine.appelsGithub === undefined ? {} : { appelsGithub: appelsLus(racine.appelsGithub) }),
      compteurs: {
        rail: entier(compteurs.rail, "compteurs.rail"),
        auTravail: entier(compteurs.auTravail, "compteurs.auTravail"),
        aLaPass: entier(compteurs.aLaPass, "compteurs.aLaPass"),
        attend: entier(compteurs.attend, "compteurs.attend"),
        livres24h: entier(compteurs.livres24h, "compteurs.livres24h"),
      },
      dernierEvenement:
        evenement === null
          ? null
          : {
              seq: entier(evenement.seq, "dernierEvenement.seq"),
              at: heure(evenement.at, "dernierEvenement.at"),
              type: texte(evenement.type, "dernierEvenement.type"),
              ticket: ouRien(evenement.ticket, "dernierEvenement.ticket", entier),
            },
      rail: (Array.isArray(racine.rail) ? racine.rail : refuser("rail", "a list")).map((ticket: unknown, rang) => {
        const lequel = `rail[${rang}]`;
        const lu = objet(ticket, lequel);
        return sauf(lu, lequel, () => ({
          ticket: entier(lu.ticket, `${lequel}.ticket`),
          etat: texte(lu.etat, `${lequel}.etat`),
          titre: texte(lu.titre, `${lequel}.titre`),
          url: texte(lu.url, `${lequel}.url`),
          ...(lu.depuis === undefined ? {} : { depuis: heure(lu.depuis, `${lequel}.depuis`) }),
          ...(lu.activite === undefined ? {} : { activite: ouRien(lu.activite, `${lequel}.activite`, comprendreActivite) }),
          ...(lu.attente === undefined ? {} : { attente: ouRien(lu.attente, `${lequel}.attente`, comprendreAttente) }),
          ...(lu.tiers === undefined ? {} : { tiers: ouRien(lu.tiers, `${lequel}.tiers`, comprendreTiers) }),
          ...(lu.revenu === undefined ? {} : { revenu: ouRien(lu.revenu, `${lequel}.revenu`, texte) }),
          ...(lu.raison === undefined ? {} : { raison: ouRien(lu.raison, `${lequel}.raison`, texte) }),
          ...(lu.captures === undefined ? {} : { captures: comprendreCaptures(lu.captures, `${lequel}.captures`) }),
        }), ({ ticket, titre }, illisible) => ({ ticket, etat: ILLISIBLE_ETAT, titre, url: "", illisible }));
      }),
      ...(racine.cooks === undefined
        ? {}
        : {
            cooks: (Array.isArray(racine.cooks) ? racine.cooks : refuser("cooks", "a list")).map((cook: unknown, rang) => {
              const lequel = `cooks[${rang}]`;
              const lu = objet(cook, lequel);
              return { ticket: entier(lu.ticket, `${lequel}.ticket`), titre: texte(lu.titre, `${lequel}.titre`), station: texte(lu.station, `${lequel}.station`) };
            }),
          }),
      ...(racine.attend === undefined
        ? {}
        : {
            attend: (Array.isArray(racine.attend) ? racine.attend : refuser("attend", "a list")).map((attendu: unknown, rang) => {
              const lequel = `attend[${rang}]`;
              const lu = objet(attendu, lequel);
              return sauf<Attendu>(lu, lequel, () => {
              const decision = lu.decision === undefined ? undefined : (decisionLue(lu.decision) ?? refuser(`${lequel}.decision`, "a decision"));
              const livraison = lu.livraison === undefined ? undefined : livraisonLue(lu.livraison);
              const carte = lu.carte === undefined ? undefined : carteLue(lu.carte);
              return { ticket: entier(lu.ticket, `${lequel}.ticket`), titre: texte(lu.titre, `${lequel}.titre`), url: ouRien(lu.url, `${lequel}.url`, texte), ...(decision === undefined ? {} : { decision }), ...(livraison === undefined ? {} : { livraison }), ...(carte === undefined ? {} : { carte }) };
              }, ({ ticket, titre }, illisible) => ({ ticket, titre, url: null, illisible }));
            }),
          }),
      ...(racine.livres === undefined
        ? {}
        : {
            livres: (Array.isArray(racine.livres) ? racine.livres : refuser("livres", "a list")).map((livre: unknown, rang) => {
              const lequel = `livres[${rang}]`;
              const lu = objet(livre, lequel);
              return sauf<Livre>(lu, lequel, () => ({
                ticket: entier(lu.ticket, `${lequel}.ticket`),
                titre: texte(lu.titre, `${lequel}.titre`),
                url: ouRien(lu.url, `${lequel}.url`, texte),
                livre: heure(lu.livre, `${lequel}.livre`),
                station: ouRien(lu.station, `${lequel}.station`, texte),
                pr: ouRien(lu.pr, `${lequel}.pr`, texte),
                ...(lu.relecture === undefined ? {} : { relecture: ouRien(lu.relecture, `${lequel}.relecture`, comprendreRelecture) }),
                ...(lu.captures === undefined ? {} : { captures: comprendreCaptures(lu.captures, `${lequel}.captures`) }),
              }), ({ ticket, titre }, illisible) => ({ ticket, titre, url: null, livre: heure(racine.lu, "lu"), station: null, pr: null, illisible }));
            }),
          }),
      ...(racine.urgence === undefined ? {} : { urgence: ouRien(racine.urgence, "urgence", comprendreUrgence) }),
      ...(racine.cuisineOisive === undefined ? {} : { cuisineOisive: ouRien(racine.cuisineOisive, "cuisineOisive", comprendreCuisineOisive) }),
      ...(racine.retenues === undefined ? {} : { retenues: (Array.isArray(racine.retenues) ? racine.retenues : refuser("retenues", "a list")).map((r: unknown, rang: number) => comprendreRetenue(r, `retenues[${rang}]`)) }),
      ...(racine.stations === undefined
        ? {}
        : { stations: (Array.isArray(racine.stations) ? racine.stations : refuser("stations", "a list")).map((station: unknown, rang) => comprendreStation(station, `stations[${rang}]`)) }),
      ...(racine.plafondDeCalibrage === undefined ? {} : { plafondDeCalibrage: plafondLu(racine.plafondDeCalibrage) }),
      ...(triageLu(racine.triage) === undefined ? {} : { triage: triageLu(racine.triage) }),
      ...(activiteCuisineLue(racine.activiteCuisine) === undefined ? {} : { activiteCuisine: activiteCuisineLue(racine.activiteCuisine) }),
      ...(cadenceLue(racine.cadence) === undefined ? {} : { cadence: cadenceLue(racine.cadence) }),
      ...(rolesCuisineLus(racine.rolesCuisine) === undefined ? {} : { rolesCuisine: rolesCuisineLus(racine.rolesCuisine) }),
      ...(coutDesGatesLu(racine.coutDesGates) === undefined ? {} : { coutDesGates: coutDesGatesLu(racine.coutDesGates) }),
      ...(racine.corrections === undefined ? {} : { corrections: correctionsLues(racine.corrections) }),
      ...(racine.reculs === undefined ? {} : { reculs: reculsLus(racine.reculs) }),
      ...(racine.profils === undefined ? {} : { profils: profilsLus(racine.profils) }),
      ...(racine.apprentissage === undefined ? {} : { apprentissage: apprentissageLu(racine.apprentissage) }),
    };
  } catch (erreur) {
    if (erreur instanceof Informe || estInforme(erreur) || reculInforme(erreur) || profilInforme(erreur) || apprentissageInforme(erreur)) return { informe: erreur.message };
    throw erreur;
  }
}

// Ce que l'app dit d'une lecture de `faits` en échec : le même cas que sous
// `status` (vue.js, `rendre`), avec les mêmes mots — le code de sortie le
// choisit. Sans cas, sur une box jointe, c'est `faits` qui n'a pas répondu : un
// runtime d'avant cette commande.
const TITRES: Readonly<Record<Exclude<Echec["cas"], null | "ssh-en-echec">, string>> = {
  "projet-inconnu": "REACHED, BUT UNKNOWN TO THE STATION",
  "sans-droit": "REACHED, BUT WITHOUT THE RIGHT TO THE ACTION",
  "commande-manque": "REACHED, BUT A COMMAND IS MISSING ON THE STATION",
  "node-inapte": "REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME",
};
// Une lecture qui n'a pas joint GitHub du tout (tableau/lecture.ts, `horsLigne`) : l'app est hors ligne, une seule cause
// pour tout ce qu'elle lit (#1818). Rien de ce qui était lu ne s'en efface, et rien n'y est une panne.
export const estHorsLigne = (lecture: object): boolean => "horsLigne" in lecture && lecture.horsLigne === true;

// `sansReponse` : ce qui se dit d'une box jointe dont le code ne dit aucun cas — pour une autre commande que `facts`.
export function titreDEchec({ cas, atteinte, duTableau }: Echec, sansReponse = "REACHED, BUT `facts` DID NOT ANSWER"): string {
  // Lue du tableau de la cuisine (#1694) : aucune station n'a été jointe, c'est GitHub ou le tableau qui n'a pas dit.
  if (duTableau === true) return "NOT READ FROM THE KITCHEN BOARD";
  if (cas !== null && cas !== "ssh-en-echec") return TITRES[cas];
  return atteinte ? sansReponse : "NOT REACHED";
}

// Les réponses du chef aux cartes de TODO qu'une lecture du tableau de la cuisine porte (tableau/envois.ts), par
// ticket — aucune d'une lecture qui ne les porte pas.
function envoisDe(lecture: Lecture): ReadonlyMap<number, EnvoiDeCarte> | undefined {
  if (!("envois" in lecture) || !Array.isArray(lecture.envois)) return undefined;
  return new Map((lecture.envois as EnvoiDeCarte[]).map((envoi) => [envoi.ticket, envoi]));
}

// Une lecture de la veille, et ce qui s'en dessine. Sans faits, rien n'est
// dessiné : le titre dit quel cas, et ce qui a été obtenu suit.
function lire(lecture: Lecture, attend?: BlocLu, status?: StatusLu, repondues?: ReadonlyMap<number, Repondue>, ecrites?: PrioriteMontree): { faits?: Faits; recue: Dessinable } {
  if ("erreur" in lecture) return { recue: { ...lecture, titre: titreDEchec(lecture) } };
  const { projet, demande, a } = lecture;
  const rendu = lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte ?? "";
  const faits = comprendre(rendu);
  if ("informe" in faits) return { recue: { projet, demande, a, titre: "THE STATION DID NOT RETURN THE SHAPE OF `facts`", informe: faits.informe, rendu } };
  return { faits, recue: { projet, demande, a, tableau: tableau(faits, attend, status, repondues, ecrites, envoisDe(lecture)) } };
}

export const dessiner = (lecture: Lecture): Dessinable => lire(lecture).recue;

// Les deux listes fermées de la forme, et la couleur de chaque mot.
const TONS_DE_PROJET = new Map([
  ["ouverte", "vert"],
  ["retenue", "jaune"],
  ["arrêtée", "rouge"],
  ["éteinte", "rouge"],
]);
const TONS_DE_TICKET = new Map([
  ["en attente", "gris"],
  ["BLOQUÉ", "rouge"],
  ["pris", "bleu"],
  ["en pass", "jaune"],
  ["servi", "vert"],
  ["86", "rouge"],
  ["WAITING", "gris"],
]);
// Le mot et, s'il est de la liste, sa couleur : un mot inconnu n'en porte aucune.
const colore = (tons: ReadonlyMap<string, string>, etat: string): { etat: string; ton?: string } => {
  const ton = tons.get(etat);
  return ton === undefined ? { etat } : { etat, ton };
};

// Une durée, dite comme `status` la dit.
export function duree(ms: number): string {
  const secondes = Math.max(0, Math.floor(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

// Un âge se compte entre deux heures de la box — celle du fait, celle de la
// lecture : l'horloge du poste n'y entre pas.
const avant = (fait: string, lu: string) => `${duree(Date.parse(lu) - Date.parse(fait))} before the reading`;

// Le dernier événement : son type s'affiche, il ne s'interprète pas.
export function evenement({ dernierEvenement, lu }: Faits): string {
  if (dernierEvenement === null) return "none: the log is empty";
  const { type, ticket, at } = dernierEvenement;
  return [type, ...(ticket === null ? [] : [`#${ticket}`]), avant(at, lu)].join(" · ");
}

// L'écart entre le dernier tick et la lecture : affiché, jamais conclu.
export function tick({ dernierTick, lu }: Faits): string {
  return dernierTick === null ? "no tick: runtime stopped, or no tick yet since it started" : `last tick ${avant(dernierTick, lu)}`;
}

// Les colonnes où la cuisine fait quelque chose du ticket : Au travail, la Pass.
const A_L_OUVRAGE = ["pris", "en pass"];
export const ACTIVITE_NON_COMMUNIQUEE = "activity not given";
const ACTIVITE_PAS_DONNEE = `${ACTIVITE_NON_COMMUNIQUEE} — this station's runtime does not give it in \`facts\``;

// Ce que la cuisine fait d'un ticket pris ou en pass, en une ligne : le geste, ce
// qu'il vise, depuis combien de temps — un âge entre deux heures de la box. Ce
// que la box ne dit pas est écrit, jamais laissé vide. Rien pour un autre état.
export function direEnCeMoment({ etat, activite }: Faits["rail"][number], lu: string): string | undefined {
  if (!A_L_OUVRAGE.includes(etat)) return undefined;
  if (activite === undefined) return ACTIVITE_PAS_DONNEE;
  if (activite === null) return ACTIVITE_NON_COMMUNIQUEE;
  const { fait, cible, depuis } = activite;
  return `${cible === null ? fait : `${fait} ${cible}`}, for ${duree(Date.parse(lu) - Date.parse(depuis))}`;
}

// Seule une adresse https s'ouvre : rien de ce qu'une box rend n'est lancé
// comme un fichier ou un programme.
const ouvrable = (url: string) => URL.parse(url)?.protocol === "https:";

// Les quatre colonnes que `faits` remplit, dans l'ordre de l'écran, et les mots
// d'état que chacune prend. Tout autre mot — `86`, un mot inconnu — n'est d'aucune.
const COLONNES_DE_FAITS = [
  { nom: "On the rail", ton: "gris", etats: ["en attente", "BLOQUÉ"] },
  { nom: "Taken", ton: "bleu", etats: ["pris"] },
  { nom: "Pass", ton: "jaune", etats: ["en pass"] },
  { nom: "Served", ton: "vert", etats: ["servi"] },
] as const;
const COLONNE_PAR_DEFAUT = "On the rail";
// Les mots d'état d'un ticket en attente sur le rail.
const EN_FILE: readonly string[] = COLONNES_DE_FAITS[0].etats;
// La priorité d'un ticket dont l'issue ne porte aucun `prio:` — `-` dans sa ligne de `status`.
export const SANS_PRIO = "no prio";
// La colonne de FAITS d'une carte : celle du mot d'état — ou, pour un ticket mis de
// côté, celle où le runtime dit qu'il attend (`attente.colonne`), et à défaut d'une
// colonne qu'elle connaisse, la colonne par défaut : une carte mise de côté n'est
// jamais hors colonne. Un mot inconnu sans attente n'est d'aucune.
function colonneDeFaits(connu: Faits["rail"][number] | undefined, etat: string | undefined): string | undefined {
  const parMot = (mot: string | undefined) => COLONNES_DE_FAITS.find(({ etats }) => (etats as readonly (string | undefined)[]).includes(mot))?.nom;
  if (connu?.illisible !== undefined) return COLONNE_PAR_DEFAUT;
  if (connu?.attente == null) return parMot(etat);
  return parMot(connu.attente.colonne) ?? parMot(etat) ?? COLONNE_PAR_DEFAUT;
}
// TODO : ce que le chef peut trancher maintenant — et cela seulement. WAITING, juste après :
// ce qui attend un tiers, qu'il ne perd pas de vue sans l'avoir devant lui.
const T_ATTEND = { nom: "TODO", ton: "rouge", rang: 3 } as const;
const WAITING = { nom: "WAITING", ton: "gris", rang: 4 } as const;
const PERSONNE_N_ATTEND = "no ticket waits for a third party";
// Les mots d'état d'un ticket que le runtime laisse attendre un tiers : en attente sur le
// rail, ou mis de côté — pas celui que la cuisine tient, en cuisine ou en pass, ni un servi.
const POSABLES = ["en attente", "BLOQUÉ", "86"];
// La ligne du bloc `attend` d'une question du manager avant découpage (runtime/src/attend.ts), dans ses deux langues.
const QUESTION_D_EPIQUE = /manager's question before splitting the epic|question du manager avant de découper l'épique/;
// Ce qui suit, sur une question répondue.
const REPONDUE_ENSUITE = "the manager reads the answer at its next tick: it splits the epic, or asks again — the card then comes back to TODO";
// Ce qu'une carte de WAITING dit quand la box ne donne pas ce qu'il attend.
const TIERS_PAS_DONNE = "not given — this station's runtime does not give in `facts` what it waits for: what, from whom, since when, its follow-up, what happens on arrival";

// Le rail qu'une station publie sur GitHub (runtime/src/appairage/rail-du-projet.ts, #1432), lu sur un ordinateur
// où le projet n'a ni box ni station (#1435) : ses tickets rangés par leur mot d'état dans les colonnes du rail que le
// Mac lit — On the rail, Taken, Pass, WAITING, Served —, du même ton. TODO n'y est pas : ce qui attend le chef ne
// se publie pas. Un mot d'aucune colonne (`86`, un mot inconnu) est hors colonnes, comme sur le Mac.
export type CarteDuRailPublie = { ticket: number; etat: string; ton?: string; titre: string; url: string; ouvrable: boolean };
export type RailPublieRange = { colonnes: { nom: string; ton: string; cartes: CarteDuRailPublie[] }[]; hors: CarteDuRailPublie[] };
// Ce que la vue en reçoit : le rail lu et rangé, ou pourquoi il ne l'est pas (`railDuProjet`, main.ts).
export type RailDuProjetLu = Exclude<RailDuProjet, { state: "listed" }> | (Extract<RailDuProjet, { state: "listed" }> & { range: RailPublieRange });
export function rangerLeRailPublie(tickets: readonly { ticket: number; state: string; title: string; url: string }[]): RailPublieRange {
  const cartes = tickets.map(({ ticket, state, title, url }): CarteDuRailPublie => ({ ticket, ...colore(TONS_DE_TICKET, state), titre: title, url, ouvrable: ouvrable(url) }));
  const [surLeRail, pris, pass, servi] = COLONNES_DE_FAITS;
  const ordre = [surLeRail, pris, pass, WAITING, servi];
  const colonneDe = (etat: string) => (etat === "WAITING" ? WAITING.nom : colonneDeFaits(undefined, etat));
  return {
    colonnes: ordre.map(({ nom, ton }) => ({ nom, ton, cartes: cartes.filter(({ etat }) => colonneDe(etat) === nom) })),
    hors: cartes.filter(({ etat }) => colonneDe(etat) === undefined),
  };
}

// Un instant de la box, tel qu'elle l'a donné : son jour et son heure, en UTC.
const instant = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const LIVRE = "Served";
const AUCUN = "no ticket";
// Livré, quand la box donne `livres` : ce que la cuisine a servi en 24 h, que
// l'issue soit fermée ou non. Vide, c'est qu'elle n'a rien servi — et elle le dit.
const RIEN_LIVRE = "nothing served in the last 24 h";
const SANS_PR = "none — served without a merge";
const SANS_CUISINIER = "not given by the queue: who cooked it — no station sent it to pass";
// Ce qui a été livré, quand la relecture ne le dit pas : pourquoi, sans rien inventer.
const SANS_RELECTURE = "what was delivered: not given — no readable review covers this delivery (merged by hand, served without going through pass, or from before the review)";
const RELECTURE_PAS_DONNEE = "what was delivered: not given — this station's runtime does not yet give the review in `facts`";

const pluriel = (nombre: number, mot: string) => `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
// Le nombre des constats, en clair : « 4 remarques », « 2 remarques, dont 1 bloquante ».
export function remarques(constats: readonly Constat[]): string {
  if (constats.length === 0) return "no remarks";
  const bloquantes = constats.filter(({ gravite }) => gravite === "bloquant").length;
  return `${pluriel(constats.length, "remark")}${bloquantes === 0 ? "" : `, ${bloquantes} blocking`}`;
}

// Ce qu'une carte de Livré dit de ce qui a été livré, d'après ce que la box en a donné.
const tete = (valeur: ReturnType<typeof teteDe>) => (valeur === undefined ? {} : { tete: valeur });
const livraison = (relecture: Relecture | null | undefined): Livraison =>
  relecture === undefined ? { sans: RELECTURE_PAS_DONNEE } : relecture === null ? { sans: SANS_RELECTURE } : { resume: relecture.resume, remarques: remarques(relecture.constats), constats: relecture.constats };
// La colonne ne dit jamais « rien ne t'attend » : une entrée sans numéro — une
// connexion, la base — attend aussi, et n'a pas de carte. C'est le bloc qui le dit.
const AUCUN_NUMERO = "no ticket at the head of a line of the `attend` block";
const AUCUN_ATTENDU = "no ticket in `attend`, according to `facts`";
const RIEN_DE_LU = "not read: this station's runtime does not give `attend` in `facts`, and the `attend` block of `ssh <hote> brigade <nom> status` was not taken for this project. This is not “nothing awaits you” — the tickets stay in their columns";

// Le rail en six colonnes. Un ticket qui attend une décision du chef est dans
// TODO, et là seulement : c'est l'information qui décide d'un geste. Il y est
// dès que la file le nomme — dans `attend`, que `faits` donne, ou en tête d'une
// ligne du bloc `attend` de `status`, qui dit en plus ce qu'on attend de lui. Un
// ticket qui attend un tiers est dans WAITING, et là seulement — jamais dans TODO,
// même nommé par la file : le chef n'a rien à en trancher tant que rien n'est
// arrivé. Sa carte dit, sans clic, ce qu'il attend, de qui, depuis quand, sa
// relance et ce qui se passera à l'arrivée. Les autres sont dans la colonne de
// leur mot d'état, dans l'ordre de service ; TODO garde l'ordre du bloc, le plus
// ancien d'abord, puis celui de `faits`.
// Une question du manager avant découpage que le chef a répondue (`repondues`, repondues.ts) quitte
// TODO sans attendre le manager : elle l'attend dans WAITING — c'est lui, le tiers —, jusqu'à ce que
// la file ne la nomme plus, ou que l'issue pose une autre question (#503).
// Livré, quand la box donne `livres`, en vient seul : les tickets servis dans les
// 24 h, le plus récent d'abord, un pour un avec `livrés 24 h` — partis du rail ou
// non. Un ticket `servi` du rail qu'elle n'y met pas, servi avant, est rendu à
// part ; un ticket qu'elle y met et que le rail porte sous un autre mot — repris
// depuis, 86 — reste aussi là où ce mot le range. Sans `livres`, un runtime
// d'avant ce champ : Livré prend les tickets `servi` du rail, comme les autres.
// `status` : ce que la box en a rendu, d'où vient la ligne que chaque carte porte.
// `ecrites` : la priorité que l'app vient d'écrire sur l'issue d'un ticket (priorite.ts), que sa carte et sa fiche
// montrent tant que le tableau montre encore celle d'avant.
// `envois` : la dernière réponse du chef à chaque carte de TODO, que le tableau de la cuisine montre, et ce que la box en
// a fait (tableau/envois.ts, #1841) — la carte la porte : envoyée et en attente de la cuisine, jouée, ou refusée.
export function rail(faits: Faits, attend?: BlocLu, status?: StatusLu, repondues?: ReadonlyMap<number, Repondue>, ecrites?: PrioriteMontree, envois?: ReadonlyMap<number, EnvoiDeCarte>): Rail {
  const lignes = status === undefined ? undefined : lignesDuRail(status.texte);
  const connus = new Map(faits.rail.map((connu) => [connu.ticket, connu]));
  // Où cuit chaque station : la box, ou le Mac (bon.ts) — rien, d'un runtime qui ne donne pas les stations.
  const lieux = faits.stations === undefined ? undefined : new Map(faits.stations.map((station) => [station.station, lieuDe(station)]));
  // Son état et son titre sur le rail, qui bornent sa ligne de `status` — rien, s'il n'y est pas.
  const sur = (connu: Faits["rail"][number] | undefined) => (connu === undefined ? {} : { rail: { etat: connu.etat, titre: connu.titre } });
  // Ce qui attend un tiers, d'après la forme : sa colonne est WAITING, quoi que la file en dise.
  const enWaiting = new Set(faits.rail.filter(({ etat, tiers }) => tiers != null || etat === "WAITING").map(({ ticket }) => ticket));
  const dits = new Map<number, string[]>();
  for (const entree of attend === undefined ? [] : ticketsDe(attend.bloc)) dits.set(entree.ticket, [...(dits.get(entree.ticket) ?? []), ditDe(entree)]);
  for (const { ticket } of faits.attend ?? []) if (!dits.has(ticket)) dits.set(ticket, []);
  for (const ticket of enWaiting) dits.delete(ticket);
  // Une question du manager avant de découper une épique — d'un runtime d'avant `decision`, ce que sa
  // ligne du bloc en dit —, et une issue que la question retient : la carte dit la question.
  const avantDecoupage = (ticket: number) => {
    const decision = faits.attend?.find((attendu) => attendu.ticket === ticket)?.decision;
    return decision === undefined ? (dits.get(ticket) ?? []).some((dit) => QUESTION_D_EPIQUE.test(dit)) : decision.quoi === "question";
  };
  const interroge = (ticket: number) => avantDecoupage(ticket) || (dits.get(ticket) ?? []).some((dit) => dit.includes(`\`${LABEL_RETENUE}\``));
  // Répondue, la question avant découpage n'attend plus le chef. Celle qui retient l'issue, si : le label reste à lever.
  const repondus = new Map([...dits.keys()].flatMap((ticket) => {
    const repondue = repondues?.get(ticket);
    return repondue !== undefined && avantDecoupage(ticket) ? [[ticket, repondue] as const] : [];
  }));
  const interroges = new Set([...dits.keys()].filter(interroge));
  for (const ticket of repondus.keys()) dits.delete(ticket);

  // La carte d'un ticket : ce que le rail en donne — ou, pour un ticket qui attend
  // sans y être, ce que `faits.attend` en donne : son titre s'il y en a un, son
  // adresse si la box l'a rendue —, puis ce que la file dit de lui.
  const carte = (ticket: number): Carte => {
    const connu = connus.get(ticket);
    const donne = faits.attend?.find((attendu) => attendu.ticket === ticket);
    const url = connu?.url ?? donne?.url;
    const titre = [connu?.titre, donne?.titre].find((candidat) => candidat !== undefined && candidat !== "");
    const dit = dits.get(ticket);
    const siennes = lignes === undefined ? undefined : (lignes.get(ticket) ?? []);
    const porte = porter(connu === undefined ? {} : { etat: connu.etat, titre: connu.titre }, {
      ...(siennes === undefined ? {} : { lignes: siennes }),
      ...(faits.cooks === undefined ? {} : { stations: [...new Set(faits.cooks.filter((cook) => cook.ticket === ticket).map(({ station }) => station))] }),
      bloque: dit !== undefined && dit.length > 0,
      ...(connu === undefined ? {} : { enCeMoment: direEnCeMoment(connu, faits.lu) }),
      ...(connu?.attente == null ? {} : { attente: connu.attente.raison }),
      ...(connu?.revenu == null ? {} : { revenu: connu.revenu }),
      ...(lieux === undefined ? {} : { lieux }),
    });
    const retient = porte.dit.find(({ libelle }) => libelle === "blocked by")?.valeur;
    const ligne: LigneDeCarte =
      connu?.illisible !== undefined || donne?.illisible !== undefined
        ? ligneIllisible()
        : dit !== undefined
        ? ligneQuiMAttend(attenduDe(donne?.decision).phrase)
        : connu?.attente != null
          ? ligneMiseDeCote(connu.attente.raison)
          : connu !== undefined && A_L_OUVRAGE.includes(connu.etat)
            ? ligneAuTravail(connu.etat as "pris" | "en pass", connu.activite, connu.activite == null ? "" : duree(Date.parse(faits.lu) - Date.parse(connu.activite.depuis)))
            : connu?.etat === "servi"
              ? { ligne: "served", repere: true }
              : connu?.raison != null && EN_FILE.includes(connu.etat)
                ? ligneDeTete(connu.etat, connu.raison)
                : ligneEnAttente(connu?.etat ?? "", retient);
    // Sur le rail, en attente : sa priorité se lit sur la carte — celle que sa ligne de `status` écrit, ou celle que
    // l'app vient d'écrire sur son issue, tant que le tableau montre encore l'ancienne.
    const enFile = dit === undefined && connu !== undefined && EN_FILE.includes(connu.etat);
    const [sienne] = siennes ?? [];
    const prioLue = connu !== undefined && siennes?.length === 1 && sienne !== undefined ? priorite(sienne, connu.etat, connu.titre) : undefined;
    const niveauLu = prioLue === "-" ? null : /^prio:([0-9])$/.exec(prioLue ?? "")?.[1];
    const ecrite = connu === undefined ? undefined : ecrites?.(ticket, niveauLu === undefined || niveauLu === null ? niveauLu : Number(niveauLu));
    const prio = !enFile ? undefined : ecrite !== undefined ? (ecrite === null ? "-" : `prio:${ecrite}`) : prioLue;
    // Dans Taken et Pass : depuis quand elle y est, et si c'est bien plus que d'ordinaire. Une carte qui t'attend est dans
    // TODO, pas dans ces colonnes : elle n'en porte pas.
    const age = connu === undefined || connu.illisible !== undefined || dit !== undefined ? undefined : anciennete(connu.etat, connu.depuis, faits.lu, faits.cadence?.medianSeconds);
    return {
      ticket,
      ...ligne,
      ...(connu === undefined ? {} : colore(TONS_DE_TICKET, connu.etat)),
      ...(titre === undefined ? {} : { titre }),
      ouvrable: url != null && ouvrable(url),
      attendu: dit !== undefined,
      attend: dit ?? [],
      ...(dit === undefined || donne?.decision === undefined ? {} : { decision: donne.decision }),
      // Livré, d'une box d'avant `livres` : la relecture n'en vient pas, la carte le dit.
      ...(connu?.etat === "servi" && faits.livres === undefined ? { livraison: livraison(undefined) } : {}),
      ...(connu?.captures === undefined ? {} : { captures: capturesDeCarte(connu.captures) }),
      ...porte,
      // La PR n'est donnée que d'un ticket livré : ici, la box ne la donne pas.
      fiche: {
        ...entete({ ...(titre === undefined ? {} : { titre }), url, ...sur(connu), ...(siennes === undefined ? {} : { lignes: siennes }), ...(ecrite === undefined ? {} : { prio: ecrite }) }),
        ...(dit === undefined ? {} : { attendu: attenduDe(donne?.decision).phrase }),
        ...(dit === undefined ? {} : tete(teteDe(donne?.decision, donne?.livraison))),
      },
      // Dans TODO, un ticket du rail que la cuisine ne tient pas peut attendre un tiers.
      ...(dit !== undefined && connu !== undefined && POSABLES.includes(connu.etat) ? { gestes: ["attente-poser" as const] } : {}),
      ...(dit !== undefined && interroges.has(ticket) ? { question: true as const } : {}),
      ...(dit !== undefined && donne?.carte !== undefined ? { todo: carteDeTodo(donne.carte, envois?.get(ticket)) } : {}),
      ...(prio === undefined ? {} : { prio: prio === "-" ? SANS_PRIO : prio }),
      ...(age === undefined ? {} : { age }),
    };
  };

  // La carte d'une question répondue, qui attend que le manager lise la réponse : qui y a répondu,
  // quand, et ce qui viendra. Ni geste ni question à poser : c'est au manager.
  const repondu = (ticket: number, { par, a }: Repondue): Carte => {
    const connu = connus.get(ticket);
    const donne = faits.attend?.find((attendu) => attendu.ticket === ticket);
    const url = connu?.url ?? donne?.url;
    const titre = [connu?.titre, donne?.titre].find((candidat) => candidat !== undefined && candidat !== "");
    return {
      ticket,
      ...ligneRepondue(par),
      ...(connu === undefined ? {} : colore(TONS_DE_TICKET, connu.etat)),
      ...(titre === undefined ? {} : { titre }),
      ouvrable: url != null && ouvrable(url),
      attendu: false,
      attend: [],
      repondue: { par, a },
      dit: [
        { libelle: "answered by", valeur: par },
        { libelle: "answered at", valeur: instant(a) },
        { libelle: "next", valeur: REPONDUE_ENSUITE },
      ],
      fiche: entete({ ...(titre === undefined ? {} : { titre }), url, ...sur(connu), ...(lignes === undefined ? {} : { lignes: lignes.get(ticket) ?? [] }) }),
    };
  };

  // La carte d'un ticket qui attend un tiers : ce qu'il attend, dans les mots du chef ; de qui ;
  // depuis quand et sa relance, à l'horloge de la box, et leur écart à la lecture ; ce que
  // « c'est arrivé » fera de lui. Puis ses deux gestes : le reprendre, ou le renvoyer en cuisine.
  const enAttente = (ticket: number): Carte => {
    const connu = connus.get(ticket) as Faits["rail"][number];
    const { tiers, url, titre } = connu;
    const relance = tiers?.relance == null ? 0 : Date.parse(tiers.relance) - Date.parse(faits.lu);
    return {
      ticket,
      ...ligneEnWaiting(tiers, tiers?.relance != null && relance < 0),
      ...colore(TONS_DE_TICKET, connu.etat),
      ...(titre === "" ? {} : { titre }),
      ouvrable: ouvrable(url),
      attendu: false,
      attend: [],
      dit:
        tiers == null
          ? []
          : [
              { libelle: "waiting for", valeur: tiers.quoi },
              { libelle: "from", valeur: tiers.qui },
              { libelle: "since", valeur: `${instant(tiers.depuis)} — ${avant(tiers.depuis, faits.lu)}` },
              ...(tiers.relance == null ? [] : [{ libelle: "follow-up", valeur: `${instant(tiers.relance)} — ${relance >= 0 ? `in ${duree(relance)} from the reading` : `passed ${duree(-relance)} before the reading`}` }]),
              { libelle: "on arrival", valeur: tiers.aLArrivee },
            ],
      ...(tiers == null ? { sans: TIERS_PAS_DONNE } : {}),
      fiche: entete({ titre, url, ...sur(connu), ...(lignes === undefined ? {} : { lignes: lignes.get(ticket) ?? [] }) }),
      // Sans relance, personne n'a posé l'attente : rien à reprendre ni à renvoyer, le ticket repart seul.
      ...(tiers?.relance === null ? {} : { gestes: ["attente-reprendre" as const, "attente-arrivee" as const] }),
    };
  };

  // La carte d'un ticket livré : ce que `livres` en donne — son titre, ou celui du
  // rail s'il n'en a pas ; quand il a été livré, à l'horloge de la box ; qui l'a
  // cuisiné ; sa PR mergée ; ce qui a été livré, dans les mots de la relecture.
  // Ce que la file n'en dit pas est écrit.
  const livre = ({ ticket, titre, url, livre: quand, station, pr, relecture, captures, illisible }: Livre): Carte => {
    const connu = connus.get(ticket);
    const adresse = url ?? connu?.url;
    const nomme = titre === "" ? connu?.titre : titre;
    return {
      ticket,
      ...(illisible === undefined ? ligneLivree(quand, relecture?.resume) : ligneIllisible()),
      ...colore(TONS_DE_TICKET, "servi"),
      ...(nomme === undefined || nomme === "" ? {} : { titre: nomme }),
      ouvrable: adresse != null && ouvrable(adresse),
      attendu: false,
      attend: [],
      ...(pr === null ? {} : { pr: ouvrable(pr) }),
      livraison: livraison(relecture),
      ...(captures === undefined ? {} : { captures: capturesDeCarte(captures) }),
      dit: [
        { libelle: "served", valeur: avant(quand, faits.lu) },
        ...(station === null ? [] : [{ libelle: "cooked by", valeur: station, exact: true as const }]),
        ...(pr === null ? [{ libelle: "PR", valeur: SANS_PR }] : []),
      ],
      ...(station === null ? { sans: SANS_CUISINIER } : {}),
      fiche: entete({ ...(nomme === undefined ? {} : { titre: nomme }), url: adresse, pr, ...sur(connu), ...(lignes === undefined ? {} : { lignes: lignes.get(ticket) ?? [] }) }),
    };
  };
  const livres = faits.livres?.map(livre);
  // Un ticket `servi` du rail que `livres` donne a sa carte dans Livré : il n'en a pas d'autre.
  const servis = new Set(livres?.map(({ ticket }) => ticket));
  const ailleurs = faits.rail.filter(({ ticket, etat }) => !dits.has(ticket) && !enWaiting.has(ticket) && !repondus.has(ticket) && !(etat === "servi" && servis.has(ticket))).map(({ ticket }) => carte(ticket));
  const colonnes: Colonne[] = COLONNES_DE_FAITS.map(({ nom, ton, etats }) => {
    if (nom === LIVRE && livres !== undefined) return { nom, ton, compte: String(livres.length), cartes: livres, vide: RIEN_LIVRE, defile: true };
    const siennes = ailleurs.filter((posee) => colonneDeFaits(connus.get(posee.ticket), posee.etat) === nom);
    return { nom, ton, compte: String(siennes.length), cartes: siennes, vide: AUCUN };
  });
  const rienDeLu = attend === undefined && faits.attend === undefined;
  colonnes.splice(T_ATTEND.rang, 0, {
    nom: T_ATTEND.nom,
    ton: T_ATTEND.ton,
    compte: rienDeLu ? "?" : String(dits.size),
    cartes: [...dits.keys()].map(carte),
    vide: rienDeLu ? RIEN_DE_LU : attend === undefined ? AUCUN_ATTENDU : AUCUN_NUMERO,
  });
  colonnes.splice(WAITING.rang, 0, {
    nom: WAITING.nom,
    ton: WAITING.ton,
    compte: String(enWaiting.size + repondus.size),
    cartes: [...[...enWaiting].map(enAttente), ...[...repondus].map(([ticket, repondue]) => repondu(ticket, repondue))],
    vide: PERSONNE_N_ATTEND,
  });
  const rangees = new Set(colonnes.flatMap((colonne) => colonne.cartes));
  const hors = ailleurs.filter((posee) => !rangees.has(posee));
  return {
    colonnes,
    hors,
    ...(hors.length === 0 && colonnes.every(({ nom, cartes }) => nom === LIVRE || cartes.length === 0) ? { aucunTicket: true as const } : {}),
    ...(attend === undefined ? {} : { attendLu: attend.a }),
    ...(status === undefined || lignes === undefined ? {} : { railLu: status.a }),
    ...(faits.corrections === undefined || faits.corrections.length === 0 ? {} : { corrections: faits.corrections.map(carteDeCorrection) }),
    ...(faits.profils === undefined || faits.profils.length === 0 ? {} : { profils: faits.profils.map(carteDeProfil) }),
    ...(faits.cadence === undefined ? {} : { cadence: histogramme(faits.cadence) }),
  };
}

// La ligne de `status` qui dit que rien ne cuit (runtime/src/etat.ts, `RIEN_NE_CUIT`) : lue
// telle quelle, en anglais ou en français (#928), une seule ligne, hors du bloc `attend` qu'elle
// ne rejoint jamais.
function rienNeCuit(status?: StatusLu): { rienNeCuit?: string } {
  const ligne = status?.texte.split("\n").find((candidate) => candidate.startsWith("nothing cooks: ") || candidate.startsWith("rien ne cuit : "));
  return ligne === undefined ? {} : { rienNeCuit: ligne };
}

// La cuisine oisive, des cartes sur le rail (#1863) : depuis combien de temps, et combien de cartes — la durée se
// compte entre deux heures de la box, le dernier repère et la lecture.
export function panneDe({ cuisineOisive, lu }: Faits): { panne?: Panne } {
  if (cuisineOisive == null) return {};
  const { depuis, cartes } = cuisineOisive;
  const pendant = duree(Date.parse(lu) - Date.parse(depuis));
  const nombre = `${cartes.length} ${cartes.length === 1 ? "card" : "cards"}`;
  return {
    panne: {
      dit: `Kitchen idle for ${pendant} with ${nombre} on the rail`,
      survol: `No cook has run for ${pendant}, though the project is on and ${cartes.map((ticket) => `#${ticket}`).join(", ")} ${cartes.length === 1 ? "waits" : "wait"} to be cooked. This is not normal: the cause, when there is one, is in the alerts or in what awaits you.`,
    },
  };
}

const AUCUN_COOK = "no cook running";
const COOKS_PAS_LUS = "cooks running: not read — this station's runtime does not give them in `facts` yet. This is not “no cook”: `ssh <hote> brigade <nom> station` shows them";

// Les faits, tels que la vue les pose : la pastille, les cinq compteurs dans
// l'ordre de la carte, les cooks en cours dans celui de la box, le dernier
// événement, et le rail en six colonnes.
export function tableau(faits: Faits, attend?: BlocLu, status?: StatusLu, repondues?: ReadonlyMap<number, Repondue>, ecrites?: PrioriteMontree, envois?: ReadonlyMap<number, EnvoiDeCarte>): Tableau {
  const { compteurs } = faits;
  return {
    ...colore(TONS_DE_PROJET, faits.etat),
    arretee: faits.etat === BANNIERE.etat,
    tick: tick(faits),
    compteurs: [
      { libelle: "rail", nombre: compteurs.rail },
      { libelle: "taken", nombre: compteurs.auTravail },
      { libelle: "at pass", nombre: compteurs.aLaPass },
      { libelle: "awaiting you", nombre: compteurs.attend },
      { libelle: "served 24 h", nombre: compteurs.livres24h },
    ],
    cooks: { enCours: faits.cooks ?? [], vide: faits.cooks === undefined ? COOKS_PAS_LUS : AUCUN_COOK },
    evenement: evenement(faits),
    ...rienNeCuit(status),
    ...panneDe(faits),
    rail: rail(faits, attend, status, repondues, ecrites, envois),
    ...(faits.stations === undefined ? {} : { stations: cuissonDe(faits.stations, faits.cooks, faits.lu) }),
    ...(faits.plafondDeCalibrage === undefined ? {} : { plafondDeCalibrage: plafondVu(faits.plafondDeCalibrage) }),
    ...(triageDe(faits.triage, faits.lu) === undefined ? {} : { triage: triageDe(faits.triage, faits.lu) }),
    ...(faits.activiteCuisine === undefined ? {} : { activiteCuisine: faits.activiteCuisine }),
    ...(faits.rolesCuisine === undefined ? {} : { rolesCuisine: faits.rolesCuisine }),
    ...(faits.coutDesGates === undefined ? {} : { coutDesGates: faits.coutDesGates }),
    ...(faits.reculs === undefined || faits.reculs.length === 0 ? {} : { reculs: faits.reculs.map(reculDe) }),
    apprentissage: apprentissageDe(faits.apprentissage),
  };
}

// La bannière d'arrêt : posée sur le « stop » du chef, avec ce qu'il implique
// (docs/runtime/garde-fous.md, « Les garde-fous ») et le geste du socle qui la relance (gestes.ts).
export const BANNIERE = {
  etat: "arrêtée",
  bouton: "reprendre",
  texte: ["KITCHEN STOPPED — your “stop” holds", "All running cooks have been stopped, and none is launched any more — runtime restarts included, until “resume”."],
} as const;

// Les derniers faits de chaque projet, tenus par le process principal : la vue
// nomme un projet et un ticket, jamais une adresse. Celle qui s'ouvre est celle
// que la box a donnée pour ce ticket, à la dernière lecture. Le dernier `status`
// de chaque projet y est tenu aussi, son bloc `attend` mis à part : il vient d'une
// autre lecture, et le rail se dessine des deux. `repondues` : les questions répondues de chaque
// projet (repondues.ts), que le rail range dans WAITING. `ecrites` : les priorités que l'app vient d'écrire sur
// les issues de chaque projet (priorite.ts), que le rail montre tant que le tableau ne les a pas lues.
export function tenirFaits(repondues: (projet: string) => ReadonlyMap<number, Repondue> = () => new Map(), ecrites: (projet: string) => PrioriteMontree = () => () => undefined) {
  const tenus = new Map<string, { faits: Faits; lecture: Lecture }>();
  const blocs = new Map<string, BlocLu>();
  const statuts = new Map<string, StatusLu>();
  const poser = <T>(ou: Map<string, T>, projet: string, valeur: T | undefined) => void (valeur === undefined ? ou.delete(projet) : ou.set(projet, valeur));
  return {
    // Hors ligne, les derniers faits lus restent : la fiche, ses adresses et le rail gardé s'y lisent encore (#1818).
    recevoir(lecture: Lecture): Dessinable {
      const { faits, recue } = lire(lecture, blocs.get(lecture.projet), statuts.get(lecture.projet), repondues(lecture.projet), ecrites(lecture.projet));
      if (faits === undefined && estHorsLigne(lecture)) return recue;
      if (faits === undefined) tenus.delete(lecture.projet);
      else tenus.set(lecture.projet, { faits, lecture });
      return recue;
    },
    // Ce que `status` vient de rendre pour un projet, son bloc mis à part : s'il
    // change ce qui est dessiné, les derniers faits du projet reviennent
    // redessinés. Une lecture ratée retire tout de celle d'avant, une lecture sans
    // bord son bloc, une lecture sans ligne `rail` ce que les cartes en portaient —
    // rien ne se dessine d'une sortie qui n'est plus la dernière. Hors ligne, rien n'est retiré, et rien ne se redessine :
    // le dernier `status` lu reste celui du rail gardé (#1818).
    attendre(montree: Montree): Dessinable | undefined {
      if (estHorsLigne(montree)) return undefined;
      const avant = blocs.has(montree.projet) || statuts.has(montree.projet);
      const lue = "erreur" in montree ? undefined : montree;
      const bloc = lue?.attend === undefined ? undefined : { bloc: lue.attend, a: montree.a };
      const texte = lue?.sorties.find(({ commande }) => commande === "status")?.texte;
      const status = texte === undefined || lignesDuRail(texte) === undefined ? undefined : { texte, a: montree.a };
      poser(blocs, montree.projet, bloc);
      poser(statuts, montree.projet, status);
      const tenu = tenus.get(montree.projet);
      if (tenu === undefined || (!avant && bloc === undefined && status === undefined)) return undefined;
      return lire(tenu.lecture, bloc, status, repondues(montree.projet), ecrites(montree.projet)).recue;
    },
    // Les projets dont `status` est lu désormais — celui qui est affiché, ou tous.
    // Ce qu'il a rendu pour un projet qui n'en est plus est lâché : ses faits, eux,
    // continuent d'être lus, et rien ne s'y dessine d'un `status` que plus rien ne
    // rafraîchit. Rend ce qui est à redessiner, sans lui.
    veiller(projets: readonly string[]): Dessinable[] {
      return [...new Set([...blocs.keys(), ...statuts.keys()])].filter((projet) => !projets.includes(projet)).flatMap((projet) => {
        blocs.delete(projet);
        statuts.delete(projet);
        const tenu = tenus.get(projet);
        return tenu === undefined ? [] : [lire(tenu.lecture, undefined, undefined, repondues(projet), ecrites(projet)).recue];
      });
    },
    // Le rail d'un projet redessiné des dernières lectures, sans en attendre une : une question vient
    // d'y être répondue, ou de ne plus l'être. Rien, s'il n'a pas de faits lus.
    redessiner(projet: string): Dessinable | undefined {
      const tenu = tenus.get(projet);
      return tenu === undefined ? undefined : lire(tenu.lecture, blocs.get(projet), statuts.get(projet), repondues(projet), ecrites(projet)).recue;
    },
    // Les tickets qui attendent le chef d'après les dernières lectures : ceux que le bloc `attend` nomme
    // en tête d'une ligne, et ceux que `faits` donne dans `attend`. Indéfini : ni l'un ni l'autre n'est lu.
    nommes(projet: string): Set<number> | undefined {
      const bloc = blocs.get(projet);
      const donnes = tenus.get(projet)?.faits.attend;
      if (bloc === undefined && donnes === undefined) return undefined;
      return new Set([...(bloc === undefined ? [] : ticketsDe(bloc.bloc).map(({ ticket }) => ticket)), ...(donnes ?? []).map(({ ticket }) => ticket)]);
    },
    adresse(projet: unknown, ticket: unknown): string | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      const url =
        donnes?.rail.find((candidat) => candidat.ticket === ticket)?.url ??
        donnes?.attend?.find((candidat) => candidat.ticket === ticket)?.url ??
        donnes?.livres?.find((candidat) => candidat.ticket === ticket)?.url ??
        donnes?.corrections?.flatMap(({ tickets }) => tickets).find((candidat) => candidat.ticket === ticket)?.url ??
        donnes?.profils?.flatMap(({ chiffres }) => chiffres.tickets).find((candidat) => candidat.ticket === ticket)?.url;
      return url != null && ouvrable(url) ? url : undefined;
    },
    // L'adresse d'une capture d'un ticket d'interface, telle que la box l'a donnée à la dernière
    // lecture — sa livraison servie d'abord, puis le rail, puis sa carte de TODO. Rien pour une capture
    // qu'elle n'a pas.
    capture(projet: unknown, ticket: unknown, ecran: unknown, moment: unknown): string | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      if (moment !== "avant" && moment !== "apres") return undefined;
      const captures =
        donnes?.livres?.find((candidat) => candidat.ticket === ticket)?.captures ??
        donnes?.rail.find((candidat) => candidat.ticket === ticket)?.captures ??
        donnes?.attend?.find((candidat) => candidat.ticket === ticket)?.carte?.captures ??
        undefined;
      return captures?.ecrans.find((candidat) => candidat.ecran === ecran)?.[moment as Moment] ?? undefined;
    },
    // La ligne du carnet d'une leçon promue, telle que la box l'a donnée à la dernière lecture : la seule
    // adresse que son lien ouvre (apprentissage.ts). Rien pour une leçon provisoire, ou qu'elle ne porte pas.
    lecon(projet: unknown, id: unknown): string | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      const url = donnes?.apprentissage?.lecons.find((candidate) => candidate.statut === "promue" && candidate.id === id)?.url;
      return ligneOuvrable(url) ? url : undefined;
    },
    // La carte de TODO d'un ticket, telle que la box l'a donnée à la dernière lecture : la seule à
    // laquelle le chef répond depuis l'app (carte-todo.ts). Rien pour un ticket qui n'en a pas.
    carte(projet: unknown, ticket: unknown): CarteLue | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      return donnes?.attend?.find((candidat) => candidat.ticket === ticket)?.carte;
    },
    // La PR mergée d'un ticket livré, telle que la box l'a donnée à la dernière lecture.
    pr(projet: unknown, ticket: unknown): string | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      const url = donnes?.livres?.find((candidat) => candidat.ticket === ticket)?.pr;
      return url != null && ouvrable(url) ? url : undefined;
    },
    // Les derniers faits lus d'un projet, et l'heure de leur lecture : c'est d'eux qu'une
    // confirmation tire son prix (confirmation.ts). Rien, s'ils ne sont pas lus.
    dernier(projet: unknown): { faits: Faits; a: string } | undefined {
      const tenu = typeof projet === "string" ? tenus.get(projet) : undefined;
      return tenu === undefined ? undefined : { faits: tenu.faits, a: tenu.lecture.a };
    },
    // Les corrections proposées que les derniers faits lus d'un projet portent, par leur numéro : seules
    // celles-là se tranchent depuis l'app (correction.ts).
    corrections(projet: unknown): number[] {
      return (typeof projet === "string" ? tenus.get(projet)?.faits.corrections : undefined)?.map(({ proposition }) => proposition) ?? [];
    },
    // Les profils proposés que les derniers faits lus d'un projet portent, par leur numéro : seuls
    // ceux-là se tranchent depuis l'app (profil.ts).
    profils(projet: unknown): number[] {
      return (typeof projet === "string" ? tenus.get(projet)?.faits.profils : undefined)?.map(({ proposition }) => proposition) ?? [];
    },
    // Ce que `facts` dit des stations d'un projet, à la dernière lecture — rien, s'il n'est pas lu.
    stations(projet: unknown): StationDesFaits[] | undefined {
      return typeof projet === "string" ? tenus.get(projet)?.faits.stations : undefined;
    },
    // Ce que `facts` dit du plafond de calibrage d'un projet, à la dernière lecture — rien, s'il n'est pas lu.
    plafondDeCalibrage(projet: unknown): PlafondLu | undefined {
      return typeof projet === "string" ? tenus.get(projet)?.faits.plafondDeCalibrage : undefined;
    },
    // Ce que le dernier bloc `attend` dit de ce ticket, ligne pour ligne — celles qui le précisent
    // comprises —, et son titre si `faits` le donne. Rien quand le bloc ne le nomme pas : la vue ne
    // fait pas dire à la file ce qu'elle n'a pas dit.
    attendu(projet: unknown, ticket: unknown): { lignes: string[]; titre?: string } | undefined {
      const bloc = typeof projet === "string" ? blocs.get(projet) : undefined;
      if (bloc === undefined || typeof ticket !== "number") return undefined;
      const entrees = ticketsDe(bloc.bloc).filter((attendu) => attendu.ticket === ticket);
      if (entrees.length === 0) return undefined;
      const donnes = tenus.get(projet as string)?.faits;
      const titre = donnes?.rail.find((candidat) => candidat.ticket === ticket)?.titre ?? donnes?.attend?.find((candidat) => candidat.ticket === ticket)?.titre;
      return { lignes: entrees.flatMap(({ ligne, suite }) => [ligne, ...suite]), ...(titre === undefined || titre === "" ? {} : { titre }) };
    },
    // Ce que les derniers faits donnent d'un ticket : son mot d'état et son titre sur le rail —
    // servi, s'il n'est que dans `livres`. Rien, s'ils ne le portent nulle part.
    ticket(projet: unknown, ticket: unknown): { etat?: string; titre?: string } | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      if (donnes === undefined) return undefined;
      const surLeRail = donnes.rail.find((candidat) => candidat.ticket === ticket);
      const livre = donnes.livres?.find((candidat) => candidat.ticket === ticket);
      const attendu = donnes.attend?.find((candidat) => candidat.ticket === ticket);
      if (surLeRail === undefined && livre === undefined && attendu === undefined) return undefined;
      const etat = surLeRail?.etat ?? (livre === undefined ? undefined : "servi");
      const titre = [surLeRail?.titre, livre?.titre, attendu?.titre].find((candidat) => candidat !== undefined && candidat !== "");
      return { ...(etat === undefined ? {} : { etat }), ...(titre === undefined ? {} : { titre }) };
    },
    oublier(): void {
      tenus.clear();
      blocs.clear();
      statuts.clear();
    },
  };
}
