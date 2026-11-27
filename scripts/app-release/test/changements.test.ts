import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changements, estUnEpic, sectionPourLUtilisateur } from "../changements.ts";

const script = fileURLToPath(new URL("../changements.ts", import.meta.url));
const epic = { title: "Epic 12", headRefName: "epic/12", body: "## Done\n- x\n\n## What changes for the user\nYou can pause a project.\nIt resumes later.\n\n## Risks\nnone" };
const seul = { title: "Fix the rail", headRefName: "cook/7-github", body: "## What changes for the user\nignored" };

test("a merged PR headed epic/* is an epic", () => {
  assert.equal(estUnEpic([epic]), true);
  assert.equal(estUnEpic([seul]), false);
  assert.equal(estUnEpic([]), false);
});

test("an epic's notes are its 'What changes for the user' section, a lone ticket's its title", () => {
  assert.equal(changements([epic]), "You can pause a project.\nIt resumes later.");
  assert.equal(changements([seul]), "Fix the rail");
  assert.equal(changements([]), "");
});

test("an epic PR without the section falls back to its title", () => {
  assert.equal(sectionPourLUtilisateur("nothing"), undefined);
  assert.equal(changements([{ ...epic, body: null }]), "Epic 12");
});

test("the command reads the PR list on stdin", () => {
  const joue = (commande: string, entree: unknown) => execFileSync("node", [script, commande], { input: JSON.stringify(entree), encoding: "utf8" });
  assert.equal(joue("epic", [epic]), "true\n");
  assert.equal(joue("epic", []), "false\n");
  assert.equal(joue("notes", [seul]), "Fix the rail\n");
});
