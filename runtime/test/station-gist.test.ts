// The station's facts in its pairing gist (#4743): every fact of a `status.json` is in the gist file the app reads,
// written when a fact changes, no more often than every few minutes.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Status } from "../src/operator-status.ts";
import { createHash } from "node:crypto";
import { FILE_LOCAL, FILE_PAIRING, FILE_STATION, gistPublisher, HEARTBEAT_MS, MIN_GAP_MS, stationDocument } from "../src/station-gist.ts";

const window = { limit: 5000, remaining: 4321, resetsAt: "2026-11-27T13:00:00.000Z" };
const STATUS: Status = {
  version: "1.7.2",
  since: "2026-11-27T08:00:00.000Z",
  updatedAt: "2026-11-27T12:00:00.000Z",
  projects: ["alpha", "beta"],
  cooks: [{ project: "alpha", issue: 7, since: "2026-11-27T11:30:00.000Z" }],
  update: { installed: "1.7.2", available: "1.7.3", frozen: false, held: "a cook is running", checkedAt: "2026-11-27T11:55:00.000Z", last: { result: "rolled-back", version: "1.7.1", at: "2026-11-26T09:00:00.000Z" } },
  quota: { core: window, graphql: null },
  refusal: "gamma: no agent launched: no sandbox",
  refused: { gamma: "no agent launched: no sandbox" },
};

test("the gist file holds version, start, projects, cooks, last update, quota and refusal", () => {
  const document = JSON.parse(stationDocument(STATUS, { name: "box", machine: "Linux 6.1" }));
  assert.equal(document.brigade, "station");
  assert.equal(document.nom, "box");
  assert.equal(document.version, "1.7.2");
  assert.deepEqual(document.projets, ["alpha", "beta"]);
  assert.equal(document.signeDeVie, STATUS.updatedAt);
  assert.deepEqual(document.status, STATUS);
});

test("it is written when a fact changes, at most every few minutes, and as a heartbeat otherwise", async () => {
  const station = mkdtempSync(join(tmpdir(), "gist-"));
  const calls: string[][] = [];
  const bodies: string[] = [];
  let time = 1_000_000;
  const gh = async (args: string[], input?: string) => {
    if (args[1] !== "-X") return JSON.stringify({ files: {} });
    calls.push(args);
    bodies.push(input ?? "");
    return JSON.stringify({ id: "g42" });
  };
  const publish = gistPublisher(station, gh, { name: "box", machine: "Linux 6.1", now: () => time });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  publish(STATUS);
  await settle();
  assert.deepEqual(calls[0]?.slice(0, 3), ["api", "-X", "POST"]);
  assert.equal(JSON.parse(readFileSync(join(station, FILE_LOCAL), "utf8")).gist, "g42");
  const written = JSON.parse(JSON.parse(bodies[0] as string).files[FILE_STATION].content);
  assert.deepEqual(written.status, STATUS);

  time += MIN_GAP_MS;
  publish({ ...STATUS, updatedAt: "later", quota: { core: { ...window, remaining: 1 }, graphql: null } });
  await settle();
  assert.equal(calls.length, 1, "nothing changed but the quota: no write");

  time += 1;
  publish({ ...STATUS, cooks: [] });
  await settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]?.slice(0, 4), ["api", "-X", "PATCH", "/gists/g42"]);

  time += 1_000;
  publish({ ...STATUS, refusal: null, refused: {} });
  await settle();
  assert.equal(calls.length, 2, "changed again, but under the minimum gap");

  time += HEARTBEAT_MS;
  publish({ ...STATUS, refusal: null, refused: {} });
  await settle();
  assert.equal(calls.length, 3, "the heartbeat writes even when nothing changed");
});

test("the gist it creates is the one the app pairs: a code's fingerprint, then no code once the app wrote its file", async () => {
  const station = mkdtempSync(join(tmpdir(), "gist-"));
  const files: Record<string, { content: string }> = {};
  const said: string[] = [];
  let time = 1_000_000;
  const gh = async (args: string[], input?: string) => {
    if (args[1] === "-X") Object.assign(files, (JSON.parse(input as string) as { files: typeof files }).files);
    return JSON.stringify(args[2] === "POST" ? { id: "g42" } : { files });
  };
  const publish = gistPublisher(station, gh, { name: "box", machine: "Linux 6.1", now: () => time, say: (line) => said.push(line) });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  publish(STATUS);
  await settle();
  const code = /code in the app: (\w{8})/.exec(said.join("\n"))?.[1] as string;
  assert.ok(code, "the code is in the log");
  const shown = JSON.parse(files[FILE_STATION]?.content as string);
  assert.equal(shown.appairage.empreinte, createHash("sha256").update(code).digest("hex"));
  assert.ok(!(FILE_PAIRING in files) && !files[FILE_STATION]?.content.includes(code), "the code itself is never published");

  files[FILE_PAIRING] = { content: JSON.stringify({ appaireeLe: "2026-11-27T12:01:00.000Z", empreinte: shown.appairage.empreinte }) };
  time += MIN_GAP_MS + HEARTBEAT_MS;
  publish(STATUS);
  await settle();
  assert.equal(JSON.parse(files[FILE_STATION]?.content as string).appairage, null, "paired: no code shown");
  assert.ok(files[FILE_PAIRING], "the app's file is left alone");
  assert.equal(JSON.parse(readFileSync(join(station, FILE_LOCAL), "utf8")).paired, true);
});
