// #4219, criterion 4: the chef answers on the card with each of the four routes; the issue ends in the state of that
// answer, with no copy-paste into the second's tab.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { repondreALaCarte } from "../../src/reponse-carte.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

const ROUTES = ["wait", "split", "resume", "close"] as const;

for (const route of ROUTES) {
  test(`the answer routed "${route}" leaves the issue in the state of that answer`, async (t) => {
    const c = cuisine(t, { manager: { jugement: "juge-decision-tiers" }, issues: [issue(30, [])] });
    chef(c.repertoire, "manager.enabled");
    await jusqua(() => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30), 10_000);

    const carte = cartesEnTodo(c.journal.base).find((x) => x.ticket === 30);
    const rang = (carte?.choix.findIndex((choix) => (choix.suite as string) === route) ?? -1) + 1;
    assert.ok(rang > 0, `the card offers an answer routed "${route}"`);
    const resultat = await repondreALaCarte(c.journal, c.gh.github, "brigade", 30, { choix: rang });
    assert.equal(resultat.done, true);

    const labels = c.gh.lire(30)?.labels ?? [];
    assert.equal(cartesEnTodo(c.journal.base).some((x) => x.ticket === 30), false);
    assert.ok(!labels.includes("decision"), "the `decision` label is gone");
    if (route === "wait") assert.ok(labels.includes("waiting"), "on hold for the third party");
    if (route === "split") assert.ok(labels.includes("epic") && !labels.includes("fire"), "split: an epic, not cooked itself");
    if (route === "resume") assert.ok(!labels.includes("waiting") && c.gh.lire(30)?.state === "open", "back to the kitchen");
    if (route === "close") assert.equal(c.gh.lire(30)?.state, "closed");
  });
}
