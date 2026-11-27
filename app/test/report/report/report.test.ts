import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildReport, LABEL, MARKER, MAX_URL, type Report } from "../../../src/report/report/report.ts";

const REPORT: Report = {
  appVersion: "1.2.3",
  runtimeVersion: "4.5.6",
  system: "linux x64 node 26",
  failure: "the station did not answer",
};
const identity = (t: string) => t;
const decoder = (url: string) => new URL(url).searchParams;

test("l'URL cible la nouvelle issue, avec l'étiquette et le marqueur", () => {
  const { url } = buildReport(REPORT, identity);
  assert.ok(url.startsWith("https://github.com/benomite/brigade/issues/new?"));
  const p = decoder(url);
  assert.equal(p.get("labels"), LABEL);
  assert.equal(LABEL, "field-report");
  assert.ok(p.get("body")!.startsWith("Field report from the brigade app"));
  assert.ok(p.get("body")!.startsWith(MARKER));
});

test("le corps porte les versions, le système, la panne", () => {
  const { body } = buildReport(REPORT, identity);
  for (const expected of ["1.2.3", "4.5.6", "linux x64 node 26", "the station did not answer"]) {
    assert.ok(body.includes(expected), expected);
  }
});

test("tout texte libre passe par redact, titre compris", () => {
  const redact = (t: string) => t.replaceAll("SECRET", "[redacted]");
  const { title, body, url } = buildReport(
    { appVersion: "1", runtimeVersion: "2", system: "sys SECRET", failure: "boom SECRET" },
    redact,
  );
  for (const text of [title, body, decoder(url).get("title")!, decoder(url).get("body")!]) {
    assert.ok(!text.includes("SECRET"));
  }
  assert.ok(title.includes("boom [redacted]"));
  assert.ok(body.includes("sys [redacted]"));
  assert.ok(!body.includes("## Log"));
});

test("une panne démesurée tient aussi sous la limite", () => {
  const { url } = buildReport({ ...REPORT, system: "x".repeat(100), failure: "mot ".repeat(5000) }, identity);
  assert.ok(url.length <= MAX_URL);
});

test("le module n'importe aucune API réseau", () => {
  const source = readFileSync(new URL("../../../src/report/report/report.ts", import.meta.url), "utf8");
  assert.ok(!/^\s*import\b/m.test(source));
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(|node:(http|https|net|dgram)|require\(/.test(source));
});
