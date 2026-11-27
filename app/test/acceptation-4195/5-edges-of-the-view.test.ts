// Cas limites de la vue du second (#4195) : chaque condition de « qui est attendu » et du filtre des messages, une à une.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Board } from "../../src/facts.ts";
import { blockage } from "../../src/second/blockage-of-second.ts";
import type { VueOfProject } from "../../src/second/context-of-blockage.ts";
import { dropTheVue } from "../../src/second/vue-of-project.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
const card = (ticket: number, more: Record<string, unknown>) => ({ ...base, ticket, titre: `t${ticket}`, ...more });

function dropped(cards: unknown[]): VueOfProject {
  const views = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    const board = { rail: { colonnes: [{ nom: "X", ton: "", compte: "", cartes: cards, vide: "" }], hors: [] } } as unknown as Board;
    dropTheVue("p", board, views);
    return JSON.parse(readFileSync(join(views, "p.json"), "utf8")) as VueOfProject;
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
}

test("qui est attendu : chaque raison, seule", () => {
  const vue = dropped([
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

test("« base rouge » : le rail ne dit plus la base rouge (#4509), la carte est ramenée à « in pass »", () => {
  const green = dropped([card(5, { etat: "base rouge" })]);
  assert.equal(green.rail[0]!.displayed, "in pass");
  assert.match(green.rail[0]!.waitsOn, /pass/);
});

test("le crochet : un message sans question de blocage, ou un événement de fond qui en parle, ne reçoit rien", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    writeFileSync(join(views, "p.json"), JSON.stringify({ banners: [], rail: [] }));
    assert.equal(blockage({ prompt: "bonjour" }, { nom: "p" }, views), "");
    assert.equal(blockage({}, { nom: "p" }, views), "");
    assert.equal(blockage({ prompt: "Monitor event: blocked" }, { nom: "p" }, views), "");
    assert.notEqual(blockage({ prompt: "on est bloqués ?" }, { nom: "p" }, views), "");
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});
