// #4162 : les outils du projet, la ligne `Tools:` du ticket, et ce que le cook en reçoit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDesOutils, outilsDemandes, outilsDuCook } from "../src/outils-du-cook.ts";
import { ReglageRefuse, reglagesDuTexte, texteDuFichier } from "../src/reglages-projet/reglages.ts";

const fichier = (tools: unknown) => JSON.stringify({ version: 1, integrationBranch: "main", tools });

test("projet.json declares its tools, and rewrites them as it read them", () => {
  const lus = reglagesDuTexte(fichier(["screenshots", "browser"]));
  assert.deepEqual(lus.tools, ["screenshots", "browser"]);
  assert.deepEqual(JSON.parse(texteDuFichier(lus)).tools, ["screenshots", "browser"]);
  assert.equal(reglagesDuTexte(fichier([])).tools, undefined);
});

test("projet.json refuses tools that are not a list of names, naming the key", () => {
  for (const mauvais of ["screenshots", [3], ["Screen Shots"], ["browser", "browser"]]) {
    assert.throws(() => reglagesDuTexte(fichier(mauvais)), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle.startsWith("tools"));
  }
});

test("the ticket's Tools line lists its tools, without duplicates, and ignores prose", () => {
  assert.deepEqual(outilsDemandes("## Context\n\nTools: Screenshots, `browser`, screenshots\n"), ["screenshots", "browser"]);
  assert.deepEqual(outilsDemandes("We use many tools here, see below.\n"), []);
});

test("a project without tools declares none: what the ticket needs is missing", () => {
  const resultat = outilsDuCook({ projet: { integrationBranch: "main" }, corpsDuTicket: "Tools: browser" });
  assert.deepEqual(resultat.outils, []);
  assert.deepEqual(resultat.manquants, ["browser"]);
});

test("the cook's brief hands the screenshot tool, names a missing one, and is empty without tools", () => {
  const donnee = consigneDesOutils(4162, outilsDuCook({ projet: { tools: ["screenshots", "cli"] }, corpsDuTicket: "Tools: screenshots, cli, browser" }));
  assert.match(donnee, /scripts\/capture-ecran\//);
  assert.match(donnee, /docs\/captures\/4162\//);
  assert.match(donnee, /`cli`/);
  assert.match(donnee, /Missing tool:.*`browser`/);
  assert.equal(consigneDesOutils(4162, outilsDuCook({ projet: { tools: ["screenshots"] }, corpsDuTicket: "nothing" })), "");
});
