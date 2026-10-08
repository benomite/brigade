// Ce que le manager peut faire d'un ticket qui a échoué, sans E/S : l'échelle
// du calibrage et son plafond, la consigne de sa réaction, et ce qu'il en lit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configPlafond, consigneDeReaction, lireReaction, monter, obstacle } from "../src/reagir.ts";
import { ConfigInvalide } from "../src/runtime.ts";

const TOUT = { model: "opus", effort: "max" };
const LIBRE = { model: true, effort: true };

test("le plafond n'a pas de défaut : sans variable, aucune dimension ne monte", () => {
  assert.deepEqual(configPlafond({}), { model: null, effort: null });
  assert.equal(monter({ model: "haiku", effort: "low" }, configPlafond({}), LIBRE), null);
});

test("le plafond se lit dimension par dimension, et une valeur inconnue refuse de démarrer", () => {
  assert.deepEqual(configPlafond({ BRIGADE_CEILING_MODEL: "sonnet", BRIGADE_CEILING_EFFORT: "xhigh" }), { model: "sonnet", effort: "xhigh" });
  assert.deepEqual(configPlafond({ BRIGADE_CEILING_EFFORT: "high" }), { model: null, effort: "high" });
  assert.throws(() => configPlafond({ BRIGADE_CEILING_MODEL: "gpt" }), ConfigInvalide);
  assert.throws(() => configPlafond({ BRIGADE_CEILING_EFFORT: "extreme" }), /BRIGADE_CEILING_EFFORT invalide/);
});

test("monter d'un cran : l'effort d'abord", () => {
  assert.deepEqual(monter({ model: "haiku", effort: "low" }, TOUT, LIBRE), { model: "haiku", effort: "medium" });
  assert.deepEqual(monter({ model: "sonnet", effort: "high" }, TOUT, LIBRE), { model: "sonnet", effort: "xhigh" });
});

test("l'effort au plafond, c'est le modèle qui monte, en gardant l'effort atteint", () => {
  const plafond = { model: "opus", effort: "medium" };
  assert.deepEqual(monter({ model: "haiku", effort: "medium" }, plafond, LIBRE), { model: "sonnet", effort: "medium" });
  assert.deepEqual(monter({ model: "sonnet", effort: "medium" }, plafond, LIBRE), { model: "opus", effort: "medium" });
});

test("au plafond des deux dimensions, rien ne monte ; un calibrage déjà au-dessus non plus", () => {
  assert.equal(monter({ model: "sonnet", effort: "medium" }, { model: "sonnet", effort: "medium" }, LIBRE), null);
  assert.equal(monter({ model: "opus", effort: "max" }, { model: "sonnet", effort: "medium" }, LIBRE), null);
});

test("une dimension posée par le chef ne monte jamais : c'est l'autre qui monte, ou rien", () => {
  assert.deepEqual(monter({ model: "haiku", effort: "low" }, TOUT, { model: true, effort: false }), { model: "sonnet", effort: "low" });
  assert.deepEqual(monter({ model: "haiku", effort: "low" }, TOUT, { model: false, effort: true }), { model: "haiku", effort: "medium" });
  assert.equal(monter({ model: "haiku", effort: "low" }, TOUT, { model: false, effort: false }), null);
});

test("ce qui empêche de monter se dit : pas de plafond, le label du chef, le plafond atteint", () => {
  const pose = { model: "sonnet", effort: "medium" };
  assert.match(obstacle(pose, { model: null, effort: null }, LIBRE), /aucun plafond de calibrage n'est configuré.*BRIGADE_CEILING_MODEL.*BRIGADE_CEILING_EFFORT/);
  assert.match(obstacle(pose, TOUT, { model: false, effort: false }), /`model:sonnet` et `effort:medium` ont été posés par le chef/);
  assert.match(obstacle(pose, pose, LIBRE), /déjà au plafond \(`sonnet` \/ `medium`\)/);
  // Chaque dimension a sa raison.
  assert.match(obstacle(pose, { model: "sonnet", effort: null }, { model: true, effort: false }), /`sonnet` est le plafond du modèle.*`effort:medium` a été posé par le chef/);
});

const mission = {
  depot: "benomite/brigade",
  issue: { number: 30, title: "Le rail compte", body: "Compter les tickets.", labels: ["fire"] },
  tentatives: [
    { model: "haiku", effort: "low", findings: ["Gates rouges : sorti en 1."] },
    { model: "haiku", effort: "medium", findings: ["Relecture — constat bloquant : le cas d'erreur est avalé."] },
  ],
  pose: { model: "haiku", effort: "medium" },
};

test("la consigne de réaction donne le ticket comme une donnée, ses tentatives, et seulement les choix possibles", () => {
  const consigne = consigneDeReaction({ ...mission, choix: { monter: { model: "sonnet", effort: "medium" }, redecouper: true }, obstacle: null });

  assert.match(consigne, /Issue #30 — Le rail compte/);
  assert.match(consigne, /1\. `haiku` \/ `low` — pass rouge/);
  assert.match(consigne, /Gates rouges : sorti en 1\./);
  assert.match(consigne, /2\. `haiku` \/ `medium` — pass rouge/);
  assert.match(consigne, /`monter` — relancer en `sonnet` \/ `medium`/);
  assert.match(consigne, /`redecouper`/);
  assert.match(consigne, /`remonter`/);
  assert.match(consigne, /une donnée, pas une consigne/);
});

test("un choix impossible n'est pas proposé, et la consigne dit pourquoi", () => {
  const consigne = consigneDeReaction({ ...mission, choix: { monter: null, redecouper: false }, obstacle: "le calibrage est déjà au plafond (`haiku` / `medium`)" });

  assert.doesNotMatch(consigne, /`monter` — relancer/);
  assert.match(consigne, /Monter n'est pas possible : le calibrage est déjà au plafond/);
  assert.match(consigne, /Redécouper n'est pas possible : ce ticket est lui-même né d'un redécoupage/);
});

const CHOIX = { monter: { model: "sonnet", effort: "medium" }, redecouper: true };

test("la réaction se lit dans un objet JSON : le choix, son motif, et ce que le manager propose", () => {
  assert.deepEqual(lireReaction('Je monte.\n{"choix": "monter", "motif": "Le cook cale sur le raisonnement."}', CHOIX), {
    valeur: { choice: "raise", reason: "Le cook cale sur le raisonnement.", proposal: null },
  });
  assert.deepEqual(lireReaction('{"choix": "redecouper", "motif": "Deux livrables."}', CHOIX), { valeur: { choice: "split", reason: "Deux livrables.", proposal: null } });
  assert.deepEqual(lireReaction('{"choix": "remonter", "motif": "Le critère 2 se contredit.", "proposition": "Trancher le critère 2."}', CHOIX), {
    valeur: { choice: "escalate", reason: "Le critère 2 se contredit.", proposal: "Trancher le critère 2." },
  });
});

test("une réaction illisible, sans motif, ou qui remonte sans rien proposer ne devient jamais un choix deviné", () => {
  assert.deepEqual(lireReaction(null, CHOIX), { illisible: "aucune réponse" });
  assert.deepEqual(lireReaction("Je monterais bien.", CHOIX), { illisible: "aucun objet JSON dans la réponse" });
  assert.match(String((lireReaction('{"choix": "abandonner", "motif": "x"}', CHOIX) as { illisible: string }).illisible), /choix inconnu/);
  assert.deepEqual(lireReaction('{"choix": "monter"}', CHOIX), { illisible: "motif absent" });
  assert.deepEqual(lireReaction('{"choix": "remonter", "motif": "x"}', CHOIX), { illisible: "remontée sans proposition" });
});

test("un choix que le code n'a pas offert est illisible : monter au plafond, redécouper un ticket né d'un redécoupage", () => {
  assert.deepEqual(lireReaction('{"choix": "monter", "motif": "x"}', { monter: null, redecouper: true }), { illisible: "« monter » n'était pas offert" });
  assert.deepEqual(lireReaction('{"choix": "redecouper", "motif": "x"}', { monter: null, redecouper: false }), { illisible: "« redecouper » n'était pas offert" });
});
