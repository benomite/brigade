// Cas limites de la vue du second (#4195) : chaque condition de « qui est attendu » et du filtre des messages, une à une.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Tableau } from "../../src/faits.ts";
import { blocage } from "../../src/second/blocage-du-second.ts";
import type { VueDuProjet } from "../../src/second/contexte-du-blocage.ts";
import { deposerLaVue } from "../../src/second/vue-du-projet.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
const carte = (ticket: number, plus: Record<string, unknown>) => ({ ...base, ticket, titre: `t${ticket}`, ...plus });

function deposee(cartes: unknown[], alertes: unknown[] = []): VueDuProjet {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    const tableau = { rail: { colonnes: [{ nom: "X", ton: "", compte: "", cartes, vide: "" }], hors: [] }, alertesDuRail: alertes } as unknown as Tableau;
    deposerLaVue("p", tableau, vues);
    return JSON.parse(readFileSync(join(vues, "p.json"), "utf8")) as VueDuProjet;
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
}

test("qui est attendu : chaque raison, seule", () => {
  const vue = deposee([
    carte(1, { etat: "todo", attendu: true }),
    carte(2, { etat: "todo", question: true }),
    carte(3, { etat: "waiting", enWaiting: true }),
    carte(4, { etat: "waiting", relancePassee: true }),
    carte(5, { etat: "base rouge" }),
    carte(6, { etat: "in pass" }),
    carte(7, { etat: "queued" }),
    carte(8, { etat: "en attente" }),
    carte(9, { etat: "autre" }),
  ]);
  const attend = (n: number) => vue.rail.find((c) => c.number === n)!.waitsOn;
  assert.match(attend(1), /chef/);
  assert.match(attend(2), /chef/);
  assert.match(attend(3), /station/);
  assert.match(attend(4), /chef/);
  assert.match(attend(6), /pass/);
  assert.match(attend(7), /kitchen/);
  assert.match(attend(8), /kitchen/);
  assert.match(attend(9), /third party/);
});

test("« base rouge » : attendu tel quel quand le rail dit la base rouge, sinon ramené à « in pass »", () => {
  const rouge = deposee([carte(5, { etat: "base rouge" })], [{ sorte: "base-rouge", geree: null, fait: {}, phrase: "main is red" }]);
  assert.equal(rouge.rail[0]!.waitsOn, "main to be green");
  assert.equal(rouge.rail[0]!.displayed, "base rouge");
  const verte = deposee([carte(5, { etat: "base rouge" })]);
  assert.equal(verte.rail[0]!.displayed, "in pass");
  assert.match(verte.rail[0]!.waitsOn, /pass/);
});

test("la ligne de la carte s'ajoute à son état quand elle en a une", () => {
  const vue = deposee([carte(1, { etat: "cooking", ligne: "cook on box" }), carte(2, { etat: "cooking" }), carte(3, { etat: "cooking", mot: "Cooking" })]);
  assert.equal(vue.rail[0]!.displayed, "cooking - cook on box");
  assert.equal(vue.rail[1]!.displayed, "cooking");
  assert.equal(vue.rail[2]!.displayed, "Cooking");
});

test("le crochet : un message sans question de blocage, ou un événement de fond qui en parle, ne reçoit rien", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    writeFileSync(join(vues, "p.json"), JSON.stringify({ banners: [], rail: [] }));
    assert.equal(blocage({ prompt: "bonjour" }, { nom: "p" }, vues), "");
    assert.equal(blocage({}, { nom: "p" }, vues), "");
    assert.equal(blocage({ prompt: "Monitor event: blocked" }, { nom: "p" }, vues), "");
    assert.notEqual(blocage({ prompt: "on est bloqués ?" }, { nom: "p" }, vues), "");
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});
