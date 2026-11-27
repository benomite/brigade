// The figures of the public autonomy page (#4500): writes site/autonomie.json in the contract of docs/autonomie-page.md,
// over the last 30 days of benomite/brigade. Run by the `pages` workflow, with its GITHUB_TOKEN:
//   node scripts/autonomy-page/generate.ts site/autonomie.json
//
// Nothing is computed twice: the read is the app's (app/src/vue/autonomy/autonomy-github.ts,
// `readTheAutonomyOfRepository`), the computation the app's too (app/src/vue/autonomy/compute.ts). One thing
// is added, for the GITHUB_TOKEN's budget (1,000 REST requests an hour per repository): the app reads each served
// ticket's events and comments with two REST calls, about 2,000 over 30 days. Here they are read by fifty with GraphQL
// first, then handed to the app's read as the issues it already holds (`lues`); a ticket GraphQL does not give whole
// (over 100 labels set or 100 comments) is left to the app's REST read.
//
// When the figures cannot be computed (GitHub refuses, the period is only read in part, no ticket served), it writes
// nothing and exits non-zero: the step fails, and the page last published stays.
import { writeFileSync } from "node:fs";
import { API_GITHUB, byFetch, clientGitHub, postByFetch, type CallGitHub } from "../../app/src/board/client.ts";
import { readTheAutonomyOfRepository, type IssuesRead } from "../../app/src/vue/autonomy/autonomy-github.ts";
import { readTheServedOnTheWindow } from "../../app/src/vue/rail/github.ts";
import { chiffresDAutonomie } from "../../app/src/vue/autonomy/compute.ts";

export const REPOSITORY = "benomite/brigade";
export const DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;
// What `readTheAutonomyOfRepository` reads at most (autonomy-github.ts): the same pages, so they are read once.
const PAGES_OF_PR_AT_MOST = 100;
const ISSUES_BY_QUERY = 50;

// A GraphQL query to GitHub, its `data` returned; throws when GitHub refuses it.
export type QueryGitHub = (query: string) => Promise<unknown>;

export type Figure = { value: string; computedAt: string; url: string };
export type AutonomyPage = { figures: { servedWithoutHuman: Figure; medianLeadTime: Figure; sendBackRate: Figure; mergedPullRequests: Figure } };

const object = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

// A GET answered once per path: the served tickets read here to know which issues to fetch are not read again by the
// app's read, which pages the same pull requests with the same `now`.
function once(call: CallGitHub): CallGitHub {
  const answers = new Map<string, ReturnType<CallGitHub>>();
  return (path, headers) => {
    if (headers !== undefined) return call(path, headers);
    if (!answers.has(path)) answers.set(path, call(path));
    return answers.get(path)!;
  };
}

// The events and comments of these tickets, as GitHub's REST API returns what compute.ts reads of them: the `labeled`
// events with their label and instant, the comments with their body, instant and author association.
export async function readTheIssuesInBulk(query: QueryGitHub, repository: string, served: readonly { ticket: number; livre: string }[]): Promise<IssuesRead> {
  const [owner, name] = repository.split("/");
  const read: IssuesRead = new Map();
  for (let start = 0; start < served.length; start += ISSUES_BY_QUERY) {
    const batch = served.slice(start, start + ISSUES_BY_QUERY);
    const fields = batch
      .map(({ ticket }) => `t${ticket}: issue(number: ${ticket}) { timelineItems(itemTypes: [LABELED_EVENT], first: 100) { pageInfo { hasNextPage } nodes { ... on LabeledEvent { createdAt label { name } } } } comments(first: 100) { pageInfo { hasNextPage } nodes { body createdAt authorAssociation } } }`)
      .join("\n");
    const data = object(await query(`query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {\n${fields}\n} }`));
    const issues = object(data?.repository);
    if (issues === null) throw new Error(`GitHub's GraphQL API gave no repository ${repository}`);
    for (const { ticket, livre } of batch) {
      const issue = object(issues[`t${ticket}`]);
      const timeline = object(issue?.timelineItems);
      const comments = object(issue?.comments);
      if (timeline === null || comments === null || object(timeline.pageInfo)?.hasNextPage !== false || object(comments.pageInfo)?.hasNextPage !== false) continue;
      read.set(ticket, {
        livre,
        evenements: list(timeline.nodes).map((node) => ({ event: "labeled", label: { name: text(object(object(node)?.label)?.name) }, created_at: text(object(node)?.createdAt) })),
        commentaires: list(comments.nodes).map((node) => ({ body: text(object(node)?.body), created_at: text(object(node)?.createdAt), author_association: text(object(node)?.authorAssociation) })),
      });
    }
  }
  return read;
}

// A duration as the app writes one (app/src/vue/project/delay.js, `durationInClear`): "2 h 34 min", "12 min", "3 d 4 h".
// Restated: the runtime's type check, which reads this file through its test, does not read the app's JavaScript.
export function durationInClear(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  const [days, hours, remaining] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  if (days > 0) return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
  if (hours > 0) return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
  return `${minutes} min`;
}

const percent = (share: number, count: number, of: number) => `${Math.round(share * 100)}% (${count} of ${of})`;
const toTheSecond = (instant: string) => instant.replace(/\.\d{3}Z$/, "Z");

// The page's four figures over the `days` days before `now`. Throws when they cannot be computed.
export async function autonomyPage(options: { appeler: CallGitHub; graphql: QueryGitHub; maintenant: Date; depot?: string; jours?: number }): Promise<AutonomyPage> {
  const { graphql, maintenant: now, depot: repository = REPOSITORY, jours: days = DAYS } = options;
  const call = once(options.appeler);
  const read = async (path: string) => {
    const answer = await call(path);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status} on ${path}`);
    return answer.data;
  };
  const end = now.getTime();
  const served = await readTheServedOnTheWindow(read, repository, end, days * DAY_MS, PAGES_OF_PR_AT_MOST);
  const lues = await readTheIssuesInBulk(graphql, repository, served.servis);
  const data = await readTheAutonomyOfRepository({ depot: repository, appeler: call, maintenant: now, lues });
  if (data.partiel !== null && Date.parse(data.partiel.depuis) > end - days * DAY_MS) throw new Error(`the period is only read since ${data.partiel.depuis}: ${data.partiel.raison}`);
  const figures = chiffresDAutonomie([data], days, now);
  if (figures.tickets === 0 || figures.partSansHumain === null || figures.partRenvoyee === null || figures.delaiMedianMs === null) throw new Error(`no ticket served by the kitchen in the last ${days} days`);
  // The pull requests merged in the period, to the second: the list every figure links to, and the one the fourth counts.
  const merged = `is:pr is:merged merged:${toTheSecond(figures.debut)}..${toTheSecond(figures.fin)}`;
  const search = object(await read(`/search/issues?q=${encodeURIComponent(`repo:${repository} ${merged}`)}&per_page=1`));
  if (search?.incomplete_results !== false || typeof search.total_count !== "number") throw new Error("GitHub's search gave no complete count of the merged pull requests");
  const figure = (value: string): Figure => ({ value, computedAt: figures.fin.slice(0, 10), url: `https://github.com/${repository}/pulls?q=${encodeURIComponent(merged)}` });
  return {
    figures: {
      servedWithoutHuman: figure(percent(figures.partSansHumain, figures.sansHumain, figures.tickets)),
      medianLeadTime: figure(durationInClear(figures.delaiMedianMs)),
      sendBackRate: figure(percent(figures.partRenvoyee, figures.renvoyes, figures.tickets)),
      mergedPullRequests: figure(String(search.total_count)),
    },
  };
}

// The page written to `path`, only once its four figures are computed: a failed computation leaves the file as it was.
export async function writeTheAutonomyPage(path: string, options: Parameters<typeof autonomyPage>[0]): Promise<AutonomyPage> {
  const page = await autonomyPage(options);
  writeFileSync(path, `${JSON.stringify(page, null, 2)}\n`);
  return page;
}

// The workflow's run: GITHUB_TOKEN for both APIs.
async function main(path: string) {
  const token = process.env.GITHUB_TOKEN ?? "";
  if (token === "") throw new Error("GITHUB_TOKEN is not set");
  const post = postByFetch({ delaiMs: 60_000 });
  const graphql: QueryGitHub = async (query) => {
    const answer = await post(`${API_GITHUB}/graphql`, { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` }, { query });
    // An issue that is not one (a number GitHub gives to a pull request) is NOT_FOUND: left to the app's REST read.
    const errors = list(object(answer.data)?.errors).filter((error) => object(error)?.type !== "NOT_FOUND");
    if (answer.status !== 200 || errors.length > 0) throw new Error(`GitHub's GraphQL API answered HTTP ${answer.status}${errors.length > 0 ? `: ${text(object(errors[0])?.message)}` : ""}`);
    return object(answer.data)?.data;
  };
  const page = await writeTheAutonomyPage(path, { appeler: clientGitHub({ jeton: async () => token, envoyer: byFetch() }), graphql, maintenant: new Date() });
  for (const [name, { value }] of Object.entries(page.figures)) console.log(`${name}: ${value}`);
}

if (import.meta.main) {
  main(process.argv[2] ?? "site/autonomie.json").catch((error: unknown) => {
    console.error(`::error::No autonomy figures: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
