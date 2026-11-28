// L'accueil (#870) : une ligne par projet — dite en quelques mots de l'app, sa pastille posée d'après des règles fixes, et rien
// de brut : ni commande, ni texte d'erreur. Ce qui se calcule ici ; ce que la vue en pose est dans home-vue.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdHome, lineOfProject, type ReadFacts, type ProjectOfTheHome } from "../src/home.ts";
import type { Facts } from "../src/facts.ts";

const A = "2026-10-16T12:00:00.000Z";
const PROJECT: ProjectOfTheHome = { nom: "brigade", servi: true };

const someFacts = (fields: Partial<Facts> = {}, counters: Partial<Facts["compteurs"]> = {}): Facts => ({
  etat: "ouverte",
  lu: A,
  compteurs: { rail: 4, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 2, ...counters },
  attend: [],
  ...fields,
});
const readOnes = (facts: Facts): ReadFacts => ({ a: A, faits: facts });
// Le bloc `attend` tel que `status` l'écrit (board/rail.ts, `blocAwaiting`).
const ONE = "awaiting   1 decision awaits the chef — for 2 d\n  #867  for 2 d  merge to do  Titre\nend awaiting\n";
const FIVE = "awaiting   5 decisions await the chef — the oldest for 2 d\n  #1  for 2 d  merge\nend awaiting\n";

describe("la ligne d'un projet : sa pastille, ce qui attend le chef, puis ce qui cuit", () => {
  test("rien n'attend le chef : vert, et ce qui cuit", () => {
    assert.deepEqual(lineOfProject(PROJECT, readOnes(someFacts({}, { auTravail: 1 })), undefined), { nom: "brigade", ton: "vert", dit: "1 at work", survol: `read at ${new Date(A).toLocaleTimeString("en-US")} — open it to act` });
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({}, { aLaPass: 2 })), undefined).dit, "2 at the pass");
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts()), undefined).dit, "nothing cooking, nothing waits for you");
  });

  test("une décision l'attend : jaune, combien, depuis quand — puis ce qui cuit", () => {
    const one = lineOfProject(PROJECT, readOnes(someFacts({}, { attend: 1, auTravail: 1 })), { texte: "", attend: ONE });
    assert.equal(one.ton, "jaune");
    assert.equal(one.attend, 1);
    assert.equal(one.dit, "1 decision awaits you, for 2 d · 1 at work");
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({}, { attend: 5 })), { texte: "", attend: FIVE }).dit, "5 decisions await you, for 2 d");
    // Sans `status` lu, le nombre se dit, pas depuis quand.
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({}, { attend: 5 })), undefined).dit, "5 decisions await you");
  });

  test("une lecture hors d'atteinte est rouge : la station ne répond pas", () => {
    const unreachable = lineOfProject(PROJECT, { a: A, injoignable: true }, undefined);
    assert.deepEqual([unreachable.ton, unreachable.dit], ["rouge", "station unreachable"]);
  });

  test("rien de lu n'est dit sain : gris, sans station, pas encore lu, ou une lecture que l'app ne comprend pas", () => {
    assert.equal(lineOfProject({ ...PROJECT, servi: false }, undefined, undefined).ton, "gris");
    assert.deepEqual(lineOfProject(PROJECT, undefined, undefined).dit, "first read in progress…");
    assert.equal(lineOfProject(PROJECT, { a: A, illisible: true }, undefined).ton, "gris");
  });
});

describe("l'accueil tenu : chaque lecture rend l'accueil à redessiner, rien quand il ne change pas", () => {
  test("le fichier des projets relu rend l'accueil une fois, puis rien tant qu'il ne change pas", () => {
    const held = holdHome({ projets: () => [PROJECT] });
    assert.equal(held.relire()?.projets[0]?.dit, "first read in progress…");
    assert.equal(held.relire(), undefined);
  });
});
