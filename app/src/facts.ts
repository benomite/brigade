// Ce que l'app dessine : les faits qu'elle lit de GitHub dans une forme faite pour un programme (board/read.ts). L'app n'y
// déduit rien : un état est un mot lu, un compteur un nombre lu. Une sortie qui n'est pas cette forme n'est pas dessinée du
// tout — ce qui a été rendu se lit à sa place. Et une couleur ne se pose que sur un mot de la liste fermée : un mot inconnu
// s'affiche tel quel, sans couleur.
// Le rail est le kanban de la cuisine (board/kitchen-board.ts), que la vue dessine telle quelle ; TODO — ce que le chef peut
// trancher maintenant — se range d'après `attend`, que la forme donne, et les numéros en tête des lignes du bloc `attend`
// de `status` (awaiting.ts), qui dit le geste en mots.
import { kitchenBoardRead, type KitchenBoard } from "./board/kitchen-board.ts";
import { ticketsOf, saysOf, type Shown } from "./awaiting.ts";
import { THE_CHEF, wordOfState, parkedOf, type Door } from "./slip.ts";
import { lineSetAside, lineAwaitingMe, lineUnreadable, type LineOfCard } from "./line-card.ts";
import type { Failure, Reading } from "./box.ts";
import type { PauseOfReads } from "./board/read.ts";
import { withoutQuestion } from "./handover-second.ts";
import { header, type Header } from "./card.ts";
import { cardOfChefOfTodo, type CardOfTodo } from "./card-todo.ts";
import { type CardOfChef, type Recommended } from "./board/todo-github.ts";
import { WITHOUT_REASON, type SetAside } from "./board/set-aside-github.ts";
import { quotaRead, type QuotaGithub } from "./vue/stations-quota/quota-read.ts";

export const COMMAND = "facts";


// La carte du chef lue de GitHub (board/todo-github.ts) : sa sorte et son texte, ou rien si elle n'a pas cette forme.
function chefRead(raw: unknown): CardOfChef | undefined {
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  if (typeof readOne?.sorte !== "string" || typeof readOne.texte !== "string") return undefined;
  // La recommandation d'un écart du manager (#3434) : nulle, il n'en recommande aucun — ni quand elle n'a pas sa forme : aucun
  // choix n'est mis en avant à sa place.
  const recommended = recommendedRead(readOne.recommandee);
  return { sorte: readOne.sorte, texte: readOne.texte, ...(recommended === undefined ? {} : { recommandee: recommended }) };
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

// Un ticket que le bloc `attend` nomme, et ce que `faits` en donne : son titre et l'adresse de son issue, nulle quand elle n'en
// a pas. L'app n'en compose aucune.
// `miseDeCote` : pour un ticket d'un projet GitHub seul que `served-elsewhere` met de côté, ce qui le
// met de côté (board/set-aside-github.ts, #2075) — absente pour toute autre entrée.
// Une carte qui attend un autre humain du projet que le compte connecté (vue/cards-assigned/, ticket 2985) : TODO la
// replie sous « Awaiting others » — comme une entrée de `attend` (sa carte…), et `qui` elle attend, leurs logins
// GitHub : l'assignation ne retient personne, tout humain du projet l'ouvre et y répond (ticket 3071).
export type ExpectedOfOthers = Expected & { qui: string[] };
export type Expected = { ticket: number; titre: string; url: string | null; chef?: CardOfChef; miseDeCote?: SetAside; illisible?: string };

// Ce qu'un ticket en WAITING attend d'un tiers, comme le runtime le donne : `quoi`, dans
// les mots du chef ; `qui` ; `depuis`, sa mise en attente, et `relance`, quand y revenir,
// à l'horloge de la box ; `aLArrivee`, ce que « c'est arrivé » fera de lui, en clair. Un ticket mis de côté faute de
// station y est aussi : le chef n'a posé aucune attente, donc `relance` est nulle et la carte n'a rien à reprendre.
export type Third = { quoi: string; qui: string; depuis: string; relance: string | null; aLArrivee: string };

// La forme, telle que le lecteur de GitHub la fige (board/read.ts).
export type Facts = {
  etat: string;
  lu: string;
  // Le quota GitHub du compte et ce qui l'use (`quotaGithub`, ticket 3483) : la jauge de l'onglet Stations.
  quotaGithub?: QuotaGithub;
  // Le dépôt du projet, quand le compte GitHub de l'app ne peut pas y écrire (board/read.ts, `lectureSeule`, #3163) ; absent sinon, et quand GitHub ne l'a pas dit.
  lectureSeule?: { depot: string };
  // Le kanban du projet (board/kitchen-board.ts, #4482) : ses six colonnes, tirées des labels seuls.
  kitchenBoard?: KitchenBoard;
  compteurs: { rail: number; auTravail: number; aLaPass: number; attend: number; livres24h: number };
  // Ce qui attend le chef, une entrée par ticket (board/wait-of-chef.ts) ; absent, la liste n'est pas lue.
  attend?: Expected[];
  // Ce qui attend un autre humain du projet que le compte connecté (ticket 2985) : hors de `attend`, et de toute colonne
  // — TODO le replie sous « Awaiting others ». Absent quand rien n'attend un autre humain.
  attendAutres?: ExpectedOfOthers[];
};

// Une carte de TODO : `ouvrable`, ce ticket s'ouvre sur son issue ; `attendu`, il attend une décision du chef ; `attend`, ce
// que le bloc `attend` dit de lui, entrée par entrée, mot pour mot. Et ce qu'elle dit, elle, en deux lignes (line-card.ts) :
// `ligne`, ce qui se passe ; `signal`, ce qui demande l'attention. `fiche` : l'en-tête de sa fiche, qu'un clic sur la carte
// ouvre par-dessus le rail (card.ts) — ce qu'on attend de toi, en une phrase.
// `todo` : sur une carte du chef lue de GitHub, sa question et ses choix (card-todo.ts) — ce que le chef tranche sur la
// carte même, d'un clic ou d'un texte.
// `etape` : la colonne de son étape. `miseDeCote` : le label qui met son ticket de côté, et les `#N` de sa ligne qui
// s'ouvrent d'un clic (#2075).
export type Card = Partial<LineOfCard> & { ticket: number; titre?: string; ouvrable: boolean; attendu: boolean; attend: string[]; fiche: Header; todo?: CardOfTodo; chef?: CardOfChef; qui?: string[]; etape?: string; miseDeCote?: { label: string; liens: number[] } } & Door;
// `compte` : le nombre de ses cartes — ou `?`, pour TODO, tant que rien ne dit qui attend. `vide` : ce qui se lit à la
// place des cartes quand il n'y en a pas.
// `autres` : dans TODO, les cartes qui attendent un autre humain du projet (ticket 2985), repliées sous « Awaiting
// others » après les siennes — leur question, qui elles attendent ; absent quand il n'y en a aucune.
export type Column = { nom: string; ton: string; compte: string; cartes: Card[]; vide: string; defile?: true; autres?: Card[] };
// `attendLu` : l'heure de la lecture de `status` dont vient le bloc — absente, il n'a pas été pris.
export type Rail = { colonnes: Column[]; hors: Card[]; aucunTicket?: true; attendLu?: string };
// Le bloc `attend` d'un projet, tel que `status` l'a écrit, et l'heure de sa lecture.
export type BlockRead = { bloc: string; a: string };
export type Board = {
  etat: string;
  mot?: string;
  ton?: string;
  compteurs: { libelle: string; nombre: number }[];
  rail: Rail;
  // Le kanban du projet (#4482) : la vue le dessine.
  kitchenBoard?: KitchenBoard;
  // Le dépôt du projet quand le compte GitHub de l'app ne peut pas y écrire (#3163) : la vue l'ouvre en lecture seule —
  // tout s'y voit, aucun geste n'y est offert, et une ligne en tête le dit. Absent : la vue ordinaire.
  lectureSeule?: { depot: string };
  // Le quota GitHub du compte, pour la jauge de l'onglet Stations (ticket 3483).
  quotaGithub?: QuotaGithub;
};

// Ce qu'une lecture de `faits` donne à la vue : le tableau ; ou, sous un `titre`
// qui dit lequel, ce qui a été `rendu` à la place des faits, mot pour mot, et
// en quoi ce n'est pas la forme (`informe`) ; ou l'échec de la veille, tel quel.
// `publieLe` : l'heure où GitHub a été lu pour ce rail (#2054) — absent d'une lecture qui ne vient pas du tableau.
export type Drawable = { projet: string; demande: number; a: string; publieLe?: string; pause?: PauseOfReads } & ({ tableau: Board } | { titre: string; informe: string; rendu: string } | ({ titre: string } & Failure));

class Informs extends Error {}

const refuse = (field: string, expected: string): never => {
  throw new Informs(`“${field}” is not ${expected}`);
};
const object = (value: unknown, field: string): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : refuse(field, "an object");
const text = (value: unknown, field: string): string => (typeof value === "string" ? value : refuse(field, "a string"));
const whole = (value: unknown, field: string): number => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : refuse(field, "a non-negative integer"));
const hour = (value: unknown, field: string): string => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : refuse(field, "a time"));
const orNothing = <T>(value: unknown, field: string, read: (value: unknown, field: string) => T): T | null => (value === null ? null : read(value, field));
const textsRead = (value: unknown, field: string): string[] => (Array.isArray(value) ? value.map((oneOf, rank) => text(oneOf, `${field}[${rank}]`)) : refuse(field, "a list"));

// `lectureSeule`, de la racine de `facts` (#3163) : le dépôt où le compte ne peut pas écrire ; rien de mal formé ne le pose.
function readOnlyRead(value: unknown): { lectureSeule?: { depot: string } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { depot: repository } = value as Record<string, unknown>;
  return typeof repository === "string" && repository !== "" ? { lectureSeule: { depot: repository } } : {};
}

// Une entrée de `attend`, ou de `attendAutres` (qui y ajoute `qui`) : une lue de travers ne tombe que sur elle.
function expectedRead(readOne: Record<string, unknown>, which: string): Expected {
  const base = { ticket: whole(readOne.ticket, `${which}.ticket`), titre: typeof readOne.titre === "string" ? readOne.titre : "" };
  try {
    const chef = chefRead(readOne.chef);
    const setAside = setAsideRead(readOne.miseDeCote);
    return { ticket: base.ticket, titre: text(readOne.titre, `${which}.titre`), url: orNothing(readOne.url, `${which}.url`, text), ...(chef === undefined ? {} : { chef }), ...(setAside === undefined ? {} : { miseDeCote: setAside }) };
  } catch (error) {
    if (error instanceof Informs) return { ticket: base.ticket, titre: base.titre, url: null, illisible: error.message };
    throw error;
  }
}

// L'entrée de TODO d'un ticket que `faits` porte : celle qui attend le compte connecté, ou un autre humain du projet — la
// carte de l'un et de l'autre s'ouvre et se répond de même (ticket 3071).
export const entryOf = (facts: Pick<Facts, "attend" | "attendAutres"> | undefined, ticket: unknown): Expected | undefined =>
  facts?.attend?.find((candidate) => candidate.ticket === ticket) ?? facts?.attendAutres?.find((candidate) => candidate.ticket === ticket);

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
    return {
      etat: text(root.etat, "etat"),
      lu: hour(root.lu, "lu"),
      ...quotaRead(root.quotaGithub),
      ...readOnlyRead(root.lectureSeule),
      ...kitchenBoardRead(root.kitchenBoard),
      compteurs: {
        rail: whole(counters.rail, "compteurs.rail"),
        auTravail: whole(counters.auTravail, "compteurs.auTravail"),
        aLaPass: whole(counters.aLaPass, "compteurs.aLaPass"),
        attend: whole(counters.attend, "compteurs.attend"),
        livres24h: whole(counters.livres24h, "compteurs.livres24h"),
      },
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
    };
  } catch (error) {
    if (error instanceof Informs) return { informe: error.message };
    throw error;
  }
}

// Une lecture qui n'a pas joint GitHub du tout (board/read.ts, `horsLigne`) : l'app est hors ligne, une seule cause
// pour tout ce qu'elle lit (#1818). Rien de ce qui était lu ne s'en efface, et rien n'y est une panne.
export const isOutsideLine = (reading: object): boolean => "horsLigne" in reading && reading.horsLigne === true;
// Une lecture de GitHub qui a raté, hors ligne ou non — GitHub qui limite les appels, refuse, ne répond pas à temps
// (board/rail.ts, `duTableau`) : elle ne dit rien de ce que GitHub tient encore. Rien de ce qui était lu ne s'en efface (#2151) ; la vue garde le dernier rail lu, et dit depuis quand il est périmé.
export const isMissedOfBoard = (reading: object): boolean => "erreur" in reading && "duTableau" in reading && reading.duTableau === true;

// `sansReponse` : ce qui se dit d'une box jointe dont le code ne dit aucun cas — pour une autre commande que `facts`.
export function titleOfFailure({ atteinte: reached, duTableau: ofBoard }: Failure, withoutAnswer = "REACHED, BUT `facts` DID NOT ANSWER"): string {
  // Lue de GitHub (#1694, #2061) : aucune station n'a été jointe, c'est GitHub qui n'a pas dit.
  if (ofBoard === true) return "NOT READ FROM GITHUB";
  return reached ? withoutAnswer : "NOT REACHED";
}

// Une lecture de la veille, et ce qui s'en dessine. Sans faits, rien n'est
// dessiné : le titre dit quel cas, et ce qui a été obtenu suit.
function read(reading: Reading, awaiting?: BlockRead): { faits?: Facts; recue: Drawable } {
  if ("erreur" in reading) return { recue: { ...reading, titre: titleOfFailure(reading) } };
  const { projet: project, demande: request, a } = reading;
  const rendered = reading.sorties.find(({ commande: command }) => command === COMMAND)?.texte ?? "";
  const facts = understand(rendered);
  if ("informe" in facts) return { recue: { projet: project, demande: request, a, titre: "THE STATION DID NOT RETURN THE SHAPE OF `facts`", informe: facts.informe, rendu: rendered } };
  const publishedThe = "publieLe" in reading && typeof reading.publieLe === "string" ? { publieLe: reading.publieLe } : {};
  const paused = "pause" in reading && typeof reading.pause === "object" && reading.pause !== null ? { pause: reading.pause as PauseOfReads } : {};
  return { faits: facts, recue: { projet: project, demande: request, a, ...publishedThe, ...paused, tableau: board(facts, awaiting) } };
}

// La couleur de chaque mot d'état de la cuisine.
const TONES_OF_PROJECT = new Map([
  ["ouverte", "vert"],
  ["retenue", "jaune"],
  ["arrêtée", "rouge"],
  ["éteinte", "rouge"],
]);
// Le mot et, s'il est de la liste, sa couleur : un mot inconnu n'en porte aucune.
// `mot` : ce qui s'affiche à sa place, en anglais (slip.ts) ; `etat` reste la valeur lue.
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

// Seule une adresse https s'ouvre : rien de ce que GitHub rend n'est lancé comme un fichier ou un programme.
const openable = (url: string) => URL.parse(url)?.protocol === "https:";

// La liste de ce qui attend le chef, et la colonne où une carte sans étape connue est posée : un ticket pas encore pris est sur le rail.
const AWAITING_YOU = "Awaiting you";
const ON_THE_RAIL = "On the rail";
const NO_NUMBER = "no ticket at the head of a line of the `attend` block";
const NO_EXPECTED = "no ticket in `attend`, according to `facts`";
// Le bloc dit lui-même que rien n'attend le chef (`decrireAttentes`) : TODO le dit en une ligne, au lieu de disparaître (#2076).
const NOTHING_N_AWAITING = "nothing awaits you";
const blockEmpty = ({ bloc: block }: BlockRead) => /^(awaiting|attend)\s+(nothing awaits the chef|rien n'attend le chef)\s*$/.test(block.split("\n")[0] ?? "");
const NOTHING_OF_READ = "not read: this station's runtime does not give `attend` in `facts`, and the `attend` block of the station's “status” step was not taken for this project. This is not “nothing awaits you” — the tickets stay in their columns";

// La liste de ce qui attend le chef — TODO, « Awaiting you » —, que la vue ne dessine pas en colonne : elle en pose chaque
// carte, en rouge, dans la colonne de son étape (`etape`, #3458). Un ticket qui attend une décision du chef est dans TODO,
// et là seulement : c'est l'information qui décide d'un geste. Il y est dès que la file le nomme — dans `attend`, que `faits`
// donne, ou en tête d'une ligne du bloc `attend` de `status`, qui dit en plus ce qu'on attend de lui. TODO garde l'ordre du
// bloc, le plus ancien d'abord, puis celui de `faits`.
export function rail(facts: Facts, awaiting?: BlockRead): Rail {
  // Ce qui attend un autre humain du projet (ticket 2985) : sa carte est celle de TODO, ses gestes aussi (ticket 3071).
  const ofOthers = new Map((facts.attendAutres ?? []).map((expected) => [expected.ticket, expected]));
  const saidOnes = new Map<number, string[]>();
  for (const entry of awaiting === undefined ? [] : ticketsOf(awaiting.bloc)) saidOnes.set(entry.ticket, [...(saidOnes.get(entry.ticket) ?? []), saysOf(entry)]);
  for (const { ticket } of facts.attend ?? []) if (!saidOnes.has(ticket)) saidOnes.set(ticket, []);

  // La carte d'un ticket qui attend : ce que `faits.attend` en donne — son titre s'il y en a un, son adresse si GitHub l'a
  // rendue —, puis ce que la file dit de lui.
  const card = (ticket: number): Card => {
    const gives = facts.attend?.find((expected) => expected.ticket === ticket) ?? ofOthers.get(ticket);
    const url = gives?.url;
    const title = gives?.titre === undefined || gives.titre === "" ? undefined : gives.titre;
    const said = saidOnes.get(ticket) ?? (ofOthers.has(ticket) ? [] : undefined);
    // Mis de côté par un label, sur GitHub seul : il t'attend, et sa ligne dit pourquoi (#2075).
    const setAside = said === undefined ? undefined : gives?.miseDeCote;
    const why = setAside === undefined ? undefined : (setAside.raison ?? WITHOUT_REASON);
    // La carte du chef lue de GitHub, dans la forme de toute carte de TODO (#2434) : sa question n'est dite qu'une fois, sur
    // la carte — la ligne dit ce que sa sorte attend du chef, jamais la question.
    const ofChef = said === undefined || gives?.chef === undefined ? undefined : cardOfChefOfTodo(gives.chef);
    const line: LineOfCard =
      gives?.illisible !== undefined
        ? lineUnreadable()
        : ofChef !== undefined && gives?.chef !== undefined
          ? lineAwaitingMe(sentenceOfChef(gives.chef.sorte))
          : why !== undefined
            ? lineSetAside(why)
            : lineAwaitingMe(gives?.chef === undefined ? withoutQuestion(ticket) : sentenceOfChef(gives.chef.sorte));
    const setOne: Card = {
      ticket,
      ...line,
      ...(title === undefined ? {} : { titre: title }),
      ouvrable: url != null && openable(url),
      attendu: said !== undefined,
      attend: said ?? [],
      // Qui attend le chef reste dans la colonne de son étape, en rouge (#3458) : le rail, quand elle n'y est pas encore.
      ...(said === undefined ? {} : { etape: ON_THE_RAIL }),
      fiche: {
        ...header({ ...(title === undefined ? {} : { titre: title }), url }),
        // La carte du chef : la tête dit ce que sa sorte attend, la question est dite dessous.
        ...(said === undefined ? {} : { attendu: ofChef !== undefined && gives?.chef !== undefined ? sentenceOfChef(gives.chef.sorte) : (why ?? withoutQuestion(ticket)) }),
      },
      ...(said !== undefined && gives?.chef !== undefined ? { chef: gives.chef } : {}),
      ...(setAside === undefined ? {} : { miseDeCote: { label: setAside.label, liens: setAside.raison === null ? [] : setAside.liens.map(({ numero: number }) => number) } }),
      ...(ofChef === undefined ? {} : { todo: ofChef }),
      dit: [],
    };
    // Ce qui attend le chef, ou un autre humain du projet, est parked pour lui (#4261) : pour sa question — ou ce que sa
    // carte attend —, sans date. Parked pour le chef, c'est une carte de son TODO.
    if (said === undefined) return setOne;
    const others = saidOnes.has(ticket) ? undefined : ofOthers.get(ticket)?.qui.join(", ");
    return { ...setOne, parque: parkedOf(others ?? THE_CHEF, setOne.todo?.question ?? setOne.fiche.attendu, null) };
  };

  // Ce qui attend un autre humain est dans TODO, replié sous « Awaiting others » (ticket 2985) : ni dans une autre colonne,
  // ni hors des colonnes.
  const others = (facts.attendAutres ?? []).filter(({ ticket }) => !saidOnes.has(ticket));
  const nothingOfRead = awaiting === undefined && facts.attend === undefined;
  const awaitingYou: Column = {
    nom: AWAITING_YOU,
    ton: "rouge",
    compte: nothingOfRead ? "?" : String(saidOnes.size),
    cartes: [...saidOnes.keys()].map(card),
    vide: nothingOfRead ? NOTHING_OF_READ : awaiting === undefined ? NO_EXPECTED : blockEmpty(awaiting) ? NOTHING_N_AWAITING : NO_NUMBER,
    ...(others.length === 0 ? {} : { autres: others.map(({ ticket, qui: who }) => ({ ...card(ticket), qui: who })) }),
  };
  return {
    colonnes: [awaitingYou],
    hors: [],
    ...(awaiting === undefined ? {} : { attendLu: awaiting.a }),
  };
}

// Les faits, tels que la vue les pose : la pastille, les compteurs dans l'ordre de la carte, et le rail.
export function board(facts: Facts, awaiting?: BlockRead): Board {
  const { compteurs: counters } = facts;
  return {
    ...colored(TONES_OF_PROJECT, facts.etat),
    compteurs: [
      { libelle: "rail", nombre: counters.rail },
      { libelle: "taken", nombre: counters.auTravail },
      { libelle: "at pass", nombre: counters.aLaPass },
      { libelle: "awaiting you", nombre: counters.attend },
      { libelle: "served 24 h", nombre: counters.livres24h },
    ],
    rail: rail(facts, awaiting),
    ...(facts.lectureSeule === undefined ? {} : { lectureSeule: facts.lectureSeule }),
    ...(facts.quotaGithub === undefined ? {} : { quotaGithub: facts.quotaGithub }),
    ...(facts.kitchenBoard === undefined ? {} : { kitchenBoard: facts.kitchenBoard }),
  };
}

// La carte d'un ticket sur le kanban (#4482), aux derniers faits lus : son issue et sa PR s'ouvrent par elle.
const cardOfKanban = (given: Facts | undefined, ticket: unknown) => given?.kitchenBoard?.columns.flatMap(({ cards }) => cards).find((card) => card.ticket === ticket);

// Les derniers faits de chaque projet, tenus par le process principal : la vue nomme un projet et un ticket, jamais une
// adresse. Le dernier bloc `attend` de chaque projet y est tenu aussi : il vient d'une autre lecture, et le rail se dessine
// des deux.
export function holdFacts() {
  const heldOnes = new Map<string, { faits: Facts; lecture: Reading }>();
  const blocks = new Map<string, BlockRead>();
  return {
    // Hors ligne, ou d'un tableau qui ne s'est pas lu, les derniers faits lus restent : la fiche, ses adresses et le rail
    // gardé s'y lisent encore (#1818, #2151).
    recevoir(reading: Reading): Drawable {
      const { faits: facts, recue: receivedOne } = read(reading, blocks.get(reading.projet));
      if (facts === undefined && isMissedOfBoard(reading)) return receivedOne;
      if (facts === undefined) heldOnes.delete(reading.projet);
      else heldOnes.set(reading.projet, { faits: facts, lecture: reading });
      return receivedOne;
    },
    // Ce que `status` vient de rendre pour un projet, son bloc mis à part : s'il change ce qui est dessiné, les derniers
    // faits du projet reviennent redessinés. Une lecture ratée retire tout de celle d'avant. Hors ligne, ou d'un tableau
    // qui ne s'est pas lu, rien n'est retiré, et rien ne se redessine (#1818, #2151).
    attendre(shownOne: Shown): Drawable | undefined {
      if (isMissedOfBoard(shownOne)) return undefined;
      const before = blocks.has(shownOne.projet);
      const readEntry = "erreur" in shownOne ? undefined : shownOne;
      const block = readEntry?.attend === undefined ? undefined : { bloc: readEntry.attend, a: shownOne.a };
      if (block === undefined) blocks.delete(shownOne.projet);
      else blocks.set(shownOne.projet, block);
      const held = heldOnes.get(shownOne.projet);
      if (held === undefined || (!before && block === undefined)) return undefined;
      return read(held.lecture, block).recue;
    },
    // Les projets dont `status` est lu désormais — celui qui est affiché, ou tous. Ce qu'il a rendu pour un projet qui n'en
    // est plus est lâché. Rend ce qui est à redessiner, sans lui.
    veiller(projects: readonly string[]): Drawable[] {
      return [...blocks.keys()].filter((project) => !projects.includes(project)).flatMap((project) => {
        blocks.delete(project);
        const held = heldOnes.get(project);
        return held === undefined ? [] : [read(held.lecture).recue];
      });
    },
    // Le rail d'un projet redessiné des dernières lectures, sans en attendre une. Rien, s'il n'a pas de faits lus.
    redessiner(project: string): Drawable | undefined {
      const held = heldOnes.get(project);
      return held === undefined ? undefined : read(held.lecture, blocks.get(project)).recue;
    },
    // Les tickets qui attendent le chef d'après les dernières lectures : ceux que le bloc `attend` nomme en tête d'une
    // ligne, et ceux que `faits` donne dans `attend`. Indéfini : ni l'un ni l'autre n'est lu.
    nommes(project: string): Set<number> | undefined {
      const block = blocks.get(project);
      const given = heldOnes.get(project)?.faits.attend;
      if (block === undefined && given === undefined) return undefined;
      return new Set([...(block === undefined ? [] : ticketsOf(block.bloc).map(({ ticket }) => ticket)), ...(given ?? []).map(({ ticket }) => ticket)]);
    },
    adresse(project: unknown, ticket: unknown): string | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      const url =
        entryOf(given, ticket)?.url ??
        // Une carte du kanban (#4482).
        cardOfKanban(given, ticket)?.url ??
        // Un `#N` de la ligne d'un ticket mis de côté (#2075) : une issue ou une PR du dépôt, que le rail ne porte pas.
        given?.attend?.flatMap(({ miseDeCote: setAside }) => setAside?.liens ?? []).find((link) => link.numero === ticket)?.url;
      return url != null && openable(url) ? url : undefined;
    },
    // La carte du chef d'un ticket, lue de GitHub à la dernière lecture (#2434, board/todo-github.ts) : celle à laquelle le
    // chef répond sur GitHub même. Rien pour un ticket qui n'en a pas.
    chef(project: unknown, ticket: unknown): CardOfChef | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      return entryOf(given, ticket)?.chef;
    },
    // La PR d'un ticket servi, telle que le kanban l'a donnée à la dernière lecture.
    pr(project: unknown, ticket: unknown): string | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      const url = cardOfKanban(given, ticket)?.pr?.url;
      return url != null && openable(url) ? url : undefined;
    },
    // Les derniers faits lus d'un projet, et l'heure de leur lecture : c'est d'eux que les gestes tirent leur adresse. Rien,
    // s'ils ne sont pas lus.
    dernier(project: unknown): { faits: Facts; a: string } | undefined {
      const held = typeof project === "string" ? heldOnes.get(project) : undefined;
      return held === undefined ? undefined : { faits: held.faits, a: held.lecture.a };
    },
    // Ce que le dernier bloc `attend` dit de ce ticket, ligne pour ligne — celles qui le précisent comprises —, et son titre
    // si `faits` le donne. Rien quand le bloc ne le nomme pas : la vue ne fait pas dire à la file ce qu'elle n'a pas dit.
    attendu(project: unknown, ticket: unknown): { lignes: string[]; titre?: string } | undefined {
      const block = typeof project === "string" ? blocks.get(project) : undefined;
      if (block === undefined || typeof ticket !== "number") return undefined;
      const entries = ticketsOf(block.bloc).filter((expected) => expected.ticket === ticket);
      if (entries.length === 0) return undefined;
      const title = entryOf(heldOnes.get(project as string)?.faits, ticket)?.titre;
      return { lignes: entries.flatMap(({ ligne: line, suite }) => [line, ...suite]), ...(title === undefined || title === "" ? {} : { titre: title }) };
    },
    // Ce que les derniers faits donnent d'un ticket : son titre. Rien, s'ils ne le portent nulle part.
    ticket(project: unknown, ticket: unknown): { etat?: string; titre?: string } | undefined {
      const given = typeof project === "string" ? heldOnes.get(project)?.faits : undefined;
      const expected = entryOf(given, ticket);
      if (expected === undefined) return undefined;
      return expected.titre === "" ? {} : { titre: expected.titre };
    },
    oublier(): void {
      heldOnes.clear();
      blocks.clear();
    },
  };
}
