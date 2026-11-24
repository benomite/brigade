// #4050 — the check the delivery owes: the five cases of the rail's cook roster in docs/maquettes/app/Project.dc.html
// (moving, stalled, waiting, click-through to the card, empty state), played with a fake clock.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const HTML = readFileSync(join(import.meta.dirname, "../../docs/maquettes/app/Project.dc.html"), "utf8");
const SCRIPT = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(HTML)?.[1] ?? assert.fail("no component script");
const NOW = Date.parse("2026-11-24T12:00:00.000Z");
const MIN = 60_000;

function roster(cooks?: unknown[]) {
  class Clock extends Date {
    constructor(...a: any[]) {
      super(...((a.length > 0 ? a : [NOW]) as [number]));
    }
    static now() {
      return NOW;
    }
  }
  class DCLogic {
    props: Record<string, unknown> = {};
  }
  const Component = new Function("DCLogic", "Date", `${SCRIPT}\nreturn Component;`)(DCLogic, Clock);
  const c = new Component();
  if (cooks !== undefined) c.props = { cooks };
  return c.renderVals().cookRoster as { empty: boolean; emptyLine: string; groups: { state: string; heading: string; lines: Record<string, any>[] }[] };
}
const cook = (num: string, minutesAgo: number, extra: object = {}) => ({ num, title: `T${num}`, stage: "Taken", model: "m", lastMoveAt: new Date(NOW - minutesAgo * MIN).toISOString(), ...extra });

test("roster: a moving cook, a stalled cook and a waiting cook sit in their groups with their own look", () => {
  const r = roster([cook("#1", 2), cook("#2", 5), cook("#3", 4.9), cook("#4", 1, { waiting: "pass" })]);
  assert.deepEqual(r.groups.map((g) => g.state), ["working", "waiting"]);
  const [moving, stalled, justBefore] = [r.groups[0]!.lines[0]!, r.groups[0]!.lines[1]!, r.groups[0]!.lines[2]!];
  assert.equal(moving.since, "2 min");
  assert.equal(moving.stalled, false);
  assert.equal(stalled.stalled, true, "exactly 5 minutes is stalled");
  assert.equal(justBefore.stalled, false, "4 min 54 s is still moving");
  assert.notEqual(moving.dot, stalled.dot);
  assert.notEqual(moving.opacity, stalled.opacity);
  assert.equal(r.groups[1]!.lines[0]!.stalled, false, "a waiting cook is not stalled");
});

test("roster: a line links to its own ticket's card", () => {
  const lines = roster([cook("#2894", 1), cook("#2873", 1)]).groups[0]!.lines;
  assert.deepEqual(lines.map((l) => l.href), ["#ticket-2894", "#ticket-2873"]);
});

test("roster: with no cook at work one line says so; the mock data shows cooks", () => {
  const r = roster([]);
  assert.equal(r.empty, true);
  assert.equal(r.groups.length, 0);
  assert.match(r.emptyLine, /cook/i);
  assert.equal(roster().empty, false);
});
