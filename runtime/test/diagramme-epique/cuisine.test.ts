// Le découpage d'une épique pose le diagramme sur l'issue ; servir un ticket le rafraîchit.
// Le GitHub de test est un faux : le test lit l'appel qui met à jour le corps.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT_DIAGRAMME, FIN_DIAGRAMME } from "../../src/diagramme-epique.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

const entre = (corps: string) => corps.split(DEBUT_DIAGRAMME)[1]?.split(FIN_DIAGRAMME)[0] ?? "";

test("le découpage pose le diagramme sur l'épique, et servir un ticket le rafraîchit", async (t) => {
  const c = cuisine(t, { manager: { jugement: "decoupe-tickets" }, issues: [issue(30, ["epic", "prio:2"])] });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(30, { body: "Le chef veut voir les tickets." });
  await jusqua(() => c.gh.commentaires.some(([n, corps]) => n === 30 && corps.includes(MARQUEUR_MANAGER) && /epic split into/.test(corps)));

  await jusqua(() => c.gh.ecritures.some(([n, corps]) => n === 30 && corps.includes(DEBUT_DIAGRAMME)));
  const posee = c.gh.ecritures.filter(([n, corps]) => n === 30 && corps.includes(DEBUT_DIAGRAMME)).at(-1)?.[1] ?? "";
  assert.match(entre(posee), /```mermaid/);
  for (const numero of [501, 502, 503]) assert.match(entre(posee), new RegExp(`#${numero}`));
  assert.ok(posee.includes("Le chef veut voir les tickets."));

  // Le ticket 501 est servi : fermé par le merge de sa PR.
  c.gh.fermeesParUnMerge.set(501, { number: 901, url: "https://github.com/acme/kitchen/pull/901", base: "main", sha: "s", state: "closed", merged: true, enRetard: false, mergeePar: null });
  const ouverte = c.gh.lire(501);
  if (ouverte) c.gh.poser({ ...ouverte, state: "closed", updatedAt: "2026-10-08T12:00:00Z" });
  await jusqua(() => c.gh.ecritures.some(([n, corps]) => n === 30 && entre(corps) !== "" && entre(corps) !== entre(posee)));
  const rafraichie = c.gh.ecritures.filter(([n, corps]) => n === 30 && entre(corps) !== "" && entre(corps) !== entre(posee)).at(-1)?.[1] ?? "";
  assert.equal(rafraichie.split(DEBUT_DIAGRAMME).length, 2);
  assert.ok(rafraichie.includes("Le chef veut voir les tickets."));
});
