// La cuisine d'un projet, lue de GitHub seul (#2061) : ses issues, leurs labels et ses PR — rien d'autre. Aucune box ne
// publie plus de tableau de la cuisine ; deux stations qui servent le même projet ne peuvent donc pas se contredire, et
// l'app lit ce que l'une et l'autre lisent :
//   - le rail : les issues ouvertes au label `fire`, chacune dans l'état que ses labels, sa PR et la base disent, avec
//     la station qui la tient (vue/rail/github.ts) ;
//   - ce qui est avant le rail : les autres issues ouvertes, rangées d'après leurs labels seuls (`avantLeRailDe`) ;
//   - TODO : ce qui attend le chef (wait-of-chef.ts, #2460), ajouté par l'appelant (main.ts) — la lecture même que le
//     second relaie à son ouverture.
// Ce qui en sort a la forme que la vue du rail lit (board/rail.ts) : l'objet de `facts`, les rubriques et les lignes de
// `status`, l'activité des cooks.
//
// Ni la box ni une station ne sont jointes : rien d'autre que GitHub, par l'appel que la plateforme donne (client.ts).
// Ce qui ne se lit pas le dit, jamais un rail vide : GitHub qui ne répond pas ou refuse — chaque fois un échec, et sa
// raison en une phrase, que l'app montre telle quelle.
import { LABEL_PARKED } from "../../../runtime/src/attente-github/marque.ts";
import { estParque } from "../../../runtime/src/github-etat/etats.ts";
import { epiqueDe, FIN, DEBUT, porteListe, ticketsDeLaListe } from "../../../runtime/src/epique.ts";
import { roadmapDuClaudeMd } from "../../../runtime/src/reglages-projet/ligne-roadmap.ts";
import { progressOfTheList, type Progress } from "../vue/backlog/progress-github.ts";
import { withTheRail, readTheRailOnGithub, SIGNS_NOT_READ, type SignsOfLife } from "../vue/rail/github.ts";
import type { CallGitHub, AnswerGitHub } from "./client.ts";
import { writingOnTheRepository } from "./writing.ts";
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
// Ce qui est avant le rail (#1836) : les issues ouvertes que le rail ne porte pas, chacune dans l'un des états que
// la vue range (upstream.ts, `GROUPES`), avec ce qui la retient en une ligne. Le bandeau Backlog (#3460) y lit chaque besoin :
// `tickets`, ceux de son découpage — la liste que le runtime écrit dans son corps, et les issues ouvertes qui se
// réclament de lui (`Epic: #N`) ; `servis`, ceux d'entre eux dont l'issue est fermée ; `contexte`, le premier paragraphe
// de son corps (sous `Context`, s'il en a un) ; `servieLe`, l'heure où une épique découpée, tous ses tickets servis, a
// été fermée — elle reste 24 h dans le bandeau ; `avancement`, ses tickets servis sur leur total, quand son corps les
// liste en cases à cocher (vue/backlog/progress-github.ts, #3480).
export type IssueBeforeTheRailPublished = { ticket: number; titre: string; priorite: number | null; etat: string; dit: string; tickets?: number[]; servis?: number[]; contexte?: string; servieLe?: string; avancement?: Progress; horizon?: number; idee?: true };
export type BeforeTheRailPublished = { lu: string; issues: IssueBeforeTheRailPublished[] };

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
  // Absent quand les issues avant le rail n'ont pas été lues.
  avantLeRail?: BeforeTheRailPublished;
  // Les issues ouvertes que la nouvelle cuisine parque pour le chef (`parked:chef`, #4474), tirées de la même liste que ce qui
  // est avant le rail : TODO les lit sans une lecture de plus (wait-of-chef.ts). Absent quand cette liste n'a pas été lue.
  parqueesPourLeChef?: IssueParkedForTheChef[];
};
export type IssueParkedForTheChef = { ticket: number; titre: string; url: string; creee: string | null; labels: string[] };
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
  // Les signes de vie des stations du compte, pour l'onglet Cooks (#2358, vue/cooks/signs-of-life.ts).
  signes?: () => Promise<SignsOfLife>;
};

const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const LABEL_FIRE = "fire";
const PAR_PAGE = 100;
const PAGES_AT_MOST = 10;

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

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((oneOf: unknown) => { const o = object(oneOf); return o === null ? [] : [o]; }) : []);
const labelsOf = (issue: Raw): string[] => list(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
const priorityOf = (labels: readonly string[]): number | null => {
  const readEntries = labels.flatMap((label) => { const n = /^prio:(\d+)$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return readEntries.length === 0 ? null : Math.min(...readEntries);
};

// L'horizon de la vision où une issue est rangée (#3590) : celui de son label `horizon:1`, `horizon:2` ou `horizon:3` ; avec
// plusieurs, le plus petit ; sans, aucun.
const horizonOf = (labels: readonly string[]): number | null => {
  const readOnes = labels.flatMap((label) => { const n = /^horizon:([123])$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return readOnes.length === 0 ? null : Math.min(...readOnes);
};

// L'état avant le rail d'une issue ouverte sans `fire`, d'après ses labels seuls — la box n'est plus là pour dire ce
// que le manager en a jugé : `idea`, une idée en réserve, que le manager ne lit jamais (#3536) et que le Backlog range à
// part (#3589) ; parquée (`estParque`, runtime/src/github-etat/etats.ts) ou `served-elsewhere`, mise de côté ; `epic`, une
// épique ; `model:` et `effort:`, calibrée et prête ; sinon, pas encore calibrée.
export const LABEL_IDEA = "idea";
export function beforeTheRailOf(labels: readonly string[]): { etat: string; dit: string } {
  if (labels.includes(LABEL_IDEA)) return { etat: "idee", dit: "it carries `idea`: an idea in reserve, not a request" };
  // Comme le runtime le dit (runtime/src/amont.ts, `avantDe`).
  if (estParque(labels)) return { etat: "mise-de-cote", dit: `parked (\`${LABEL_PARKED}\`): it waits for someone — who, for what and until when are on the issue; nothing takes it before` };
  if (labels.includes("served-elsewhere")) return { etat: "mise-de-cote", dit: "it carries `served-elsewhere`: this kitchen does not serve it" };
  if (labels.includes("epic")) return { etat: "epique", dit: "it carries `epic`: not split yet" };
  const calibration = labels.filter((label) => label.startsWith("model:") || label.startsWith("effort:"));
  if (calibration.some((label) => label.startsWith("model:")) && calibration.some((label) => label.startsWith("effort:"))) {
    return { etat: "prete", dit: `calibrated (${calibration.join(", ")}), without \`fire\`: the rail takes it once \`fire\` is set` };
  }
  return { etat: "non-lue", dit: "not calibrated yet: no `model:` and `effort:` labels" };
}

// Le contexte d'un besoin, tel que son issue l'écrit : le premier paragraphe sous un titre `Context`, à défaut le premier
// paragraphe du corps — ni titre, ni ligne `Epic: #N`, ni commentaire, ni la liste des tickets, ni bloc de code. Au plus
// 400 caractères, coupés à un mot. Rien d'écrit : aucun contexte, jamais un texte inventé.
const CONTEXT_AT_MOST = 400;
export function contextOf(body: string): string | undefined {
  const start = body.indexOf(DEBUT);
  const end = start < 0 ? -1 : body.indexOf(FIN, start);
  const withoutList = start < 0 ? body : `${body.slice(0, start)}\n\n${end < 0 ? "" : body.slice(end + FIN.length)}`;
  const withoutCode = withoutList.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, "\n");
  const paragraphs = withoutCode
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
  const title = /^#{1,6}\s/;
  const text = (paragraph: string) => !title.test(paragraph) && epiqueDe(paragraph) === null && !/^(```|~~~|---)/.test(paragraph);
  const context = paragraphs.findIndex((paragraph) => /^#{1,6}\s*(context|contexte)\b/i.test(paragraph));
  // Un titre suivi de son texte dans le même paragraphe : le texte est sous le titre.
  const underTheTitle = context < 0 ? undefined : paragraphs[context]?.split("\n").slice(1).join(" ").trim();
  const chosen = underTheTitle !== undefined && underTheTitle !== "" ? underTheTitle : (context < 0 ? paragraphs : paragraphs.slice(context + 1)).find(text);
  if (chosen === undefined) return undefined;
  const enOneLine = chosen.replace(/\s+/g, " ").trim();
  if (enOneLine.length <= CONTEXT_AT_MOST) return enOneLine;
  const cut = enOneLine.slice(0, CONTEXT_AT_MOST);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
}

const bodyOf = (issue: Raw) => (typeof issue.body === "string" ? issue.body : "");
// Une épique découpée, tous ses tickets servis et son issue fermée, reste dans le bandeau 24 h après sa fermeture (#3460).
const HELD_MS = 24 * 3_600_000;
// Les issues fermées depuis 24 h ne se relisent que quand la liste des ouvertes change de numéros : une épique ou un ticket
// qui se ferme la quitte toujours. Gardées dans la mémoire des lectures, sous cette clé, avec ces numéros pour signature —
// une lecture sans mémoire les relit chaque fois. Le budget GitHub de l'app le demande (budget-github.test.ts).
const CLOSED_KEPT = "brigade:closed-in-24h";
// La roadmap du projet n'est jamais un besoin (#3589) : un document de suivi, pas une ligne du Backlog. C'est l'issue au
// label `roadmap`, ou celle que la ligne « Roadmap » des bindings nomme dans le `CLAUDE.md` de la branche par défaut —
// lue comme le manager la lit (runtime/src/reglages-projet/ligne-roadmap.ts, `roadmapDuClaudeMd`). Un `CLAUDE.md` qui ne se
// lit pas ne nomme rien : aucune issue n'est écartée sur une supposition, et le reste se lit.
const LABEL_ROADMAP = "roadmap";
async function roadmapOfRepository(repository: string, read: (path: string) => Promise<unknown>): Promise<number | null> {
  try {
    const content = object(await read(`/repos/${repository}/contents/CLAUDE.md`))?.content;
    return typeof content === "string" ? roadmapDuClaudeMd(Buffer.from(content, "base64").toString("utf8")) : null;
  } catch {
    return null;
  }
}

// Les issues ouvertes que le rail ne porte pas, dans l'ordre où le manager les lit : `prio:` d'abord, sans priorité en
// dernier ; à priorité égale, la plus ancienne. Chacune est un besoin (#3460) : les tickets nés d'un découpage n'en sont
// pas — ils sont comptés sur le besoin dont ils viennent. Puis les épiques découpées fermées depuis moins de 24 h, tous
// leurs tickets servis : une lecture qui les rate n'en montre aucune, et le reste se lit.
async function readBeforeTheRail(repository: string, read: (path: string) => Promise<unknown>, readOne: string, memory?: MemoryOfReads): Promise<{ avantLeRail: BeforeTheRailPublished; parqueesPourLeChef: IssueParkedForTheChef[] }> {
  const issues: Raw[] = [];
  for (let page = 1; page <= PAGES_AT_MOST; page++) {
    const readEntries = list(await read(`/repos/${repository}/issues?state=open&sort=created&direction=asc&per_page=${PAR_PAGE}&page=${page}`));
    issues.push(...readEntries);
    if (readEntries.length < PAR_PAGE) break;
  }
  const openEntries = issues.filter((issue) => issue.pull_request === undefined && typeof issue.number === "number");
  const numbersOpen = new Set(openEntries.map((issue) => issue.number as number));
  const parkedForTheChef = openEntries
    .filter((issue) => labelsOf(issue).includes(LABEL_PARKED_CHEF))
    .map((issue) => ({ ticket: issue.number as number, titre: typeof issue.title === "string" ? issue.title : "", url: typeof issue.html_url === "string" ? issue.html_url : `https://github.com/${repository}/issues/${issue.number}`, creee: typeof issue.created_at === "string" ? issue.created_at : null, labels: labelsOf(issue) }));
  const roadmap = await roadmapOfRepository(repository, read);
  const outside = openEntries.filter((issue) => !labelsOf(issue).includes(LABEL_FIRE) && !labelsOf(issue).includes(LABEL_ROADMAP) && issue.number !== roadmap);
  const since = Date.parse(readOne) - HELD_MS;
  const signature = [...numbersOpen].sort((a, b) => a - b).join(",");
  const kept = memory?.get(CLOSED_KEPT);
  const closedEntries =
    kept !== undefined && kept.etag === signature
      ? list(kept.data)
      : await read(`/repos/${repository}/issues?state=closed&sort=updated&direction=desc&since=${new Date(since).toISOString()}&per_page=${PAR_PAGE}`)
          .then((data) => {
            memory?.set(CLOSED_KEPT, { etag: signature, data });
            return list(data);
          })
          .catch(() => {
            memory?.delete(CLOSED_KEPT);
            return [];
          });
  const servedOnes = closedEntries.filter((issue) => issue.pull_request === undefined && typeof issue.number === "number" && issue.state === "closed" && typeof issue.closed_at === "string" && Date.parse(issue.closed_at) >= since && porteListe(bodyOf(issue)));
  // Les besoins qui ont des tickets : leur liste, et les issues ouvertes qui se réclament d'eux.
  // Une idée en réserve n'est pas découpée : ce qu'elle liste reste à part, chaque issue un besoin.
  const splittable = outside.filter((issue) => !labelsOf(issue).includes(LABEL_IDEA));
  const needs = new Set([...splittable, ...servedOnes].map((issue) => issue.number as number));
  const claim = new Map<number, number[]>();
  for (const issue of openEntries) {
    const epic = epiqueDe(bodyOf(issue));
    if (epic !== null && epic !== issue.number && needs.has(epic)) claim.set(epic, [...(claim.get(epic) ?? []), issue.number as number]);
  }
  const ticketsOf = (issue: Raw) => [...new Set([...ticketsDeLaListe(bodyOf(issue)), ...(claim.get(issue.number as number) ?? [])])].filter((ticket) => ticket !== issue.number);
  // Une épique fermée dont un ticket est encore ouvert n'est pas servie : elle n'est pas retenue.
  const retainedEntries = servedOnes.filter((issue) => {
    const tickets = ticketsOf(issue);
    return tickets.length > 0 && !tickets.some((ticket) => numbersOpen.has(ticket));
  });
  const ofTickets = new Set([...splittable, ...retainedEntries].flatMap(ticketsOf));
  const need = (issue: Raw, state: { etat: string; dit: string }, servedThe?: string): IssueBeforeTheRailPublished => {
    const tickets = state.etat === "idee" ? [] : ticketsOf(issue);
    const context = contextOf(bodyOf(issue));
    const progress = progressOfTheList(bodyOf(issue));
    const labels = labelsOf(issue);
    const horizon = horizonOf(labels);
    return {
      ticket: issue.number as number,
      titre: typeof issue.title === "string" ? issue.title : "",
      priorite: priorityOf(labels),
      ...state,
      ...(horizon === null ? {} : { horizon }),
      ...(labels.includes("idea") ? { idee: true as const } : {}),
      ...(tickets.length === 0 ? {} : { tickets, servis: tickets.filter((ticket) => !numbersOpen.has(ticket)) }),
      ...(context === undefined ? {} : { contexte: context }),
      ...(progress === undefined ? {} : { avancement: progress }),
      ...(servedThe === undefined ? {} : { servieLe: servedThe }),
    };
  };
  const before = outside
    .filter((issue) => !ofTickets.has(issue.number as number))
    .map((issue) => {
      const labels = labelsOf(issue);
      const parLabels = beforeTheRailOf(labels);
      const tickets = ticketsOf(issue);
      // Une idée reste une idée, même avec une liste : le manager ne la lit pas, il ne l'a pas découpée.
      if (parLabels.etat === "mise-de-cote" || parLabels.etat === "idee" || (tickets.length === 0 && !porteListe(bodyOf(issue)))) return need(issue, parLabels);
      const servedTickets = tickets.filter((ticket) => !numbersOpen.has(ticket)).length;
      if (tickets.length > 0 && servedTickets === tickets.length) return need(issue, { etat: "servie", dit: `split, all ${tickets.length} tickets served: the manager closes it` });
      return need(issue, { etat: "decoupee", dit: `split into ${tickets.length} ticket${tickets.length === 1 ? "" : "s"}, ${servedTickets} served` });
    });
  const all = [...before, ...retainedEntries.map((issue) => need(issue, { etat: "servie", dit: `split, all ${ticketsOf(issue).length} tickets served` }, issue.closed_at as string))];
  all.sort((a, b) => (a.priorite ?? 10) - (b.priorite ?? 10) || a.ticket - b.ticket);
  return { avantLeRail: { lu: readOne, issues: all }, parqueesPourLeChef: parkedForTheChef };
}

// La lecture vide d'un projet, à l'heure dite : ce que le rail, TODO et ce qui est avant le rail complètent.
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

export async function readTheBoardOfRepository({ depot: repository, appeler: call, maintenant: now = () => new Date(), memoire: memory, signes: signs = async () => SIGNS_NOT_READ }: OptionsOfRead): Promise<ReadOfBoardOfRepository> {
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
  try {
    readOne = withTheRail(empty(repository, readThe.toISOString()), await readTheRailOnGithub({ depot: repository, appeler: tracking, maintenant: () => readThe }), await signs());
  } catch (error) {
    const said = (error instanceof Error ? error.message : String(error)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    if (injoint) return failure(`GitHub could not be reached to read the rail of ${repository}${said === "" ? "" : `: ${said}`}.`, true);
    return failure(refusal === undefined ? `The rail of ${repository} was not read from GitHub: ${said}.` : refusalOf(repository, refusal));
  }
  // Ce qui est avant le rail ne se lit pas : la vue n'en dit rien, et le rail reste lu.
  const read = async (path: string) => {
    const answer = await reader(path);
    if (answer.status !== 200) throw new Error(`HTTP ${answer.status}`);
    return answer.data;
  };
  const before = await readBeforeTheRail(repository, read, readOne.luLe, memory).catch(() => undefined);
  // Un dépôt où le compte ne peut pas écrire s'ouvre en lecture seule (#3163) ; relu à chaque lecture — un 304 ne coûte
  // rien —, l'accès gagné rend la vue ordinaire à la suivante. Ce qui ne se lit pas ne décide rien : le rail reste lu.
  const readOnly: ReadOnly | undefined = (await writingOnTheRepository(repository, reader)) === false ? { depot: repository } : undefined;
  const complete = readOnly === undefined ? readOne : { ...readOne, faits: { ...readOne.faits, lectureSeule: readOnly } };
  return before === undefined ? complete : { ...complete, ...before };
}

// Ce que la vue reçoit de l'activité des cooks d'un projet, à chaque lecture de son rail (#1846, vue/activity-of-cook.js) :
// l'heure de la lecture, et ce que GitHub dit de chaque cook.
export type ActivitiesPublished = { projet: string; lu: string; activites: ActivityOfCook[] };
export function activitiesPublished(project: string, readOne: BoardRead): ActivitiesPublished {
  return { projet: project, lu: readOne.luLe, activites: readOne.activites };
}
