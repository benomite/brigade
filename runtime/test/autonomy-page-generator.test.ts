// The generator of the public autonomy page (#4500): fixed GitHub data in, site/autonomie.json out, in the contract of
// docs/autonomie-page.md; and nothing written when the figures cannot be computed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CallGitHub } from "../../app/src/board/client.ts";
import { durationInClear, writeTheAutonomyPage, type QueryGitHub } from "../../scripts/autonomy-page/generate.ts";

const ROOT = join(import.meta.dirname, "../..");
const NOW = new Date("2026-11-27T04:17:00.000Z");
const REPO = "benomite/brigade";
const MEMBER = "MEMBER";

const pr = (number: number, ticket: number | null, merged: string | null, updated = merged ?? "2026-11-26T00:00:00Z") => ({ number, title: `#${ticket} — t`, head: { ref: ticket === null ? "docs-typo" : `cook/${ticket}-github` }, body: "", merged_at: merged, updated_at: updated, html_url: `https://github.com/${REPO}/pull/${number}` });
// Closed pull requests, most recently updated first: three tickets served in the period, one PR with no ticket, one
// closed unmerged, and one merged before the period, which ends the paging.
const PULLS = [pr(104, 13, "2026-11-22T00:00:00Z"), pr(103, null, "2026-11-21T12:00:00Z"), pr(102, 12, "2026-11-21T04:00:00Z"), pr(105, 14, null, "2026-11-21T01:00:00Z"), pr(101, 11, "2026-11-20T10:00:00Z"), pr(90, 9, "2026-10-01T00:00:00Z")];

const labeled = (name: string, at: string) => ({ createdAt: at, label: { name } });
const comment = (body: string, at: string) => ({ body, createdAt: at, authorAssociation: MEMBER });
// What GitHub's GraphQL API holds of each ticket: 11 served alone in 2 h, 12 sent back once in 4 h, 13 too long to be
// given whole (its REST read below asks the chef a question, 6 h).
const GRAPHQL: Record<number, unknown> = {
  11: { timelineItems: { pageInfo: { hasNextPage: false }, nodes: [labeled("fire", "2026-11-20T08:00:00Z")] }, comments: { pageInfo: { hasNextPage: false }, nodes: [] } },
  12: { timelineItems: { pageInfo: { hasNextPage: false }, nodes: [labeled("fire", "2026-11-21T00:00:00Z")] }, comments: { pageInfo: { hasNextPage: false }, nodes: [comment("<!-- brigade:renvoi -->\nSent back", "2026-11-21T02:00:00Z")] } },
  13: { timelineItems: { pageInfo: { hasNextPage: false }, nodes: [] }, comments: { pageInfo: { hasNextPage: true }, nodes: [] } },
};
const REST: Record<string, unknown> = {
  "/repos/benomite/brigade/issues/13/events": [{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-21T18:00:00Z" }, { event: "labeled", label: { name: "chef-todo" }, created_at: "2026-11-21T19:00:00Z" }],
  "/repos/benomite/brigade/issues/13/comments": [{ body: "<!-- brigade:todo kind=decision -->\nWhich colour?", created_at: "2026-11-21T19:00:00Z", author_association: MEMBER }],
  "/repos/benomite/brigade/issues": [],
  "/search/commits": { incomplete_results: false, items: [] },
  "/search/issues": { incomplete_results: false, total_count: 4, items: [] },
};

function github(refuse: (path: string) => boolean = () => false) {
  const paths: string[] = [];
  const appeler: CallGitHub = async (path) => {
    paths.push(path);
    if (refuse(path)) return { status: 403, data: { message: "API rate limit exceeded" } };
    const [route, query = ""] = path.split("?");
    if (route === "/repos/benomite/brigade/pulls") return { status: 200, data: new URLSearchParams(query).get("page") === "1" ? PULLS : [] };
    if (route === "/search/issues") assert.equal(new URLSearchParams(query).get("q"), `repo:${REPO} is:pr is:merged merged:2026-10-28T04:17:00Z..2026-11-27T04:17:00Z`);
    const page = new URLSearchParams(query).get("page");
    return route! in REST ? { status: 200, data: page === null || page === "1" ? REST[route!] : [] } : { status: 404, data: { message: "Not Found" } };
  };
  const graphql: QueryGitHub = async (query) => ({ repository: Object.fromEntries([...query.matchAll(/t(\d+): issue\(number: (\d+)\)/g)].map(([, alias, n]) => [`t${alias}`, GRAPHQL[Number(n)] ?? null])) });
  return { appeler, graphql, paths };
}

const output = () => join(mkdtempSync(join(tmpdir(), "autonomy-page-")), "autonomie.json");
const LIST = `https://github.com/${REPO}/pulls?q=${encodeURIComponent("is:pr is:merged merged:2026-10-28T04:17:00Z..2026-11-27T04:17:00Z")}`;

test("fixed GitHub data gives the four figures of the page, each with its value, its date and the list of its pull requests", async () => {
  const path = output();
  const { appeler, graphql, paths } = github();
  await writeTheAutonomyPage(path, { appeler, graphql, maintenant: NOW });
  const figure = (value: string) => ({ value, computedAt: "2026-11-27", url: LIST });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
    figures: { servedWithoutHuman: figure("67% (2 of 3)"), medianLeadTime: figure("4 h"), sendBackRate: figure("33% (1 of 3)"), mergedPullRequests: figure("4") },
  });
  // The tickets GraphQL gives whole are not read again by REST; the pull requests are paged once.
  assert.deepEqual(paths.filter((p) => /\/issues\/\d+\//.test(p)).map((p) => p.split("?")[0]).sort(), ["/repos/benomite/brigade/issues/13/comments", "/repos/benomite/brigade/issues/13/events"]);
  assert.equal(paths.filter((p) => p.includes("/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1")).length, 1);
  // The page renders what was written (site/autonomie.js, `rows`).
  const g: Record<string, any> = {};
  new Function("globalThis", readFileSync(join(ROOT, "site/autonomie.js"), "utf8"))(g);
  assert.equal(g.autonomie.rows(JSON.parse(readFileSync(path, "utf8")))?.length, 4);
});

test("figures that cannot be computed fail and write nothing: GitHub refuses, or no ticket was served in the period", async () => {
  for (const refuse of [(p: string) => p.startsWith("/repos/benomite/brigade/pulls"), (p: string) => p.startsWith("/search/issues"), (p: string) => p.includes("/issues/13/")]) {
    const path = output();
    writeFileSync(path, "last published");
    const { appeler, graphql } = github(refuse);
    await assert.rejects(writeTheAutonomyPage(path, { appeler, graphql, maintenant: NOW }));
    assert.equal(readFileSync(path, "utf8"), "last published");
  }
  const path = output();
  const { appeler, graphql } = github();
  await assert.rejects(writeTheAutonomyPage(path, { appeler, graphql, maintenant: new Date("2027-06-01T00:00:00Z") }), /no ticket served/);
  assert.equal(existsSync(path), false);
});

test("the lead time is written as the app writes a duration", async () => {
  const app = (await import(join(ROOT, "app/src/vue/project/delay.js"))) as { durationInClear(ms: number): string };
  for (const ms of [0, 59_000, 12 * 60_000, 2 * 3600_000, 5_220_000, 86400_000, 3 * 86400_000 + 4 * 3600_000 + 59_000]) assert.equal(durationInClear(ms), app.durationInClear(ms));
});

test("the workflow's step fails visibly with no token, and writes no file", () => {
  const path = output();
  const run = spawnSync(process.execPath, [join(ROOT, "scripts/autonomy-page/generate.ts"), path], { env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^::error::No autonomy figures: GITHUB_TOKEN is not set/m);
  assert.equal(existsSync(path), false);
});

test("pages.yml runs the generator, with the workflow's read token, before the single upload of site/", () => {
  const w = readFileSync(join(ROOT, ".github/workflows/pages.yml"), "utf8");
  const step = w.indexOf("node scripts/autonomy-page/generate.ts site/autonomie.json");
  assert.ok(step > 0 && step < w.indexOf("actions/upload-pages-artifact"));
  assert.match(w, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(w, /secrets\.(?!GITHUB_TOKEN\b)/);
  assert.doesNotMatch(w, /PLACEHOLDER|#3213 is not merged/);
  assert.doesNotMatch(readFileSync(join(ROOT, "docs/autonomie-page.md"), "utf8"), /^## Status/m);
});
