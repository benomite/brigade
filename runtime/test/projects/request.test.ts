// Ce que l'app demande à la station, lu par la station : un projet illisible
// n'est que le sien, un fichier illisible ne fait rien retirer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireDemande } from "../../src/projects/request.ts";

// Tel que l'app l'écrit (app/src/projects/request.ts).
const PARADE = {
  nom: "parade",
  depot: "benomite/parade",
  base: "main",
  principale: true,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-15T12:00:00.000Z",
  demandeLe: "2026-10-15T12:01:00.000Z",
};

test("un projet demandé se lit tel que l'app l'écrit", () => {
  assert.deepEqual(lireDemande(JSON.stringify({ brigade: "projets", format: 1, projets: [PARADE] })), { projets: [PARADE], problemes: [] });
});

test("un projet illisible est dit, et les autres sont lus", () => {
  const lu = lireDemande(
    JSON.stringify({
      brigade: "projets",
      format: 1,
      projets: [
        { ...PARADE, nom: "Parade!" },
        { ...PARADE, nom: "a", depot: "pas un dépôt" },
        { ...PARADE, nom: "b", cooks: 0 },
        { ...PARADE, nom: "c", manager: { modele: "gpt", effort: "medium" } },
        { ...PARADE, nom: "d", principale: "oui" },
        PARADE,
        PARADE,
      ],
    }),
  );
  assert.deepEqual(
    lu?.projets.map(({ nom }) => nom),
    ["parade"],
  );
  assert.deepEqual(lu?.problemes, [
    "projet « Parade! » demandé par l'app : nom de projet invalide — attendu un identifiant court en minuscules, chiffres et tirets",
    "projet « a » demandé par l'app : dépôt invalide — attendu <owner>/<repo>",
    "projet « b » demandé par l'app : plafond de cooks invalide — attendu un entier, 1 ou plus",
    "projet « c » demandé par l'app : calibrage du manager invalide — attendu un modèle (opus, sonnet, haiku) et un effort (low, medium, high, xhigh, max)",
    "projet « d » demandé par l'app : on ne sait pas si cette station en est la principale",
    "projet « parade » demandé par l'app : demandé deux fois",
  ]);
});

test("un fichier illisible en entier ne se lit pas : la station n'en retire rien", () => {
  assert.equal(lireDemande("{"), null);
  assert.equal(lireDemande(JSON.stringify({ brigade: "station", projets: [] })), null);
  assert.equal(lireDemande(JSON.stringify({ brigade: "projets" })), null);
});
