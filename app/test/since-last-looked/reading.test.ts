// "Since you last looked" (#4649): the groups and their counts, read from a fake GitHub (since-last-looked.ts), and the
// last look kept per project.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSinceLastLooked, sinceYouLastLooked, holdLastLooks, revertedTicket, type LookedGroup } from "../../src/since-last-looked.ts";
import { fakeGitHub, repositoryAround, REPOSITORY } from "./fake-github.ts";

const SINCE = new Date("2026-11-27T08:00:00.000Z");
const summary = (groups: LookedGroup[]) => groups.map(({ key, title, count, entries }) => ({ key, title, count, entries: entries.map(({ ticket, title: name, how }) => `#${ticket} ${name}${how === undefined ? "" : ` — ${how}`}`) }));

test("the three groups count every ticket that changed since the last look, and keep the three latest", async () => {
  const { call } = fakeGitHub(repositoryAround(SINCE));
  const read = await readSinceLastLooked({ depot: REPOSITORY, appeler: call, depuis: SINCE });
  assert.equal(read.since, SINCE.toISOString());
  assert.equal(read.partial, undefined);
  assert.deepEqual(summary(read.groups), [
    // #11 to #14, merged after the look (#14 by its `Closes`); #9 before it and #15 closed unmerged are not; the revert of #7 is not a merge.
    { key: "merged", title: "Merged", count: 4, entries: ["#14 Fourteen by hand", "#13 Thirteen", "#12 Twelve"] },
    // #7's revert, #21 out of tries, #20 sent back twice (one ticket); #22's send-back is from outside the repository, #23's before the look.
    { key: "sentBack", title: "Sent back or reverted", count: 3, entries: ["#7 Seven — reverted", "#21 Twenty-one — sent back", "#20 Twenty — sent back"] },
    // #32 parked again after the look, #30 parked after it; #31 before it, #33 not for the chef.
    { key: "parked", title: "Parked for you", count: 2, entries: ["#32 Thirty-two", "#30 Thirty"] },
  ]);
  for (const group of read.groups) for (const { ticket, url } of group.entries) assert.equal(url, `https://github.com/${REPOSITORY}/issues/${ticket}`);
});

test("with no change since the last look, every group is empty", async () => {
  const { call } = fakeGitHub(repositoryAround(SINCE));
  const read = await readSinceLastLooked({ depot: REPOSITORY, appeler: call, depuis: new Date(SINCE.getTime() + 3 * 3_600_000) });
  assert.deepEqual(read.groups.map(({ key, count, entries }) => [key, count, entries.length]), [["merged", 0, 0], ["sentBack", 0, 0], ["parked", 0, 0]]);
});

test("a group holds more than three tickets: its count says them all, its entries the three latest", async () => {
  const state = repositoryAround(SINCE);
  const { call } = fakeGitHub({ ...state, closed: Array.from({ length: 12 }, (_, rank) => ({ number: 200 + rank, title: `#${40 + rank} — T${rank}`, body: "", head: { ref: `cook/${40 + rank}-github` }, merged_at: new Date(SINCE.getTime() + (rank + 1) * 60_000).toISOString(), updated_at: new Date(SINCE.getTime() + (rank + 1) * 60_000).toISOString() })) });
  const read = await readSinceLastLooked({ depot: REPOSITORY, appeler: call, depuis: SINCE });
  const merged = read.groups[0];
  assert.equal(merged?.count, 12);
  assert.deepEqual(merged?.entries.map(({ ticket }) => ticket), [51, 50, 49]);
});

test("a refusal of GitHub throws, with its HTTP status", async () => {
  await assert.rejects(readSinceLastLooked({ depot: REPOSITORY, appeler: async () => ({ status: 403, data: { message: "rate limit" } }), depuis: SINCE }), /HTTP 403/);
});

test("a revert names the ticket it undid, by GitHub's revert branch or by its title", () => {
  assert.equal(revertedTicket("revert-4589-cook/4576-github", 'Revert "something"'), 4576);
  assert.equal(revertedTicket("cook/4614-github", "#4614 — Revert #4576: main is green again"), 4576);
  assert.equal(revertedTicket("revert-12-feature", 'Revert "#4576 — the wheel scrolls"'), 4576);
  assert.equal(revertedTicket("cook/11-github", "#11 — Eleven"), null);
});

test("the first opening of a project only sets the last look; the next compares with it, and a failed reading moves nothing", async () => {
  const folder = mkdtempSync(join(tmpdir(), "last-looked-"));
  try {
    const file = join(folder, "last-looked.json");
    const looks = holdLastLooks(file);
    const { call, paths } = fakeGitHub(repositoryAround(SINCE));
    const first = await sinceYouLastLooked({ projet: "parade", depot: REPOSITORY, appeler: call, looks, maintenant: () => SINCE });
    assert.deepEqual(first, { firstLook: true });
    assert.deepEqual(paths, [], "nothing is read at the first opening");
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { parade: SINCE.toISOString() });

    const later = new Date(SINCE.getTime() + 3 * 3_600_000);
    const second = await sinceYouLastLooked({ projet: "parade", depot: REPOSITORY, appeler: call, looks, maintenant: () => later });
    assert.ok("groups" in second && second.since === SINCE.toISOString());
    assert.equal(looks.get("parade")?.toISOString(), later.toISOString());

    await assert.rejects(sinceYouLastLooked({ projet: "parade", depot: REPOSITORY, appeler: async () => ({ status: 500, data: null }), looks, maintenant: () => new Date(later.getTime() + 60_000) }));
    assert.equal(looks.get("parade")?.toISOString(), later.toISOString(), "a failed reading keeps the last look");
    assert.equal(looks.get("other"), undefined, "each project has its own");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
