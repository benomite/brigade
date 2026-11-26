// The naming gate (#4411) on the cases around its acceptance: a French file of
// the base that changes or moves, a key checked file by file, what it never
// reads, and what it does when a read fails.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commit, fixture, gate, git, write } from "./fixture.ts";

const inFixture = (body: (repo: string) => void) => () => {
  const repo = fixture();
  try {
    body(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
};

test("a French file of the base that changes is green with an English export, red on the French one it adds only", inFixture((repo) => {
  write(repo, "runtime/src/garde-fous.ts", "export const plafondDeCooks = 3;\nexport const capOfTokens = 9;\n");
  commit(repo);
  let r = gate(repo);
  assert.equal(r.code, 0, r.out);
  write(repo, "runtime/src/garde-fous.ts", "export const plafondDeCooks = 3;\nexport const capOfTokens = 9;\nexport const seuilDuDisjoncteur = 2;\n");
  commit(repo);
  r = gate(repo);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /runtime\/src\/garde-fous\.ts: exported symbol `seuilDuDisjoncteur` French word `disjoncteur`/);
  assert.doesNotMatch(r.out, /plafondDeCooks/);
  assert.doesNotMatch(r.out, /file name `garde-fous`/);
}));

test("a French file renamed to English is green, an English name renamed to French is red", inFixture((repo) => {
  git(repo, "mv", "runtime/src/garde-fous.ts", "runtime/src/guardrails.ts");
  write(repo, "runtime/src/breaker.ts", "export const drift = 1;\n");
  commit(repo);
  let r = gate(repo);
  assert.equal(r.code, 0, r.out);
  git(repo, "mv", "runtime/src/breaker.ts", "runtime/src/disjoncteur.ts");
  commit(repo);
  r = gate(repo);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /runtime\/src\/disjoncteur\.ts: file name `disjoncteur`/);
}));

test("JSON keys are checked file by file: a French key new to its file is red, the keys it had are not", inFixture((repo) => {
  write(repo, "runtime/src/sortie-ancienne.json", '{"plafond": 3, "cap": 4, "journal": []}\n');
  commit(repo);
  const r = gate(repo);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /runtime\/src\/sortie-ancienne\.json: JSON key `journal` French word `journal`/);
  assert.doesNotMatch(r.out, /JSON key `plafond`/);
}));

test("a new French directory is red; an English file in a French directory of the base is green", inFixture((repo) => {
  write(repo, "app/src/attente/queue.ts", "export const size = 1;\n");
  commit(repo);
  let r = gate(repo);
  assert.equal(r.code, 0, r.out);
  write(repo, "app/src/reglages/index.ts", "export const settings = {};\n");
  commit(repo);
  r = gate(repo);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /app\/src\/reglages: directory name `reglages`/);
}));

test("comments, strings and names that are not exported are not read", inFixture((repo) => {
  write(repo, "runtime/src/log.ts", '// Le plafond de la dérive.\nconst plafond = "en attente";\nexport const cap = plafond;\n');
  commit(repo);
  const r = gate(repo);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no new French identifier/);
}));

test("a JSON file that does not parse is red, naming it", inFixture((repo) => {
  write(repo, "runtime/src/output.json", "{ not json\n");
  commit(repo);
  const r = gate(repo);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /runtime\/src\/output\.json: JSON file `output\.json` cannot be read as JSON/);
}));

test("a base that does not exist stops the gate with exit 2, never green", inFixture((repo) => {
  const r = gate(repo, "no-such-branch");
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /cannot compare with the base `no-such-branch`/);
}));

test("a mapping that does not read stops the gate, naming the file, never green", inFixture((repo) => {
  const copy = mkdtempSync(join(tmpdir(), "gate-mapping-"));
  try {
    for (const file of ["gate.ts", "table.ts", "names.ts", "words.ts"]) cpSync(join(import.meta.dirname, "..", file), join(copy, file));
    writeFileSync(join(copy, "mapping.json"), "{ broken");
    const r = gate(repo, "main", join(copy, "gate.ts"));
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /cannot read the French → English mapping .*mapping\.json/);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}));
