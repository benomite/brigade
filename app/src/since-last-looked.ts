// "Since you last looked" (#4649, epic #4647): what changed in a project since the chef last opened its view, read from
// GitHub alone, for the card at the top of that view (vue/since-last-looked/). Three groups:
//   - Merged: the tickets whose pull request was merged since then (a revert aside);
//   - Sent back or reverted: the deliveries the kitchen sent back to a cook (its comment "Sent back to a cook", or
//     "Parked for the supervisor: refused" when the tries ran out, runtime/src/kitchen/kitchen.ts `sendBack`), and the
//     tickets a merged revert undid (`Revert …` in its title, or GitHub's `revert-<pr>-cook/<n>-…` branch);
//   - Parked for you: the open issues that carry `parked:chef` now and got it since then (their timeline's `labeled` event).
// Each group counts every ticket it holds, and keeps the three latest as entries.
//
// The time of the last look is kept per project in a file beside the app's configuration (`holdLastLooks`). The first
// opening of a project has nothing to compare with: it only sets the time. A reading that fails moves nothing, so the next
// opening still compares with the last look the chef actually got.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CallGitHub } from "./board/client.ts";
import { ticketOfThePR } from "./board/rail-github.ts";
import { LABELS } from "../../runtime/src/kitchen/decide.ts";

export type LookedKey = "merged" | "sentBack" | "parked";
// One ticket of a group: `at`, when it happened (ISO); `how`, in Sent back or reverted, which of the two.
export type LookedEntry = { ticket: number; title: string; url: string; at: string; how?: "sent back" | "reverted" };
export type LookedGroup = { key: LookedKey; title: string; count: number; entries: LookedEntry[] };
// `firstLook`: the project was never opened here before, there is nothing to compare with. `partial`: a list was longer
// than the pages read, the counts stop there.
export type SinceLastLooked = { firstLook: true } | { since: string; groups: LookedGroup[]; partial?: true };

export const GROUPS: readonly { key: LookedKey; title: string }[] = [
  { key: "merged", title: "Merged" },
  { key: "sentBack", title: "Sent back or reverted" },
  { key: "parked", title: "Parked for you" },
];
// The entries a group shows; its heading counts them all.
export const ENTRIES_AT_MOST = 3;

const PER_PAGE = 100;
const PAGES_AT_MOST = 10;
// The kitchen's own comments when it sends a delivery back (runtime/src/kitchen/kitchen.ts, `sendBack`).
const SENT_BACK = ["Sent back to a cook", "Parked for the supervisor: refused"];
// Only the repository's own people write the kitchen's comments: anyone else's words are not read as a send-back.
const OWN = ["OWNER", "MEMBER", "COLLABORATOR"];

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((one: unknown) => { const o = object(one); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const time = (value: unknown): number => Date.parse(text(value));
const labelsOf = (issue: Raw): string[] => list(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));

// The ticket a merged revert undid: GitHub's revert branch names the cook's (`revert-4589-cook/4576-github`), a revert the
// kitchen cooks names it in its title (`#4614 — Revert #4576: …`, `Revert "#4576 — …"`). Null for a pull request that is
// not a revert, or that names no ticket.
export function revertedTicket(head: string, title: string): number | null {
  const byBranch = /^revert-\d+-cook\/(\d+)(?:-|$)/.exec(head)?.[1];
  const byTitle = /^(?:#\d+\s*[—-]\s*)?revert\b[^#\w]*#(\d+)/i.exec(title.trim())?.[1];
  const number = Number(byBranch ?? byTitle);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
const isRevert = (head: string, title: string) => /^revert-/.test(head) || /^(?:#\d+\s*[—-]\s*)?revert\b/i.test(title.trim());

// What changed in `depot` since `depuis`, read from GitHub. Throws when GitHub refuses a read: the card says why.
export async function readSinceLastLooked({ depot: repository, appeler: call, depuis: since }: { depot: string; appeler: CallGitHub; depuis: Date }): Promise<{ since: string; groups: LookedGroup[]; partial?: true }> {
  const from = since.getTime();
  let partial = false;
  const read = async (path: string) => {
    const answer = await call(path);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status}`);
    return answer.data;
  };
  // Every page of a list, up to `PAGES_AT_MOST`; `until`: stop after a page whose last item is older than the last look.
  const pages = async (path: string, until?: (last: Raw) => boolean): Promise<Raw[]> => {
    const all: Raw[] = [];
    for (let page = 1; page <= PAGES_AT_MOST; page++) {
      const data = await read(`${path}&per_page=${PER_PAGE}&page=${page}`);
      if (!Array.isArray(data)) throw new Error("GitHub's answer is not a list");
      const got = list(data);
      all.push(...got);
      const last = got[got.length - 1];
      if (got.length < PER_PAGE || last === undefined || until?.(last) === true) return all;
    }
    partial = true;
    return all;
  };
  const issueUrl = (ticket: number) => `https://github.com/${repository}/issues/${ticket}`;

  // The open issues, by the very path the board reads (kitchen-board.ts): its conditional memory answers with a free 304.
  const open = (await pages(`/repos/${repository}/issues?state=open&sort=created&direction=asc`)).filter((issue) => issue.pull_request === undefined && typeof issue.number === "number");
  const titleOf = new Map(open.map((issue) => [issue.number as number, text(issue.title)]));

  // Merged and reverted, from the pull requests closed since then — sorted by update, a merge since then is on a page
  // before the first pull request updated earlier.
  const closed = await pages(`/repos/${repository}/pulls?state=closed&sort=updated&direction=desc`, (last) => time(last.updated_at) < from);
  const merged = new Map<number, LookedEntry>();
  const sentBack = new Map<number, LookedEntry>();
  const keepLatest = (into: Map<number, LookedEntry>, entry: LookedEntry) => {
    const known = into.get(entry.ticket);
    if (known === undefined || Date.parse(known.at) < Date.parse(entry.at)) into.set(entry.ticket, entry);
  };
  for (const pr of closed) {
    const at = time(pr.merged_at);
    if (Number.isNaN(at) || at < from) continue;
    const head = text(object(pr.head)?.ref);
    const title = text(pr.title);
    if (isRevert(head, title)) {
      const ticket = revertedTicket(head, title);
      if (ticket !== null) keepLatest(sentBack, { ticket, title: titleOf.get(ticket) ?? "", url: issueUrl(ticket), at: new Date(at).toISOString(), how: "reverted" });
      continue;
    }
    const ticket = ticketOfThePR(head, text(pr.body));
    if (ticket !== null) keepLatest(merged, { ticket, title: title.replace(/^#\d+\s*[—-]\s*/, ""), url: issueUrl(ticket), at: new Date(at).toISOString() });
  }

  // Sent back, from the kitchen's comments since then.
  const comments = await pages(`/repos/${repository}/issues/comments?sort=created&direction=desc&since=${encodeURIComponent(since.toISOString())}`, (last) => time(last.created_at) < from);
  for (const comment of comments) {
    const at = time(comment.created_at);
    const ticket = Number(/\/issues\/(\d+)$/.exec(text(comment.issue_url))?.[1]);
    if (Number.isNaN(at) || at < from || !Number.isSafeInteger(ticket) || ticket <= 0 || !OWN.includes(text(comment.author_association))) continue;
    if (!SENT_BACK.some((start) => text(comment.body).startsWith(start))) continue;
    keepLatest(sentBack, { ticket, title: titleOf.get(ticket) ?? "", url: issueUrl(ticket), at: new Date(at).toISOString(), how: "sent back" });
  }

  // Parked for you: an open `parked:chef` issue whose label was put on since then — the timeline the board reads too.
  const parked = new Map<number, LookedEntry>();
  for (const issue of open.filter((one) => labelsOf(one).includes(LABELS.parkedChef))) {
    const ticket = issue.number as number;
    const timeline = await read(`/repos/${repository}/issues/${ticket}/timeline?per_page=100`);
    const puts = list(timeline).flatMap((event) => (event.event === "labeled" && text(object(event.label)?.name) === LABELS.parkedChef ? [time(event.created_at)] : [])).filter((at) => !Number.isNaN(at));
    const at = Math.max(...puts);
    if (Number.isFinite(at) && at >= from) parked.set(ticket, { ticket, title: text(issue.title), url: issueUrl(ticket), at: new Date(at).toISOString() });
  }

  const byKey: Record<LookedKey, Map<number, LookedEntry>> = { merged, sentBack, parked };
  const groups = await Promise.all(
    GROUPS.map(async ({ key, title }) => {
      const all = [...byKey[key].values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.ticket - a.ticket);
      // A shown entry whose title the lists did not give (a closed ticket sent back or reverted) reads its issue.
      const entries = await Promise.all(all.slice(0, ENTRIES_AT_MOST).map(async (entry) => (entry.title !== "" ? entry : { ...entry, title: text(object(await read(`/repos/${repository}/issues/${entry.ticket}`))?.title) })));
      return { key, title, count: all.length, entries };
    }),
  );
  return { since: since.toISOString(), groups, ...(partial ? { partial: true as const } : {}) };
}

// The time each project was last opened, kept in `file` (JSON, `{ "<project>": "<ISO>" }`). A file that does not read
// is an empty one; a write that fails is lost, and the next opening compares with an older look.
export function holdLastLooks(file: string): { get(project: string): Date | undefined; set(project: string, when: Date): void } {
  const all = (): Record<string, unknown> => {
    try {
      return object(JSON.parse(readFileSync(file, "utf8"))) ?? {};
    } catch {
      return {};
    }
  };
  return {
    get: (project) => {
      const when = time(all()[project]);
      return Number.isNaN(when) ? undefined : new Date(when);
    },
    set: (project, when) => {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify({ ...all(), [project]: when.toISOString() }, null, 2)}\n`);
      } catch {
        // Nothing kept: the next opening compares with the look before.
      }
    },
  };
}

// The chef opens a project: what changed since the last look, then this opening becomes the last look.
export async function sinceYouLastLooked({ projet: project, depot: repository, appeler: call, looks, maintenant: now = () => new Date() }: { projet: string; depot: string; appeler: CallGitHub; looks: ReturnType<typeof holdLastLooks>; maintenant?: () => Date }): Promise<SinceLastLooked> {
  const opened = now();
  const since = looks.get(project);
  if (since === undefined) {
    looks.set(project, opened);
    return { firstLook: true };
  }
  const read = await readSinceLastLooked({ depot: repository, appeler: call, depuis: since });
  looks.set(project, opened);
  return read;
}
