// Le diagramme de la fiche (ticket 3773) se tire du corps de l'issue tel qu'il est écrit : la discussion lue de GitHub le
// porte sur son premier message, et lui seul — un commentaire ne pose pas de diagramme. Contre un faux `gh` en shell.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discussionDeGitHub } from "../../../src/card-github.ts";
import { extraireMermaid } from "../../../src/vue/card-diagram/card-diagram.js";
import { SANS_POSIX } from "../../aides/posix.ts";

const CORPS = "Context.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nThe rest.";

test("le corps de l'issue lu de GitHub porte sa source, d'où la fiche tire le diagramme", { skip: SANS_POSIX }, async (t) => {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-diagramme-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const issue = {
    title: "A diagram",
    state: "OPEN",
    body: CORPS,
    author: { login: "benomite" },
    createdAt: "2026-11-17T09:00:00Z",
    comments: [{ author: { login: "brigade" }, createdAt: "2026-11-17T09:05:00Z", body: "```mermaid\ngraph TD\n```" }],
  };
  writeFileSync(join(racine, "issue.json"), JSON.stringify(issue));
  const gh = join(racine, "gh");
  writeFileSync(gh, ["#!/bin/sh", `cat '${join(racine, "issue.json")}'`].join("\n"));
  chmodSync(gh, 0o755);
  const lue = await discussionDeGitHub({ gh, delaiMs: 60_000 }, "acme/kitchen", 12);
  assert.ok(!("sans" in lue));
  assert.deepEqual(lue.messages.map(({ source }) => source), [CORPS, undefined]);
  assert.equal(extraireMermaid(lue.messages.find(({ corps }) => corps === true)?.source), "flowchart LR\n  A --> B");
});
