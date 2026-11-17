// Le diagramme posé par le découpage porte la zone et le contexte de chaque
// ticket ; servi, un ticket y prend la classe `served`. Comme la liste, il ne
// se réécrit que quand il change : le chef qui le retire n'est pas contredit
// avant qu'un ticket bouge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT_DIAGRAMME, FIN_DIAGRAMME } from "../../src/diagramme-epique.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

const entre = (corps: string) => corps.split(DEBUT_DIAGRAMME)[1]?.split(FIN_DIAGRAMME)[0] ?? "";
const classe = (bloc: string, nom: string) => bloc.split("\n").find((ligne) => ligne.trim().startsWith("class ") && ligne.trim().endsWith(` ${nom}`))?.trim() ?? "";

test("le diagramme dit la zone et le contexte de chaque ticket, n'est pas réécrit s'il ne change pas, et marque servi le ticket servi", async (t) => {
  const c = cuisine(t, { manager: { jugement: "decoupe-tickets" }, issues: [issue(30, ["epic", "prio:2"])] });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(30, { body: "Le chef veut voir les tickets." });
  await jusqua(() => c.gh.commentaires.some(([n, corps]) => n === 30 && corps.includes(MARQUEUR_MANAGER) && /epic split into/.test(corps)));
  await jusqua(() => c.gh.ecritures.some(([n, corps]) => n === 30 && corps.includes(DEBUT_DIAGRAMME)));

  const pose = entre(c.gh.corpsDe(30));
  assert.match(pose, /t501\["#501 Le rail compte ses tickets<br\/><small>open<br\/>Le compte n'existe nulle part\.<br\/>runtime\/src\/rail\.ts<\/small>"\]/);
  assert.match(pose, /t502\["#502 La pass lit le compte<br\/><small>open<br\/>runtime\/src\/pass\.ts<\/small>"\]/);
  assert.equal(classe(pose, "open"), "class t501,t502,t503 open");

  // Le chef retire le diagramme : tant qu'aucun ticket ne bouge, il n'est pas reposé.
  const sansDiagramme = c.gh.corpsDe(30).replace(/\n*<!-- brigade-diagram:start -->[\s\S]*<!-- brigade-diagram:end -->/, "");
  c.gh.decrire(30, { body: sansDiagramme });
  const ecrites = c.gh.ecritures.length;
  await c.laisserReveiller(4);
  assert.equal(c.gh.ecritures.length, ecrites);
  assert.ok(!c.gh.corpsDe(30).includes(DEBUT_DIAGRAMME));

  // Le ticket 501 est servi : le diagramme revient, #501 servi, les autres ouverts.
  c.gh.fermeesParUnMerge.set(501, { number: 901, url: "https://github.com/acme/kitchen/pull/901", base: "main", sha: "s", state: "closed", merged: true, enRetard: false, mergeePar: null });
  const ouverte = c.gh.lire(501);
  if (ouverte) c.gh.poser({ ...ouverte, state: "closed", updatedAt: "2026-10-08T12:00:00Z" });
  await jusqua(() => classe(entre(c.gh.corpsDe(30)), "served") !== "");
  const rafraichi = entre(c.gh.corpsDe(30));
  assert.equal(classe(rafraichi, "served"), "class t501 served");
  assert.equal(classe(rafraichi, "open"), "class t502,t503 open");
  assert.match(rafraichi, /t501\["#501 Le rail compte ses tickets<br\/><small>served<br\/>/);
  assert.equal(c.gh.corpsDe(30).split(DEBUT_DIAGRAMME).length, 2);
});
