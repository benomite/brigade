import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readDrift, sayDuration, type TicketTime } from "../../src/closer-github-durees/derive.ts";

const LAST_PASS = "2026-11-01T00:00:00Z";
const MIN = 60;

// One ticket a day from `from` on, each with its own split in minutes.
const tickets = (project: string, from: string, splits: Array<{ cook: number; tests: number; ci: number; rest?: number }>, first = 1): TicketTime[] =>
  splits.map((split, index) => ({
    project,
    ticket: first + index,
    at: new Date(Date.parse(from) + index * 24 * 3600_000).toISOString(),
    seconds: (split.cook + split.tests + split.ci + (split.rest ?? 0)) * MIN,
    split: { cook: split.cook * MIN, tests: split.tests * MIN, ci: split.ci * MIN },
  }));

const repeat = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));

test("a project whose times stay stable since the last pass returns no finding", () => {
  const stable = tickets("brigade", "2026-11-01T10:00:00Z", repeat(8, (i) => ({ cook: 6 + (i % 3), tests: 2 + (i % 2), ci: 2, rest: 1 })));
  assert.deepEqual(readDrift(stable, LAST_PASS), [{ project: "brigade", tickets: 8, finding: null }]);
});

test("tests that grow are named slow tests, with the numbers they rest on", () => {
  const times = tickets("brigade", "2026-11-01T10:00:00Z", [
    ...repeat(4, () => ({ cook: 6, tests: 2, ci: 2 })),
    ...repeat(4, () => ({ cook: 6, tests: 12, ci: 2 })),
  ]);
  const [reading] = readDrift(times, LAST_PASS);
  assert.equal(reading!.finding!.cause, "slow-tests");
  assert.deepEqual(reading!.finding!.numbers, {
    since: "2026-11-01T00:00:00.000Z",
    tickets: { before: 4, after: 4 },
    medianSeconds: { before: 10 * MIN, after: 20 * MIN },
    part: "tests",
    partMedianSeconds: { before: 2 * MIN, after: 12 * MIN },
    partShare: { before: 0.2, after: 0.6 },
  });
  assert.equal(
    reading!.finding!.sentence,
    "The tests got slow: a ticket's tests went from 2 min to 12 min (20% → 60% of a ticket's time), and the median ticket from 10 min to 20 min — the first 4 tickets since 2026-11-01 against the last 4.",
  );
});

test("a cook's own work that grows is named tickets too big", () => {
  const times = tickets("brigade", "2026-11-01T10:00:00Z", [
    ...repeat(3, () => ({ cook: 8, tests: 3, ci: 1 })),
    ...repeat(3, () => ({ cook: 30, tests: 4, ci: 1 })),
  ]);
  const finding = readDrift(times, LAST_PASS)[0]!.finding!;
  assert.equal(finding.cause, "tickets-too-big");
  assert.deepEqual(finding.numbers.medianSeconds, { before: 12 * MIN, after: 35 * MIN });
  assert.deepEqual(finding.numbers.partMedianSeconds, { before: 8 * MIN, after: 30 * MIN });
  assert.match(finding.sentence, /^The tickets are too big: the cook's own work on a ticket went from 8 min to 30 min \(67% → 86% of a ticket's time\), and the median ticket from 12 min to 35 min/);
});

test("a CI that grows is named a CI drifting", () => {
  const times = tickets("brigade", "2026-11-01T10:00:00Z", [
    ...repeat(3, () => ({ cook: 6, tests: 2, ci: 2 })),
    ...repeat(3, () => ({ cook: 6, tests: 2, ci: 14 })),
  ]);
  const finding = readDrift(times, LAST_PASS)[0]!.finding!;
  assert.equal(finding.cause, "ci-drifting");
  assert.deepEqual(finding.numbers.partShare, { before: 0.2, after: 14 / 22 });
  assert.match(finding.sentence, /^The CI is drifting: a ticket's wait on its CI went from 2 min to 14 min \(20% → 64% of a ticket's time\), and the median ticket from 10 min to 22 min/);
});

test("a time that grows outside the three parts says so, rather than blaming one of them", () => {
  const times = tickets("brigade", "2026-11-01T10:00:00Z", [
    ...repeat(3, () => ({ cook: 6, tests: 2, ci: 2, rest: 1 })),
    ...repeat(3, () => ({ cook: 6, tests: 2, ci: 2, rest: 20 })),
  ]);
  assert.equal(readDrift(times, LAST_PASS)[0]!.finding!.cause, "elsewhere");
});

test("only the times after the last pass count: a drift that ended before it is not read", () => {
  // Fast tickets before the pass, then slow ones — at the pass itself, and steadily after it.
  const before = tickets("brigade", "2026-10-20T10:00:00Z", repeat(6, () => ({ cook: 6, tests: 2, ci: 2 })), 1);
  const atThePass = { ...tickets("brigade", LAST_PASS, [{ cook: 6, tests: 2, ci: 2 }], 7)[0]! };
  const after = tickets("brigade", "2026-11-01T10:00:00Z", repeat(6, () => ({ cook: 6, tests: 12, ci: 2 })), 8);
  const all = [...before, atThePass, ...after];
  assert.deepEqual(readDrift(all, LAST_PASS), [{ project: "brigade", tickets: 6, finding: null }]);
  // The same measures with no pass before: the drift is there.
  assert.equal(readDrift(all, null)[0]!.finding!.cause, "slow-tests");
  assert.equal(readDrift(all, null)[0]!.finding!.numbers.since, null);
  assert.doesNotMatch(readDrift(all, null)[0]!.finding!.sentence, / since /);
});

test("each project is read on its own, a project measured only before the pass included", () => {
  const times = [
    ...tickets("zeta", "2026-11-01T10:00:00Z", [...repeat(3, () => ({ cook: 6, tests: 2, ci: 2 })), ...repeat(3, () => ({ cook: 6, tests: 2, ci: 14 }))]),
    ...tickets("alpha", "2026-11-01T10:00:00Z", repeat(6, () => ({ cook: 6, tests: 2, ci: 2 }))),
    ...tickets("old", "2026-10-01T10:00:00Z", repeat(6, () => ({ cook: 6, tests: 2, ci: 2 }))),
  ];
  const readings = readDrift(times, new Date(LAST_PASS));
  assert.deepEqual(readings.map(({ project, tickets, finding }) => [project, tickets, finding?.cause ?? null]), [
    ["alpha", 6, null],
    ["old", 0, null],
    ["zeta", 6, "ci-drifting"],
  ]);
});

test("too few tickets, or a growth too small in seconds, is no drift", () => {
  const few = tickets("brigade", "2026-11-01T10:00:00Z", [...repeat(2, () => ({ cook: 6, tests: 2, ci: 2 })), ...repeat(2, () => ({ cook: 6, tests: 20, ci: 2 }))]);
  assert.equal(readDrift(few, LAST_PASS)[0]!.finding, null);
  const short = tickets("brigade", "2026-11-01T10:00:00Z", [...repeat(3, () => ({ cook: 0.5, tests: 0.5, ci: 0 })), ...repeat(3, () => ({ cook: 0.5, tests: 2, ci: 0 }))]);
  assert.equal(readDrift(short, LAST_PASS)[0]!.finding, null);
});

test("an unreadable measure is skipped, an unreadable last pass refused", () => {
  const times = tickets("brigade", "2026-11-01T10:00:00Z", repeat(6, () => ({ cook: 6, tests: 2, ci: 2 })));
  const broken = [...times, { ...times[0]!, ticket: 99, at: "not a date" }, { ...times[0]!, ticket: 98, seconds: Number.NaN }];
  assert.equal(readDrift(broken, LAST_PASS)[0]!.tickets, 6);
  assert.throws(() => readDrift(times, "yesterday"), /unreadable last pass/);
});

test("durations read in plain words", () => {
  assert.deepEqual([45, 120, 750, 3900].map(sayDuration), ["45 s", "2 min", "12 min 30 s", "1 h 05 min"]);
});

test("the module calls no `claude` and writes nothing to GitHub: it imports nothing", () => {
  const dir = join(import.meta.dirname, "../../src/closer-github-durees");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const source = readFileSync(join(dir, file), "utf8");
    assert.doesNotMatch(source, /^\s*import\s/m, file);
    assert.doesNotMatch(source, /\bimport\(|\brequire\(|\bfetch\(|child_process|\bspawn\b|\bexecFile\b/, file);
  }
});
