// Cas limites de la vue du second (#4195) : chaque condition de « qui est attendu » et du filtre des messages, une à une.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Tableau } from "../../src/facts.ts";
import { blockage } from "../../src/second/blockage-du-second.ts";
import type { VueDuProject } from "../../src/second/context-du-blockage.ts";
import { deposerLaVue } from "../../src/second/vue-du-project.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
const card = (ticket: number, plus: Record<string, unknown>) => ({ ...base, ticket, titre: `t${ticket}`, ...plus });

function deposee(cards: unknown[], alerts: unknown[] = []): VueDuProject {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    const tableau = { rail: { colonnes: [{ nom: "X", ton: "", compte: "", cartes: cards, vide: "" }], hors: [] }, alertesDuRail: alerts } as unknown as Tableau;
    deposerLaVue("p", tableau, vues);
    return JSON.parse(readFileSync(join(vues, "p.json"), "utf8")) as VueDuProject;
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
}

test("qui est attendu : chaque raison, seule", () => {
  const vue = deposee([
    card(1, { etat: "todo", attendu: true }),
    card(2, { etat: "todo", question: true }),
    card(3, { etat: "waiting", enWaiting: true }),
    card(4, { etat: "waiting", relancePassee: true }),
    card(5, { etat: "base rouge" }),
    card(6, { etat: "in pass" }),
    card(7, { etat: "queued" }),
    card(8, { etat: "en attente" }),
    card(9, { etat: "autre" }),
  ]);
  const awaiting = (n: number) => vue.rail.find((c) => c.number === n)!.waitsOn;
  assert.match(awaiting(1), /chef/);
  assert.match(awaiting(2), /chef/);
  assert.match(awaiting(3), /station/);
  assert.match(awaiting(4), /chef/);
  assert.match(awaiting(6), /pass/);
  assert.match(awaiting(7), /kitchen/);
  assert.match(awaiting(8), /kitchen/);
  assert.match(awaiting(9), /third party/);
});

test("« base rouge » : attendu tel quel quand le rail dit la base rouge, sinon ramené à « in pass »", () => {
  const red = deposee([card(5, { etat: "base rouge" })], [{ sorte: "base-rouge", geree: null, fait: {}, phrase: "main is red" }]);
  assert.equal(red.rail[0]!.waitsOn, "main to be green");
  assert.equal(red.rail[0]!.displayed, "base rouge");
  const verte = deposee([card(5, { etat: "base rouge" })]);
  assert.equal(verte.rail[0]!.displayed, "in pass");
  assert.match(verte.rail[0]!.waitsOn, /pass/);
});

test("le crochet : un message sans question de blocage, ou un événement de fond qui en parle, ne reçoit rien", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    writeFileSync(join(vues, "p.json"), JSON.stringify({ banners: [], rail: [] }));
    assert.equal(blockage({ prompt: "bonjour" }, { nom: "p" }, vues), "");
    assert.equal(blockage({}, { nom: "p" }, vues), "");
    assert.equal(blockage({ prompt: "Monitor event: blocked" }, { nom: "p" }, vues), "");
    assert.notEqual(blockage({ prompt: "on est bloqués ?" }, { nom: "p" }, vues), "");
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});
