// The Agents tab on the new kitchen (#4569): the agents at work, read from a fake GitHub (the `taken` and `in-pass` labels)
// alone — no command is launched on the station (#4683).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import type { AnswerGitHub, CallGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { readTheAgents } from "../../src/team-of-the-box.ts";
import { holdTheAgents } from "../../src/vue/agents/agents.js";
import { source } from "../../src/vue/agents/source.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/neuve";
const NOW = new Date("2026-11-26T12:00:00.000Z");
const HOUR = 3_600_000;
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: at(30), labels: labels.map((name) => ({ name })) });
const labeled = (name: string, hoursAgo: number) => ({ event: "labeled", label: { name }, created_at: at(hoursAgo) });

// A fake `gh`: the issues it lists, and each one's timeline.
function github(issues: object[], timelines: Record<number, object[]> = {}): CallGitHub {
  return async (path) => {
    if (path.startsWith(`/repos/${REPOSITORY}/issues?state=open`)) return ok(issues);
    if (path.startsWith(`/repos/${REPOSITORY}/pulls`)) return ok([]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (/\/pulls\/\d+$/.test(path)) return ok({ additions: 1, deletions: 0 });
    if (/\/issues\/\d+\/timeline/.test(path)) return ok(timelines[Number(/issues\/(\d+)\//.exec(path)?.[1])] ?? []);
    return { status: 404, data: { message: "Not Found" } };
  };
}

// The agents at work of a project whose GitHub holds `call`.
async function read(call: CallGitHub, cooksHere = true) {
  return readTheAgents({
    station: "box",
    cooksHere,
    board: () => readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => NOW }),
    now: () => NOW.getTime(),
  });
}

test("a cook on a `taken` ticket and the pass on an `in-pass` one are listed, with their ticket, since when and station", async () => {
  const call = github([issue(3, ["fire", "taken"]), issue(4, ["fire", "in-pass"]), issue(5, ["fire"])], { 3: [labeled("taken", 4)], 4: [labeled("in-pass", 2)] });
  assert.deepEqual((await read(call)).agents, [
    { agent: "cook", ticket: 3, since: at(4), station: "box" },
    { agent: "pass", ticket: 4, since: at(2), station: "box" },
  ]);
});

test("with no agent at work, the list is empty — and the tab says `No agent at work`, never an error", async () => {
  const { agents } = await read(github([issue(1, []), issue(2, ["fire"])]));
  assert.deepEqual(agents, []);
  assert.equal((await shown({ agents })).textContent, "No agent at work");
});

test("a project that does not cook on this computer has no station; a GitHub that cannot be read throws its reason", async () => {
  const { agents } = await read(github([issue(3, ["fire", "taken"])]), false);
  assert.deepEqual(agents.map(({ station }) => station), [null]);
  const refusing: CallGitHub = async () => ({ status: 403, data: { message: "rate limited" } });
  await assert.rejects(read(refusing), /./);
});

test("the app launches no `agents` command: team-of-the-box.ts launches nothing", () => {
  const code = readFileSync(new URL("../../src/team-of-the-box.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code.replace(/^\/\/.*$/gm, ""), /launch|facts|COMMAND/i);
});

const THE_REAL = { ...source };
afterEach(() => void Object.assign(source, THE_REAL));
async function shown(reading: unknown, project = "parade") {
  Object.assign(source, { lire: async () => reading });
  const tab = holdTheAgents({ createElement: (tag: string) => new Fake(tag) }, { maintenant: () => NOW.getTime() });
  tab.lire(project);
  for (let i = 0; i < 3; i++) await repos();
  return tab.element as unknown as Fake;
}

test("the tab lists one line per agent: kind, ticket, since when, station", async () => {
  const tab = await shown({ agents: [{ agent: "cook", ticket: 3, since: at(4), station: "box" }, { agent: "pass", ticket: 4, since: at(2), station: "box" }] });
  assert.match(tab.textContent, /cook · #3 · since 4 h 00 · on box/);
  assert.match(tab.textContent, /pass · #4 · since 2 h 00 · on box/);
  assert.equal((await shown({ agents: [{ agent: "manager", ticket: null, since: null, station: null }] })).textContent, "manager");
});

test("a reading that fails says the agents were not reached, its detail on hover; one that is not a reading says so", async () => {
  Object.assign(source, { lire: () => Promise.reject(new Error("GitHub answered HTTP 403")) });
  const tab = holdTheAgents({ createElement: (tag: string) => new Fake(tag) });
  tab.lire("parade");
  for (let i = 0; i < 3; i++) await repos();
  const element = tab.element as unknown as Fake;
  assert.match(element.textContent, /^The agents not reached\./);
  assert.match([element, ...element.descendants()].map(({ title, ariaLabel }) => `${title} ${ariaLabel}`).join(" "), /HTTP 403/);
  assert.match((await shown({ error: "boom" })).textContent, /^The agents' reading is not readable/);
});
