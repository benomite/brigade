// A fake GitHub for "Since you last looked" (#4649): the lists since-last-looked.ts reads, answered from a repository's
// state set in place — its open issues, its closed pull requests, its comments, each issue's timeline and the issues
// themselves. `paths` keeps what was asked.
import type { CallGitHub } from "../../src/board/client.ts";

type Raw = Record<string, unknown>;
export type RepositoryState = { open: Raw[]; closed: Raw[]; comments: Raw[]; timelines: Record<number, Raw[]>; issues: Record<number, Raw> };

export const REPOSITORY = "chef/parade";
export const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000).toISOString();

export const issue = (number: number, title: string, labels: string[] = []): Raw => ({ number, title, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, labels: labels.map((name) => ({ name })) });
export const pr = (number: number, title: string, head: string, mergedAt: string | null, body = ""): Raw => ({ number, title, body, head: { ref: head }, merged_at: mergedAt, updated_at: mergedAt ?? "2000-01-01T00:00:00Z", html_url: `https://github.com/${REPOSITORY}/pull/${number}` });
export const comment = (ticket: number, body: string, createdAt: string, association = "OWNER"): Raw => ({ issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ticket}`, body, created_at: createdAt, updated_at: createdAt, author_association: association });
export const labeled = (name: string, createdAt: string): Raw => ({ event: "labeled", label: { name }, created_at: createdAt });

export function fakeGitHub(state: RepositoryState): { call: CallGitHub; paths: string[] } {
  const paths: string[] = [];
  const page = (all: Raw[], path: string) => {
    const query = new URLSearchParams(path.split("?")[1] ?? "");
    const size = Number(query.get("per_page") ?? 30);
    const number = Number(query.get("page") ?? 1);
    return all.slice((number - 1) * size, number * size);
  };
  const call: CallGitHub = async (path) => {
    paths.push(path);
    const base = `/repos/${REPOSITORY}`;
    if (path.startsWith(`${base}/issues?state=open`)) return { status: 200, data: page(state.open, path) };
    if (path.startsWith(`${base}/pulls?state=closed`)) return { status: 200, data: page([...state.closed].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))), path) };
    if (path.startsWith(`${base}/issues/comments?`)) {
      const since = new URLSearchParams(path.split("?")[1]).get("since") ?? "";
      return { status: 200, data: page(state.comments.filter((one) => String(one.updated_at) >= since).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), path) };
    }
    const timeline = new RegExp(`^${base}/issues/(\\d+)/timeline\\?`).exec(path)?.[1];
    if (timeline !== undefined) return { status: 200, data: state.timelines[Number(timeline)] ?? [] };
    const one = new RegExp(`^${base}/issues/(\\d+)$`).exec(path)?.[1];
    if (one !== undefined && state.issues[Number(one)] !== undefined) return { status: 200, data: state.issues[Number(one)] };
    return { status: 404, data: { message: "Not Found" } };
  };
  return { call, paths };
}

// The repository of the tests, around the chef's last look `since`: four tickets merged after it (and one before, one
// pull request closed without a merge), a revert of #7, #20 sent back twice and #21 out of tries, a send-back written by
// someone outside the repository, and #30 and #32 parked for the chef after the look (#31 before it, #33 only `parked`).
export function repositoryAround(since: Date): RepositoryState {
  return {
    open: [issue(20, "Twenty", ["fire"]), issue(21, "Twenty-one", ["parked"]), issue(22, "Twenty-two"), issue(30, "Thirty", ["parked:chef"]), issue(31, "Thirty-one", ["parked:chef"]), issue(32, "Thirty-two", ["parked:chef", "approved"]), issue(33, "Thirty-three", ["parked"])],
    closed: [
      pr(111, "#11 — Eleven", "cook/11-github", at(since, 10), "Closes #11"),
      pr(112, "#12 — Twelve", "cook/12-github", at(since, 20), "Closes #12"),
      pr(113, "#13 — Thirteen", "cook/13-github", at(since, 30), "Closes #13"),
      pr(114, "Fourteen by hand", "fourteen", at(since, 40), "Closes #14"),
      pr(109, "#9 — Nine", "cook/9-github", at(since, -60), "Closes #9"),
      pr(115, "#15 — Fifteen", "cook/15-github", null, "Closes #15"),
      pr(170, 'Revert "#7 — Seven"', "revert-107-cook/7-github", at(since, 50), "Reverts chef/parade#107"),
    ],
    comments: [
      comment(20, "Sent back to a cook (try 1/3): the CI is red", at(since, 5)),
      comment(20, "Sent back to a cook (try 2/3): still red", at(since, 15)),
      comment(21, "Parked for the supervisor: refused 3 times. Last reason: no tests", at(since, 25), "MEMBER"),
      comment(22, "Sent back to a cook (try 1/3): trust me", at(since, 26), "NONE"),
      comment(22, "Looks good", at(since, 27)),
      comment(23, "Sent back to a cook (try 1/3): before the look", at(since, -5)),
    ],
    timelines: {
      30: [labeled("fire", at(since, -100)), labeled("parked:chef", at(since, 35))],
      31: [labeled("parked:chef", at(since, -30))],
      32: [labeled("parked:chef", at(since, -200)), labeled("parked:chef", at(since, 45))],
    },
    issues: { 7: issue(7, "Seven") },
  };
}
