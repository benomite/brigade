// The kanban of a project on the new kitchen (runtime/src/kitchen/, #4482): the kitchen keeps its whole state in GitHub
// labels (docs/superpowers/specs/2026-11-26-agents-in-prompts.md), so the board is read from them alone — the open issues,
// the open pull requests and those merged in the last 24 hours. Nothing of the old runtime is read: no claim comment, no
// station gist, no `facts`, no merge order, no ticket sheet.
//
// A project is on the new kitchen when its default branch holds `.brigade/kitchen.json`, the file the kitchen reads its
// risk zones from (runtime/src/kitchen/main.ts).
import type { CallGitHub } from "./client.ts";
import type { MemoryOfReads } from "./rail-github.ts";
import { LABEL_PARKED_CHEF } from "./parked-chef-github.ts";

// The kitchen's labels (runtime/src/kitchen/decide.ts, `LABELS`), written here: the rail reading loads nothing of the runtime
// but its GitHub states (test/board/read.test.ts).
const FIRE = "fire";
const TAKEN = "taken";
const IN_PASS = "in-pass";
const PARKED = "parked";
// The old process's waiting labels, which the kitchen still reads as parked (decide.ts, `LEGACY_PARKED`).
const LEGACY_PARKED = ["waiting", "chef-todo", "blocked-on-human"];

const KITCHEN_FILE = ".brigade/kitchen.json";

export type BoardColumnKey = "backlog" | "ready" | "cooking" | "pass" | "parked" | "served";
export type BoardCard = { ticket: number; title: string; url: string; tries: number; pr: { number: number; url: string } | null; forTheChef?: true; durationMs?: number; lines?: { added: number; removed: number } };
export type BoardColumn = { key: BoardColumnKey; title: string; cards: BoardCard[] };
export type KitchenBoard = { columns: BoardColumn[] };
// An open issue of the board, as the TODO of the chef reads it (wait-of-chef.ts, `parqueesPourLeChef`).
export type OpenIssue = { ticket: number; titre: string; url: string; creee: string | null; labels: string[] };

const COLUMNS: readonly { key: BoardColumnKey; title: string }[] = [
  { key: "backlog", title: "Backlog" },
  { key: "ready", title: "Ready" },
  { key: "cooking", title: "Cooking" },
  { key: "pass", title: "Pass" },
  { key: "parked", title: "Parked" },
  { key: "served", title: "Served" },
];

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((one: unknown) => { const o = object(one); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const labelsOf = (issue: Raw): string[] => list(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));

// The refusals so far: the highest `try:N` label (decide.ts, `triesOf`).
export const triesOf = (labels: readonly string[]): number => Math.max(0, ...labels.filter((label) => /^try:\d+$/.test(label)).map((label) => Number(label.slice(4))));
const parked = (labels: readonly string[]) => labels.some((label) => label === PARKED || label.startsWith(`${PARKED}:`) || LEGACY_PARKED.includes(label));

// The column of an open issue, from its labels alone. A parked ticket is parked whatever else it carries; then the furthest
// step wins — the kitchen keeps `fire` on a ticket it takes, and swaps `taken` for `in-pass` when the cook delivers.
export function columnOf(labels: readonly string[]): Exclude<BoardColumnKey, "served"> {
  if (parked(labels)) return "parked";
  if (labels.includes(IN_PASS)) return "pass";
  if (labels.includes(TAKEN)) return "cooking";
  if (labels.includes(FIRE)) return "ready";
  return "backlog";
}

// The ticket a pull request of the kitchen delivers: its branch `cook/<n>-github`, or the `Closes #n` of its body
// (runtime/src/kitchen/github.ts, `branchOf`, `openPr`).
function ticketOfPr(pr: Raw): number | null {
  const branch = /^cook\/(\d+)-/.exec(text(object(pr.head)?.ref))?.[1];
  const closes = /\b(?:closes|fixes|resolves)\s+#(\d+)/i.exec(text(pr.body))?.[1];
  const found = branch ?? closes;
  return found === undefined ? null : Number(found);
}

const priority = (labels: readonly string[]): number => {
  const found = labels.flatMap((label) => { const n = /^prio:(\d+)$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return found.length === 0 ? 9 : Math.min(...found);
};

const DAY_MS = 24 * 3_600_000;

const labelsOfColumn = (column: BoardColumnKey, labels: readonly string[]): string[] =>
  column === "cooking" ? [TAKEN] : column === "pass" ? [IN_PASS] : column === "ready" ? [FIRE] : column === "parked" ? labels.filter((label) => parked([label])) : [];

// What a card shows beyond its labels, from the issue's timeline and its pull request — the only reads a card costs. Nothing
// else of a card is looked for: the kitchen writes no station on GitHub (its comments, its commits and its labels name none,
// and it assigns nobody), so a card shows none.
async function detailsOf(board: KitchenBoard, issues: readonly Raw[], closedPrs: readonly Raw[], read: (path: string) => Promise<unknown>, repository: string, now: number): Promise<KitchenBoard> {
  const labelsOfTicket = new Map(issues.map((issue) => [issue.number as number, labelsOf(issue)]));
  const mergedAt = new Map(closedPrs.flatMap((pr) => (typeof pr.number === "number" ? [[pr.number, Date.parse(text(pr.merged_at))] as const] : [])));
  const columns = await Promise.all(
    board.columns.map(async (column) => ({
      ...column,
      cards: await Promise.all(
        column.cards.map(async (card) => {
          if (column.key === "backlog") return card;
          const [timeline, pull] = await Promise.all([
            read(`/repos/${repository}/issues/${card.ticket}/timeline?per_page=100`).catch(() => null),
            card.pr === null ? null : read(`/repos/${repository}/pulls/${card.pr.number}`).catch(() => null),
          ]);
          // The latest time one of the column's labels was put on; for Served, from `taken` to the merge.
          const wanted = column.key === "served" ? [TAKEN] : labelsOfColumn(column.key, labelsOfTicket.get(card.ticket) ?? []);
          const puts = list(timeline).flatMap((event) => (event.event === "labeled" && wanted.includes(text(object(event.label)?.name)) ? [Date.parse(text(event.created_at))] : [])).filter((time) => !Number.isNaN(time));
          const end = column.key === "served" ? (card.pr === null ? NaN : (mergedAt.get(card.pr.number) ?? NaN)) : now;
          const start = column.key === "served" ? Math.max(...puts.filter((time) => time <= end)) : Math.max(...puts);
          const done = object(pull);
          const lines = typeof done?.additions === "number" && typeof done.deletions === "number" ? { added: done.additions, removed: done.deletions } : null;
          return { ...card, ...(Number.isFinite(start) && Number.isFinite(end) && end >= start ? { durationMs: end - start } : {}), ...(lines === null ? {} : { lines }) };
        }),
      ),
    })),
  );
  return { columns };
}

// The board, from what GitHub gave: the open issues (pull requests left out), the open pull requests and the closed ones.
// The kitchen's order in each column — priority, then age; Served, the latest merged first. A served ticket is one whose
// issue is closed and whose pull request was merged in the 24 hours before `now`.
export function boardOf({ issues, openPrs, closedPrs, now }: { issues: readonly Raw[]; openPrs: readonly Raw[]; closedPrs: readonly Raw[]; now: number }): KitchenBoard {
  const open = issues.filter((issue) => issue.pull_request === undefined && typeof issue.number === "number");
  const openNumbers = new Set(open.map((issue) => issue.number as number));
  const prOf = new Map<number, { number: number; url: string }>();
  for (const pr of openPrs) {
    const ticket = ticketOfPr(pr);
    if (ticket !== null && typeof pr.number === "number" && !prOf.has(ticket)) prOf.set(ticket, { number: pr.number, url: text(pr.html_url) });
  }
  const columns = new Map<BoardColumnKey, (BoardCard & { order: number })[]>(COLUMNS.map(({ key }) => [key, []]));
  for (const issue of open) {
    const labels = labelsOf(issue);
    const ticket = issue.number as number;
    const card: BoardCard & { order: number } = {
      ticket,
      title: text(issue.title),
      url: text(issue.html_url),
      tries: triesOf(labels),
      pr: prOf.get(ticket) ?? null,
      ...(labels.includes(LABEL_PARKED_CHEF) ? { forTheChef: true as const } : {}),
      order: priority(labels) * 1e9 + ticket,
    };
    columns.get(columnOf(labels))?.push(card);
  }
  const served = new Map<number, BoardCard & { order: number }>();
  for (const pr of closedPrs) {
    const merged = Date.parse(text(pr.merged_at));
    const ticket = ticketOfPr(pr);
    if (Number.isNaN(merged) || merged < now - DAY_MS || merged > now || ticket === null || openNumbers.has(ticket) || typeof pr.number !== "number") continue;
    const known = served.get(ticket);
    if (known !== undefined && -known.order >= merged) continue;
    const url = text(pr.html_url);
    const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/.exec(url)?.[1];
    served.set(ticket, { ticket, title: text(pr.title).replace(/^#\d+\s*[—-]\s*/, ""), url: repo === undefined ? "" : `https://github.com/${repo}/issues/${ticket}`, tries: 0, pr: { number: pr.number, url }, order: -merged });
  }
  columns.set("served", [...served.values()]);
  return {
    columns: COLUMNS.map(({ key, title }) => ({
      key,
      title,
      cards: [...(columns.get(key) ?? [])].sort((a, b) => a.order - b.order).map(({ order: _order, ...card }) => card),
    })),
  };
}

const PER_PAGE = 100;
const PAGES_AT_MOST = 10;

// Every page of a list, up to `PAGES_AT_MOST`; `until`: stop after a page whose last item says there is nothing further.
async function pages(read: (path: string) => Promise<unknown>, path: string, until?: (last: Raw) => boolean): Promise<Raw[]> {
  const all: Raw[] = [];
  for (let page = 1; page <= PAGES_AT_MOST; page++) {
    const data = await read(`${path}&per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(data)) throw new Error("GitHub's answer is not a list");
    const got = list(data);
    all.push(...got);
    const last = got[got.length - 1];
    if (got.length < PER_PAGE || last === undefined || until?.(last) === true) break;
  }
  return all;
}

// The board of a project on the new kitchen, and its open issues (the TODO of the chef reads them). A reading GitHub refuses
// throws: the rail reading says why (read.ts).
export async function readKitchenBoard({ depot: repository, appeler: call, now }: { depot: string; appeler: CallGitHub; now: number }): Promise<{ board: KitchenBoard; open: OpenIssue[] }> {
  const read = async (path: string) => {
    const answer = await call(path);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status}`);
    return answer.data;
  };
  const issues = await pages(read, `/repos/${repository}/issues?state=open&sort=created&direction=asc`);
  const openPrs = await pages(read, `/repos/${repository}/pulls?state=open`);
  // Sorted by update, a page whose last pull request is older than the day has nothing merged in the day after it.
  const closedPrs = await pages(read, `/repos/${repository}/pulls?state=closed&sort=updated&direction=desc`, (last) => Date.parse(text(last.updated_at)) < now - DAY_MS);
  const open = issues
    .filter((issue) => issue.pull_request === undefined && typeof issue.number === "number")
    .map((issue) => ({ ticket: issue.number as number, titre: text(issue.title), url: text(issue.html_url) || `https://github.com/${repository}/issues/${issue.number}`, creee: typeof issue.created_at === "string" ? issue.created_at : null, labels: labelsOf(issue) }));
  const bare = boardOf({ issues, openPrs, closedPrs, now });
  return { board: await detailsOf(bare, issues, closedPrs, read, repository, now), open };
}

// Whether the project is on the new kitchen: its default branch holds `KITCHEN_FILE`, a file whose content is a JSON object —
// what the kitchen parses. A 404 is no, and so is an answer that is not that file; any other refusal is no too, and is not
// kept — the rail reading says it. The answer is kept `RECHECK_MS` in the readings' memory: a 404 carries no
// ETag, and asking at every reading would cost one counted request a minute per project (budget-github.ts).
const RECHECK_MS = 10 * 60_000;
const isKitchenFile = (data: unknown): boolean => {
  const file = object(data);
  if (file?.type !== "file" || typeof file.content !== "string") return false;
  try {
    return object(JSON.parse(Buffer.from(file.content, "base64").toString("utf8"))) !== null;
  } catch {
    return false;
  }
};
const KEPT = "brigade:new-kitchen";
export async function onTheNewKitchen({ depot: repository, appeler: call, memoire: memory, now }: { depot: string; appeler: CallGitHub; memoire?: MemoryOfReads; now: number }): Promise<boolean> {
  const kept = memory?.get(KEPT);
  if (kept !== undefined && now - Number(kept.etag) < RECHECK_MS && typeof kept.data === "boolean") return kept.data;
  const answer = await call(`/repos/${repository}/contents/${KITCHEN_FILE}`);
  if (answer.status !== 200 && answer.status !== 404) return false;
  const yes = answer.status === 200 && isKitchenFile(answer.data);
  memory?.set(KEPT, { etag: String(now), data: yes });
  return yes;
}

// `kitchenBoard`, from the root of `facts` (facts.ts, `comprendre`): nothing malformed sets it — the view then draws the
// rail it reads, never a made-up board.
export function kitchenBoardRead(value: unknown): { kitchenBoard?: KitchenBoard } {
  const columns = object(value)?.columns;
  if (!Array.isArray(columns) || columns.length !== COLUMNS.length) return {};
  const read = columns.map((column: unknown, rank) => {
    const { key, title, cards } = object(column) ?? {};
    if (key !== COLUMNS[rank]?.key || typeof title !== "string" || !Array.isArray(cards)) return null;
    const good = cards.flatMap((card: unknown) => {
      const { ticket, title: name, url, tries, pr, forTheChef, durationMs, lines } = object(card) ?? {};
      const linesRead = object(lines);
      const prRead = pr === null ? null : object(pr);
      const prOk = pr === null || (prRead !== null && typeof prRead.number === "number" && typeof prRead.url === "string");
      if (typeof ticket !== "number" || typeof name !== "string" || typeof url !== "string" || typeof tries !== "number" || !prOk) return [];
      return [{ ticket, title: name, url, tries, pr: prRead === null ? null : { number: prRead.number as number, url: prRead.url as string }, ...(forTheChef === true ? { forTheChef: true as const } : {}), ...(typeof durationMs === "number" ? { durationMs } : {}), ...(typeof linesRead?.added === "number" && typeof linesRead.removed === "number" ? { lines: { added: linesRead.added, removed: linesRead.removed } } : {}) }];
    });
    return good.length === cards.length ? { key: key as BoardColumnKey, title, cards: good } : null;
  });
  return read.every((column) => column !== null) ? { kitchenBoard: { columns: read as BoardColumn[] } } : {};
}
