// Everything the kitchen reads from and writes to GitHub, through `gh`.
// The state is read in one paged GraphQL query per turn; the gestures are
// plain `gh` commands. Only text from trusted authors leaves this module.
import { execFile } from "../sans-invite.ts";
import type { Checks, Issue, PullRequest } from "./decide.ts";

export type Gh = (args: string[], input?: string) => Promise<string>;

export function ghCli(bin: string, env: NodeJS.ProcessEnv): Gh {
  return (args, input) =>
    new Promise((resolve, reject) => {
      const child = execFile(bin, args, { env, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(`gh ${args.slice(0, 3).join(" ")}: ${stderr.trim() || error.message}`));
        else resolve(stdout);
      });
      child.stdin?.end(input ?? "");
    });
}

const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
export const ACCEPTED = "accepted";
export const branchOf = (issue: number) => `cook/${issue}-github`;
const issueOfBranch = (branch: string): number | null => {
  const match = /^cook\/(\d+)-github$/.exec(branch);
  return match === null ? null : Number(match[1]);
};

export const dependsOn = (body: string): number[] => [...body.matchAll(/depends on #(\d+)/gi)].map((match) => Number(match[1]));

const QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes { number title body authorAssociation labels(first: 30) { nodes { name } } }
    }
    pullRequests(states: OPEN, first: 100) {
      nodes { number headRefName mergeable commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 60) { nodes {
        __typename ... on CheckRun { name conclusion status } ... on StatusContext { context state } } } } } } } }
    }
  }
}`;

type Context = { __typename: string; name?: string; conclusion?: string | null; status?: string; context?: string; state?: string };
type RawPr = { number: number; headRefName: string; mergeable: string; commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string; contexts: { nodes: Context[] } } | null } }> } };
type RawIssue = { number: number; title: string; body: string; authorAssociation: string; labels: { nodes: Array<{ name: string }> } };

const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"]);

export function checksOf(rollup: { state: string; contexts: { nodes: Context[] } } | null): { checks: Checks; failing: string[] } {
  if (rollup === null) return { checks: "none", failing: [] };
  const contexts = rollup.contexts.nodes;
  const failing = contexts.filter((one) => FAILED.has(one.conclusion ?? one.state ?? "")).map((one) => one.name ?? one.context ?? "?");
  const pending = contexts.some((one) => (one.__typename === "CheckRun" ? one.status !== "COMPLETED" : one.state === "PENDING" || one.state === "EXPECTED"));
  // A red check is final only when the run is over: a rerun may still be on its way.
  if (pending) return { checks: "pending", failing: [] };
  return failing.length > 0 ? { checks: "failure", failing } : { checks: "success", failing: [] };
}

export async function readState(gh: Gh, repo: string): Promise<{ issues: Issue[]; prs: PullRequest[] }> {
  const [owner, name] = repo.split("/");
  const issues: Issue[] = [];
  let prs: PullRequest[] = [];
  let cursor: string | null = null;
  do {
    const args = ["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`];
    if (cursor !== null) args.push("-F", `cursor=${cursor}`);
    const data = JSON.parse(await gh(args)).data.repository;
    for (const raw of data.issues.nodes as RawIssue[]) {
      const labels = raw.labels.nodes.map((label) => label.name);
      issues.push({ number: raw.number, title: raw.title, labels, trusted: TRUSTED.has(raw.authorAssociation) || labels.includes(ACCEPTED), dependsOn: dependsOn(raw.body) });
    }
    if (cursor === null) {
      prs = (data.pullRequests.nodes as RawPr[]).flatMap((raw) => {
        const issue = issueOfBranch(raw.headRefName);
        if (issue === null) return [];
        return [{ number: raw.number, issue, conflicting: raw.mergeable === "CONFLICTING", ...checksOf(raw.commits.nodes[0]?.commit.statusCheckRollup ?? null) }];
      });
    }
    cursor = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null;
  } while (cursor !== null);
  return { issues, prs };
}

// The ticket as an agent may read it: its title and body, and only the
// comments of trusted authors. Untrusted text never reaches an agent.
export async function ticketText(gh: Gh, repo: string, issue: number): Promise<string> {
  // The REST API, not `gh issue view`: only it says each author's association.
  const raw = JSON.parse(await gh(["api", `repos/${repo}/issues/${issue}`])) as { title: string; body: string | null; author_association: string; labels: Array<{ name: string }> };
  const pages = JSON.parse(await gh(["api", "--paginate", "--slurp", `repos/${repo}/issues/${issue}/comments?per_page=100`])) as Array<Array<{ user: { login: string } | null; author_association: string; body: string }>>;
  const trusted = TRUSTED.has(raw.author_association) || raw.labels.some((label) => label.name === ACCEPTED);
  const comments = pages.flat().filter((one) => TRUSTED.has(one.author_association)).map((one) => `--- ${one.user?.login ?? "?"} ---\n${one.body}`);
  return [`# #${issue} ${raw.title}`, trusted ? (raw.body ?? "") : "(body withheld: its author is not trusted)", ...(comments.length > 0 ? ["## Comments", ...comments] : [])].join("\n\n");
}

export function gestures(gh: Gh, repo: string) {
  const r = ["-R", repo];
  return {
    labels: async (issue: number, add: string[], remove: string[] = []) => {
      if (add.length === 0 && remove.length === 0) return;
      await gh(["issue", "edit", String(issue), ...r, ...(add.length ? ["--add-label", add.join(",")] : []), ...(remove.length ? ["--remove-label", remove.join(",")] : [])]);
    },
    close: (issue: number, body: string) => gh(["issue", "close", String(issue), ...r, "--reason", "not planned", "--comment", body]),
    comment: (issue: number, body: string) => gh(["issue", "comment", String(issue), ...r, "--body-file", "-"], body),
    open: async (title: string, body: string, labels: string[] = []): Promise<number> => {
      const url = await gh(["issue", "create", ...r, "--title", title, "--body-file", "-", ...(labels.length ? ["--label", labels.join(",")] : [])], body);
      return Number(url.trim().split("/").pop());
    },
    openPr: (issue: number, base: string, title: string) => gh(["pr", "create", ...r, "--head", branchOf(issue), "--base", base, "--title", `#${issue} — ${title}`, "--body-file", "-"], `Closes #${issue}`),
    prFiles: async (pr: number): Promise<string[]> => (JSON.parse(await gh(["pr", "view", String(pr), ...r, "--json", "files"])).files as Array<{ path: string }>).map((file) => file.path),
    // The last lines of each failing Actions job's failed steps: the cook has no token to read them.
    failedLogs: async (pr: number, max = 5, lines = 40): Promise<Array<{ name: string; log: string }>> => {
      const sha = (JSON.parse(await gh(["api", `repos/${repo}/pulls/${pr}`])) as { head: { sha: string } }).head.sha;
      const runs = (JSON.parse(await gh(["api", `repos/${repo}/commits/${sha}/check-runs?per_page=100`])) as { check_runs: Array<{ name: string; conclusion: string | null; html_url: string }> }).check_runs;
      const failed = runs.filter((check) => FAILED.has((check.conclusion ?? "").toUpperCase())).slice(0, max);
      return Promise.all(failed.map(async (check) => {
        const job = /\/job\/(\d+)/.exec(check.html_url)?.[1];
        if (job === undefined) return { name: check.name, log: `(no Actions log: ${check.html_url})` };
        const raw = await gh(["run", "view", "--job", job, ...r, "--log-failed"]).catch((error: Error) => `(log unreadable: ${error.message})`);
        // Each line is `<job>\t<step>\t<text>`: only the text is kept.
        const text = raw.trimEnd().split("\n").map((line) => line.replace(/^[^\t]*\t[^\t]*\t/, "").slice(0, 300));
        return { name: check.name, log: text.slice(-lines).join("\n") };
      }));
    },
    merge: (pr: number) => gh(["pr", "merge", String(pr), ...r, "--merge", "--delete-branch"]),
    ensureLabels: async (names: string[]) => {
      for (const name of names) await gh(["label", "create", name, ...r, "--force"]).catch(() => "");
    },
  };
}
export type Gestures = ReturnType<typeof gestures>;
