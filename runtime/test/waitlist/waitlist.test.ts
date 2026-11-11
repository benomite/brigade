// The waiting list for cloud stations (#3271): a signup over HTTP appears in the chef's report, with the right count and date.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
// @ts-ignore: plain ESM script outside the runtime
import { createWaitlistServer } from "../../../scripts/waitlist/server.mjs";
// @ts-ignore
import { openStore } from "../../../scripts/waitlist/store.mjs";

const REPORT = join(import.meta.dirname, "../../../scripts/waitlist/report.mjs");

async function avecServeur(fn: (post: (body: string) => Promise<Response>, file: string, store: any) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "waitlist-"));
  const file = join(dir, "w.sqlite");
  const store = openStore(file);
  const server = createWaitlistServer(store, "https://benomite.github.io");
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn((body) => fetch(`${url}/signup`, { method: "POST", body }), file, store);
    // nothing readable from the site: no GET, no other route
    assert.equal((await fetch(`${url}/signup`)).status, 405);
    assert.equal((await fetch(`${url}/`)).status, 404);
    assert.equal((await fetch(`${url}/signups`)).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a signup shows in the chef's report with the count and the date; a second one is silent and adds nothing", async () => {
  await avecServeur(async (post, file, store) => {
    const before = Date.now();
    const first = await post(JSON.stringify({ email: "  Chef@Example.com " }));
    assert.equal(first.status, 200);
    const again = await post(JSON.stringify({ email: "chef@example.com" }));
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), await first.json());
    await post(JSON.stringify({ email: "other@example.org" }));
    const { count, signups } = store.list();
    assert.equal(count, 2);
    const at = Date.parse(signups[0].signedUpAt);
    assert.ok(at >= before && at <= Date.now());
    assert.deepEqual(Object.keys(signups[0]).sort(), ["email", "signedUpAt"]);
    const out = execFileSync(process.execPath, [REPORT, file], { encoding: "utf8" }).split("\n");
    assert.equal(out[0], "2 signups");
    assert.equal(out[1], `${signups[0].signedUpAt}  chef@example.com`);
  });
});

test("an empty, malformed or unreadable body is refused and stores nothing", async () => {
  await avecServeur(async (post, _file, store) => {
    for (const body of [JSON.stringify({ email: "" }), JSON.stringify({ email: "nope" }), JSON.stringify({ email: "a@b" }), JSON.stringify({}), "not json"]) {
      assert.equal((await post(body)).status, 400, body);
    }
    assert.equal(store.list().count, 0);
  });
});

test("the report refuses a path that does not exist instead of creating an empty list", () => {
  assert.throws(() => execFileSync(process.execPath, [REPORT, join(tmpdir(), "absent-waitlist.sqlite")], { stdio: "pipe" }));
});
