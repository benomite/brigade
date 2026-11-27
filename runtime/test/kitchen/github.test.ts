import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checksOf, dependsOn, ghCli, gestures, issueOfBranch, readState } from "../../src/kitchen/github.ts";
import { repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

test("a ticket waits for every ticket its body says it depends on, is blocked by, or comes after", () => {
  assert.deepEqual(dependsOn("Part of #4497. Blocked by #4481 and #4498: take it once both are merged."), [4481, 4498]);
  assert.deepEqual(dependsOn("Depends on #12\nSee #7 for context.\nAfter #3, #4."), [12, 3, 4]);
  assert.deepEqual(dependsOn("Epic: #5\nCloses #9"), []);
});

test("adding a label the repo does not have creates it and retries; a second failure is thrown", async () => {
  const known = new Set<string>();
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "label") { known.add(String(args[2])); return ""; }
    const add = args[args.indexOf("--add-label") + 1]?.split(",") ?? [];
    if (add.some((name) => !known.has(name))) throw new Error("label not found");
    return "";
  };
  await gestures(gh, "o/r").labels(7, ["parked:chef", "approved"], ["in-pass"]);
  assert.ok(known.has("approved"));
  assert.equal(calls.filter((c) => c[0] === "issue").length, 2);
  const broken = async (args: string[]) => { if (args[0] === "issue") throw new Error("boom"); return ""; };
  await assert.rejects(gestures(broken, "o/r").labels(7, ["approved"]), /boom/);
});

test("a PR whose GitHub Actions workflow still runs is pending even when every check so far is green; another app's queued suite is ignored (#4589)", () => {
  const green = { state: "SUCCESS", contexts: { nodes: [{ __typename: "CheckRun", name: "plan", status: "COMPLETED", conclusion: "SUCCESS" }] } };
  const claude = { status: "QUEUED", app: { slug: "claude" } };
  assert.deepEqual(checksOf(green, [{ status: "IN_PROGRESS", app: { slug: "github-actions" } }, claude]), { checks: "pending", failing: [] });
  assert.deepEqual(checksOf(green, [{ status: "COMPLETED", app: { slug: "github-actions" } }, claude]), { checks: "success", failing: [] });
  assert.deepEqual(checksOf(green), { checks: "success", failing: [] });
});

test("a `gh` that exits before reading its input is a failed call, not a crash of the kitchen", { skip: posixOnly("the fake gh is a #!/bin/sh script") }, async (t) => {
  const gh = join(repertoireTemporaire(t), "gh");
  writeFileSync(gh, "#!/bin/sh\necho refused >&2\nexit 1\n");
  chmodSync(gh, 0o755);
  // More than a pipe holds: the write is still pending when `gh` is gone.
  await assert.rejects(ghCli(gh, process.env)(["api", "graphql"], "x".repeat(4 * 1024 * 1024)), /gh api graphql: refused/);
});

test("readState tells a split epic and lists the epic branches; an epic branch maps to its issue (#4697)", async () => {
  const node = (number: number, labels: string[], comments: string[]) => ({ number, title: "t", body: "", authorAssociation: "OWNER", labels: { nodes: labels.map((name) => ({ name })) }, comments: { nodes: comments.map((body) => ({ body })) } });
  const answer = { data: { repository: {
    issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node(7, ["epic"], ["hello", "Split by the manager into #8."]), node(9, ["epic"], [])] },
    pullRequests: { nodes: [{ number: 50, headRefName: "epic/7", mergeable: "MERGEABLE", commits: { nodes: [] } }] },
    refs: { nodes: [{ name: "7" }] },
  } } };
  const state = await readState(async () => JSON.stringify(answer), "o/r");
  assert.deepEqual(state.issues.map((one) => one.split), [true, undefined]);
  assert.deepEqual(state.epicBranches, [7]);
  assert.equal(state.prs[0]?.issue, 7);
  assert.equal(issueOfBranch("epic/12"), "12");
  assert.equal(issueOfBranch("cook/12-github"), "12");
});
