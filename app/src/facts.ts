// Ce que l'app dessine : les faits que la box rend dans une forme faite pour un
// programme (`brigade <projet> faits` — docs/runtime/etat-et-mesures.md, « Les faits, pour un
// programme »). L'app n'y déduit rien : un état est un mot lu, un compteur un
// nombre lu. Une sortie qui n'est pas cette forme n'est pas dessinée du tout —
// ce que la box a rendu se lit à sa place. Et une couleur ne se pose que sur un
// mot des deux listes fermées : un mot inconnu s'affiche tel quel, sans couleur.
// Le rail se range en six colonnes : quatre d'après le mot d'état de chaque
// ticket ; TODO — ce que le chef peut trancher maintenant — d'après `attend`, que
// la forme donne, et les numéros en tête des lignes du bloc `attend` de `status`
// (awaiting.ts), qui dit le geste en mots ; WAITING — ce qui attend un tiers —
// d'après ce que la forme dit de chaque ticket (`tiers`). Chaque carte porte ce que la file dit du ticket : sa station
// et où elle cuit — box ou Mac — d'après la forme, le reste d'après sa ligne sous `rail`, dans `status` (slip.ts).
// Ce sont les deux seules choses lues hors de la forme.
import { vueOfPostMortems, type VueOfPostMortems } from "./projects/post-mortems.ts";
import { digestRead, threadsRead, type DigestRead, type ThreadsRead } from "./log/threads.ts";
import { logOfDay, type LogOfDay } from "./projects/log-of-day.ts";
import { topOfBacklogRead, type TopOfBacklog } from "./vue/rail/rail.ts";
import { kitchenBoardRead, type KitchenBoard } from "./board/kitchen-board.ts";
import type { ActionOfWait } from "./wait.ts";
import { saysOf, ticketsOf, type Shown } from "./awaiting.ts";
import { THE_CHEF, placeOf, linesOfRail, wordOfState, parkedOf, carry, priority, type Door } from "./slip.ts";
import { sTries } from "./trial.ts";
import { lineAtWork, lineBaseRed, lineOfHead, queuedLine, lineInWaiting, lineUnreadable, lineDelivered, lineSetAside, lineAwaitingMe, lineRefused, lineAnswered, type LineOfCard } from "./line-card.ts";
import type { FactsStation } from "./ordinary.ts";
import type { Failure, Reading } from "./box.ts";
import { capturesOfCard, type CapturesOfCard, type CapturesRead, type Moment } from "./captures.ts";
import { learningOf, learningInforms, learningRead, type Learning, type LearningRead } from "./learning.ts";
import { engineRead, type EngineOfDelivery } from "./vue/delivery-engine/engine.ts";
import { expectedOf, decisionRead, readDelivery, headOf, type Decision, type Delivery as AwaitedDelivery } from "./decision.ts";
import { header, type Header } from "./card.ts";
import { agentsOf, cookingOf, type CookingOfProject } from "./cooking.ts";
import { guardRepeatedRead, lineOfGuard, type GuardRepeatedRead, type LineOfGuard } from "./vue/card-ticket/guard-repeated.ts";
import { seniority, cadenceRead, trialsRead, points, type Seniority, type TrialRead, type Point, type CadenceRead } from "./cadence.ts";
import { cardOfTodo, cardOfChefOfTodo, cardRead, type CardOfTodo, type CardRead } from "./card-todo.ts";
import { LABEL_OF_CHEF, type CardOfChef, type Recommended } from "./board/todo-github.ts";
import { validationRead } from "./vue/validation-design/validation-design-github.ts";
import { WITHOUT_REASON, SERVED_ELSEWHERE, type SetAside } from "./board/set-aside-github.ts";
import { requiredRead, taskRead, type TaskHuman } from "./vue/wait-capacity/read.ts";
import { limitRead, type LimitOfAccount } from "./vue/banner-limit-github.ts";
import { quotaRead, type QuotaGithub } from "./vue/stations-quota/quota-read.ts";
import type { Answered } from "./answered.ts";
import type { PriorityShown } from "./priority.ts";

export const COMMAND = "facts";

// Un cook en cours : son ticket, le titre de ce ticket — vide s'il a quitté le
// rail pendant la cuisson —, sa station.
export type Cook = { ticket: number; titre: string; station: string };

// Ce que la cuisine fait tourner en ce moment hors des cooks de ticket (#1971) : son rôle
// (`pass`, `manager`, `triage`, `closer`), la station qui le fait tourner — nulle quand le runtime ne la nomme pas —, son
// ticket — nul pour le closer —, ce qu'il fait, en anglais, et depuis quand.
export type AgentRead = { role: string; station: string | null; ticket: number | null; fait: string; depuis: string };

// Le champ `agents` d'un `facts` : un agent qui n'a pas cette forme n'est pas lu, ni une liste qui n'en est pas une — le
// bloc des stations se dessine sans, comme pour un runtime d'avant ce champ.
export function agentsRead(raw: unknown): AgentRead[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
  return raw.flatMap((oneOf: unknown) => {
    if (typeof oneOf !== "object" || oneOf === null) return [];
    const { role, station, ticket, fait: done, depuis: since } = oneOf as Record<string, unknown>;
    const number = ticket === null || (typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket > 0);
    const or = station === null || text(station);
    return text(role) && or && number && text(done) && text(since) && !Number.isNaN(Date.parse(since))
      ? [{ role, station: station as string | null, ticket: ticket as number | null, fait: done, depuis: since }]
      : [];
  });
}

// Un rôle de la cuisine du projet (ticket 1274) : son nom, la ligne qui dit ce qu'il
// fait, et sa dernière action sur le projet — une courte phrase, son ticket et son heure —, nulle s'il n'a rien fait.
export type ActionOfRole = { what: string; ticket: number | null; at: string };
export type RoleOfKitchen = { role: string; does: string; latest: ActionOfRole | null };

// Le champ `rolesCuisine` d'un `facts` : une liste de rôles. Un rôle qui n'a pas cette forme n'est pas lu, ni une liste
// qui n'en est pas une — l'onglet Cooks se dessine sans, comme pour un runtime d'avant ce champ.
export function rolesKitchenRead(raw: unknown): RoleOfKitchen[] | undefined {
  const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
  const action = (value: unknown): ActionOfRole | null | undefined => {
    if (value === null) return null;
    if (typeof value !== "object") return undefined;
    const { what, ticket, at } = value as Record<string, unknown>;
    const number = ticket === null || (typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket > 0);
    return text(what) && number && text(at) && !Number.isNaN(Date.parse(at)) ? { what, ticket: ticket as number | null, at } : undefined;
  };
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((oneOf: unknown) => {
    if (typeof oneOf !== "object" || oneOf === null) return [];
    const { role, does, latest } = oneOf as Record<string, unknown>;
    const readEntry = action(latest);
    return text(role) && text(does) && readEntry !== undefined ? [{ role, does, latest: readEntry }] : [];
  });
}

// Un post-mortem de panne (#4023) : ses cinq champs — la cause, la durée, qui l'a vue
// en premier, ce qui l'a corrigée, le ticket du correctif ; ces deux derniers nuls quand rien ne les a dits —, et la fin de sa panne.
export type PostMortemOfTheOutage = { cause: string; duree: string; vuEnPremier: string; corrige: string | null; ticket: string | null; fin: string };

// Le champ `postMortems` d'un `facts` : une liste. Une entrée qui n'a pas cette forme n'est pas lue, ni une liste qui n'en est
// pas une — la vue dit alors qu'elle ne les a pas lus.
export function postMortemsRead(raw: unknown): PostMortemOfTheOutage[] | undefined {
  const full = (value: unknown): value is string => typeof value === "string" && value.length > 0;
  const oupas = (value: unknown): value is string | null => value === null || full(value);
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((oneOf: unknown) => {
    if (typeof oneOf !== "object" || oneOf === null) return [];
    const { cause, duree: duration, vuEnPremier: seenInFirst, corrige, ticket, fin: end } = oneOf as Record<string, unknown>;
    return full(cause) && full(duration) && full(seenInFirst) && oupas(corrige) && oupas(ticket) && full(end) && !Number.isNaN(Date.parse(end)) ? [{ cause, duree: duration, vuEnPremier: seenInFirst, corrige, ticket, fin: end }] : [];
  });
}

// La carte du chef lue de GitHub (board/todo-github.ts) : sa sorte et son texte, ou rien si elle n'a pas cette forme.
function chefRead(raw: unknown): CardOfChef | undefined {
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  if (typeof readOne?.sorte !== "string" || typeof readOne.texte !== "string") return undefined;
  // La carte « Validate its screen » (ticket 3185) garde ce que le corps de son issue dit, s'il a sa forme.
  const design = validationRead(readOne.design);
  // La recommandation d'un écart du manager (#3434) : nulle, il n'en recommande aucun — ni quand elle n'a pas sa forme : aucun
  // choix n'est mis en avant à sa place.
  const recommended = recommendedRead(readOne.recommandee);
  return { sorte: readOne.sorte, texte: readOne.texte, ...(design === undefined ? {} : { design }), ...(recommended === undefined ? {} : { recommandee: recommended }) };
}
function recommendedRead(raw: unknown): Recommended | null | undefined {
  if (raw === undefined) return undefined;
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  return typeof readOne?.texte === "string" && typeof readOne.pourquoi === "string" ? { texte: readOne.texte, pourquoi: readOne.pourquoi } : null;
}
// Ce qu'une carte du chef attend de lui, en une phrase, selon sa sorte ; une sorte que l'app ne connaît pas est dite telle quelle.
const WHO_M_AWAITING_OF_CHEF: Readonly<Record<string, string>> = {
  blocked: "Blocked: a ticket cannot go on without you.",
  "merge-by-hand": "Green, but not merged: merge it yourself.",
  "product-question": "A product question waits for your answer.",
  abandoned: "The kitchen gave this ticket up.",
  "design-validation": "A design delivery waits for you to validate its screen.",
  // La question du manager avant de découper une épique (board/question-of-epic-github.ts).
  "manager-epic-question": "The manager asked you a question before splitting this epic: it waits for your answer.",
  // Un ticket parqué pour le chef par un label d'attente d'avant parked (#3370, #4129, board/set-aside-github.ts, `carteDeLEcart`).
  "manager-parked": "Parked for you by a waiting label of before parked: it waits for your answer.",
  // Un ticket que la nouvelle cuisine parque pour le chef (`parked:chef`, #4474, board/parked-chef-github.ts).
  "parked-chef": "Parked for you by the kitchen: it goes back on the rail once you answer.",
};
const sentenceOfChef = (kind: string): string => WHO_M_AWAITING_OF_CHEF[kind] ?? `Waits for you: ${kind}.`;

// Ce qui met de côté un ticket d'un projet GitHub seul (board/set-aside-github.ts, #2075) : son label, la ligne qui dit
// pourquoi — nulle sans commentaire qui la porte —, et ses `#N` ouvrables, en https. Rien s'il n'a pas cette forme.
function setAsideRead(raw: unknown): SetAside | undefined {
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  if (typeof readOne?.label !== "string" || (readOne.raison !== null && typeof readOne.raison !== "string") || !Array.isArray(readOne.liens)) return undefined;
  const links = readOne.liens.flatMap((link: unknown) => {
    const { numero: number, url } = (typeof link === "object" && link !== null ? link : {}) as { numero?: unknown; url?: unknown };
    return typeof number === "number" && Number.isSafeInteger(number) && typeof url === "string" && openable(url) ? [{ numero: number, url }] : [];
  });
  return { label: readOne.label, raison: readOne.raison, liens: links };
}
// La ligne d'un ticket mis de côté sans commentaire qui dise pourquoi (board/set-aside-github.ts).
export { WITHOUT_REASON };

// Un ticket que le bloc `attend` nomme, et ce que `faits` en donne : son titre —
// vide s'il n'est pas sur le rail, le journal ne le connaît pas — et l'adresse de
// son issue, que la box donne : nulle quand elle n'en a pas. L'app n'en compose aucune.
// `decision` : ce que le chef a à trancher, en champs (decision.ts) — absente d'un
// runtime d'avant ce champ.
// `livraison` : pour une livraison qui attend, ce que la pass en a consigné (decision.ts) — absente
// quand elle n'a rien consigné, et d'un runtime d'avant ce champ.
// `carte` : pour une carte entrée par la porte de TODO, sa question, ses choix et ses captures
// (card-todo.ts) — absente pour toute autre entrée, et d'un runtime d'avant ce champ.
// `miseDeCote` : pour un ticket d'un projet GitHub seul que `served-elsewhere` met de côté, ce qui le
// met de côté (board/set-aside-github.ts, #2075) — absente pour toute autre entrée.
// Une carte qui attend un autre humain du projet que le compte connecté (vue/cards-assigned/, ticket 2985) : TODO la
// replie sous « Awaiting others » — comme une entrée de `attend` (sa carte, sa décision…), et `qui` elle attend, leurs logins
// GitHub : l'assignation ne retient personne, tout humain du projet l'ouvre et y répond (ticket 3071).
export type ExpectedOfOthers = Expected & { qui: string[] };
export type Expected = { ticket: number; titre: string; url: string | null; chef?: CardOfChef; decision?: Decision; livraison?: AwaitedDelivery; carte?: CardRead; tache?: TaskHuman; miseDeCote?: SetAside; illisible?: string };

// Un ticket servi dans les 24 h avant la lecture, que la box garde après la
// fermeture de son issue : `livre`, l'heure de son service ; `station`, celle qui
// l'a cuisiné — nulle quand aucune ne l'a envoyé en pass ; `pr`, la PR mergée —
// nulle pour un ticket servi sans merge ; `url`, son issue, nulle quand la box ne
// la connaît pas ; `relecture`, ce que le reviewer a dit de ce qui a été servi —
// nulle quand aucune relecture lisible ne porte dessus, absente d'un runtime
// d'avant ce champ.
// `captures` : pour un ticket d'interface, l'écran avant et après de sa livraison (captures.ts) —
// absentes pour tout autre ticket, et d'un runtime d'avant ce champ.
export type Delivers = { ticket: number; titre: string; url: string | null; livre: string; station: string | null; pr: string | null; prLue?: SizeOfPr; relecture?: Review | null; moteur?: EngineOfDelivery; captures?: CapturesRead; illisible?: string };
// Le résumé du reviewer et ses constats, dans ses mots.
export type Finding = { gravite: string; fichier: string | null; constat: string };
export type Review = { resume: string; constats: Finding[] };

// Ce que la cuisine fait d'un ticket pris ou en pass : le geste, en mots du chef ;
// ce qu'il vise — un fichier, une commande —, nul s'il ne vise rien ; l'heure où
// elle s'y est mise, à l'horloge de la box.
// `faitEn` : le même geste en anglais, celui de la carte ; absent d'un runtime d'avant ce champ.
// `etape` : en pass, l'étape où la pass en est (« CI running », « review », « waiting for main », « merging ») ; absente
// sinon, et d'un runtime d'avant ce champ.
export type Activity = { fait: string; faitEn?: string; cible: string | null; depuis: string; etape?: string };

// Ce qu'un ticket mis de côté attend, comme le runtime le dit : `raison` en clair
// (« attend : setup du projet impossible »), `colonne` : celle du rail où il est.
export type Wait = { raison: string; complete?: string; label?: string; colonne: string; retour: string | null };

// Ce qu'un ticket en WAITING attend d'un tiers, comme le runtime le donne : `quoi`, dans
// les mots du chef ; `qui` ; `depuis`, sa mise en attente, et `relance`, quand y revenir,
// à l'horloge de la box ; `aLArrivee`, ce que « c'est arrivé » fera de lui, en clair. Un ticket mis de côté faute de
// station y est aussi : le chef n'a posé aucune attente, donc `relance` est nulle et la carte n'a rien à reprendre.
export type Third = { quoi: string; qui: string; depuis: string; relance: string | null; aLArrivee: string };

// Une décision du chef qui retient toute la cuisine, comme le runtime la donne
// (`DecisionUrgente`) : `decision`, ce qui la nomme en tête
// de sa ligne du bloc `attend` (`#535`, une station, `base`, `setup`) ; `ticket`,
// nul hors ticket ; `cause`, son mot ; `geste`, sa ligne du bloc — ce qui attend,
// puis le geste du chef ; `url`, l'adresse de son issue, nulle sans elle.
export type DecisionUrgent = { decision: string; ticket: number | null; cause: string; geste: string; url: string | null };
// L'urgence : plus rien ne cuit, et c'est le chef que toute la cuisine attend.
// `depuis` : le début de l'arrêt total, à l'horloge de la box ; `retenus` : les
// tickets à l'arrêt ; `autres` : les autres décisions qui en retiennent aussi ;
// `alerte` : celle que le runtime a émise pour cette urgence, nulle tant qu'il ne
// l'a pas annoncée, absente d'un runtime d'avant ce champ.
export type Emergency = DecisionUrgent & { depuis: string; retenus: number[]; autres: DecisionUrgent[]; alerte?: AlertEmergency | null };
// Une décision du chef qui retient des tickets, et eux seuls : `retenus`, ceux qui l'attendent. Les
// autres tickets cuisent (`retenues`).
export type Held = DecisionUrgent & { retenus: number[] };
// L'alerte d'urgence émise (`AlerteExposee`) : sa ligne, sa
// première émission, la dernière, rappel compris, et le nombre de rappels.
export type AlertEmergency = { libelle: string; emiseLe: string; derniereLe: string; rappels: number };

// Les appels de la box à GitHub sur la dernière heure : le total, et ce qui en a fait le plus (nul quand rien n'a été appelé).
export type CallsGithub = { total: number; topProject: { name: string; calls: number } | null; topKind: { name: string; calls: number } | null };

// La forme, telle que le runtime la fige (`Faits`).
// `cooks`, `attend`, `livres`, `urgence` : absents, c'est un runtime d'avant ce
// champ — les seuls que la forme laisse manquer. `urgence` nulle : la
// cuisine n'attend pas le chef tout entière — une décision qui ne retient qu'une partie
// du rail n'en est pas une.
export type Facts = {
  etat: string;
  lu: string;
  dernierTick: string | null;
  // Quand GitHub limite les appels du compte : l'instant où il les rend (runtime, `limiteGithub`) ; absent sinon, et d'un runtime d'avant ce champ.
  limiteGithub?: string;
  // La limite que GitHub pose aux appels du compte — laquelle, depuis quand, retour vers quand (runtime, `github`) ; absente quand les appels passent (vue/banner-limit-github.ts).
  github?: LimitOfAccount;
  // Le quota GitHub du compte et ce qui l'use (runtime, `quotaGithub`, ticket 3483) : la jauge de l'onglet Stations ; absent d'un runtime d'avant ce champ.
  quotaGithub?: QuotaGithub;
  // Le refus de l'interrupteur GitHub seul par le runtime (`githubSeul`, ticket 2161) : sa raison en une phrase, et depuis quand ; absent quand l'interrupteur est éteint ou accepté.
  githubSeulRefuse?: { reason: string; since: string };
  // Le dépôt du projet, quand le compte GitHub de l'app ne peut pas y écrire (board/read.ts, `lectureSeule`, #3163) ; absent sinon, et quand GitHub ne l'a pas dit.
  lectureSeule?: { depot: string };
  // Le rail, haut du backlog (vue/rail/, #4223) : les issues calibrées et prêtes, par priorité puis âge, et leur écran ;
  // absent d'une lecture qui ne le compose pas.
  hautDuBacklog?: TopOfBacklog;
  // Le kanban d'un projet de la nouvelle cuisine (board/kitchen-board.ts, #4482) : ses six colonnes, tirées des labels seuls ;
  // absent d'un projet du runtime d'avant.
  kitchenBoard?: KitchenBoard;
  // Les appels de la box à GitHub sur l'heure glissante (runtime, `appelsGithub`) : leur total, le projet et la lecture qui en ont fait le plus ; absent d'un runtime d'avant ce champ.
  appelsGithub?: CallsGithub;
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
  // `essais` : d'un ticket pris, ses essais depuis sa première prise, le plus ancien d'abord (#1893) ; absent pour tout autre.
  // Le rail est dans l'ordre où il se sert : la priorité de l'issue, puis son âge.
  // `pr` : la PR ouverte qui le livre ; `renvoi` : le dernier renvoi de sa livraison à un cook, et pourquoi (ticket 3302) —
  // absents sans eux, et d'un runtime d'avant ces champs.
  rail: { ticket: number; etat: string; titre: string; url: string; depuis?: string; essais?: TrialRead[]; gardeRepetee?: GuardRepeatedRead; activite?: Activity | null; attente?: Wait | null; tiers?: Third | null; revenu?: string | null; raison?: string | null; captures?: CapturesRead; requiert?: string[]; station?: string; requires?: string[]; attend?: number[]; illisible?: string; pr?: { numero: number; url: string }; renvoi?: { n: number; raison: string } }[];
  cooks?: Cook[];
  attend?: Expected[];
  // Ce qui attend un autre humain du projet que le compte connecté (ticket 2985) : hors de `attend`, et de toute colonne
  // — TODO le replie sous « Awaiting others ». Absent quand rien n'attend un autre humain, et des `facts` d'une station.
  attendAutres?: ExpectedOfOthers[];
  livres?: Delivers[];
  urgence?: Emergency | null;
  // Les décisions du chef qui retiennent des tickets sans arrêter la cuisine : absent, c'est un
  // runtime d'avant ce champ.
  retenues?: Held[];
  // Les stations que le projet déclare et ce qu'elles font des tickets ordinaires (ordinary.ts) ; absent d'un runtime d'avant ce champ.
  stations?: FactsStation[];
  // Les stations d'un projet sur GitHub seul, dites de GitHub par l'app (vue/rail/github.ts, #2358) : leurs prises et
  // leurs signes de vie, la box comme un ordinateur ; `illisible`, pourquoi leurs signes de vie ne se lisent pas. Absent
  // des `facts` d'une station.
  stationsSurGithub?: { illisible: string | null };
  // Ce qui tourne hors des cooks de ticket — la pass, le manager, le triage, le closer (#1971) ; absent d'un runtime
  // d'avant ce champ.
  agents?: AgentRead[];
  // À quelle allure elle sert (cadence.ts, ticket 1811) : servis et ratés heure par heure sur les 24 dernières, et le temps
  // ordinaire d'un ticket pris, puis en pass ; absent d'un runtime d'avant ce champ.
  cadence?: CadenceRead;
  // Les rôles de la cuisine du projet, chacun avec sa ligne et sa dernière action (ticket 1274) ; absent d'un runtime
  // d'avant ce champ.
  rolesCuisine?: RoleOfKitchen[];
  // Les post-mortems des pannes du projet (#4023) — absent d'un runtime qui ne les donne pas.
  postMortems?: PostMortemOfTheOutage[];
  // Ce que les cooks ont appris au projet, ses leçons et ses profils (learning.ts) : absent quand il
  // n'a ni leçon ni profil, et d'un runtime d'avant ce champ.
  apprentissage?: LearningRead;
  // Les fils des agents du projet, et le digest de la veille (log/threads.ts, ticket 4274) : le journal du jour et la carte
  // du matin de sa vue — absents d'un runtime qui ne les donne pas.
  fils?: ThreadsRead;
  digest?: DigestRead;
};

// Ce que la vue dessine d'un projet, prêt à poser : elle n'y calcule rien.
// `ton` : la couleur du mot d'état — absente, le mot n'est pas de la liste fermée.
// `arretee` : la bannière d'arrêt se pose.
// Une carte du rail : `ouvrable`, ce ticket s'ouvre sur son issue ; `attendu`, il
// attend une décision du chef, et il est dans TODO — la liste de ce qui attend le chef, que la vue pose en rouge dans la
// colonne de son étape (#3458) ; `attend`, ce que le bloc
// `attend` dit de lui, entrée par entrée, mot pour mot — une entrée et ce qui la
// précise dessous d'un seul tenant, ses lignes comprises. Sans `etat` ni `titre` :
// il attend, et il n'est pas sur le rail que `faits` rend. Et ce qu'elle porte de
// la file (slip.ts) : ce qu'elle dit du ticket, ce qu'elle n'en dit pas, sa ligne
// telle quelle quand l'app n'a pas su la découper. Dans Livré, `pr` : la PR mergée
// du ticket s'ouvre — faux, son adresse n'est pas en https ; absent, il n'en a pas.
// Et `livraison` : ce qui a été livré. `fiche` : l'en-tête de sa fiche, qu'un clic sur
// la carte ouvre par-dessus le rail (card.ts) — pour une carte qui t'attend, ce qu'on attend
// de toi, en une phrase (decision.ts). `decision` : ce que `faits` en donne, d'où se lisent
// cette phrase et les gestes de la fiche ; absente d'un runtime d'avant ce champ. `gestes` : ceux de WAITING que la carte
// porte (wait.ts) — « waiting for… » sur une carte de TODO que le runtime laisse attendre,
// « resume » et « it arrived » sur une carte de WAITING ; absent, elle n'en porte aucun.
// `captures` : celles d'un ticket d'interface livré, avant et après (captures.ts) — absentes,
// le ticket n'est pas d'interface ou n'a rien livré, et la carte n'en dit rien.
// `question` : sur une carte de TODO, son issue porte une question du manager — avant de découper
// une épique, ou qui la parque pour le chef (`chef-todo`) —, que la carte dit en deux lignes (question.ts).
// `todo` : sur une carte de TODO entrée par la porte du runtime, sa question, ses choix et ses captures
// (card-todo.ts) — ce que le chef tranche sur la carte même, d'un clic ou d'un texte.
// `repondue` : sur une carte de WAITING, sa question est répondue, et elle attend que le manager lise
// la réponse (answered.ts) — qui y a répondu, et quand.
// `prio` : sa priorité, telle que sa ligne de `status` l'écrit (`prio:2`), `no prio` quand son issue n'en porte
// pas — absente, la ligne n'est pas lue.
// `age` : sur une carte de Taken ou de Pass, depuis combien de temps elle y est (cadence.ts) — absent pour une autre, et
// d'un runtime qui ne dit pas l'entrée du ticket dans sa colonne.
// `essais` : un point par essai de la cuisine sur ce ticket (cadence.ts), dès qu'il y en a plus d'un (#1895).
// `essai` : le rang de l'essai en cours d'un ticket pris plus d'une fois (#3923) — absent pour un premier essai.
// `etape` : sur une carte qui attend le chef, la colonne de son étape, où la vue la pose en rouge (#3458) — TODO n'est
// pas une colonne. `relancePassee` : sur une carte de WAITING, sa relance est passée — sa ligne le signale ; parked jusqu'à
// une date, elle n'attend pas le chef pour autant : ni rouge, ni dans son TODO (#4261).
// `miseDeCote` : sur une carte de TODO d'un projet GitHub seul, le label qui met son ticket de côté, et les `#N` de sa
// ligne qui s'ouvrent d'un clic (#2075) — sa ligne dit pourquoi.
// Et ce qu'elle dit, elle, en deux lignes (line-card.ts) : `ligne`, ce qui se passe ; `signal`, ce qui demande
// l'attention ; `repere`, la file ne dit pas tout — le détail est dans la fiche, avec `dit` et `sans`.
// Ce que la carte d'un ticket en pass ou servi dit de sa PR : son numéro et son lien ; ses lignes ajoutées et retirées, et son âge
// quand GitHub les a donnés (#4051). `TailleDePr` : ce que GitHub en a donné, rien de plus.
export type SizeOfPr = { additions?: number; deletions?: number; ouvertLe?: string };
export type DeliveryRead = { numero: number; url: string; lignes?: { ajoutees: number; retirees: number }; age?: string };
export type Card = Partial<LineOfCard> & { ticket: number; etat?: string; mot?: string; ton?: string; titre?: string; ouvrable: boolean; attendu: boolean; attend: string[]; decision?: Decision; pr?: boolean; livraisonLue?: DeliveryRead; livraison?: Delivery; moteur?: EngineOfDelivery; captures?: CapturesOfCard; fiche: Header; gestes?: ActionOfWait[]; question?: true; todo?: CardOfTodo; chef?: CardOfChef; repondue?: { par: string; a: string }; qui?: string[]; prio?: string; apres?: number[]; age?: Seniority; essais?: Point[]; essai?: number; garde?: LineOfGuard; requiert?: string[]; station?: string; enWaiting?: true; etape?: string; relancePassee?: true; tache?: TaskHuman; miseDeCote?: { label: string; liens: number[] }; refus?: { brut: string }; essayable?: true; sansCook?: true } & Door;
// Ce qui a été livré, sur une carte de Livré : le résumé de la relecture, mot pour
// mot, et ses constats sous leur nombre dit en clair (`remarques`) — ou, sans
// relecture, pourquoi elle n'est pas là. Rien n'est mis à sa place.
export type Delivery = { resume: string; remarques: string; constats: Finding[] } | { sans: string };
// `compte` : le nombre de ses cartes — ou `?`, pour TODO, tant que rien ne dit
// qui attend. `vide` : ce qui se lit à la place des cartes quand il n'y en a pas.
// `defile` : ses cartes défilent dans une hauteur bornée — longue, la colonne ne
// pousse rien sous les autres.
// `autres` : dans TODO, les cartes qui attendent un autre humain du projet (ticket 2985), repliées sous « Awaiting
// others » après les siennes — leur question, qui elles attendent ; absent quand il n'y en a aucune.
export type Column = { nom: string; ton: string; compte: string; cartes: Card[]; vide: string; defile?: true; autres?: Card[] };
// `hors` : les tickets que `faits` rend et qu'aucune colonne ne prend. `attendLu` :
// l'heure de la lecture de `status` dont vient le bloc — absente, il n'a pas été pris.
// `railLu` : celle dont viennent les lignes que les cartes portent — absente, la
// ligne `rail` de `status` n'a pas été lue. `aucunTicket` : aucune carte, hors Livré — rien à
// cuire, rien en cuisson, rien qui t'attende : c'est là que se dit ce qui est en amont (upstream.ts).
// `cadence` : l'histogramme des 24 dernières heures, servis et ratés (cadence.ts) — absent d'un runtime d'avant ce champ.
export type Rail = { colonnes: Column[]; hors: Card[]; aucunTicket?: true; attendLu?: string; railLu?: string };
// Le bloc `attend` d'un projet, tel que `status` l'a écrit, et l'heure de sa lecture.
export type BlockRead = { bloc: string; a: string };
// Ce que `status` a rendu pour un projet, son bloc `attend` mis à part, et l'heure de sa lecture.
export type StatusRead = { texte: string; a: string };
// `vide` : ce qui se lit à la place des cooks quand il n'y en a pas à poser.
export type Board = {
  etat: string;
  mot?: string;
  ton?: string;
  arretee: boolean;
  tick: string;
  compteurs: { libelle: string; nombre: number }[];
  cooks: { enCours: Cook[]; vide: string };
  evenement: string;
  // La ligne « nothing cooks: base red since …, repair #N in progress » (« rien ne cuit : base rouge depuis …, réparation #N en cours » avant #928) que `status` écrit
  // en tête, mot pour mot — absente quand `status` n'est pas lu ou ne la porte pas.
  rienNeCuit?: string;
  rail: Rail;
  // Le rail, haut du backlog (vue/rail/, #4223) : au-dessus des colonnes, sous le bandeau Backlog. Absent sans lecture qui le porte.
  hautDuBacklog?: TopOfBacklog;
  // Le kanban d'un projet de la nouvelle cuisine (#4482) : la vue le dessine à la place du plan de la cuisine.
  kitchenBoard?: KitchenBoard;
  // Le dépôt du projet quand le compte GitHub de l'app ne peut pas y écrire (#3163) : la vue l'ouvre en lecture seule —
  // tout s'y voit, aucun geste n'y est offert, et une ligne en tête le dit. Absent : la vue ordinaire.
  lectureSeule?: { depot: string };
  // Le quota GitHub du compte, pour la jauge de l'onglet Stations (ticket 3483) — absent d'un runtime qui ne le donne pas.
  quotaGithub?: QuotaGithub;
  // Les tickets sur lesquels un agent travaille à cette lecture (#2984) : la vue pose la poêle à côté de leur carte. Absent
  // d'un tableau qui ne vient pas d'ici (un souvenir d'avant ce champ) : rien n'y cuit.
  auTravail?: number[];
  // Ce que chaque station du projet en fait, ses cooks et son geste, et la ligne d'alerte de l'onglet Rail
  // (cooking.ts) — absent d'un runtime qui ne donne pas les stations.
  stations?: CookingOfProject;
  // Les rôles de la cuisine du projet, sur l'onglet Cooks — absent d'un runtime qui ne les donne pas.
  rolesCuisine?: RoleOfKitchen[];
  // Les post-mortems des pannes du projet (#4023), la liste et le compte de la section de Settings du projet, tels que
  // projects/post-mortems.ts les met en forme à cette lecture — absent d'un runtime qui ne les donne pas.
  postMortems?: VueOfPostMortems;
  // Ce que les cooks ont appris au projet (learning.ts) : ses leçons et ses profils, que la page
  // Reliability pose sous les causes corrigées — vides, elle le dit en une phrase.
  apprentissage: Learning;
  // Où en est chaque ticket pris, en pass ou servi, que le récit du premier ticket suit (ticket 3302,
  // vue/first-ticket/) — absent d'un tableau qui ne vient pas d'ici (un souvenir d'avant ce champ).
  etapesDesTickets?: StepOfTicket[];
  // Le journal du jour, tiré des fils des agents à cette lecture (projects/log-of-day.ts, ticket 4274), avec les gestes
  // illisibles qu'il n'a pas pu ranger — ou pourquoi les fils ne se lisent pas ; et le digest de la veille. Absents d'un
  // runtime qui ne les donne pas.
  journal?: (LogOfDay & { illisibles: number }) | { illisible: string };
  digest?: DigestRead;
};

// Un ticket tel que le récit du premier ticket le suit (ticket 3302) : son mot d'état (`pris`, `en pass`, `base rouge`,
// `servi`…), la PR qui le livre — `numero` nul quand l'adresse ne le dit pas ; nulle sans PR, ou quand son adresse n'est
// pas en https et ne s'ouvre pas —, et son dernier renvoi à un cook — nul sans renvoi.
export type StepOfTicket = { ticket: number; etat: string; pr: { numero: number | null; url: string } | null; renvoi: { n: number; raison: string } | null };

// Ce qu'une lecture de `faits` donne à la vue : le tableau ; ou, sous un `titre`
// qui dit lequel, ce que la box a `rendu` à la place des faits, mot pour mot, et
// en quoi ce n'est pas la forme (`informe`) ; ou l'échec de la veille, tel quel.
// `publieLe` : l'heure où la box a lu l'état que ce rail montre (#2054) — absent d'une lecture qui ne vient pas du tableau.
export type Drawable = { projet: string; demande: number; a: string; publieLe?: string } & ({ tableau: Board } | { titre: string; informe: string; rendu: string } | ({ titre: string } & Failure));

class Informs extends Error {}

// Un élément d'une liste que l'app ne sait pas lire — une valeur d'une box plus récente — ne gâte que sa carte : son
// numéro seul est exigé, car sans lui il n'y a pas de carte. `rendre` en lit la forme ; `sinon`, la carte qu'on en
// dessine à la place, avec la raison de l'échec.
export const UNREADABLE_STATE = "unreadable";
const withoutNumber = (readOne: Record<string, unknown>, which: string) => ({ ticket: whole(readOne.ticket, `${which}.ticket`), titre: typeof readOne.titre === "string" ? readOne.titre : "" });
function except<T>(readOne: Record<string, unknown>, which: string, render: () => T, sinon: (base: { ticket: number; titre: string }, reason: string) => T): T {
  const base = withoutNumber(readOne, which);
  try {
    return render();
  } catch (error) {
    if (error instanceof Informs || learningInforms(error)) return sinon(base, error.message);
    throw error;
  }
}

const refuse = (field: string, expected: string): never => {
  throw new Informs(`“${field}” is not ${expected}`);
};
const object = (value: unknown, field: string): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : refuse(field, "an object");
const text = (value: unknown, field: string): string => (typeof value === "string" ? value : refuse(field, "a string"));
const whole = (value: unknown, field: string): number => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : refuse(field, "a non-negative integer"));
const hour = (value: unknown, field: string): string => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : refuse(field, "a time"));
const engineOf = (readOne: Record<string, unknown>, field: string): { moteur?: EngineOfDelivery } => {
  const engine = engineRead(readOne.engine, readOne.costUsd, field, refuse);
  return engine === undefined ? {} : { moteur: engine };
};
const orNothing = <T>(value: unknown, field: string, read: (value: unknown, field: string) => T): T | null => (value === null ? null : read(value, field));
const textsRead = (value: unknown, field: string): string[] => (Array.isArray(value) ? value.map((oneOf, rank) => text(oneOf, `${field}[${rank}]`)) : refuse(field, "a list"));
const numbersRead = (value: unknown, field: string): number[] => (Array.isArray(value) ? value.map((oneOf, rank) => whole(oneOf, `${field}[${rank}]`)) : refuse(field, "a list"));
const boolean = (value: unknown, field: string): boolean => (typeof value === "boolean" ? value : refuse(field, "true or false"));

const named = (value: unknown, field: string): { name: string; calls: number } => {
  const readOne = object(value, field);
  return { name: text(readOne.name, `${field}.name`), calls: whole(readOne.calls, `${field}.calls`) };
};
const callsRead = (value: unknown): CallsGithub => {
  const readOne = object(value, "appelsGithub");
  return { total: whole(readOne.total, "appelsGithub.total"), topProject: orNothing(readOne.topProject, "appelsGithub.topProject", named), topKind: orNothing(readOne.topKind, "appelsGithub.topKind", named) };
};

// Une station que le projet déclare, et ce qu'elle fait des tickets ordinaires (ordinary.ts).
function understandStation(value: unknown, field: string): FactsStation {
  const readOne = object(value, field);
  return {
    station: text(readOne.station, `${field}.station`),
    distante: boolean(readOne.distante, `${field}.distante`),
    plafond: orNothing(readOne.plafond, `${field}.plafond`, whole),
    ordinaires: boolean(readOne.ordinaires, `${field}.ordinaires`),
    bacASable: orNothing(readOne.bacASable, `${field}.bacASable`, (sandbox, which) => {
      const said = object(sandbox, which);
      return {
        disponible: boolean(said.disponible, `${which}.disponible`),
        raison: orNothing(said.raison, `${which}.raison`, text),
        version: orNothing(said.version, `${which}.version`, text),
        depuis: hour(said.depuis, `${which}.depuis`),
      };
    }),
    prendOrdinaires: boolean(readOne.prendOrdinaires, `${field}.prendOrdinaires`),
    // Ce que la station fait du projet (#1183) : absent d'un runtime d'avant ce champ.
    ...(readOne.cuisson === undefined ? {} : { cuisson: text(readOne.cuisson, `${field}.cuisson`) }),
    ...(readOne.lacks === undefined ? {} : { lacks: text(readOne.lacks, `${field}.lacks`) }),
    ...(readOne.arreteeDepuis === undefined ? {} : { arreteeDepuis: orNothing(readOne.arreteeDepuis, `${field}.arreteeDepuis`, hour) }),
    ...(readOne.refus === undefined
      ? {}
      : {
          refus: orNothing(readOne.refus, `${field}.refus`, (refusal, which) => {
            const said = object(refusal, which);
            return { code: text(said.code, `${which}.code`), message: text(said.message, `${which}.message`), action: text(said.action, `${which}.action`) };
          }),
        }),
    ...(readOne.cooks === undefined
      ? {}
      : {
          cooks: (Array.isArray(readOne.cooks) ? readOne.cooks : refuse(`${field}.cooks`, "a list")).map((cook: unknown, rank) => {
            const which = `${field}.cooks[${rank}]`;
            const said = object(cook, which);
            return { ticket: whole(said.ticket, `${which}.ticket`), titre: text(said.titre, `${which}.titre`), station: text(said.station, `${which}.station`) };
          }),
        }),
    // Ce que la principale sait d'elle (#1830) : absent d'un runtime d'avant ces champs.
    ...(readOne.fournit === undefined ? {} : { fournit: (Array.isArray(readOne.fournit) ? readOne.fournit : refuse(`${field}.fournit`, "a list")).map((capacity: unknown, rank) => text(capacity, `${field}.fournit[${rank}]`)) }),
    ...(readOne.presente === undefined ? {} : { presente: boolean(readOne.presente, `${field}.presente`) }),
    ...(readOne.vueLe === undefined ? {} : { vueLe: orNothing(readOne.vueLe, `${field}.vueLe`, hour) }),
    // Son moteur (#3746), passé tel quel : la vue le lit, et un état mal formé n'y dit rien sans rendre `facts` illisible.
    ...(readOne.engine === undefined ? {} : { engine: readOne.engine }),
  };
}

// Ce que la cuisine fait d'un ticket : un geste, ce qu'il vise ou rien, une heure.
function understandActivity(value: unknown, field: string): Activity {
  const readOne = object(value, field);
  return { fait: text(readOne.fait, `${field}.fait`), ...(readOne.faitEn === undefined ? {} : { faitEn: text(readOne.faitEn, `${field}.faitEn`) }), ...(readOne.etape === undefined ? {} : { etape: text(readOne.etape, `${field}.etape`) }), cible: orNothing(readOne.cible, `${field}.cible`, text), depuis: hour(readOne.depuis, `${field}.depuis`) };
}

// Ce que le reviewer a dit d'une livraison servie : son résumé, ses constats dans son ordre.
function understandReview(value: unknown, field: string): Review {
  const readOne = object(value, field);
  return {
    resume: text(readOne.resume, `${field}.resume`),
    constats: (Array.isArray(readOne.constats) ? readOne.constats : refuse(`${field}.constats`, "une liste")).map((raw: unknown, rank) => {
      const which = `${field}.constats[${rank}]`;
      const finding = object(raw, which);
      return { gravite: text(finding.gravite, `${which}.gravite`), fichier: orNothing(finding.fichier, `${which}.fichier`, text), constat: text(finding.constat, `${which}.constat`) };
    }),
  };
}

function understandDecision(value: unknown, field: string): DecisionUrgent {
  const readOne = object(value, field);
  return {
    decision: text(readOne.decision, `${field}.decision`),
    ticket: orNothing(readOne.ticket, `${field}.ticket`, whole),
    cause: text(readOne.cause, `${field}.cause`),
    geste: text(readOne.geste, `${field}.geste`),
    url: orNothing(readOne.url, `${field}.url`, text),
  };
}

// L'urgence : la décision qui retient le plus de tickets, depuis quand tout est à l'arrêt,
// les tickets retenus, les autres décisions.
function understandEmergency(value: unknown, field: string): Emergency {
  const readOne = object(value, field);
  const list = (raw: unknown, name: string): unknown[] => (Array.isArray(raw) ? raw : refuse(name, "a list"));
  return {
    ...understandDecision(readOne, field),
    depuis: hour(readOne.depuis, `${field}.depuis`),
    retenus: list(readOne.retenus, `${field}.retenus`).map((ticket, rank) => whole(ticket, `${field}.retenus[${rank}]`)),
    autres: list(readOne.autres, `${field}.autres`).map((other, rank) => understandDecision(other, `${field}.autres[${rank}]`)),
    ...(readOne.alerte === undefined ? {} : { alerte: orNothing(readOne.alerte, `${field}.alerte`, understandAlertEmergency) }),
  };
}

function understandHeld(value: unknown, field: string): Held {
  const readOne = object(value, field);
  const retainedOnes = Array.isArray(readOne.retenus) ? readOne.retenus : refuse(`${field}.retenus`, "a list");
  return { ...understandDecision(readOne, field), retenus: retainedOnes.map((ticket: unknown, rank: number) => whole(ticket, `${field}.retenus[${rank}]`)) };
}

// L'alerte émise pour l'urgence : sa ligne, ses deux heures, ses rappels.
function understandAlertEmergency(value: unknown, field: string): AlertEmergency {
  const readOne = object(value, field);
  return {
    libelle: text(readOne.libelle, `${field}.libelle`),
    emiseLe: hour(readOne.emiseLe, `${field}.emiseLe`),
    derniereLe: hour(readOne.derniereLe, `${field}.derniereLe`),
    rappels: whole(readOne.rappels, `${field}.rappels`),
  };
}

// Les captures d'une livraison d'interface : si elle les porte toutes, et chaque écran avec
// l'adresse de sa capture avant et de sa capture après, nulle quand elle manque.
function understandCaptures(raw: unknown, which: string): CapturesRead {
  const readOne = object(raw, which);
  if (typeof readOne.complet !== "boolean") refuse(`${which}.complet`, "a boolean");
  return {
    complet: readOne.complet as boolean,
    ecrans: (Array.isArray(readOne.ecrans) ? readOne.ecrans : refuse(`${which}.ecrans`, "a list")).map((screen: unknown, rank) => {
      const itsOwn = `${which}.ecrans[${rank}]`;
      const readEntry = object(screen, itsOwn);
      return { ecran: text(readEntry.ecran, `${itsOwn}.ecran`), avant: orNothing(readEntry.avant, `${itsOwn}.avant`, text), apres: orNothing(readEntry.apres, `${itsOwn}.apres`, text) };
    }),
  };
}

function understandWait(raw: unknown, which: string): Wait {
  const readOne = object(raw, which);
  return { raison: text(readOne.raison, `${which}.raison`), ...(readOne.complete === undefined ? {} : { complete: text(readOne.complete, `${which}.complete`) }), ...(readOne.label === undefined ? {} : { label: text(readOne.label, `${which}.label`) }), colonne: text(readOne.colonne, `${which}.colonne`), retour: orNothing(readOne.retour, `${which}.retour`, text) };
}

function understandThird(raw: unknown, which: string): Third {
  const readOne = object(raw, which);
  return {
    quoi: text(readOne.quoi, `${which}.quoi`),
    qui: text(readOne.qui, `${which}.qui`),
    depuis: hour(readOne.depuis, `${which}.depuis`),
    relance: orNothing(readOne.relance, `${which}.relance`, hour),
    aLArrivee: text(readOne.aLArrivee, `${which}.aLArrivee`),
  };
}

// `stationsSurGithub`, de la racine de `facts` : posé par l'app sur un projet GitHub seul — rien de mal formé ne le pose.
function onGithubRead(value: unknown): { stationsSurGithub?: { illisible: string | null } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { illisible: unreadable } = value as Record<string, unknown>;
  return { stationsSurGithub: { illisible: typeof unreadable === "string" && unreadable !== "" ? unreadable : null } };
}

// `lectureSeule`, de la racine de `facts` (#3163) : le dépôt où le compte ne peut pas écrire ; rien de mal formé ne le pose.
function readOnlyRead(value: unknown): { lectureSeule?: { depot: string } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { depot: repository } = value as Record<string, unknown>;
  return typeof repository === "string" && repository !== "" ? { lectureSeule: { depot: repository } } : {};
}

// `githubSeul`, de la racine de `facts` : seul un refus se garde, avec sa raison ; rien de mal formé ne la fait inventer.
function refusalGitHubOnlyRead(value: unknown): { githubSeulRefuse?: { reason: string; since: string } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { etat: state, reason, since } = value as Record<string, unknown>;
  if (state !== "refused" || typeof reason !== "string" || reason === "") return {};
  return { githubSeulRefuse: { reason, since: typeof since === "string" ? since : "" } };
}

// Une entrée de `attend`, ou de `attendAutres` (qui y ajoute `qui`) : une lue de travers ne tombe que sur elle.
function expectedRead(readOne: Record<string, unknown>, which: string): Expected {
  return except<Expected>(readOne, which, () => {
    const decision = readOne.decision === undefined ? undefined : (decisionRead(readOne.decision) ?? refuse(`${which}.decision`, "a decision"));
    const delivery = readOne.livraison === undefined ? undefined : readDelivery(readOne.livraison);
    const card = readOne.carte === undefined ? undefined : cardRead(readOne.carte);
    const chef = chefRead(readOne.chef);
    const setAside = setAsideRead(readOne.miseDeCote);
    return { ticket: whole(readOne.ticket, `${which}.ticket`), titre: text(readOne.titre, `${which}.titre`), url: orNothing(readOne.url, `${which}.url`, text), ...(chef === undefined ? {} : { chef }), ...(setAside === undefined ? {} : { miseDeCote: setAside }), ...(decision === undefined ? {} : { decision }), ...(delivery === undefined ? {} : { livraison: delivery }), ...(card === undefined ? {} : { carte: card }), ...taskRead(readOne.tache) };
  }, ({ ticket, titre: title }, unreadable) => ({ ticket, titre: title, url: null, illisible: unreadable }));
}

// L'entrée de TODO d'un ticket que `faits` porte : celle qui attend le compte connecté, ou un autre humain du projet — la
// carte de l'un et de l'autre s'ouvre et se répond de même (ticket 3071).
export const entryOf = (facts: Pick<Facts, "attend" | "attendAutres"> | undefined, ticket: unknown): Expected | undefined =>
  facts?.attend?.find((candidate) => candidate.ticket === ticket) ?? facts?.attendAutres?.find((candidate) => candidate.ticket === ticket);

// Sa taille et l'heure de son ouverture : dites seulement quand GitHub les a données, jamais inventées.
function sizeOfPrRead(said: Record<string, unknown>): SizeOfPr {
  const size = Number.isSafeInteger(said.additions) && Number.isSafeInteger(said.deletions) ? { additions: said.additions as number, deletions: said.deletions as number } : {};
  const opened = typeof said.ouvertLe === "string" && !Number.isNaN(Date.parse(said.ouvertLe)) ? { ouvertLe: said.ouvertLe } : {};
  return { ...size, ...opened };
}

// La sortie de `faits`, champ pour champ — ou en quoi elle n'est pas la forme.
// Rien n'y est complété : un champ qui manque refuse la forme entière — sauf
// `cooks`, `attend`, `livres`, `urgence` et l'`activite`,
// l'`attente` et les `tiers` d'un ticket, qu'un runtime d'avant eux ne rend pas,
// et qui manquent alors ici aussi — et `apprentissage`, absent quand le projet n'a ni leçon ni profil, `github` quand GitHub ne limite pas le compte,
// et `attendAutres` quand rien n'attend un autre humain.
// Un champ de plus est laissé de côté, un mot d'état inconnu est gardé.
export function understand(output: string): Facts | { informe: string } {
  if (output.trim() === "") return { informe: "the command returned nothing" };
  let readOne: unknown;
  try {
    readOne = JSON.parse(output);
  } catch {
    return { informe: "this is not JSON" };
  }
  try {
    const root = typeof readOne === "object" && readOne !== null && !Array.isArray(readOne) ? (readOne as Record<string, unknown>) : refuse("the output", "an object");
    const counters = object(root.compteurs, "compteurs");
    const event = orNothing(root.dernierEvenement, "dernierEvenement", object);
    return {
      etat: text(root.etat, "etat"),
      lu: hour(root.lu, "lu"),
      dernierTick: orNothing(root.dernierTick, "dernierTick", hour),
      ...(root.limiteGithub === undefined ? {} : { limiteGithub: hour(root.limiteGithub, "limiteGithub") }),
      ...limitRead(root.github),
      ...quotaRead(root.quotaGithub),
      ...refusalGitHubOnlyRead(root.githubSeul),
      ...readOnlyRead(root.lectureSeule),
      ...topOfBacklogRead(root.hautDuBacklog),
      ...kitchenBoardRead(root.kitchenBoard),
      ...(root.appelsGithub === undefined ? {} : { appelsGithub: callsRead(root.appelsGithub) }),
      compteurs: {
        rail: whole(counters.rail, "compteurs.rail"),
        auTravail: whole(counters.auTravail, "compteurs.auTravail"),
        aLaPass: whole(counters.aLaPass, "compteurs.aLaPass"),
        attend: whole(counters.attend, "compteurs.attend"),
        livres24h: whole(counters.livres24h, "compteurs.livres24h"),
      },
      dernierEvenement:
        event === null
          ? null
          : {
              seq: whole(event.seq, "dernierEvenement.seq"),
              at: hour(event.at, "dernierEvenement.at"),
              type: text(event.type, "dernierEvenement.type"),
              ticket: orNothing(event.ticket, "dernierEvenement.ticket", whole),
            },
      rail: (Array.isArray(root.rail) ? root.rail : refuse("rail", "a list")).map((ticket: unknown, rank) => {
        const which = `rail[${rank}]`;
        const readOne = object(ticket, which);
        return except(readOne, which, () => ({
          ticket: whole(readOne.ticket, `${which}.ticket`),
          etat: text(readOne.etat, `${which}.etat`),
          titre: text(readOne.titre, `${which}.titre`),
          url: text(readOne.url, `${which}.url`),
          ...(readOne.depuis === undefined ? {} : { depuis: hour(readOne.depuis, `${which}.depuis`) }),
          ...(readOne.essais === undefined ? {} : { essais: trialsRead(readOne.essais, `${which}.essais`) }),
          ...(readOne.gardeRepetee == null ? {} : { gardeRepetee: guardRepeatedRead(readOne.gardeRepetee) ?? refuse(`${which}.gardeRepetee`, "a guard that stopped the ticket twice") }),
          ...(readOne.activite === undefined ? {} : { activite: orNothing(readOne.activite, `${which}.activite`, understandActivity) }),
          ...(readOne.attente === undefined ? {} : { attente: orNothing(readOne.attente, `${which}.attente`, understandWait) }),
          ...(readOne.tiers === undefined ? {} : { tiers: orNothing(readOne.tiers, `${which}.tiers`, understandThird) }),
          ...(readOne.revenu === undefined ? {} : { revenu: orNothing(readOne.revenu, `${which}.revenu`, text) }),
          ...(readOne.raison === undefined ? {} : { raison: orNothing(readOne.raison, `${which}.raison`, text) }),
          ...(readOne.captures === undefined ? {} : { captures: understandCaptures(readOne.captures, `${which}.captures`) }),
          ...requiredRead(readOne.requiert),
          ...(readOne.station == null ? {} : { station: text(readOne.station, `${which}.station`) }),
          ...(readOne.requires == null ? {} : { requires: textsRead(readOne.requires, `${which}.requires`) }),
          // Les tickets qu'il attend (l'ordonnancement du rail, #3502) : « after #N » sur sa carte.
          ...(readOne.attend == null ? {} : { attend: numbersRead(readOne.attend, `${which}.attend`) }),
          ...(readOne.pr === undefined
            ? {}
            : {
                pr: (() => {
                  const said = object(readOne.pr, `${which}.pr`);
                  return { numero: whole(said.numero, `${which}.pr.numero`), url: text(said.url, `${which}.pr.url`), ...sizeOfPrRead(said) };
                })(),
              }),
          ...(readOne.renvoi === undefined
            ? {}
            : {
                renvoi: (() => {
                  const said = object(readOne.renvoi, `${which}.renvoi`);
                  return { n: whole(said.n, `${which}.renvoi.n`), raison: text(said.raison, `${which}.renvoi.raison`) };
                })(),
              }),
        }), ({ ticket, titre: title }, unreadable) => ({ ticket, etat: UNREADABLE_STATE, titre: title, url: "", illisible: unreadable }));
      }),
      ...(root.cooks === undefined
        ? {}
        : {
            cooks: (Array.isArray(root.cooks) ? root.cooks : refuse("cooks", "a list")).map((cook: unknown, rank) => {
              const which = `cooks[${rank}]`;
              const readOne = object(cook, which);
              return { ticket: whole(readOne.ticket, `${which}.ticket`), titre: text(readOne.titre, `${which}.titre`), station: text(readOne.station, `${which}.station`) };
            }),
          }),
      ...(root.attend === undefined
        ? {}
        : {
            attend: (Array.isArray(root.attend) ? root.attend : refuse("attend", "a list")).map((expected: unknown, rank) => expectedRead(object(expected, `attend[${rank}]`), `attend[${rank}]`)),
          }),
      ...(root.attendAutres === undefined
        ? {}
        : {
            attendAutres: (Array.isArray(root.attendAutres) ? root.attendAutres : refuse("attendAutres", "a list")).map((expected: unknown, rank) => {
              const which = `attendAutres[${rank}]`;
              const readOne = object(expected, which);
              return { ...expectedRead(readOne, which), qui: textsRead(readOne.qui, `${which}.qui`) };
            }),
          }),
      ...(root.livres === undefined
        ? {}
        : {
            livres: (Array.isArray(root.livres) ? root.livres : refuse("livres", "a list")).map((delivers: unknown, rank) => {
              const which = `livres[${rank}]`;
              const readOne = object(delivers, which);
              return except<Delivers>(readOne, which, () => ({
                ticket: whole(readOne.ticket, `${which}.ticket`),
                titre: text(readOne.titre, `${which}.titre`),
                url: orNothing(readOne.url, `${which}.url`, text),
                livre: hour(readOne.livre, `${which}.livre`),
                station: orNothing(readOne.station, `${which}.station`, text),
                pr: orNothing(readOne.pr, `${which}.pr`, text),
                ...(readOne.prLue === undefined ? {} : { prLue: sizeOfPrRead(object(readOne.prLue, `${which}.prLue`)) }),
                ...(readOne.relecture === undefined ? {} : { relecture: orNothing(readOne.relecture, `${which}.relecture`, understandReview) }),
                ...engineOf(readOne, which),
                ...(readOne.captures === undefined ? {} : { captures: understandCaptures(readOne.captures, `${which}.captures`) }),
              }), ({ ticket, titre: title }, unreadable) => ({ ticket, titre: title, url: null, livre: hour(root.lu, "lu"), station: null, pr: null, illisible: unreadable }));
            }),
          }),
      ...(root.urgence === undefined ? {} : { urgence: orNothing(root.urgence, "urgence", understandEmergency) }),
      ...(root.retenues === undefined ? {} : { retenues: (Array.isArray(root.retenues) ? root.retenues : refuse("retenues", "a list")).map((r: unknown, rank: number) => understandHeld(r, `retenues[${rank}]`)) }),
      ...(root.stations === undefined
        ? {}
        : { stations: (Array.isArray(root.stations) ? root.stations : refuse("stations", "a list")).map((station: unknown, rank) => understandStation(station, `stations[${rank}]`)) }),
      ...onGithubRead(root.stationsSurGithub),
      ...(agentsRead(root.agents) === undefined ? {} : { agents: agentsRead(root.agents) }),
      ...(cadenceRead(root.cadence) === undefined ? {} : { cadence: cadenceRead(root.cadence) }),
      ...(rolesKitchenRead(root.rolesCuisine) === undefined ? {} : { rolesCuisine: rolesKitchenRead(root.rolesCuisine) }),
      ...(postMortemsRead(root.postMortems) === undefined ? {} : { postMortems: postMortemsRead(root.postMortems) }),
      ...(root.apprentissage === undefined ? {} : { apprentissage: learningRead(root.apprentissage) }),
      ...(threadsRead(root.fils) === undefined ? {} : { fils: threadsRead(root.fils) }),
      ...(digestRead(root.digest) === undefined ? {} : { digest: digestRead(root.digest) }),
    };
  } catch (error) {
    if (error instanceof Informs || learningInforms(error)) return { informe: error.message };
    throw error;
  }
}

// Ce que l'app dit d'une lecture de `faits` en échec : le même cas que sous
// `status` (vue.js, `rendre`), avec les mêmes mots — le code de sortie le
// choisit. Sans cas, sur une box jointe, c'est `faits` qui n'a pas répondu : un
// runtime d'avant cette commande.
const TITLES: Readonly<Record<Exclude<Failure["cas"], null>, string>> = {
  "projet-inconnu": "REACHED, BUT UNKNOWN TO THE STATION",
  "sans-droit": "REACHED, BUT WITHOUT THE RIGHT TO THE ACTION",
  "commande-manque": "REACHED, BUT A COMMAND IS MISSING ON THE STATION",
  "node-inapte": "REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME",
};
// Une lecture qui n'a pas joint GitHub du tout (board/read.ts, `horsLigne`) : l'app est hors ligne, une seule cause
// pour tout ce qu'elle lit (#1818). Rien de ce qui était lu ne s'en efface, et rien n'y est une panne.
export const isOutsideLine = (reading: object): boolean => "horsLigne" in reading && reading.horsLigne === true;
// Une lecture de GitHub qui a raté, hors ligne ou non — GitHub qui limite les appels, refuse, ne répond pas à temps
// (board/rail.ts, `duTableau`) : elle ne dit rien de ce que GitHub tient encore. Rien de ce qui était lu ne s'en efface (#2151) ; la vue garde le dernier rail lu, et dit depuis quand il est périmé.
export const isMissedOfBoard = (reading: object): boolean => "erreur" in reading && "duTableau" in reading && reading.duTableau === true;

// `sansReponse` : ce qui se dit d'une box jointe dont le code ne dit aucun cas — pour une autre commande que `facts`.
export function titleOfFailure({ cas: theCase, atteinte: reached, duTableau: ofBoard }: Failure, withoutAnswer = "REACHED, BUT `facts` DID NOT ANSWER"): string {
  // Lue de GitHub (#1694, #2061) : aucune station n'a été jointe, c'est GitHub qui n'a pas dit.
  if (ofBoard === true) return "NOT READ FROM GITHUB";
  if (theCase !== null) return TITLES[theCase];
  return reached ? withoutAnswer : "NOT REACHED";
}

// Une lecture de la veille, et ce qui s'en dessine. Sans faits, rien n'est
// dessiné : le titre dit quel cas, et ce qui a été obtenu suit.
function read(reading: Reading, awaiting?: BlockRead, status?: StatusRead, answeredEntries?: ReadonlyMap<number, Answered>, writtenEntries?: PriorityShown): { faits?: Facts; recue: Drawable } {
  if ("erreur" in reading) return { recue: { ...reading, titre: titleOfFailure(reading) } };
  const { projet: project, demande: request, a } = reading;
  const rendered = reading.sorties.find(({ commande: command }) => command === COMMAND)?.texte ?? "";
  const facts = understand(rendered);
  if ("informe" in facts) return { recue: { projet: project, demande: request, a, titre: "THE STATION DID NOT RETURN THE SHAPE OF `facts`", informe: facts.informe, rendu: rendered } };
  const publishedThe = "publieLe" in reading && typeof reading.publieLe === "string" ? { publieLe: reading.publieLe } : {};
  return { faits: facts, recue: { projet: project, demande: request, a, ...publishedThe, tableau: board(facts, awaiting, status, answeredEntries, writtenEntries) } };
}

export const draw = (reading: Reading): Drawable => read(reading).recue;

// Les deux listes fermées de la forme, et la couleur de chaque mot.
export const TONES_OF_PROJECT = new Map([
  ["ouverte", "vert"],
  ["retenue", "jaune"],
  ["arrêtée", "rouge"],
  ["éteinte", "rouge"],
]);
export const TONES_OF_TICKET = new Map([
  ["en attente", "gris"],
  ["tests écrits", "gris"],
  ["BLOQUÉ", "rouge"],
  ["pris", "bleu"],
  ["en pass", "jaune"],
  ["servi", "vert"],
  ["86", "rouge"],
  ["WAITING", "gris"],
  ["base rouge", "rouge"],
]);
// Le mot et, s'il est de la liste, sa couleur : un mot inconnu n'en porte aucune.
// `mot` : ce qui s'affiche à sa place, en anglais (slip.ts) ; `etat` reste la valeur de la box.
// Un mot que la table ignore n'en porte pas : la vue pose `etat` tel quel.
const colored = (tones: ReadonlyMap<string, string>, state: string): { etat: string; mot?: string; ton?: string } => {
  const your = tones.get(state);
  const word = wordOfState(state);
  return { etat: state, ...(word === state ? {} : { mot: word }), ...(your === undefined ? {} : { ton: your }) };
};

// Une durée, dite comme `status` la dit.
export function duration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

// Un âge se compte entre deux heures de la box — celle du fait, celle de la
// lecture : l'horloge du poste n'y entre pas.
const before = (done: string, readOne: string) => `${duration(Date.parse(readOne) - Date.parse(done))} before the reading`;

// Le dernier événement : son type s'affiche, il ne s'interprète pas.
export function event({ dernierEvenement: lastEvent, lu: readOne }: Facts): string {
  if (lastEvent === null) return "none: the log is empty";
  const { type, ticket, at } = lastEvent;
  return [type, ...(ticket === null ? [] : [`#${ticket}`]), before(at, readOne)].join(" · ");
}

// L'écart entre le dernier tick et la lecture : affiché, jamais conclu.
export function tick({ dernierTick: lastTick, lu: readOne }: Facts): string {
  return lastTick === null ? "no tick: runtime stopped, or no tick yet since it started" : `last tick ${before(lastTick, readOne)}`;
}

// Les colonnes où la cuisine fait quelque chose du ticket : Au travail, la Pass.
const AT_THE_WORK = ["pris", "en pass"];
export const ACTIVITY_NOT_COMMUNICATED = "activity not given";
const ACTIVITY_NOT_DATA = `${ACTIVITY_NOT_COMMUNICATED} — this station's runtime does not give it in \`facts\``;

// Ce que la cuisine fait d'un ticket pris ou en pass, en une ligne : le geste, ce
// qu'il vise, depuis combien de temps — un âge entre deux heures de la box. Ce
// que la box ne dit pas est écrit, jamais laissé vide. Rien pour un autre état.
export function tellInThisMoment({ etat: state, activite: activity }: Facts["rail"][number], readOne: string): string | undefined {
  if (!AT_THE_WORK.includes(state)) return undefined;
  if (activity === undefined) return ACTIVITY_NOT_DATA;
  if (activity === null) return ACTIVITY_NOT_COMMUNICATED;
  const { fait: said, faitEn: doneIn, cible: target, depuis: since } = activity;
  const done = doneIn ?? said;
  return `${target === null ? done : `${done} ${target}`}, for ${duration(Date.parse(readOne) - Date.parse(since))}`;
}

// Seule une adresse https s'ouvre : rien de ce qu'une box rend n'est lancé
// comme un fichier ou un programme.
const openable = (url: string) => URL.parse(url)?.protocol === "https:";

// Les quatre colonnes que `faits` remplit, dans l'ordre de l'écran, et les mots
// d'état que chacune prend. Tout autre mot — `86`, un mot inconnu — n'est d'aucune.
const FACTS_COLUMNS = [
  { nom: "On the rail", ton: "gris", etats: ["en attente", "tests écrits", "BLOQUÉ"] },
  { nom: "Taken", ton: "bleu", etats: ["pris"] },
  { nom: "Pass", ton: "jaune", etats: ["en pass", "base rouge"] },
  { nom: "Served", ton: "vert", etats: ["servi"] },
] as const;
const COLUMN_BY_DEFAULT = "On the rail";
const COLUMN_OF_THE_PASS = "Pass";
// Le ticket livré qu'une carte du chef lui demande de juger — la validation du design —, ou rien.
function deliveryAJudge(chef: CardOfChef | undefined): number | undefined {
  return chef?.design?.ticket;
}
// Les mots d'état d'un ticket en attente sur le rail.
const IN_FILE: readonly string[] = FACTS_COLUMNS[0].etats;
// La priorité d'un ticket dont l'issue ne porte aucun `prio:` — `-` dans sa ligne de `status`.
export const WITHOUT_PRIO = "no prio";
// La colonne de FAITS d'une carte : celle du mot d'état — ou, pour un ticket mis de
// côté, celle où le runtime dit qu'il attend (`attente.colonne`), et à défaut d'une
// colonne qu'elle connaisse, la colonne par défaut : une carte mise de côté n'est
// jamais hors colonne. Un mot inconnu sans attente n'est d'aucune.
function factsColumn(knownOne: Facts["rail"][number] | undefined, state: string | undefined): string | undefined {
  const byWord = (word: string | undefined) => FACTS_COLUMNS.find(({ etats: states }) => (states as readonly (string | undefined)[]).includes(word))?.nom;
  if (knownOne?.illisible !== undefined) return COLUMN_BY_DEFAULT;
  if (knownOne?.attente == null) return byWord(state);
  return byWord(knownOne.attente.colonne) ?? byWord(state) ?? COLUMN_BY_DEFAULT;
}
// Awaiting you (Todo) : ce que le chef peut trancher maintenant — et cela seulement. Une liste, pas une étape : la vue en
// pose les cartes dans la colonne de leur étape, en rouge, et la compte dans « TODO (N) » (#3458). Waiting : ce qui attend
// un tiers, qu'il ne perd pas de vue sans l'avoir devant lui. Dans l'ordre du service (#2093) : On the rail, Taken, Pass,
// Waiting, Served.
const AWAITING_YOU = { nom: "Awaiting you", ton: "rouge", rang: 3 } as const;
const WAITING = { nom: "Waiting", ton: "orange", rang: 4 } as const;
const NOBODY_AWAITS = "no ticket waits for a third party";
// Les mots d'état d'un ticket que le runtime laisse attendre un tiers : en attente sur le
// rail, ou mis de côté — pas celui que la cuisine tient, en cuisine ou en pass, ni un servi.
const SETTABLE = ["en attente", "tests écrits", "BLOQUÉ", "86"];
// La ligne du bloc `attend` d'une question du manager avant découpage, dans ses deux langues.
const EPIC_QUESTION = /manager's question before splitting the epic|question du manager avant de découper l'épique/;
// Ce qui suit, sur une question répondue.
const ANSWERED_THEN = "the manager reads the answer at its next tick: it splits the epic, or asks again — the card then comes back to TODO";
// Ce qu'une carte de WAITING dit quand la box ne donne pas ce qu'il attend.
const THIRD_NOT_GIVES = "not given — this station's runtime does not give in `facts` what it waits for: what, from whom, since when, its follow-up, what happens on arrival";

// Un instant de la box, tel qu'elle l'a donné : son jour et son heure, en UTC.
const instant = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const DELIVERS = "Served";
const NO = "no ticket";
// Livré, quand la box donne `livres` : ce que la cuisine a servi en 24 h, que
// l'issue soit fermée ou non. Vide, c'est qu'elle n'a rien servi — et elle le dit.
const NOTHING_DELIVERS = "nothing served in the last 24 h";
const WITHOUT_PR = "none — served without a merge";
const WITHOUT_COOK = "not given by the queue: who cooked it — no station sent it to pass";
// Ce qui a été livré, quand la relecture ne le dit pas : pourquoi, sans rien inventer.
const WITHOUT_REVIEW = "what was delivered: not given — no readable review covers this delivery (merged by hand, served without going through pass, or from before the review)";
const REVIEW_NOT_DATA = "what was delivered: not given — this station's runtime does not yet give the review in `facts`";

const pluriel = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
// Le nombre des constats, en clair : « 4 remarques », « 2 remarques, dont 1 bloquante ».
export function remarks(findings: readonly Finding[]): string {
  if (findings.length === 0) return "no remarks";
  const blocking = findings.filter(({ gravite }) => gravite === "bloquant").length;
  return `${pluriel(findings.length, "remark")}${blocking === 0 ? "" : `, ${blocking} blocking`}`;
}

// Ce qu'une carte de Livré dit de ce qui a été livré, d'après ce que la box en a donné.
const head = (value: ReturnType<typeof headOf>) => (value === undefined ? {} : { tete: value });
const delivery = (review: Review | null | undefined): Delivery =>
  review === undefined ? { sans: REVIEW_NOT_DATA } : review === null ? { sans: WITHOUT_REVIEW } : { resume: review.resume, remarques: remarks(review.constats), constats: review.constats };
// La colonne ne dit jamais « rien ne t'attend » : une entrée sans numéro — une
// connexion, la base — attend aussi, et n'a pas de carte. C'est le bloc qui le dit.
const NO_NUMBER = "no ticket at the head of a line of the `attend` block";
const NO_EXPECTED = "no ticket in `attend`, according to `facts`";
// Le bloc dit lui-même que rien n'attend le chef (`decrireAttentes`) : TODO le dit en une ligne,
// au lieu de disparaître (#2076). Ce qui n'est pas une décision — le bilan des arrêts, la version passée — n'y change rien.
const NOTHING_N_AWAITING = "nothing awaits you";
const blockEmpty = ({ bloc: block }: BlockRead) => /^(awaiting|attend)\s+(nothing awaits the chef|rien n'attend le chef)\s*$/.test(block.split("\n")[0] ?? "");
const NOTHING_OF_READ = "not read: this station's runtime does not give `attend` in `facts`, and the `attend` block of the station's “status” step was not taken for this project. This is not “nothing awaits you” — the tickets stay in their columns";

// Le rail en colonnes, et la liste de ce qui attend le chef — TODO, « Awaiting you » —, que la vue ne dessine pas en
// colonne : elle en pose chaque carte, en rouge, dans la colonne de son étape (`etape`, #3458). Un ticket qui attend une
// décision du chef est dans TODO, et là seulement : c'est l'information qui décide d'un geste. Il y est
// dès que la file le nomme — dans `attend`, que `faits` donne, ou en tête d'une
// ligne du bloc `attend` de `status`, qui dit en plus ce qu'on attend de lui. Un
// ticket qui attend un tiers est dans WAITING, et là seulement — jamais dans TODO,
// même nommé par la file : le chef n'a rien à en trancher tant que rien n'est
// arrivé. Sa carte dit, sans clic, ce qu'il attend, de qui, depuis quand, sa
// relance et ce qui se passera à l'arrivée. Les autres sont dans la colonne de
// leur mot d'état, dans l'ordre de service ; TODO garde l'ordre du bloc, le plus
// ancien d'abord, puis celui de `faits`.
// Une question du manager avant découpage que le chef a répondue (`repondues`, answered.ts) quitte
// TODO sans attendre le manager : elle l'attend dans WAITING — c'est lui, le tiers —, jusqu'à ce que
// la file ne la nomme plus, ou que l'issue pose une autre question (#503).
// Livré, quand la box donne `livres`, en vient seul : les tickets servis dans les
// 24 h, le plus récent d'abord, un pour un avec `livrés 24 h` — partis du rail ou
// non. Un ticket `servi` du rail qu'elle n'y met pas, servi avant, est rendu à
// part ; un ticket qu'elle y met et que le rail porte sous un autre mot — repris
// depuis, 86 — reste aussi là où ce mot le range. Sans `livres`, un runtime
// d'avant ce champ : Livré prend les tickets `servi` du rail, comme les autres.
// `status` : ce que la box en a rendu, d'où vient la ligne que chaque carte porte.
// `ecrites` : la priorité que l'app vient d'écrire sur l'issue d'un ticket (priority.ts), que sa carte et sa fiche
// montrent tant que le tableau montre encore celle d'avant.
export function rail(facts: Facts, awaiting?: BlockRead, status?: StatusRead, answeredEntries?: ReadonlyMap<number, Answered>, writtenEntries?: PriorityShown): Rail {
  const lines = status === undefined ? undefined : linesOfRail(status.texte);
  const knownOnes = new Map(facts.rail.map((knownOne) => [knownOne.ticket, knownOne]));
  // Où cuit chaque station : la box, ou le Mac (slip.ts) — rien, d'un runtime qui ne donne pas les stations.
  const places = facts.stations === undefined ? undefined : new Map(facts.stations.map((station) => [station.station, placeOf(station)]));
  // Son état et son titre sur le rail, qui bornent sa ligne de `status` — rien, s'il n'y est pas.
  const on = (knownOne: Facts["rail"][number] | undefined) => (knownOne === undefined ? {} : { rail: { etat: knownOne.etat, titre: knownOne.titre } });
  // Ce qui attend un tiers, d'après la forme : sa colonne est WAITING, quoi que la file en dise.
  const inWaiting = new Set(facts.rail.filter(({ etat: state, tiers: third }) => third != null || state === "WAITING").map(({ ticket }) => ticket));
  const saidOnes = new Map<number, string[]>();
  // Ce qui attend un autre humain du projet (ticket 2985) : sa carte est celle de TODO, ses gestes aussi (ticket 3071).
  const ofOthers = new Map((facts.attendAutres ?? []).map((expected) => [expected.ticket, expected]));
  for (const entry of awaiting === undefined ? [] : ticketsOf(awaiting.bloc)) saidOnes.set(entry.ticket, [...(saidOnes.get(entry.ticket) ?? []), saysOf(entry)]);
  for (const { ticket } of facts.attend ?? []) if (!saidOnes.has(ticket)) saidOnes.set(ticket, []);
  for (const ticket of inWaiting) saidOnes.delete(ticket);
  // Une question du manager avant de découper une épique — d'un runtime d'avant `decision`, ce que sa
  // ligne du bloc en dit —, et une issue que le manager a parquée pour le chef avec sa question (`chef-todo`, que sa ligne
  // du bloc nomme ; d'abord un label d'attente d'avant parked, #4260) : la carte dit la question.
  const beforeSplit = (ticket: number) => {
    const decision = (facts.attend?.find((expected) => expected.ticket === ticket) ?? ofOthers.get(ticket))?.decision;
    return decision === undefined ? (saidOnes.get(ticket) ?? []).some((said) => EPIC_QUESTION.test(said)) : decision.quoi === "question";
  };
  const queries = (ticket: number) => beforeSplit(ticket) || (saidOnes.get(ticket) ?? []).some((said) => said.includes(`\`${LABEL_OF_CHEF}\``));
  // Répondue, la question avant découpage n'attend plus le chef. Celle qui parque l'issue, si : sa carte reste à répondre.
  const answeredOnes = new Map([...saidOnes.keys()].flatMap((ticket) => {
    const answeredOne = answeredEntries?.get(ticket);
    return answeredOne !== undefined && beforeSplit(ticket) ? [[ticket, answeredOne] as const] : [];
  }));
  const queried = new Set([...saidOnes.keys(), ...ofOthers.keys()].filter(queries));
  for (const ticket of answeredOnes.keys()) saidOnes.delete(ticket);

  // La carte d'un ticket : ce que le rail en donne — ou, pour un ticket qui attend
  // sans y être, ce que `faits.attend` en donne : son titre s'il y en a un, son
  // adresse si la box l'a rendue —, puis ce que la file dit de lui.
  // Ce que la carte dit de sa PR (#4051) : rien quand son lien ne s'ouvre pas ; sa taille et son âge, quand GitHub les a donnés.
  const deliveryOf = (number: number, url: string, { additions, deletions, ouvertLe: openThe }: SizeOfPr): { livraisonLue?: DeliveryRead } =>
    !openable(url)
      ? {}
      : {
          livraisonLue: {
            numero: number,
            url,
            ...(additions === undefined || deletions === undefined ? {} : { lignes: { ajoutees: additions, retirees: deletions } }),
            ...(openThe === undefined ? {} : { age: duration(Date.parse(facts.lu) - Date.parse(openThe)) }),
          },
        };
  const card = (ticket: number): Card => {
    const knownOne = knownOnes.get(ticket);
    const pr: (NonNullable<Facts["rail"][number]["pr"]> & SizeOfPr) | undefined = knownOne?.pr;
    const gives = facts.attend?.find((expected) => expected.ticket === ticket) ?? ofOthers.get(ticket);
    const url = knownOne?.url ?? gives?.url;
    // Une carte qui demande de juger une livraison est la carte du ticket livré (#3519) : elle en porte le titre et la station.
    const judged = deliveryAJudge(gives?.chef);
    const delivered = judged === undefined || judged === ticket ? undefined : knownOnes.get(judged);
    const title = [delivered?.titre, knownOne?.titre, gives?.titre].find((candidate) => candidate !== undefined && candidate !== "");
    const said = saidOnes.get(ticket) ?? (ofOthers.has(ticket) ? [] : undefined);
    const itsOwn = lines === undefined ? undefined : (lines.get(ticket) ?? []);
    const carried = carry(knownOne === undefined ? {} : { etat: knownOne.etat, titre: knownOne.titre }, {
      ...(itsOwn === undefined ? {} : { lignes: itsOwn }),
      ...(facts.cooks === undefined ? {} : { stations: [...new Set(facts.cooks.filter((cook) => cook.ticket === ticket).map(({ station }) => station))] }),
      bloque: said !== undefined && said.length > 0,
      ...(knownOne === undefined ? {} : { enCeMoment: tellInThisMoment(knownOne, facts.lu) }),
      ...(knownOne?.attente == null ? {} : { attente: knownOne.attente.raison }),
      ...(knownOne?.revenu == null ? {} : { revenu: knownOne.revenu }),
      ...(places === undefined ? {} : { lieux: places }),
    });
    const holds = carried.dit.find(({ libelle: wording }) => wording === "blocked by")?.valeur;
    // Mis de côté par un label, sur GitHub seul : il t'attend, et sa ligne dit pourquoi (#2075).
    const setAside = said === undefined ? undefined : gives?.miseDeCote;
    const why = setAside === undefined ? undefined : (setAside.raison ?? WITHOUT_REASON);
    // La carte du chef lue de GitHub, dans la forme de toute carte de TODO (#2434) : sa question n'est dite qu'une fois, sur
    // la carte — la ligne dit ce que sa sorte attend du chef, jamais la question.
    const ofChef = said === undefined || gives?.chef === undefined ? undefined : cardOfChefOfTodo(gives.chef);
    // Mis de côté sur le rail, sans question au chef : plus aucun cook ne le prendra (ticket 3147).
    // Seul le label `served-elsewhere` le dit : les autres 86 (quota, station absente…) repartent seuls.
    const refused = said === undefined && knownOne?.etat === "86" && knownOne.illisible === undefined && knownOne.attente?.label === SERVED_ELSEWHERE;
    const rawOfRefusal = knownOne?.attente?.complete ?? knownOne?.attente?.raison ?? "";
    const line: LineOfCard =
      knownOne?.illisible !== undefined || gives?.illisible !== undefined
        ? lineUnreadable()
        : ofChef !== undefined && gives?.chef !== undefined
        ? lineAwaitingMe(sentenceOfChef(gives.chef.sorte))
        : why !== undefined
        ? lineSetAside(why)
        : refused
        ? lineRefused(rawOfRefusal)
        : said !== undefined
        ? lineAwaitingMe(gives?.chef === undefined ? expectedOf(gives?.decision, ticket, gives?.carte?.question).phrase : sentenceOfChef(gives.chef.sorte))
        : knownOne?.attente != null
          ? lineSetAside(knownOne.attente.raison)
          : knownOne?.etat === "base rouge"
            ? lineBaseRed(knownOne.activite == null ? "" : duration(Date.parse(facts.lu) - Date.parse(knownOne.activite.depuis)))
          : knownOne !== undefined && AT_THE_WORK.includes(knownOne.etat)
            ? lineAtWork(knownOne.activite, knownOne.activite == null ? "" : duration(Date.parse(facts.lu) - Date.parse(knownOne.activite.depuis)))
            : knownOne?.etat === "servi"
              ? { ligne: "served", repere: true }
              : knownOne?.raison != null && IN_FILE.includes(knownOne.etat)
                ? lineOfHead(knownOne.etat, knownOne.raison)
                : queuedLine(knownOne?.etat ?? "", holds);
    // Sur le rail, en attente : sa priorité se lit sur la carte — celle que sa ligne de `status` écrit, ou celle que
    // l'app vient d'écrire sur son issue, tant que le tableau montre encore l'ancienne.
    const inFile = said === undefined && knownOne !== undefined && IN_FILE.includes(knownOne.etat);
    const [itsOwnOne] = itsOwn ?? [];
    const prioRead = knownOne !== undefined && itsOwn?.length === 1 && itsOwnOne !== undefined ? priority(itsOwnOne, knownOne.etat, knownOne.titre) : undefined;
    const levelRead = prioRead === "-" ? null : /^prio:([0-9])$/.exec(prioRead ?? "")?.[1];
    const writtenOne = knownOne === undefined ? undefined : writtenEntries?.(ticket, levelRead === undefined || levelRead === null ? levelRead : Number(levelRead));
    const prio = !inFile ? undefined : writtenOne !== undefined ? (writtenOne === null ? "-" : `prio:${writtenOne}`) : prioRead;
    // Dans Taken et Pass : depuis quand elle y est, et si c'est bien plus que d'ordinaire. Une carte qui t'attend est dans
    // TODO, pas dans ces colonnes : elle n'en porte pas.
    const age = knownOne === undefined || knownOne.illisible !== undefined || said !== undefined ? undefined : seniority(knownOne.etat, knownOne.depuis, facts.lu, facts.cadence?.medianSeconds);
    const trials = age === undefined ? undefined : points(knownOne?.essais);
    const setOne: Card = {
      ticket,
      ...line,
      ...(trials === undefined ? {} : { essais: trials }),
      ...(knownOne?.essais === undefined || knownOne.essais.length < 2 ? {} : { essai: knownOne.essais.length }),
      ...(knownOne?.gardeRepetee === undefined ? {} : { garde: lineOfGuard(knownOne.gardeRepetee) }),
      ...(pr === undefined ? {} : deliveryOf(pr.numero, pr.url, pr)),
      ...(knownOne === undefined ? {} : colored(TONES_OF_TICKET, knownOne.etat)),
      ...(title === undefined ? {} : { titre: title }),
      ...((knownOne?.station ?? delivered?.station) === undefined ? {} : { station: knownOne?.station ?? delivered?.station }),
      ...(knownOne?.requires === undefined ? {} : { requiert: knownOne.requires }),
      ...(!inFile || knownOne?.attend === undefined || knownOne.attend.length === 0 ? {} : { apres: knownOne.attend }),
      ouvrable: url != null && openable(url),
      attendu: said !== undefined,
      attend: said ?? [],
      // Qui attend le chef reste dans la colonne de son étape, en rouge (#3458) : celle de son mot d'état — ou, mis de côté,
      // celle où le runtime dit qu'il attend —, et sur le rail quand il n'y est pas encore.
      // Une carte qui demande au chef de juger une livraison (validation design) est la passe qui l'attend : elle
      // reste dans Pass, sur la carte de son ticket (#3519).
      ...(said === undefined ? {} : { etape: deliveryAJudge(gives?.chef) !== undefined ? COLUMN_OF_THE_PASS : (factsColumn(knownOne, knownOne?.etat) ?? COLUMN_BY_DEFAULT) }),
      ...(said === undefined || gives?.decision === undefined ? {} : { decision: gives.decision }),
      // Livré, d'une box d'avant `livres` : la relecture n'en vient pas, la carte le dit.
      ...(knownOne?.etat === "servi" && facts.livres === undefined ? { livraison: delivery(undefined) } : {}),
      ...(knownOne?.captures === undefined ? {} : { captures: capturesOfCard(knownOne.captures) }),
      ...carried,
      // La PR n'est donnée que d'un ticket livré : ici, la box ne la donne pas.
      fiche: {
        ...header({ ...(title === undefined ? {} : { titre: title }), url, ...on(knownOne), ...(itsOwn === undefined ? {} : { lignes: itsOwn }), ...(writtenOne === undefined ? {} : { prio: writtenOne }) }),
        // La carte du chef : la tête dit ce que sa sorte attend, la question est dite dessous (story.ts, `situation`).
        ...(said === undefined ? {} : { attendu: ofChef !== undefined && gives?.chef !== undefined ? sentenceOfChef(gives.chef.sorte) : (why ?? expectedOf(gives?.decision, ticket, gives?.carte?.question).phrase) }),
        ...(said === undefined ? {} : head(headOf(gives?.decision, gives?.livraison))),
      },
      // Dans TODO, un ticket du rail que la cuisine ne tient pas peut attendre un tiers — sur un projet GitHub, toute carte
      // de TODO (vue/wait/, #3075).
      ...(said !== undefined && (facts.stationsSurGithub !== undefined || (knownOne !== undefined && SETTABLE.includes(knownOne.etat))) ? { gestes: ["attente-poser" as const] } : {}),
      ...(said !== undefined && queried.has(ticket) ? { question: true as const } : {}),
      ...(said !== undefined && gives?.chef !== undefined ? { chef: gives.chef } : {}),
      ...(refused ? { refus: { brut: rawOfRefusal } } : {}),
      // Prise (`taken`), sans attente chronométrée vivante, et aucun cook ne la cuit sur aucune station : la carte le dit (#3884).
      // `facts` sans liste de cooks (runtime d'avant ce champ) : on ne sait pas, rien n'est dit.
      ...(said === undefined && knownOne?.etat === "pris" && knownOne.attente == null && knownOne.illisible === undefined && facts.cooks !== undefined && !facts.cooks.some((cook) => cook.ticket === ticket) ? { sansCook: true as const } : {}),
      // En pass ou livrée, et sur le rail : « try it » (trial.ts, #3215) — pas une carte qui t'attend.
      ...(said === undefined && knownOne?.illisible === undefined && sTries(knownOne?.etat) ? { essayable: true as const } : {}),
      // Mis de côté par le runtime, sans question au chef : parked, jusqu'à son retour (#4238).
      ...(said === undefined && knownOne?.attente != null && !refused ? { parque: { qui: knownOne.attente.raison, jusqua: knownOne.attente.retour } } : {}),
      ...(setAside === undefined ? {} : { miseDeCote: { label: setAside.label, liens: setAside.raison === null ? [] : setAside.liens.map(({ numero: number }) => number) } }),
      ...(ofChef !== undefined ? { todo: ofChef } : said !== undefined && gives?.carte !== undefined ? { todo: cardOfTodo(gives.carte) } : {}),
      // Confié à un humain : sa tâche (vue/wait-capacity/).
      ...(said !== undefined && gives?.tache !== undefined ? { tache: gives.tache } : {}),
      ...(prio === undefined ? {} : { prio: prio === "-" ? WITHOUT_PRIO : prio }),
      ...(age === undefined ? {} : { age }),
    };
    // Ce qui attend le chef, ou un autre humain du projet, est parked pour lui (#4261) : pour sa question — ou ce que sa
    // carte attend —, sans date. Parked pour le chef, c'est une carte de son TODO.
    if (said === undefined) return setOne;
    const others = saidOnes.has(ticket) ? undefined : ofOthers.get(ticket)?.qui.join(", ");
    return { ...setOne, parque: parkedOf(others ?? THE_CHEF, setOne.todo?.question ?? setOne.fiche.attendu, null) };
  };

  // La carte d'une question répondue, qui attend que le manager lise la réponse : qui y a répondu,
  // quand, et ce qui viendra. Ni geste ni question à poser : c'est au manager.
  const answered = (ticket: number, { par: by, a }: Answered): Card => {
    const knownOne = knownOnes.get(ticket);
    const gives = facts.attend?.find((expected) => expected.ticket === ticket);
    const url = knownOne?.url ?? gives?.url;
    const title = [knownOne?.titre, gives?.titre].find((candidate) => candidate !== undefined && candidate !== "");
    return {
      ticket,
      ...lineAnswered(by),
      ...(knownOne === undefined ? {} : colored(TONES_OF_TICKET, knownOne.etat)),
      ...(title === undefined ? {} : { titre: title }),
      ouvrable: url != null && openable(url),
      attendu: false,
      attend: [],
      repondue: { par: by, a },
      dit: [
        { libelle: "answered by", valeur: by },
        { libelle: "answered at", valeur: instant(a) },
        { libelle: "next", valeur: ANSWERED_THEN },
      ],
      fiche: header({ ...(title === undefined ? {} : { titre: title }), url, ...on(knownOne), ...(lines === undefined ? {} : { lignes: lines.get(ticket) ?? [] }) }),
    };
  };

  // La carte d'un ticket qui attend un tiers : ce qu'il attend, dans les mots du chef ; de qui ;
  // depuis quand et sa relance, à l'horloge de la box, et leur écart à la lecture ; ce que
  // « c'est arrivé » fera de lui. Puis ses deux gestes : le reprendre, ou le renvoyer en cuisine.
  const queued = (ticket: number): Card => {
    const knownOne = knownOnes.get(ticket) as Facts["rail"][number];
    const { tiers: third, url, titre: title } = knownOne;
    const relaunch = third?.relance == null ? 0 : Date.parse(third.relance) - Date.parse(facts.lu);
    return {
      ticket,
      ...lineInWaiting(third, third?.relance != null && relaunch < 0),
      ...colored(TONES_OF_TICKET, knownOne.etat),
      ...(title === "" ? {} : { titre: title }),
      ouvrable: openable(url),
      attendu: false,
      attend: [],
      dit:
        third == null
          ? []
          : [
              { libelle: "waiting for", valeur: third.quoi },
              { libelle: "from", valeur: third.qui },
              { libelle: "since", valeur: `${instant(third.depuis)} — ${before(third.depuis, facts.lu)}` },
              ...(third.relance == null ? [] : [{ libelle: "follow-up", valeur: `${instant(third.relance)} — ${relaunch >= 0 ? `in ${duration(relaunch)} from the reading` : `passed ${duration(-relaunch)} before the reading`}` }]),
              { libelle: "on arrival", valeur: third.aLArrivee },
            ],
      ...(third == null ? { sans: THIRD_NOT_GIVES } : {}),
      // Sa relance est passée : sa ligne le signale (#3458) — une date passée ne la rend pas au chef (#4261).
      ...(third?.relance != null && relaunch < 0 ? { relancePassee: true as const } : {}),
      // Parked pour qui elle attend, pour ce qu'elle attend : pour le chef seulement, elle est dans son TODO (#4261).
      ...(third == null ? {} : { parque: parkedOf(third.qui, third.quoi, third.relance) }),
      fiche: header({ titre: title, url, ...on(knownOne), ...(lines === undefined ? {} : { lignes: lines.get(ticket) ?? [] }) }),
      // Sans relance, personne n'a posé l'attente : rien à reprendre ni à renvoyer, le ticket repart seul.
      ...(third?.relance === null ? {} : { gestes: ["attente-reprendre" as const, "attente-arrivee" as const] }),
      // Faute de capacité, ce que sa carte demande : la vue en tire ses deux sorties (vue/wait-capacity/).
      ...(knownOne.requiert === undefined ? {} : { requiert: knownOne.requiert, enWaiting: true as const }),
      ...(knownOne.station === undefined ? {} : { station: knownOne.station }),
    };
  };

  // La carte d'un ticket livré : ce que `livres` en donne — son titre, ou celui du
  // rail s'il n'en a pas ; quand il a été livré, à l'horloge de la box ; qui l'a
  // cuisiné ; sa PR mergée ; ce qui a été livré, dans les mots de la relecture.
  // Ce que la file n'en dit pas est écrit.
  const delivers = ({ ticket, titre: title, url, livre: when, station, pr, prLue: prRead, relecture: review, moteur: engine, captures, illisible: unreadable }: Delivers): Card => {
    const knownOne = knownOnes.get(ticket);
    const address = url ?? knownOne?.url;
    const named = title === "" ? knownOne?.titre : title;
    const numberOfPr = pr === null ? undefined : /\/pull\/(\d+)$/.exec(pr)?.[1];
    return {
      ticket,
      ...(unreadable === undefined ? lineDelivered(when, review?.resume) : lineUnreadable()),
      ...colored(TONES_OF_TICKET, "servi"),
      ...(named === undefined || named === "" ? {} : { titre: named }),
      ouvrable: address != null && openable(address),
      attendu: false,
      attend: [],
      ...(pr === null ? {} : { pr: openable(pr) }),
      ...(pr === null || prRead === undefined || numberOfPr === undefined ? {} : deliveryOf(Number(numberOfPr), pr, prRead)),
      livraison: delivery(review),
      ...(engine === undefined ? {} : { moteur: engine }),
      ...(unreadable === undefined ? { essayable: true as const } : {}),
      ...(captures === undefined ? {} : { captures: capturesOfCard(captures) }),
      dit: [
        pr === null ? { libelle: "served", valeur: before(when, facts.lu) } : { libelle: "merged", valeur: `${duration(Date.parse(facts.lu) - Date.parse(when))} ago` },
        ...(station === null ? [] : [{ libelle: "cooked by", valeur: station, exact: true as const }]),
        ...(pr === null ? [{ libelle: "PR", valeur: WITHOUT_PR }] : []),
      ],
      ...(station === null ? { sans: WITHOUT_COOK } : {}),
      fiche: header({ ...(named === undefined ? {} : { titre: named }), url: address, pr, ...on(knownOne), ...(lines === undefined ? {} : { lignes: lines.get(ticket) ?? [] }) }),
    };
  };
  const delivered = facts.livres?.map(delivers);
  // Un ticket `servi` du rail que `livres` donne a sa carte dans Livré : il n'en a pas d'autre.
  const servedOnes = new Set(delivered?.map(({ ticket }) => ticket));
  // Ce qui attend un autre humain est dans TODO, replié sous « Awaiting others » (ticket 2985) : ni dans une autre colonne,
  // ni hors des colonnes.
  const others = (facts.attendAutres ?? []).filter(({ ticket }) => !saidOnes.has(ticket) && !inWaiting.has(ticket) && !answeredOnes.has(ticket));
  const ofOtherPeople = new Set(others.map(({ ticket }) => ticket));
  // Un ticket livré dont la carte du chef lui demande de juger la livraison n'a qu'une carte, celle-là, rouge dans Pass (#3519).
  const aJudge = new Set([...saidOnes.keys()].flatMap((ticket) => {
    const judged = deliveryAJudge((facts.attend?.find((expected) => expected.ticket === ticket) ?? ofOthers.get(ticket))?.chef);
    return judged === undefined || judged === ticket ? [] : [judged];
  }));
  const elsewhere = facts.rail.filter(({ ticket, etat: state }) => !saidOnes.has(ticket) && !aJudge.has(ticket) && !inWaiting.has(ticket) && !answeredOnes.has(ticket) && !ofOtherPeople.has(ticket) && !(state === "servi" && servedOnes.has(ticket))).map(({ ticket }) => card(ticket));
  const columns: Column[] = FACTS_COLUMNS.map(({ nom: name, ton: your, etats: states }) => {
    if (name === DELIVERS && delivered !== undefined) return { nom: name, ton: your, compte: String(delivered.length), cartes: delivered, vide: NOTHING_DELIVERS, defile: true };
    const itsOwn = elsewhere.filter((setOne) => factsColumn(knownOnes.get(setOne.ticket), setOne.etat) === name);
    return { nom: name, ton: your, compte: String(itsOwn.length), cartes: itsOwn, vide: NO };
  });
  const nothingOfRead = awaiting === undefined && facts.attend === undefined;
  columns.splice(AWAITING_YOU.rang, 0, {
    nom: AWAITING_YOU.nom,
    ton: AWAITING_YOU.ton,
    compte: nothingOfRead ? "?" : String(saidOnes.size),
    cartes: [...saidOnes.keys()].map(card),
    vide: nothingOfRead ? NOTHING_OF_READ : awaiting === undefined ? NO_EXPECTED : blockEmpty(awaiting) ? NOTHING_N_AWAITING : NO_NUMBER,
    ...(others.length === 0 ? {} : { autres: others.map(({ ticket, qui: who }) => ({ ...card(ticket), qui: who })) }),
  });
  columns.splice(WAITING.rang, 0, {
    nom: WAITING.nom,
    ton: WAITING.ton,
    compte: String(inWaiting.size + answeredOnes.size),
    cartes: [...[...inWaiting].map(queued), ...[...answeredOnes].map(([ticket, answeredOne]) => answered(ticket, answeredOne))],
    vide: NOBODY_AWAITS,
  });
  const rows = new Set(columns.flatMap((column) => column.cartes));
  const outside = elsewhere.filter((setOne) => !rows.has(setOne));
  return {
    colonnes: columns,
    hors: outside,
    ...(outside.length === 0 && others.length === 0 && columns.every(({ nom: name, cartes: cards }) => name === DELIVERS || cards.length === 0) ? { aucunTicket: true as const } : {}),
    ...(awaiting === undefined ? {} : { attendLu: awaiting.a }),
    ...(status === undefined || lines === undefined ? {} : { railLu: status.a }),
  };
}

// La ligne de `status` qui dit que rien ne cuit (`RIEN_NE_CUIT`) : lue
// telle quelle, en anglais ou en français (#928), une seule ligne, hors du bloc `attend` qu'elle
// ne rejoint jamais.
function nothingNotCooked(status?: StatusRead): { rienNeCuit?: string } {
  const line = status?.texte.split("\n").find((candidate) => candidate.startsWith("nothing cooks: ") || candidate.startsWith("rien ne cuit : "));
  return line === undefined ? {} : { rienNeCuit: line };
}

// Les tickets sur lesquels un agent travaille à la lecture (#2984) : un ticket pris, que son cook tient — sauf mis de côté
// ou illisible —, et celui d'un agent qui tourne hors des cooks (cooking.ts, `agentsDe`) : la pass qui juge une livraison,
// le manager qui qualifie ou découpe une issue, le triage. Une livraison qui attend la pass, sa CI ou le chef n'y est pas,
// ni un ticket en file ou en WAITING. Que la lecture soit encore vraie — en ligne, fraîche, la cuisine pas arrêtée —, la
// vue le sait seule.
function ticketsAtWork(facts: Facts): number[] {
  const taken = facts.rail.filter(({ etat: state, attente: wait, illisible: unreadable }) => state === "pris" && wait == null && unreadable === undefined).map(({ ticket }) => ticket);
  const agents = agentsOf(facts.agents, facts.rail).flatMap(({ ticket }) => (ticket === null ? [] : [ticket]));
  return [...new Set([...taken, ...agents])];
}

const NO_COOK = "no cook running";
const COOKS_NOT_READ = "cooks running: not read — this station's runtime does not give them in `facts` yet. This is not “no cook”: the station's “station” step shows them";

// Les faits, tels que la vue les pose : la pastille, les cinq compteurs dans
// l'ordre de la carte, les cooks en cours dans celui de la box, le dernier
// événement, et le rail en six colonnes.
export function board(facts: Facts, awaiting?: BlockRead, status?: StatusRead, answeredEntries?: ReadonlyMap<number, Answered>, writtenEntries?: PriorityShown): Board {
  const { compteurs: counters } = facts;
  return {
    ...colored(TONES_OF_PROJECT, facts.etat),
    arretee: facts.etat === BANNER.etat,
    tick: tick(facts),
    compteurs: [
      { libelle: "rail", nombre: counters.rail },
      { libelle: "taken", nombre: counters.auTravail },
      { libelle: "at pass", nombre: counters.aLaPass },
      { libelle: "awaiting you", nombre: counters.attend },
      { libelle: "served 24 h", nombre: counters.livres24h },
    ],
    cooks: { enCours: facts.cooks ?? [], vide: facts.cooks === undefined ? COOKS_NOT_READ : NO_COOK },
    evenement: event(facts),
    ...nothingNotCooked(status),
    rail: rail(facts, awaiting, status, answeredEntries, writtenEntries),
    auTravail: ticketsAtWork(facts),
    ...(facts.lectureSeule === undefined ? {} : { lectureSeule: facts.lectureSeule }),
    ...(facts.quotaGithub === undefined ? {} : { quotaGithub: facts.quotaGithub }),
    ...(facts.hautDuBacklog === undefined ? {} : { hautDuBacklog: facts.hautDuBacklog }),
    ...(facts.kitchenBoard === undefined ? {} : { kitchenBoard: facts.kitchenBoard }),
    ...(facts.stations === undefined ? {} : { stations: { ...cookingOf(facts.stations, facts.cooks, facts.lu, facts.agents, facts.rail), ...(facts.stationsSurGithub === undefined ? {} : { surGithub: facts.stationsSurGithub }) } }),
    ...(facts.rolesCuisine === undefined ? {} : { rolesCuisine: facts.rolesCuisine }),
    ...(facts.postMortems === undefined ? {} : { postMortems: vueOfPostMortems(facts.postMortems, new Date(facts.lu)) }),
    apprentissage: learningOf(facts.apprentissage),
    etapesDesTickets: stepsOfTickets(facts),
    ...(facts.fils === undefined ? {} : { journal: "illisible" in facts.fils ? facts.fils : { ...logOfDay(facts.fils.fils, new Date(facts.lu)), illisibles: facts.fils.illisibles } }),
    ...(facts.digest === undefined ? {} : { digest: facts.digest }),
  };
}

// Où en est chaque ticket que `faits` rend, pour le récit du premier ticket (ticket 3302) : ceux du rail, puis les servis
// des 24 h — leur PR mergée. Un ticket illisible n'en est pas : rien n'y est deviné.
export function stepsOfTickets(facts: Facts): StepOfTicket[] {
  const prOf = (url: string, number?: number) => (openable(url) ? { numero: number ?? (Number(/\/pull\/(\d+)\/?$/.exec(url)?.[1]) || null), url } : null);
  const ofRail = facts.rail.flatMap(({ ticket, etat: state, pr, renvoi: sendBack, illisible: unreadable }) => (unreadable !== undefined ? [] : [{ ticket, etat: state, pr: pr === undefined ? null : prOf(pr.url, pr.numero), renvoi: sendBack ?? null }]));
  const servedOnes = (facts.livres ?? []).flatMap(({ ticket, pr, illisible: unreadable }) => (unreadable !== undefined ? [] : [{ ticket, etat: "servi", pr: pr === null ? null : prOf(pr), renvoi: null }]));
  return [...ofRail, ...servedOnes];
}

// La bannière d'arrêt : posée sur le « stop » du chef, avec ce qu'il implique
// (docs/runtime/garde-fous.md, « Les garde-fous ») et le geste du socle qui la relance (actions.ts).
export const BANNER = {
  etat: "arrêtée",
  bouton: "reprendre",
  texte: ["KITCHEN STOPPED — your “stop” holds", "All running cooks have been stopped, and none is launched any more — runtime restarts included, until “resume”."],
} as const;

// Les derniers faits de chaque projet, tenus par le process principal : la vue
// nomme un projet et un ticket, jamais une adresse. Celle qui s'ouvre est celle
// que la box a donnée pour ce ticket, à la dernière lecture. Le dernier `status`
// de chaque projet y est tenu aussi, son bloc `attend` mis à part : il vient d'une
// autre lecture, et le rail se dessine des deux. `repondues` : les questions répondues de chaque
// projet (answered.ts), que le rail range dans WAITING. `ecrites` : les priorités que l'app vient d'écrire sur
// les issues de chaque projet (priority.ts), que le rail montre tant que le tableau ne les a pas lues.
// La carte d'un ticket sur le kanban de la nouvelle cuisine (#4482), aux derniers faits lus : son issue et sa PR s'ouvrent par elle.
const cardOfKanban = (given: Facts | undefined, ticket: unknown) => given?.kitchenBoard?.columns.flatMap(({ cards }) => cards).find((card) => card.ticket === ticket);

export function holdFacts(answeredEntries: (project: string) => ReadonlyMap<number, Answered> = () => new Map(), writtenEntries: (project: string) => PriorityShown = () => () => undefined) {
  const heldOnes = new Map<string, { faits: Facts; lecture: Reading }>();
  const blocks = new Map<string, BlockRead>();
  const statuses = new Map<string, StatusRead>();
  const set = <T>(or: Map<string, T>, project: string, value: T | undefined) => void (value === undefined ? or.delete(project) : or.set(project, value));
  return {
    // Hors ligne, ou d'un tableau qui ne s'est pas lu, les derniers faits lus restent : la fiche, ses adresses et le rail
    // gardé s'y lisent encore (#1818, #2151).
    recevoir(reading: Reading): Drawable {
      const { faits: facts, recue: receivedOne } = read(reading, blocks.get(reading.projet), statuses.get(reading.projet), answeredEntries(reading.projet), writtenEntries(reading.projet));
      if (facts === undefined && isMissedOfBoard(reading)) return receivedOne;
      if (facts === undefined) heldOnes.delete(reading.projet);
      else heldOnes.set(reading.projet, { faits: facts, lecture: reading });
      return receivedOne;
    },
    // Ce que `status` vient de rendre pour un projet, son bloc mis à part : s'il
    // change ce qui est dessiné, les derniers faits du projet reviennent
    // redessinés. Une lecture ratée retire tout de celle d'avant, une lecture sans
    // bord son bloc, une lecture sans ligne `rail` ce que les cartes en portaient —
    // rien ne se dessine d'une sortie qui n'est plus la dernière. Hors ligne, ou d'un tableau qui ne s'est pas lu, rien
    // n'est retiré, et rien ne se redessine : le dernier `status` lu reste celui du rail gardé (#1818, #2151).
    attendre(shownOne: Shown): Drawable | undefined {
      if (isMissedOfBoard(shownOne)) return undefined;
      const before = blocks.has(shownOne.projet) || statuses.has(shownOne.projet);
      const readEntry = "erreur" in shownOne ? undefined : shownOne;
      const block = readEntry?.attend === undefined ? undefined : { bloc: readEntry.attend, a: shownOne.a };
      const text = readEntry?.sorties.find(({ commande: command }) => command === "status")?.texte;
      const status = text === undefined || linesOfRail(text) === undefined ? undefined : { texte: text, a: shownOne.a };
      set(blocks, shownOne.projet, block);
      set(statuses, shownOne.projet, status);
      const held = heldOnes.get(shownOne.projet);
      if (held === undefined || (!before && block === undefined && status === undefined)) return undefined;
      return read(held.lecture, block, status, answeredEntries(shownOne.projet), writtenEntries(shownOne.projet)).recue;
    },
    // Les projets dont `status` est lu désormais — celui qui est affiché, ou tous.
    // Ce qu'il a rendu pour un projet qui n'en est plus est lâché : ses faits, eux,
    // continuent d'être lus, et rien ne s'y dessine d'un `status` que plus rien ne
    // rafraîchit. Rend ce qui est à redessiner, sans lui.
    veiller(projects: readonly string[]): Drawable[] {
      return [...new Set([...blocks.keys(), ...statuses.keys()])].filter((project) => !projects.includes(project)).flatMap((project) => {
        blocks.delete(project);
        statuses.delete(project);
        const held = heldOnes.get(project);
        return held === undefined ? [] : [read(held.lecture, undefined, undefined, answeredEntries(project), writtenEntries(project)).recue];
      });
    },
    // Le rail d'un projet redessiné des dernières lectures, sans en attendre une : une question vient
    // d'y être répondue, ou de ne plus l'être. Rien, s'il n'a pas de faits lus.
    redessiner(project: string): Drawable | undefined {
      const held = heldOnes.get(project);
      return held === undefined ? undefined : read(held.lecture, blocks.get(project), statuses.get(project), answeredEntries(project), writtenEntries(project)).recue;
    },
    // Les tickets qui attendent le chef d'après les dernières lectures : ceux que le bloc `attend` nomme
    // en tête d'une ligne, et ceux que `faits` donne dans `attend`. Indéfini : ni l'un ni l'autre n'est lu.
    nommes(project: string): Set<number> | undefined {
      const block = blocks.get(project);
      const given = heldOnes.get(project)?.faits.attend;
      if (block === undefined && given === undefined) return undefined;
      return new Set([...(block === undefined ? [] : ticketsOf(block.bloc).map(({ ticket }) => ticket)), ...(given ?? []).map(({ ticket }) => ticket)]);
    },
    adresse(project: unknown, ticket: unknown): string | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      const url =
        given?.rail.find((candidate) => candidate.ticket === ticket)?.url ??
        entryOf(given, ticket)?.url ??
        given?.livres?.find((candidate) => candidate.ticket === ticket)?.url ??
        // Une carte du kanban de la nouvelle cuisine (#4482).
        cardOfKanban(given, ticket)?.url ??
        // Un `#N` de la ligne d'un ticket mis de côté (#2075) : une issue ou une PR du dépôt, que le rail ne porte pas.
        given?.attend?.flatMap(({ miseDeCote: setAside }) => setAside?.liens ?? []).find((link) => link.numero === ticket)?.url;
      return url != null && openable(url) ? url : undefined;
    },
    // L'adresse d'une capture d'un ticket d'interface, telle que la box l'a donnée à la dernière
    // lecture — sa livraison servie d'abord, puis le rail, puis sa carte de TODO. Rien pour une capture
    // qu'elle n'a pas.
    capture(project: unknown, ticket: unknown, screen: unknown, moment: unknown): string | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      if (moment !== "avant" && moment !== "apres") return undefined;
      const captures =
        given?.livres?.find((candidate) => candidate.ticket === ticket)?.captures ??
        given?.rail.find((candidate) => candidate.ticket === ticket)?.captures ??
        entryOf(given, ticket)?.carte?.captures ??
        entryOf(given, ticket)?.chef?.design?.captures ??
        undefined;
      return captures?.ecrans.find((candidate) => candidate.ecran === screen)?.[moment as Moment] ?? undefined;
    },
    // La carte de TODO d'un ticket, telle que la box l'a donnée à la dernière lecture : la seule à
    // laquelle le chef répond depuis l'app (card-todo.ts). Rien pour un ticket qui n'en a pas.
    carte(project: unknown, ticket: unknown): CardRead | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      return entryOf(given, ticket)?.carte;
    },
    // La carte du chef d'un ticket, lue de GitHub à la dernière lecture (#2434, board/todo-github.ts) : celle à laquelle le
    // chef répond sur GitHub même. Rien pour un ticket qui n'en a pas.
    chef(project: unknown, ticket: unknown): CardOfChef | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      return entryOf(given, ticket)?.chef;
    },
    // La PR mergée d'un ticket livré, telle que la box l'a donnée à la dernière lecture.
    pr(project: unknown, ticket: unknown): string | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      // Ou la PR qu'une carte « Validate its screen » valide (ticket 3185).
      const chef = entryOf(given, ticket)?.chef;
      const url = given?.livres?.find((candidate) => candidate.ticket === ticket)?.pr ?? chef?.design?.url ?? cardOfKanban(given, ticket)?.pr?.url;
      return url != null && openable(url) ? url : undefined;
    },
    // Les derniers faits lus d'un projet, et l'heure de leur lecture : c'est d'eux qu'une
    // confirmation tire son prix (confirmation.ts). Rien, s'ils ne sont pas lus.
    dernier(project: unknown): { faits: Facts; a: string } | undefined {
      const held = typeof project === "string" ? heldOnes.get(project) : undefined;
      return held === undefined ? undefined : { faits: held.faits, a: held.lecture.a };
    },
    // Ce que `facts` dit des stations d'un projet, à la dernière lecture — rien, s'il n'est pas lu.
    stations(project: unknown): FactsStation[] | undefined {
      return typeof project === "string" ? heldOnes.get(project)?.faits.stations : undefined;
    },
    // Ce que le dernier bloc `attend` dit de ce ticket, ligne pour ligne — celles qui le précisent
    // comprises —, et son titre si `faits` le donne. Rien quand le bloc ne le nomme pas : la vue ne
    // fait pas dire à la file ce qu'elle n'a pas dit.
    attendu(project: unknown, ticket: unknown): { lignes: string[]; titre?: string } | undefined {
      const block = typeof project === "string" ? blocks.get(project) : undefined;
      if (block === undefined || typeof ticket !== "number") return undefined;
      const entries = ticketsOf(block.bloc).filter((expected) => expected.ticket === ticket);
      if (entries.length === 0) return undefined;
      const given = heldOnes.get(project as string)?.faits;
      const title = given?.rail.find((candidate) => candidate.ticket === ticket)?.titre ?? given?.attend?.find((candidate) => candidate.ticket === ticket)?.titre;
      return { lignes: entries.flatMap(({ ligne: line, suite }) => [line, ...suite]), ...(title === undefined || title === "" ? {} : { titre: title }) };
    },
    // Ce que les derniers faits donnent d'un ticket : son mot d'état et son titre sur le rail —
    // servi, s'il n'est que dans `livres`. Rien, s'ils ne le portent nulle part.
    ticket(project: unknown, ticket: unknown): { etat?: string; titre?: string } | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      if (given === undefined) return undefined;
      const onTheRail = given.rail.find((candidate) => candidate.ticket === ticket);
      const delivers = given.livres?.find((candidate) => candidate.ticket === ticket);
      const expected = entryOf(given, ticket);
      if (onTheRail === undefined && delivers === undefined && expected === undefined) return undefined;
      const state = onTheRail?.etat ?? (delivers === undefined ? undefined : "servi");
      const title = [onTheRail?.titre, delivers?.titre, expected?.titre].find((candidate) => candidate !== undefined && candidate !== "");
      return { ...(state === undefined ? {} : { etat: state }), ...(title === undefined ? {} : { titre: title }) };
    },
    oublier(): void {
      heldOnes.clear();
      blocks.clear();
      statuses.clear();
    },
  };
}
