// Le contexte d'un signalement (report/context/context.ts) : versions, système, et seulement les lignes du
// journal qui parlent de la panne — dans le format de brigade, dans l'ordre, au plus LIGNES_MAX.
import assert from "node:assert/strict";
import { arch, release, type } from "node:os";
import { test } from "node:test";
import { contextDuReport, LINES_MAX, type SourcesDuContext } from "../../../src/report/context/context.ts";

const line = (seq: number, ticket: number | null, auteur = "runtime", charge: unknown = {}) =>
  [seq, "2026-10-12T10:04:00.000Z", "brigade", ticket === null ? "-" : `#${ticket}`, "cook.started", auteur, JSON.stringify(charge)].join("  ");

const sources = (log: SourcesDuContext["journal"]): SourcesDuContext => ({ appVersion: "1.4.0", runtimeVersion: () => "2.7.1", journal: log });

test("versions et système viennent des sources de l'app", async () => {
  const context = await contextDuReport({ ticket: 7 }, sources(() => ""));
  assert.equal(context.appVersion, "1.4.0");
  assert.equal(context.runtimeVersion, "2.7.1");
  assert.equal(context.system.name, type());
  assert.equal(context.system.release, release());
  assert.equal(context.system.arch, arch());
  assert.notEqual(context.system.version, "");
});

test("un ticket : seules ses lignes, dans l'ordre du journal", async () => {
  const texte = [line(3, 7), line(1, 7), line(2, 8), line(4, null)].join("\n");
  const { logLines } = await contextDuReport({ ticket: 7 }, sources(() => texte));
  assert.deepEqual(logLines, [line(1, 7), line(3, 7)]);
});

test("une station, une passe ou une ligne d'erreur : les lignes qui les citent", async () => {
  const texte = [line(1, 7, "station:box-1"), line(2, 7, "station:box-2"), line(3, 8, "runtime", { pass: "pass-42" }), line(4, 9, "runtime", { error: "ENOSPC" })].join("\n");
  assert.deepEqual((await contextDuReport({ station: "box-1" }, sources(() => texte))).logLines, [line(1, 7, "station:box-1")]);
  assert.deepEqual((await contextDuReport({ pass: "pass-42" }, sources(() => texte))).logLines, [line(3, 8, "runtime", { pass: "pass-42" })]);
  assert.deepEqual((await contextDuReport({ ligne: "ENOSPC" }, sources(() => texte))).logLines, [line(4, 9, "runtime", { error: "ENOSPC" })]);
});

test("au plus LIGNES_MAX lignes, les plus récentes", async () => {
  const texte = Array.from({ length: LINES_MAX + 5 }, (_, i) => line(i + 1, 7)).join("\n");
  const { logLines } = await contextDuReport({ ticket: 7 }, sources(() => texte));
  assert.equal(logLines.length, LINES_MAX);
  assert.equal(logLines[0], line(6, 7));
  assert.equal(logLines.at(-1), line(LINES_MAX + 5, 7));
});

test("une ligne qui cite le contenu d'un fichier n'entre pas : seul le format du journal est gardé", async () => {
  const secret = "SECRET_TOKEN=abc123 (from .env)";
  const texte = [line(1, 7, "runtime", { note: "ok" }), secret, `${secret} #7`, `7  not-a-date  brigade  #7  x  runtime  {}`, "2  2026-10-12T10:04:00.000Z  brigade  #7  x  runtime  contenu du fichier : SECRET_TOKEN"].join("\n");
  const context = await contextDuReport({ ligne: "SECRET_TOKEN" }, sources(() => texte));
  assert.deepEqual(context.logLines, []);
  assert.deepEqual((await contextDuReport({ ticket: 7 }, sources(() => texte))).logLines, [line(1, 7, "runtime", { note: "ok" })]);
});

test("journal absent ou illisible : aucune ligne, versions et système quand même, sans exception", async () => {
  for (const log of [() => { throw new Error("ENOENT"); }, () => Promise.reject(new Error("illisible"))]) {
    const context = await contextDuReport({ ticket: 7 }, sources(log));
    assert.deepEqual(context.logLines, []);
    assert.equal(context.appVersion, "1.4.0");
    assert.equal(context.runtimeVersion, "2.7.1");
    assert.equal(context.system.arch, arch());
  }
});
