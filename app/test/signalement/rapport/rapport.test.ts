import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { construireRapport, ETIQUETTE, MARQUEUR, MAX_LIGNES, MAX_URL, type Rapport } from "../../../src/signalement/rapport/rapport.ts";

const RAPPORT: Rapport = {
  appVersion: "1.2.3",
  runtimeVersion: "4.5.6",
  system: "linux x64 node 26",
  failure: "the station did not answer",
  logLines: ["one", "two", "three"],
};
const identite = (t: string) => t;
const decoder = (url: string) => new URL(url).searchParams;

test("l'URL cible la nouvelle issue, avec l'étiquette et le marqueur", () => {
  const { url } = construireRapport(RAPPORT, identite);
  assert.ok(url.startsWith("https://github.com/benomite/brigade/issues/new?"));
  const p = decoder(url);
  assert.equal(p.get("labels"), ETIQUETTE);
  assert.equal(ETIQUETTE, "field-report");
  assert.ok(p.get("body")!.startsWith("Field report from the brigade app"));
  assert.ok(p.get("body")!.startsWith(MARQUEUR));
});

test("le corps porte les versions, le système, la panne et les lignes", () => {
  const { body } = construireRapport(RAPPORT, identite);
  for (const attendu of ["1.2.3", "4.5.6", "linux x64 node 26", "the station did not answer", "one", "two", "three"]) {
    assert.ok(body.includes(attendu), attendu);
  }
});

test("tout texte libre passe par redact, titre compris", () => {
  const redact = (t: string) => t.replaceAll("SECRET", "[redacted]");
  const { title, body, url } = construireRapport(
    { appVersion: "1", runtimeVersion: "2", system: "sys SECRET", failure: "boom SECRET", logLines: ["a SECRET", "b SECRET"] },
    redact,
  );
  for (const texte of [title, body, decoder(url).get("title")!, decoder(url).get("body")!]) {
    assert.ok(!texte.includes("SECRET"));
  }
  assert.ok(title.includes("boom [redacted]"));
  assert.ok(body.includes("a [redacted]") && body.includes("b [redacted]") && body.includes("sys [redacted]"));
});

test("les lignes sont plafonnées, les plus récentes gardées", () => {
  const logLines = Array.from({ length: MAX_LIGNES + 10 }, (_, i) => `l${i}`);
  const { body } = construireRapport({ ...RAPPORT, logLines }, identite);
  assert.ok(body.includes(`l${MAX_LIGNES + 9}`));
  assert.ok(!/\bl9\b/.test(body));
});

test("un très long journal tient sous la limite de l'URL, les lignes récentes d'abord", () => {
  const logLines = Array.from({ length: MAX_LIGNES }, (_, i) => `ligne ${i} ${"é&=".repeat(300)}`);
  const { url, body } = construireRapport({ ...RAPPORT, logLines }, identite);
  assert.ok(url.length <= MAX_URL, String(url.length));
  assert.ok(body.includes(`ligne ${MAX_LIGNES - 1} `));
  assert.ok(!body.includes("ligne 0 "));
  assert.ok(body.includes("the station did not answer"));
});

test("une panne démesurée tient aussi sous la limite", () => {
  const { url } = construireRapport({ ...RAPPORT, system: "x".repeat(100), failure: "mot ".repeat(5000) }, identite);
  assert.ok(url.length <= MAX_URL);
});

test("le module n'importe aucune API réseau", () => {
  const source = readFileSync(new URL("../../../src/signalement/rapport/rapport.ts", import.meta.url), "utf8");
  assert.ok(!/^\s*import\b/m.test(source));
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(|node:(http|https|net|dgram)|require\(/.test(source));
});
