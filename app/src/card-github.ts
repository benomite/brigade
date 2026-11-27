// L'histoire et la discussion d'une carte du rail, sur sa fiche, lues de GitHub — jamais de la box (#1735). Le `gh` du
// poste lit l'issue du ticket dans le dépôt du projet, et les PR qui la ferment : la fiche s'ouvre box éteinte.
// Ce que GitHub ne porte pas — les tokens et la durée des cooks, la rétro, le verdict de la relecture — est écrit
// « not communicated », jamais inventé. Une issue absente de GitHub se dit en une phrase.
import { failure, launch, type Settings } from "./question.ts";
import { NOT_COMMUNICATED, instant, type StepSaid, type Story } from "./story.ts";
import type { Discussion, MessageSays } from "./discussion.ts";
import { linksOf, render } from "./markdown.ts";
import { PR_OF_TICKET } from "./vue/pr-of-ticket.js";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const hour = (value: unknown): value is string => text(value) && !Number.isNaN(Date.parse(value));
const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

const UNREADABLE = "not read: GitHub did not return the issue in the expected shape";
const WITHOUT_AUTHOR = "a deleted GitHub account";
const RETRO = "retro not communicated: GitHub does not carry it";

// L'issue n'existe pas (ou plus) dans ce dépôt : `gh` le dit ainsi.
const ABSENT = /could not resolve to an issue|issue.*not found|HTTP 404/i;
const absent = (ticket: number, repository: string) => `${repository}#${ticket} is not on GitHub: there is nothing to read`;

type Reading = { lu: Record<string, unknown> } | { sans: string };

// `gh <args>` lu en JSON : l'objet, ou la phrase qui dit pourquoi on n'en lit rien.
async function readJson(settings: Settings, args: string[], ticket: number, repository: string): Promise<Reading> {
  const rendered = await launch(settings, args);
  if (rendered.erreur !== null) {
    if (ABSENT.test(`${rendered.erreurs}${rendered.sortie}`)) return { sans: `no issue to read: ${absent(ticket, repository)}` };
    return { sans: `not read: ${failure(settings, args, { ...rendered, erreur: rendered.erreur })}` };
  }
  try {
    const readOne: unknown = JSON.parse(rendered.sortie);
    return object(readOne) ? { lu: readOne } : { sans: UNREADABLE };
  } catch {
    return { sans: UNREADABLE };
  }
}

const AUTHOR = (raw: unknown) => {
  const login = object(raw) && object(raw.author) ? raw.author.login : undefined;
  return text(login) && login !== "" ? login : WITHOUT_AUTHOR;
};

function message(raw: unknown, body: boolean, createdA: unknown): MessageSays | undefined {
  if (!object(raw) || !hour(createdA) || !text(raw.body)) return undefined;
  return { auteur: AUTHOR(raw), at: instant(createdA), blocs: render(raw.body), ...(body ? { corps: true as const, source: raw.body } : {}) };
}

// L'issue et ses commentaires, du plus ancien au plus récent, et les adresses qu'un clic peut y ouvrir.
export async function discussionOfGitHub(settings: Settings, repository: string, ticket: unknown): Promise<Discussion> {
  if (!number(ticket)) return { sans: "not read: the sheet names no ticket" };
  const readEntry = await readJson(settings, ["issue", "view", String(ticket), "--repo", repository, "--json", "title,state,body,author,createdAt,comments"], ticket, repository);
  if ("sans" in readEntry) return readEntry;
  const { title, state, comments } = readEntry.lu;
  if (!text(title) || !Array.isArray(comments)) return { sans: UNREADABLE };
  const opens = message(readEntry.lu, true, readEntry.lu.createdAt);
  const suite = comments.map((comment) => message(comment, false, object(comment) ? comment.createdAt : undefined));
  if (opens === undefined || suite.some((said) => said === undefined)) return { sans: UNREADABLE };
  const messages = [opens, ...(suite as MessageSays[])];
  return { titre: title, ouverte: String(state).toUpperCase() !== "CLOSED", messages, liens: [...new Set(messages.flatMap(({ blocs: blocks }) => linksOf(blocks)))] };
}

// L'histoire d'un ticket, de ce que GitHub en garde : l'issue ouverte, chaque PR qui la ferme — livrée, puis mergée —,
// l'issue fermée. Dans l'ordre du temps. Le coût et la rétro, que seul le journal de la box porte, sont dits non communiqués.
export async function storyOfGitHub(settings: Settings, repository: string, ticket: unknown): Promise<Story> {
  if (!number(ticket)) return { sans: "not read: the sheet names no ticket" };
  const readEntry = await readJson(settings, ["issue", "view", String(ticket), "--repo", repository, "--json", "createdAt,closedAt,state,closedByPullRequestsReferences"], ticket, repository);
  if ("sans" in readEntry) return readEntry;
  const { createdAt, closedAt, closedByPullRequestsReferences: refs } = readEntry.lu;
  if (!hour(createdAt)) return { sans: UNREADABLE };
  const steps: { t: number; etape: StepSaid }[] = [{ t: Date.parse(createdAt), etape: { libelle: "arrived", at: instant(createdAt) } }];
  let merge = false;
  for (const ref of Array.isArray(refs) ? refs : []) {
    if (!object(ref) || !Number.isSafeInteger(ref.number)) continue;
    const pr = await readJson(settings, ["pr", "view", String(ref.number), "--repo", repository, "--json", "createdAt,mergedAt"], ticket, repository);
    if ("sans" in pr) return pr;
    const { createdAt: delivered, mergedAt } = pr.lu;
    if (hour(delivered)) steps.push({ t: Date.parse(delivered), etape: { libelle: `delivered (${PR_OF_TICKET(ticket)})`, at: instant(delivered) } });
    if (hour(mergedAt)) {
      merge = true;
      steps.push({ t: Date.parse(mergedAt), etape: { libelle: `merged (${PR_OF_TICKET(ticket)})`, at: instant(mergedAt) } });
    }
  }
  if (!merge && hour(closedAt)) steps.push({ t: Date.parse(closedAt), etape: { libelle: "closed without a merge", at: instant(closedAt) } });
  steps.sort((a, b) => a.t - b.t);
  return {
    etapes: steps.map(({ etape: step }) => step),
    cout: { tokens: NOT_COMMUNICATED, duree: NOT_COMMUNICATED, essais: NOT_COMMUNICATED, minimum: false },
    retro: { sans: RETRO },
  };
}
