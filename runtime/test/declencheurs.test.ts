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

test("un workflow planifié, déclenché à la main ou sur un tag ne se lance pas sur une PR (gadgets #1627)", () => {
  assert.equal(sur("name: drift\non:\n  schedule:\n    - cron: '0 6 * * *'\n  workflow_dispatch:\n    inputs:\n      cible:\n        description: x\n        required: false\njobs:\n  a:\n    runs-on: x\n"), false);
  assert.equal(sur("on:\n  push:\n    tags:\n      - 'v*'\n  workflow_dispatch:\n"), false);
  assert.equal(sur("on:\n  schedule:\n    - cron: '0 6 * * *'\n  pull_request:\n"), true);
});

test("un événement sans filtre écrit en ligne (`workflow_dispatch: {}`) n'est pas un workflow de PR", () => {
  assert.equal(sur('on:\n  schedule:\n    - cron: "0 6 * * 1-5"\n  workflow_dispatch: {}\n'), false);
  assert.equal(sur('on:\n  push:\n    tags:\n      - "v*.*.*"\n  workflow_dispatch: {}\n'), false);
  assert.equal(sur("on:\n  workflow_dispatch: {}\n  pull_request: { branches: [v2] }\n"), true);
});

test("seule la clé `on:` compte : ni un commentaire, ni une étape, ni le corps d'un autre événement (#1647)", () => {
  const rappel = [
    "name: Deploy reminder",
    "# GitHub signale alors un run en échec à 0 s sur CHAQUE push, pull_request compris",
    "on:",
    "  schedule:",
    '    - cron: "0 7 * * 1-5" # push pull_request',
    "  workflow_dispatch: {}",
    "jobs:",
    "  rappel:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      # un push ou une pull_request ne le lance pas",
    "      - run: echo 'on: pull_request' && echo push",
    "",
  ].join("\n");
  assert.equal(sur(rappel), false);
  // Le corps d'un événement sans PR n'est pas lu, même plié sur plusieurs lignes.
  assert.equal(sur("on:\n  workflow_dispatch:\n    inputs:\n      cible:\n        description: >-\n          un texte plié\n          sur plusieurs lignes\n  schedule:\n    - cron: '0 7 * * *'\n"), false);
  assert.equal(sur("on:\n  push:\n    tags: ['v*']\n  workflow_dispatch:\n"), false);
});

test("la forme en ligne de `on: {…}` se lit aussi", () => {
  assert.equal(sur("on: { push: { tags: ['v*'] }, workflow_dispatch: {} }\n"), false);
  assert.equal(sur("on: { schedule: [{ cron: '0 7 * * *' }] }\n"), false);
  assert.equal(sur("on: { push: { tags: ['v*'] }, pull_request: { branches: [v2] } }\n"), true);
});
