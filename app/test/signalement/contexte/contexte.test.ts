// Le contexte d'un signalement (signalement/contexte/contexte.ts) : versions, système, et seulement les lignes du
// journal qui parlent de la panne — dans le format de brigade, dans l'ordre, au plus LIGNES_MAX.
import assert from "node:assert/strict";
import { arch, release, type } from "node:os";
import { test } from "node:test";
import { contexteDuSignalement, LIGNES_MAX, type SourcesDuContexte } from "../../../src/signalement/contexte/contexte.ts";

const ligne = (seq: number, ticket: number | null, auteur = "runtime", charge: unknown = {}) =>
  [seq, "2026-10-12T10:04:00.000Z", "brigade", ticket === null ? "-" : `#${ticket}`, "cook.started", auteur, JSON.stringify(charge)].join("  ");

const sources = (journal: SourcesDuContexte["journal"]): SourcesDuContexte => ({ appVersion: "1.4.0", runtimeVersion: () => "2.7.1", journal });

test("versions et système viennent des sources de l'app", async () => {
  const contexte = await contexteDuSignalement({ ticket: 7 }, sources(() => ""));
  assert.equal(contexte.appVersion, "1.4.0");
  assert.equal(contexte.runtimeVersion, "2.7.1");
  assert.equal(contexte.system.name, type());
  assert.equal(contexte.system.release, release());
  assert.equal(contexte.system.arch, arch());
  assert.notEqual(contexte.system.version, "");
});

test("un ticket : seules ses lignes, dans l'ordre du journal", async () => {
  const texte = [ligne(3, 7), ligne(1, 7), ligne(2, 8), ligne(4, null)].join("\n");
  const { logLines } = await contexteDuSignalement({ ticket: 7 }, sources(() => texte));
  assert.deepEqual(logLines, [ligne(1, 7), ligne(3, 7)]);
});

test("une station, une passe ou une ligne d'erreur : les lignes qui les citent", async () => {
  const texte = [ligne(1, 7, "station:box-1"), ligne(2, 7, "station:box-2"), ligne(3, 8, "runtime", { pass: "pass-42" }), ligne(4, 9, "runtime", { error: "ENOSPC" })].join("\n");
  assert.deepEqual((await contexteDuSignalement({ station: "box-1" }, sources(() => texte))).logLines, [ligne(1, 7, "station:box-1")]);
  assert.deepEqual((await contexteDuSignalement({ pass: "pass-42" }, sources(() => texte))).logLines, [ligne(3, 8, "runtime", { pass: "pass-42" })]);
  assert.deepEqual((await contexteDuSignalement({ ligne: "ENOSPC" }, sources(() => texte))).logLines, [ligne(4, 9, "runtime", { error: "ENOSPC" })]);
});

test("au plus LIGNES_MAX lignes, les plus récentes", async () => {
  const texte = Array.from({ length: LIGNES_MAX + 5 }, (_, i) => ligne(i + 1, 7)).join("\n");
  const { logLines } = await contexteDuSignalement({ ticket: 7 }, sources(() => texte));
  assert.equal(logLines.length, LIGNES_MAX);
  assert.equal(logLines[0], ligne(6, 7));
  assert.equal(logLines.at(-1), ligne(LIGNES_MAX + 5, 7));
});

test("une ligne qui cite le contenu d'un fichier n'entre pas : seul le format du journal est gardé", async () => {
  const secret = "SECRET_TOKEN=abc123 (from .env)";
  const texte = [ligne(1, 7, "runtime", { note: "ok" }), secret, `${secret} #7`, `7  not-a-date  brigade  #7  x  runtime  {}`, "2  2026-10-12T10:04:00.000Z  brigade  #7  x  runtime  contenu du fichier : SECRET_TOKEN"].join("\n");
  const contexte = await contexteDuSignalement({ ligne: "SECRET_TOKEN" }, sources(() => texte));
  assert.deepEqual(contexte.logLines, []);
  assert.deepEqual((await contexteDuSignalement({ ticket: 7 }, sources(() => texte))).logLines, [ligne(1, 7, "runtime", { note: "ok" })]);
});

test("journal absent ou illisible : aucune ligne, versions et système quand même, sans exception", async () => {
  for (const journal of [() => { throw new Error("ENOENT"); }, () => Promise.reject(new Error("illisible"))]) {
    const contexte = await contexteDuSignalement({ ticket: 7 }, sources(journal));
    assert.deepEqual(contexte.logLines, []);
    assert.equal(contexte.appVersion, "1.4.0");
    assert.equal(contexte.runtimeVersion, "2.7.1");
    assert.equal(contexte.system.arch, arch());
  }
});
