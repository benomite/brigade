// Ce que l'app demande à la station, lu par la station : un projet illisible
// n'est que le sien, un fichier illisible ne fait rien retirer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireDemande } from "../../src/projets/demande.ts";

// Tel que l'app l'écrit (app/src/projets/demande.ts).
const SHOP = {
  nom: "shop",
  depot: "acme/shop",
  base: "main",
  principale: true,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-15T12:00:00.000Z",
  demandeLe: "2026-10-15T12:01:00.000Z",
};

test("un projet demandé se lit tel que l'app l'écrit", () => {
  assert.deepEqual(lireDemande(JSON.stringify({ brigade: "projets", format: 1, projets: [SHOP] })), { projets: [SHOP], problemes: [] });
});

test("un projet demandé sans branche ni calibrage se lit : son dépôt les déclare — mais ce que l'app nomme doit être lisible", () => {
  const { base: _base, manager: _manager, reviewer: _reviewer, ...sans } = SHOP;
  assert.deepEqual(lireDemande(JSON.stringify({ brigade: "projets", format: 1, projets: [sans, { ...SHOP, nom: "nuls", base: null, manager: null, reviewer: null }] })), {
    projets: [
      { ...sans, base: null, manager: null, reviewer: null },
      { ...sans, nom: "nuls", base: null, manager: null, reviewer: null },
    ],
    problemes: [],
  });
  const lu = lireDemande(JSON.stringify({ brigade: "projets", format: 1, projets: [{ ...sans, nom: "a", base: "" }, { ...sans, nom: "b", reviewer: { modele: "gpt", effort: "high" } }] }));
  assert.deepEqual(lu?.problemes, [
    "projet « a » demandé par l'app : branche d'intégration invalide",
    "projet « b » demandé par l'app : calibrage du reviewer invalide — attendu un modèle (opus, sonnet, haiku) et un effort (low, medium, high, xhigh, max)",
  ]);
});

test("un projet illisible est dit, et les autres sont lus", () => {
  const lu = lireDemande(
    JSON.stringify({
      brigade: "projets",
      format: 1,
      projets: [
        { ...SHOP, nom: "Shop!" },
        { ...SHOP, nom: "a", depot: "pas un dépôt" },
        { ...SHOP, nom: "b", cooks: 0 },
        { ...SHOP, nom: "c", manager: { modele: "gpt", effort: "medium" } },
        { ...SHOP, nom: "d", principale: "oui" },
        SHOP,
        SHOP,
      ],
    }),
  );
  assert.deepEqual(
    lu?.projets.map(({ nom }) => nom),
    ["shop"],
  );
  assert.deepEqual(lu?.problemes, [
    "projet « Shop! » demandé par l'app : nom de projet invalide — attendu un identifiant court en minuscules, chiffres et tirets",
    "projet « a » demandé par l'app : dépôt invalide — attendu <owner>/<repo>",
    "projet « b » demandé par l'app : plafond de cooks invalide — attendu un entier, 1 ou plus",
    "projet « c » demandé par l'app : calibrage du manager invalide — attendu un modèle (opus, sonnet, haiku) et un effort (low, medium, high, xhigh, max)",
    "projet « d » demandé par l'app : on ne sait pas si cette station en est la principale",
    "projet « shop » demandé par l'app : demandé deux fois",
  ]);
});

test("un fichier illisible en entier ne se lit pas : la station n'en retire rien", () => {
  assert.equal(lireDemande("{"), null);
  assert.equal(lireDemande(JSON.stringify({ brigade: "station", projets: [] })), null);
  assert.equal(lireDemande(JSON.stringify({ brigade: "projets" })), null);
});
