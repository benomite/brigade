import assert from "node:assert/strict";
import { test } from "node:test";
import { motsPorteurs, rangerParDirections } from "../../../src/produit/directions/classement.ts";
import type { Direction } from "../../../src/produit/directions/directions.ts";

const direction = (numero: number, titre: string, texte: string, commentaires: string[] = []): Direction => ({
  numero,
  lien: `https://github.com/acme/projet/issues/${numero}`,
  titre,
  texte,
  jusqua: null,
  commentaires: commentaires.map((texte) => ({ texte, date: "2026-11-02T09:00:00Z" })),
});

const ONBOARDING = direction(7, "Focus on onboarding", "Focus on onboarding this month.\nuntil: 2026-11-30");
type Sujet = { titre: string; contexte: string };
const SUJETS: Sujet[] = [
  { titre: "Faster pass on large diffs", contexte: "Reviews time out on diffs over 5,000 lines." },
  { titre: "Onboard a new project in one command", contexte: "Three new users gave up during onboarding last week." },
];
const ranger = (sujets: Sujet[], directions: Direction[]) => rangerParDirections(sujets, directions, ({ titre, contexte }) => `${titre}\n${contexte}`);

test("de deux sujets, celui qui sert une direction active (« onboarding ») passe premier ; sans direction active, l'ordre donné est gardé", () => {
  assert.deepEqual(
    ranger(SUJETS, [ONBOARDING]).map(({ sujet, score, directions }) => ({ titre: sujet.titre, score, directions })),
    [
      { titre: "Onboard a new project in one command", score: 1, directions: [7] },
      { titre: "Faster pass on large diffs", score: 0, directions: [] },
    ],
  );
  assert.deepEqual(
    ranger(SUJETS, []).map(({ sujet, score }) => [sujet.titre, score]),
    [
      ["Faster pass on large diffs", 0],
      ["Onboard a new project in one command", 0],
    ],
  );
});

test("à points égaux, l'ordre donné tient ; un sujet qui sert plus de mots, ou plus de directions, monte d'autant", () => {
  const installateur = direction(8, "The installer", "Make the installer explain each failure.");
  const sujets: Sujet[] = [
    { titre: "Docs typo", contexte: "A typo in the README." },
    { titre: "Installer onboarding", contexte: "The installer gives no failure message during onboarding." },
    { titre: "Onboarding checklist", contexte: "New users ask what to do first." },
    { titre: "Installer failure messages", contexte: "Each failure of the installer should say what to fix." },
  ];
  assert.deepEqual(
    ranger(sujets, [ONBOARDING, installateur]).map(({ sujet, score, directions }) => [sujet.titre, score, directions]),
    [
      ["Installer onboarding", 3, [7, 8]],
      ["Installer failure messages", 2, [8]],
      ["Onboarding checklist", 1, [7]],
      ["Docs typo", 0, []],
    ],
  );
});

test("les commentaires du chef portent la direction autant que son corps", () => {
  const precisee = direction(9, "Focus on onboarding", "Focus on onboarding.", ["Start with the installer."]);
  const sujets: Sujet[] = [
    { titre: "Faster pass", contexte: "Reviews are slow." },
    { titre: "Installer exits silently", contexte: "No message when Node is missing." },
  ];
  assert.equal(ranger(sujets, [precisee])[0]!.sujet.titre, "Installer exits silently");
});

test("les mots qui disent qu'on dirige — « focus », « this month », une date, un lien — ne portent pas de sujet", () => {
  assert.deepEqual([...motsPorteurs("Focus on onboarding this month: https://example.com/onboarding-guide.\nuntil: 2026-11-30")], ["onboard"]);
  const sujets: Sujet[] = [
    { titre: "Monthly report", contexte: "Focus the report on this month's numbers." },
    { titre: "Onboarding", contexte: "" },
  ];
  assert.deepEqual(
    ranger(sujets, [ONBOARDING]).map(({ sujet, score }) => [sujet.titre, score]),
    [
      ["Onboarding", 1],
      ["Monthly report", 0],
    ],
  );
});

test("la casse et les accents ne séparent pas deux mots", () => {
  const francaise = direction(10, "Priorité à l'accueil", "L'accueil des nouveaux projets d'abord.");
  const sujets: Sujet[] = [
    { titre: "Rapide", contexte: "" },
    { titre: "ACCUEIL plus clair", contexte: "" },
  ];
  assert.equal(ranger(sujets, [francaise])[0]!.sujet.titre, "ACCUEIL plus clair");
});
