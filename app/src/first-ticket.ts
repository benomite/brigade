// Le premier ticket d'un projet prêt, écrit dans l'app (#3306, épique #3301) : le chef dit au second ce qu'il veut changer
// d'abord (vue/first-ticket/), et ce module fait le reste, sous le `claude` et le jeton du `gh` de ce poste :
//
//   draft(…)    le second écrit l'issue d'après la réponse du chef, par `claude -p`, comme le triage du départ
//               (departure-of-project.ts, #3268). Un « non » du chef, avec ce qu'il veut changer, la fait réécrire : le
//               brouillon d'avant et les changements partent avec la réponse. Rien n'est créé ici.
//   create(…)   sur le « oui » du chef, et sur lui seul : l'issue créée sur GitHub avec `product`, `prio:1` et `fire`, le
//               label que la cuisine prend (runtime/src/kitchen/decide.ts, `LABELS.ready`) — elle est sur le rail.
//
// Rien n'est inventé quand une lecture échoue : une réponse du second qui ne se lit pas, ou une création que GitHub refuse,
// se dit avec sa cause ; aucun brouillon par défaut, aucune issue à moitié.
import type { LaunchTheTriage } from "./departure-of-project.ts";
import type { ClientOfThePriority } from "./priority.ts";

export type Draft = { title: string; body: string };
export type Request = { answer: string; draft?: Draft; changes?: string };
export type Redaction = { draft: Draft } | { refus: string; detail: string };
export type Creation = { ticket: number; url: string } | { refus: string; detail: string };

// La question que le second pose au chef, le projet prêt ; les labels de l'issue créée ; les deux sections de son corps,
// celles d'une issue `product` du second (second/role.md).
const QUESTION = "What do you want to change first?";
const LABELS = ["product", "prio:1", "fire"];
const SECTIONS = ["## Context", "## Acceptance criteria"] as const;
const DRAFT_DELAY_MS = 120_000;
const TITLE_MAX = 120;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const text = (value: unknown): value is string => typeof value === "string";
const record = (value: unknown): Record<string, unknown> | undefined => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);

// Un brouillon tel qu'il est venu — du second, ou de l'écran —, vérifié : un titre d'une ligne, et un corps qui porte les
// deux sections. Lève, en une phrase, sur ce qui n'en a pas la forme.
function draftRead(raw: unknown): Draft {
  const read = record(raw);
  if (read === undefined || !text(read.title) || !text(read.body)) throw new Error("a draft has a title and a body");
  const title = read.title.trim();
  const body = read.body.trim();
  if (title === "") throw new Error("the draft's title is empty");
  if (/[\r\n]/.test(title)) throw new Error("the draft's title is not on one line");
  if (title.length > TITLE_MAX) throw new Error(`the draft's title is longer than ${TITLE_MAX} characters`);
  for (const section of SECTIONS) if (!body.split(/\r?\n/).some((line) => line.trimEnd() === section)) throw new Error(`the draft's body has no \`${section}\` section`);
  return { title, body };
}

// Ce que le chef a donné, vérifié : une réponse, et pour une réécriture le brouillon vu et des changements, tous deux ou aucun.
function requestRead(raw: unknown): Request {
  const read = record(raw);
  if (read === undefined || !text(read.answer) || read.answer.trim() === "") throw new Error("the chef's answer is empty");
  if (read.draft === undefined && read.changes === undefined) return { answer: read.answer.trim() };
  if (!text(read.changes) || read.changes.trim() === "") throw new Error("the changes the chef asks for are empty");
  return { answer: read.answer.trim(), draft: draftRead(read.draft), changes: read.changes.trim() };
}

// Ce que le second reçoit : comment écrire le premier ticket, la réponse du chef, et — pour une réécriture — le brouillon
// d'avant et ce qui y change.
function instruction(repository: string, { answer, draft, changes }: Request): string {
  const [context, criteria] = SECTIONS;
  const lines = [
    `You are the second of the project ${repository}. It is ready for Brigade, and you asked the chef, in the app: "${QUESTION}"`,
    "From their answer, write the project's first ticket, in English, as a GitHub issue: a short title, and a body with two sections —",
    `\`${context}\` (what the chef wants, and why, in two or three sentences) and \`${criteria}\` (two to five observable criteria, one \`- \` line each, from the user's point of view: "when I do X, I see Y").`,
    "No model, no effort, no label: the manager calibrates it, and the app puts it on the rail once the chef agrees.",
    "Run no command, read nothing else, ask no question, create nothing: only write the draft.",
    'Answer with nothing but a JSON object: {"title": "<the title, one line>", "body": "<the body, in Markdown>"}.',
    "",
    "The chef's answer:",
    answer,
  ];
  if (draft !== undefined && changes !== undefined) lines.push("", "You already showed them this draft:", JSON.stringify(draft), "", "They asked for these changes — rewrite the draft with them, and keep the rest:", changes);
  return lines.join("\n");
}

// Le brouillon que le second a répondu : l'objet JSON de sa sortie. Lève sur une réponse qui ne se lit pas.
function answerRead(output: string): Draft {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  let read: unknown;
  try {
    if (start < 0 || end < start) throw new Error("no JSON object in it");
    read = JSON.parse(output.slice(start, end + 1));
  } catch (error) {
    throw new Error(`the second's answer is not a JSON object (${message(error)})`);
  }
  return draftRead(read);
}

export type OptionsOfDraft = { depot: string; dossier: string; demande: unknown; claude: string; lancer: LaunchTheTriage; delaiMs?: number };

// Le second écrit le brouillon, ou dit pourquoi il ne l'a pas fait.
export async function draft({ depot: repository, dossier: folder, demande: raw, claude, lancer: launch, delaiMs: delayMs = DRAFT_DELAY_MS }: OptionsOfDraft): Promise<Redaction> {
  let request: Request;
  try {
    request = requestRead(raw);
  } catch (error) {
    return { refus: "nothing was sent to the second: the screen sent no answer it can read", detail: message(error) };
  }
  let rendered;
  try {
    rendered = await launch(claude, ["-p"], instruction(repository, request), folder, delayMs);
  } catch (error) {
    return { refus: "the second could not be started to write the ticket", detail: message(error) };
  }
  if (rendered.code !== 0) return { refus: "the second did not write the ticket", detail: rendered.erreur.trim() || `claude stopped with code ${String(rendered.code)}` };
  try {
    return { draft: answerRead(rendered.sortie) };
  } catch (error) {
    return { refus: "the second answered something the app cannot read as a ticket", detail: message(error) };
  }
}

// Le « oui » du chef : l'issue créée, avec ses labels. Une réponse de GitHub sans numéro ni adresse est un refus.
export async function create(client: Pick<ClientOfThePriority, "ecrire">, repository: string, raw: unknown): Promise<Creation> {
  let read: Draft;
  try {
    read = draftRead(raw);
  } catch (error) {
    return { refus: "nothing was created: the screen sent no draft the app can read", detail: message(error) };
  }
  let answer;
  try {
    answer = await client.ecrire("POST", `/repos/${repository}/issues`, { ...read, labels: LABELS });
  } catch (error) {
    return { refus: "nothing was created: GitHub could not be reached", detail: message(error) };
  }
  const body = record(answer.data);
  if (answer.status !== 201) return { refus: `nothing was created: GitHub refused the issue on ${repository}`, detail: `HTTP ${answer.status}${text(body?.message) ? ` — ${body.message}` : ""}` };
  if (typeof body?.number !== "number" || !text(body.html_url)) return { refus: `GitHub created the issue on ${repository} but did not say its number`, detail: JSON.stringify(answer.data) };
  return { ticket: body.number, url: body.html_url };
}
