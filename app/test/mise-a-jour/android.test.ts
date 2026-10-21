// The Android launch-time update check (mise-a-jour/android.ts): a manifest published as a release
// asset, read against the running version. Every failure is "no update", and never delays launch.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAtLaunch, checkForUpdate, type CheckOptions } from "../../src/mise-a-jour/android.ts";

const manifest = (over: Record<string, unknown> = {}) => ({
  version: "1.4.0",
  versionCode: 14,
  apkUrl: "https://github.com/benomite/brigade/releases/download/android-v1.4.0/brigade.apk",
  notes: "Faster launch.",
  ...over,
});
const serving = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as typeof fetch;
const check = (current: string, fetcher: typeof fetch, over: Partial<CheckOptions> = {}) =>
  checkForUpdate({ currentVersion: current, fetch: fetcher, ...over });

test("a higher version gives an offer with its version, notes and apkUrl", async () => {
  assert.deepEqual(await check("1.3.0", serving(manifest())), {
    kind: "offer",
    version: "1.4.0",
    notes: "Faster launch.",
    apkUrl: "https://github.com/benomite/brigade/releases/download/android-v1.4.0/brigade.apk",
  });
});

test("versions compare by their numbers, not as text", async () => {
  assert.equal((await check("1.9.0", serving(manifest({ version: "1.10.0" })))).kind, "offer");
});

test("notes are optional", async () => {
  const { notes: _, ...sans } = manifest();
  assert.deepEqual(await check("1.3.0", serving(sans)), { kind: "offer", version: "1.4.0", notes: "", apkUrl: manifest().apkUrl });
});

test("the same version gives no update", async () => {
  assert.deepEqual(await check("1.4.0", serving(manifest())), { kind: "none" });
});

test("a lower version gives no update", async () => {
  assert.deepEqual(await check("1.5.0", serving(manifest())), { kind: "none" });
});

test("a network error gives no update, without throwing", async () => {
  assert.deepEqual(await check("1.3.0", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch), { kind: "none" });
});

test("a timeout gives no update, without throwing", async () => {
  const never = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
  assert.deepEqual(await check("1.3.0", never, { delayMs: 20 }), { kind: "none" });
});

test("a body that stalls after its headers also times out", async () => {
  const stalled = (async () => ({ ok: true, text: () => new Promise(() => {}) })) as unknown as typeof fetch;
  assert.deepEqual(await check("1.3.0", stalled, { delayMs: 20 }), { kind: "none" });
});

test("a malformed manifest gives no update, without throwing", async () => {
  for (const bad of [
    "not json {",
    "null",
    "[]",
    manifest({ version: "latest" }),
    manifest({ version: 14 }),
    manifest({ versionCode: "14" }),
    manifest({ apkUrl: "http://insecure.example/a.apk" }),
    manifest({ apkUrl: undefined }),
    manifest({ notes: 3 }),
  ]) {
    assert.deepEqual(await check("1.3.0", serving(bad)), { kind: "none" }, JSON.stringify(bad));
  }
});

test("an HTTP error gives no update", async () => {
  assert.deepEqual(await check("1.3.0", serving(manifest(), 404)), { kind: "none" });
});

test("launch proceeds while the check is slow: checkAtLaunch returns at once, the offer comes later", async () => {
  let release!: (r: Response) => void;
  const slow = (() => new Promise<Response>((resolve) => (release = resolve))) as unknown as typeof fetch;
  const offers: string[] = [];
  const heard = new Promise<void>((done) => checkAtLaunch({ currentVersion: "1.3.0", fetch: slow }, (o) => (offers.push(o.version), done())));
  assert.deepEqual(offers, []); // launch went on; nothing yet
  release(new Response(JSON.stringify(manifest())));
  await heard;
  assert.deepEqual(offers, ["1.4.0"]);
});

test("launch proceeds when the check fails: nobody is told, nothing throws", async () => {
  const offers: string[] = [];
  checkAtLaunch({ currentVersion: "1.3.0", fetch: (async () => { throw new Error("offline"); }) as typeof fetch }, (o) => offers.push(o.version));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(offers, []);
});
