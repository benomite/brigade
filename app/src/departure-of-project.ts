// Le départ d'un projet qu'« Add a project » vient d'ouvrir (#3268, premier geste du parcours de départ) : le second sait
// déjà proposer ce qu'on met sur le rail quand un projet arrive avec des issues ouvertes — mais dans son terminal. Ce module
// le rend à la vue : les issues ouvertes du dépôt, les propositions du second, et la mise sur le rail du choix du chef.
//
// Rien n'est refait de ce que le second fait. Le triage est le sien : la section « A project just set up » de son rôle
// (second/role.md, `triageDuSecond`) est donnée telle quelle à `claude -p`, avec les issues — la même consigne, donc la même
// échelle (`prio:1` à `prio:3`) et le même motif en une ligne. La mise sur le rail est son geste : `product`, `prio:<n>` et
// `fire` posés sur l'issue, la priorité par `changerLaPriorite` (priority.ts) comme sur une fiche.
// Rien n'est inventé quand une lecture échoue : une issue, une réponse du triage ou un label qui ne se lit pas ou ne se pose
// pas se dit, avec sa cause ; aucune priorité par défaut.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { refusalOf, type CallGitHub } from "./board/client.ts";
import { changeThePriority, type ClientOfThePriority } from "./priority.ts";
import { ROLE_OF_SECOND } from "./second/launch.ts";

// Les priorités du triage du second : `prio:1`, `prio:2`, `prio:3` (role.md, « Prioritize »).
export const PRIORITIES_OF_TRIAGE: readonly number[] = [1, 2, 3];
// Au-delà, le triage est abandonné : le critère du ticket est de moins de deux minutes, triage compris.
export const DELAY_OF_TRIAGE_MS = 100_000;
const PAGES_MAX = 50;

export type Line = { ticket: number; titre: string; priorite: number; raison: string };
// Ce que la vue reçoit : `ouvertes`, le nombre d'issues ouvertes du dépôt (les pull requests ne comptent pas) et les
// lignes proposées — celles qui ne sont pas déjà sur le rail ; `aucune`, pas d'issue ouverte ; `sans`, ce qui n'a pas pu se lire.
export type Departure = { ouvertes: number; lignes: Line[] } | { aucune: true } | { sans: string; detail?: string };

type Issue = { number: number; title: string; body: string; labels: string[] };

// Lance `claude` avec ce texte sur son entrée standard — un prompt de cent issues ne tient pas dans un argument sur Windows.
export type LaunchTheTriage = (command: string, args: readonly string[], entry: string, folder: string, delayMs: number) => Promise<{ code: number | null; sortie: string; erreur: string }>;

export const launchTheTriage: LaunchTheTriage = (command, args, entry, folder, delayMs) =>
  new Promise((resolve) => {
    const child = spawn(command, [...args], { cwd: folder, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let error = "";
    const guard = setTimeout(() => {
      error += `no answer within ${Math.round(delayMs / 1000)} s`;
      child.kill();
    }, delayMs);
    child.stdout.setEncoding("utf8").on("data", (end: string) => (output += end));
    child.stderr.setEncoding("utf8").on("data", (end: string) => (error += end));
    child.on("error", (cause) => {
      clearTimeout(guard);
      resolve({ code: null, sortie: output, erreur: error + cause.message });
    });
    child.on("close", (code) => {
      clearTimeout(guard);
      resolve({ code, sortie: output, erreur: error });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(entry);
  });

// La section du rôle du second qui dit quoi proposer sur un projet qui arrive avec des issues : de son titre au titre suivant.
const TITLE_OF_THE_SECTION = "## A project just set up: an empty rail with open issues";
export function triageOfSecond(role: string): string | undefined {
  const lines = role.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === TITLE_OF_THE_SECTION);
  if (start < 0) return undefined;
  const end = lines.findIndex((line, rank) => rank > start && /^## /.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n").trim();
}

// Les issues ouvertes d'un dépôt, toutes les pages. Une page qui ne se lit pas : rien n'est rendu à moitié.
export async function readTheIssuesOpen(read: CallGitHub, repository: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (let page = 1; page <= PAGES_MAX; page++) {
    const answer = await read(`/repos/${repository}/issues?state=open&per_page=100&page=${page}`);
    if (answer.status !== 200) throw refusalOf(`the reading of the open issues of ${repository}`, answer);
    if (!Array.isArray(answer.data)) throw new Error(`GitHub did not answer with a list of issues for ${repository}`);
    for (const readEntry of answer.data as Record<string, unknown>[]) {
      if (typeof readEntry !== "object" || readEntry === null || "pull_request" in readEntry) continue;
      const labels = Array.isArray(readEntry.labels) ? readEntry.labels.flatMap((label: unknown) => (typeof label === "string" ? [label] : typeof (label as { name?: unknown })?.name === "string" ? [(label as { name: string }).name] : [])) : [];
      if (typeof readEntry.number !== "number" || typeof readEntry.title !== "string") throw new Error(`GitHub gave an issue of ${repository} without a number or a title`);
      issues.push({ number: readEntry.number, title: readEntry.title, body: typeof readEntry.body === "string" ? readEntry.body : "", labels });
    }
    if (answer.data.length < 100) return issues;
  }
  throw new Error(`${repository} has more than ${PAGES_MAX * 100} open issues: they were not all read`);
}

const BODY_MAX = 600;
function instruction(triage: string, issues: readonly Issue[]): string {
  const list = issues.map(({ number, title, body, labels }) => ({ number, title, labels, body: body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}…` : body }));
  return [
    "Here is how the second proposes what to put on the rail of a project that arrives with open issues:",
    "",
    triage,
    "",
    "Do only its step 1, on the open issues below, which are already read and already without `fire` — run no command, ask no question, set no label.",
    `Answer with nothing but a JSON array, one object per issue: {"number": <issue number>, "prio": 1 | 2 | 3, "reason": "<the reason for that priority, in one line>"}.`,
    "",
    JSON.stringify(list),
  ].join("\n");
}

// Ce que le triage a répondu, lu : une ligne par issue qu'il a nommée et que la liste portait. Une réponse qui ne se lit pas
// est une erreur, jamais une liste vide ou des priorités par défaut.
export function readTheAnswer(output: string, issues: readonly Issue[]): Line[] {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  let readOne: unknown;
  try {
    if (start < 0 || end < start) throw new Error("no JSON list in it");
    readOne = JSON.parse(output.slice(start, end + 1));
  } catch (error) {
    throw new Error(`the triage's answer is not a JSON list (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!Array.isArray(readOne)) throw new Error("the triage's answer is not a JSON list");
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const lines = new Map<number, Line>();
  for (const oneOf of readOne as Record<string, unknown>[]) {
    const issue = typeof oneOf?.number === "number" ? byNumber.get(oneOf.number) : undefined;
    const priority = Number(oneOf?.prio);
    const reason = typeof oneOf?.reason === "string" ? oneOf.reason.replace(/\s+/g, " ").trim() : "";
    if (issue === undefined || !PRIORITIES_OF_TRIAGE.includes(priority) || reason === "" || lines.has(issue.number)) continue;
    lines.set(issue.number, { ticket: issue.number, titre: issue.title, priorite: priority, raison: reason });
  }
  if (lines.size === 0) throw new Error("the triage's answer names no issue of the list with a priority 1, 2 or 3 and a reason");
  return issues.flatMap(({ number }) => lines.get(number) ?? []);
}

export type OptionsOfDeparture = { depot: string; dossier: string; lire: CallGitHub; claude: string; lancer?: LaunchTheTriage; role?: string; delaiMs?: number };

// Lit les issues ouvertes du dépôt et fait trier par le second celles qui ne sont pas sur le rail.
export async function proposeTheDeparture({ depot: repository, dossier: folder, lire: read, claude, lancer: launch = launchTheTriage, role, delaiMs: delayMs = DELAY_OF_TRIAGE_MS }: OptionsOfDeparture): Promise<Departure> {
  let issues: Issue[];
  try {
    issues = await readTheIssuesOpen(read, repository);
  } catch (error) {
    return { sans: `the open issues of ${repository} were not read on GitHub`, detail: error instanceof Error ? error.message : String(error) };
  }
  if (issues.length === 0) return { aucune: true };
  const aSort = issues.filter(({ labels }) => !labels.includes("fire"));
  if (aSort.length === 0) return { ouvertes: issues.length, lignes: [] };
  let triage: string | undefined;
  try {
    triage = triageOfSecond(role ?? readFileSync(ROLE_OF_SECOND, "utf8"));
  } catch (error) {
    return { sans: "the second's role was not read, so its triage cannot be asked", detail: error instanceof Error ? error.message : String(error) };
  }
  if (triage === undefined) return { sans: "the second's role has no section for a project that arrives with open issues", detail: TITLE_OF_THE_SECTION };
  const rendered = await launch(claude, ["-p"], instruction(triage, aSort), folder, delayMs);
  if (rendered.code !== 0) return { sans: "the second's triage did not answer", detail: rendered.erreur.trim() || `claude stopped with code ${String(rendered.code)}` };
  try {
    return { ouvertes: issues.length, lignes: readTheAnswer(rendered.sortie, aSort) };
  } catch (error) {
    return { sans: "the second's triage answered something the app cannot read", detail: error instanceof Error ? error.message : String(error) };
  }
}

// Le geste du second, pour les lignes restantes : sur chaque issue, sa priorité (`prio:<n>`, l'autre retirée), puis `product` et
// `fire`. Une ligne qui échoue est dite avec sa cause et les autres continuent ; `fait` : celles qui sont sur le rail.
export type Putting = { fait: number[]; refus: { ticket: number; refus: string; detail: string }[] };
export async function putOnTheRail({ depot: repository, lignes: lines, client }: { depot: string; lignes: unknown; client: ClientOfThePriority }): Promise<Putting> {
  const putting: Putting = { fait: [], refus: [] };
  if (!Array.isArray(lines)) return { ...putting, refus: [{ ticket: 0, refus: "nothing was put on the rail: the screen sent no list", detail: "" }] };
  for (const line of lines as Partial<Line>[]) {
    const ticket = line?.ticket as number;
    const rendered = await changeThePriority({ depot: repository, ticket, valeur: typeof line?.priorite === "number" ? String(line.priorite) : undefined, client });
    if ("refus" in rendered) {
      putting.refus.push({ ticket, refus: rendered.refus, detail: rendered.detail });
      continue;
    }
    try {
      const setOne = await client.ecrire("POST", `/repos/${repository}/issues/${ticket}/labels`, { labels: ["product", "fire"] });
      if (setOne.status !== 200) throw refusalOf("the labels `product` and `fire`", setOne);
      putting.fait.push(ticket);
    } catch (error) {
      putting.refus.push({ ticket, refus: `#${ticket} is not on the rail: GitHub did not put \`product\` and \`fire\` on it`, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return putting;
}
