// La cuisine d'un projet, lue de GitHub seul (#2061) : ses issues, leurs labels et ses PR — rien d'autre. La cuisine garde
// tout son état dans ses labels (runtime/src/kitchen/, #4482, #4507) ; deux stations qui servent le même projet ne
// peuvent donc pas se contredire, et l'app lit ce que l'une et l'autre lisent :
//   - le kanban : chaque issue ouverte dans la colonne que ses labels disent, et ce qui a été servi dans la journée
//     (kitchen-board.ts) ;
//   - TODO : ce qui attend le chef (wait-of-chef.ts, #2460), ajouté par l'appelant (main.ts) — les issues `parked:chef`
//     de la même liste.
// Ce qui en sort a la forme que la vue du rail lit (board/rail.ts) : l'objet de `facts`, les rubriques et les lignes de
// `status`.
//
// Ni la box ni une station ne sont jointes : rien d'autre que GitHub, par l'appel que la plateforme donne (client.ts).
// Ce qui ne se lit pas le dit, jamais un rail vide : GitHub qui ne répond pas ou refuse — chaque fois un échec, et sa
// raison en une phrase, que l'app montre telle quelle.
import type { CallGitHub, AnswerGitHub } from "./client.ts";
import { writingOnTheRepository } from "./writing.ts";
import { readKitchenBoard, type KitchenBoard } from "./kitchen-board.ts";
import { LABEL_PARKED_CHEF } from "./parked-chef-github.ts";
import { readConditional, type MemoryOfReads } from "./rail-github.ts";

// Une rubrique de `status` : son titre, et ses lignes.
export type HeadingOfBoard = { titre: string; lignes: string[] };
// La ligne `status` d'un ticket du rail, et sa priorité (`prio:<n>`, nulle sans).
export type LineOfRail = { ticket: number; priorite: number | null; ligne: string };
// Une ligne de la file du chef, comme le bloc `awaiting` de `status` l'écrit (rail.ts, `blocAwaiting`) : ce qui la nomme
// en tête de sa ligne (`#18`), son ticket, son titre, d'où elle vient (wait-of-chef.ts), l'instant où elle a commencé
// d'attendre, et ce qui attend puis le geste du chef.
export type LineOfTheFile = { nom: string; ticket: number | null; titre: string | null; quoi: string; depuis: string; ligne: string };
// L'objet de `facts`, tel que la vue du rail le lit (facts.ts, `comprendre`).
export type FactsPublished = { [field: string]: unknown };
// Ce que fait le cook d'un ticket (vue/activity-of-cook.js) : ce que GitHub en dit — la station qui le tient, depuis sa
// prise, et sa PR. Ni ses gestes, ni ses tours, ni ses tokens : seul le journal de sa station les porte.
export type StepOfCook = { fait: string; faitEn: string; cible: string | null; depuis: string };
export type ActivityOfCook = {
  ticket: number;
  titre: string | null;
  run: string;
  station: string | null;
  lanceLe: string;
  finiLe: string | null;
  fin: string | null;
  maintenant: StepOfCook | null;
  etapes: StepOfCook[];
  tours: number | null;
  tokens: number | null;
  pr: { numero: number | null; url: string } | null;
};
export type BoardRead = {
  lu: true;
  // `<owner>/<repo>`.
  depot: string;
  // L'heure de la lecture : les durées que ses lignes disent se comptent jusqu'à elle.
  luLe: string;
  // Les rubriques de `status` que GitHub dit : le rail et les cooks.
  cuisine: { rubriques: HeadingOfBoard[] };
  faits: FactsPublished;
  // Ce qui attend le chef, lu de GitHub (wait-of-chef.ts, `avecLAttenteDuChef`) : la file du bloc `awaiting`, et ce qui
  // n'en est pas une entrée mais que le second doit savoir (`bilans`). Vides tant que cette lecture n'est pas posée.
  file: LineOfTheFile[];
  bilans: string[];
  lignesDuRail: LineOfRail[];
  activites: ActivityOfCook[];
  // Les issues ouvertes que la cuisine parque pour le chef (`parked:chef`, #4474), tirées de la liste du kanban : TODO les
  // lit sans une lecture de plus (wait-of-chef.ts). Absent quand cette liste n'a pas été lue.
  parqueesPourLeChef?: IssueParkedForTheChef[];
};
export type IssueParkedForTheChef = { ticket: number; titre: string; url: string; creee: string | null; labels: string[]; assignes?: string[] };
// Ce que `facts` porte d'un dépôt où le compte GitHub de l'app ne peut pas écrire (#3163) : la vue ouvre alors le projet en
// lecture seule, sans aucun geste, et le dit en une ligne.
export type ReadOnly = { depot: string };
// `horsLigne` : GitHub n'a pas été joint du tout — pas de réseau, une seule cause (#1818). Ce n'est pas une panne : la vue
// garde le dernier rail lu, et le dit hors ligne. Un GitHub joint qui refuse en est une.
// `faits` n'y est jamais posé : il n'est déclaré (lâche) que pour que `lu.faits` se lise sans rétrécir d'abord.
export type BoardNotRead = { lu: false; depot: string; luLe: string; raison: string; horsLigne?: true; faits?: any };
export type ReadOfBoardOfRepository = BoardRead | BoardNotRead;

export type OptionsOfRead = {
  // `<owner>/<repo>` : le dépôt du projet.
  depot: string;
  appeler: CallGitHub;
  maintenant?: () => Date;
  // Les réponses gardées avec leur ETag : une relecture que GitHub dit inchangée (304) ne coûte rien.
  memoire?: MemoryOfReads;
};

const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// La première phrase de ce que GitHub dit d'un refus, sans son point.
function messageOf(data: unknown): string | null {
  const message = typeof data === "object" && data !== null && "message" in data ? data.message : typeof data === "string" ? data : null;
  if (typeof message !== "string") return null;
  const sentence = (message.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/[.\s]+$/, "");
  return sentence === "" || sentence.length > 200 || sentence.startsWith("<") ? null : sentence;
}

// La raison d'une réponse de GitHub qui n'est pas ce que la lecture du rail demande — ses issues, ses PR, leurs
// commentaires ou la base.
function refusalOf(repository: string, { status, data }: AnswerGitHub): string {
  const message = messageOf(data);
  if (status === 401) return `GitHub refused the app's GitHub sign-in (HTTP 401)${message === null ? "" : `: ${message}`} — sign in to GitHub again.`;
  if (status === 404) return `GitHub does not show ${repository} (HTTP 404): the repository is private and this app is not signed in to an account that sees it, or it no longer exists.`;
  return `GitHub refused to read the rail of ${repository} (HTTP ${status})${message === null ? "" : `: ${message}`}.`;
}

// La lecture d'un projet (#4482) : son kanban, tiré des labels seuls (kitchen-board.ts), et rien du runtime d'avant — ni
// prise, ni signe de vie de station, ni ordre de merge, ni fiche. `faits.rail` reste vide : la vue dessine `kitchenBoard`
// à la place du plan de la cuisine.
function withTheKanban(readOne: BoardRead, board: KitchenBoard): BoardRead {
  const count = (key: string) => board.columns.find((column) => column.key === key)?.cards.length ?? 0;
  const saidOnes = (
    [
      ["ready", "ready"],
      ["cooking", "cooking"],
      ["pass", "in pass"],
      ["parked", "parked"],
    ] as const
  ).flatMap(([key, said]) => (count(key) === 0 ? [] : [`${count(key)} ${said}`]));
  return {
    ...readOne,
    cuisine: {
      rubriques: [
        { titre: "rail", lignes: [saidOnes.length === 0 ? "0 on the rail" : saidOnes.join(" · ")] },
        { titre: "cooks", lignes: [count("cooking") === 0 ? "none running" : `${count("cooking")} running`] },
      ],
    },
    faits: {
      ...readOne.faits,
      compteurs: { rail: count("ready"), auTravail: count("cooking"), aLaPass: count("pass"), attend: 0, livres24h: count("served") },
      kitchenBoard: board,
    },
  };
}

// La lecture vide d'un projet, à l'heure dite : ce que le kanban et TODO complètent.
const empty = (repository: string, readThe: string): BoardRead => ({
  lu: true,
  depot: repository,
  luLe: readThe,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: readThe, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
});

export async function readTheBoardOfRepository({ depot: repository, appeler: call, maintenant: now = () => new Date(), memoire: memory }: OptionsOfRead): Promise<ReadOfBoardOfRepository> {
  const failure = (reason: string, outsideLine?: true): BoardNotRead => ({ lu: false, depot: repository, luLe: now().toISOString(), raison: reason, ...(outsideLine === undefined ? {} : { horsLigne: outsideLine }) });
  if (!REPOSITORY.test(repository)) return failure(`The project's repository "${repository}" is not an owner/name GitHub repository, so its rail cannot be read. Its folder has no GitHub \`origin\` remote to take it from: in ~/.config/brigade/app.json, give this project the field "depot" with its GitHub repository as value, for example "depot": "acme/kitchen".`);
  const reader = memory === undefined ? call : readConditional(call, memory);
  // Ce qui a fait rater la lecture : GitHub pas joint du tout, ou sa première réponse qui n'est pas la liste.
  let injoint = false;
  let refusal: AnswerGitHub | undefined;
  const tracking: CallGitHub = async (path, headers) => {
    const answer = await reader(path, headers).catch((error: unknown) => {
      injoint = true;
      throw error;
    });
    if (answer.status !== 200) refusal ??= answer;
    return answer;
  };
  const readThe = now();
  let readOne: BoardRead;
  let parkedForTheChef: IssueParkedForTheChef[];
  try {
    const { board, open } = await readKitchenBoard({ depot: repository, appeler: tracking, now: readThe.getTime() });
    readOne = withTheKanban(empty(repository, readThe.toISOString()), board);
    // TODO lit ses issues `parked:chef` de la liste déjà lue.
    parkedForTheChef = open.filter(({ labels }) => labels.includes(LABEL_PARKED_CHEF));
  } catch (error) {
    const said = (error instanceof Error ? error.message : String(error)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    if (injoint) return failure(`GitHub could not be reached to read the rail of ${repository}${said === "" ? "" : `: ${said}`}.`, true);
    return failure(refusal === undefined ? `The rail of ${repository} was not read from GitHub: ${said}.` : refusalOf(repository, refusal));
  }
  // Un dépôt où le compte ne peut pas écrire s'ouvre en lecture seule (#3163) ; relu à chaque lecture — un 304 ne coûte
  // rien —, l'accès gagné rend la vue ordinaire à la suivante. Ce qui ne se lit pas ne décide rien : le rail reste lu.
  const readOnly: ReadOnly | undefined = (await writingOnTheRepository(repository, reader)) === false ? { depot: repository } : undefined;
  const complete = readOnly === undefined ? readOne : { ...readOne, faits: { ...readOne.faits, lectureSeule: readOnly } };
  return { ...complete, parqueesPourLeChef: parkedForTheChef };
}

// Ce que la vue reçoit de l'activité des cooks d'un projet, à chaque lecture de son rail (#1846, vue/activity-of-cook.js) :
// l'heure de la lecture, et ce que GitHub dit de chaque cook.
export type ActivitiesPublished = { projet: string; lu: string; activites: ActivityOfCook[] };
export function activitiesPublished(project: string, readOne: BoardRead): ActivitiesPublished {
  return { projet: project, lu: readOne.luLe, activites: readOne.activites };
}
