import assert from "node:assert/strict";
import { test } from "node:test";
import { declencheSurPr } from "../src/declencheurs.ts";

const sur = (on: string, fichiers: string[] = ["a.ts"]) => declencheSurPr(on, "v2", fichiers);

test("un workflow qui ne se lance qu'au push ne se lance pas sur une PR", () => {
  assert.equal(sur("name: publier\non:\n  push:\n    branches: [v2]\njobs:\n  x: {}\n"), false);
  assert.equal(sur("on: push\n"), false);
  assert.equal(sur("on: [push, workflow_dispatch]\n"), false);
  assert.equal(sur('"on":\n  - push\n'), false);
});

test("pull_request et pull_request_target se lisent sous toutes les formes de `on:`", () => {
  assert.equal(sur("on: pull_request\n"), true);
  assert.equal(sur("on: [push, pull_request]\n"), true);
  assert.equal(sur("on:\n  - push\n  - pull_request_target\n"), true);
  assert.equal(sur("on:\n  push:\n  pull_request:\n"), true);
  assert.equal(sur("on:\n  pull_request_target:\n    types: [opened]\n"), true);
  assert.equal(sur("on:\n  # pull_request:\n  push:\n"), false);
});

test("les filtres de branches se lisent contre la base", () => {
  assert.equal(sur("on:\n  pull_request:\n    branches: [main]\n"), false);
  assert.equal(sur("on:\n  pull_request:\n    branches:\n      - main\n      - v2\n"), true);
  assert.equal(sur("on:\n  pull_request:\n    branches: ['v*']\n"), true);
  assert.equal(sur("on:\n  pull_request:\n    branches-ignore: [v2]\n"), false);
});

test("les filtres de chemins se lisent contre les fichiers de la PR", () => {
  assert.equal(sur("on:\n  pull_request:\n    paths:\n      - 'docs/**'\n", ["runtime/a.ts"]), false);
  assert.equal(sur("on:\n  pull_request:\n    paths:\n      - 'docs/**'\n", ["docs/x/a.md"]), true);
  assert.equal(sur("on:\n  pull_request:\n    paths-ignore: ['**.md']\n", ["a.md", "docs/b.md"]), false);
  assert.equal(sur("on:\n  pull_request:\n    paths-ignore: ['**.md']\n", ["a.md", "a.ts"]), true);
});

test("dans le doute, la CI est attendue", () => {
  assert.equal(sur("jobs: {}\n"), true);
  assert.equal(sur("on: { pull_request: {} }\n"), true);
});
