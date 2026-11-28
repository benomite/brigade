// La discussion d'une carte, lue de GitHub — jamais de la box (#1735). Le `gh` du poste lit l'issue du ticket dans le dépôt du
// projet. Une issue absente de GitHub se dit en une phrase.
import { failure, launch, type Settings } from "./question.ts";
import type { Discussion, MessageSays } from "./discussion.ts";
import { render } from "./markdown.ts";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const hour = (value: unknown): value is string => text(value) && !Number.isNaN(Date.parse(value));
const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

// Un instant de GitHub : son jour et son heure, en UTC.
const instant = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const UNREADABLE = "not read: GitHub did not return the issue in the expected shape";
const WITHOUT_AUTHOR = "a deleted GitHub account";

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
  return { auteur: AUTHOR(raw), at: instant(createdA), blocs: render(raw.body), ...(body ? { corps: true as const } : {}) };
}

// L'issue et ses commentaires, du plus ancien au plus récent.
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
  return { titre: title, ouverte: String(state).toUpperCase() !== "CLOSED", messages };
}
