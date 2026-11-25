// #4121 : le tableau que l'app dessine devient la vue que le second lit — déposée, relue par le crochet, bandeaux et carte avant le reste.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { VueDuProjet } from "../../src/second/contexte-du-blocage.ts";
import type { Tableau } from "../../src/faits.ts";
import { blocage } from "../../src/second/blocage-du-second.ts";
import { deposerLaVue } from "../../src/second/vue-du-projet.ts";

const carte = { ticket: 221, etat: "queued", titre: "Espace: sync the board", ligne: "ready, waits for a place in the kitchen", ouvrable: true, attendu: false, attend: [], fiche: {}, dit: [] };
// La vue que l'app dépose pour ce tableau, relue du fichier.
function vueDeposee(t: Tableau): VueDuProjet {
  const vues = mkdtempSync(join(tmpdir(), "vue-4121-lue-"));
  try {
    deposerLaVue("espace", t, vues);
    return JSON.parse(readFileSync(join(vues, "espace.json"), "utf8")) as VueDuProjet;
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
}

const tableau = {
  arretCuisine: { cause: { kind: "unknown" }, since: "2026-11-24T10:00:00Z" },
  alertesDuRail: [{ sorte: "aucun-cook", phrase: "No cook can start", fait: { depuis: "2026-11-24T10:00:00Z", ticket: 221 }, geste: "Start it on its computer", geree: null }],
  attenteDuRail: { raison: "arretee", phrase: "The station is stopped, so no cook can start.", geste: "demarrer-la-station", stations: ["box"] },
  rail: { colonnes: [{ nom: "QUEUED", ton: "", compte: "1", cartes: [carte], vide: "" }], hors: [] },
} as unknown as Tableau;

test("le tableau devient la vue : bandeaux STOPPED et FAULT #221, carte #221 affichée prête, état réel et geste", () => {
  const vue = vueDeposee(tableau);
  assert.deepEqual(vue.banners.map((b) => b.label), ["STOPPED", "FAULT #221"]);
  assert.equal(vue.rail[0]!.number, 221);
  assert.equal(vue.rail[0]!.displayed, "queued - ready, waits for a place in the kitchen");
  assert.equal(vue.rail[0]!.real, "The station is stopped, so no cook can start.");
  assert.equal(vue.rail[0]!.waitsOn, "Start it on its computer");
  assert.deepEqual(vue.gesture, { what: "Start it on its computer", by: "the chef" });
});

test("sans raison dite à la file, la carte n'a pas d'état réel différent, et sans geste la vue n'en invente pas", () => {
  const vue = vueDeposee({ ...tableau, attenteDuRail: undefined } as unknown as Tableau);
  assert.equal(vue.rail[0]!.real, vue.rail[0]!.displayed);
  assert.equal(vue.gesture, undefined);
});

test("la vue déposée par l'app est celle que le crochet rend", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4121-depot-"));
  try {
    deposerLaVue("espace", tableau, vues);
    const sortie = JSON.parse(blocage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues)) as { hookSpecificOutput: { additionalContext: string } };
    const contexte = sortie.hookSpecificOutput.additionalContext;
    assert.ok(contexte.includes("STOPPED") && contexte.includes("FAULT #221") && contexte.includes("#221 Espace: sync the board"));
    assert.ok(contexte.includes("contradicts the real state"));
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});

test("le bandeau STOPPED dit ce que l'arrêt attend selon la cause que le runtime a nommée", () => {
  const avec = (cause: unknown) => vueDeposee({ ...tableau, arretCuisine: { cause, since: "2026-11-24T10:00:00Z" } } as unknown as Tableau).banners[0]!;
  assert.deepEqual(avec({ kind: "frozen-zone", ticket: 1078, zone: "app/src" }), { label: "STOPPED", waitsFor: "frozen ticket #1078 holds the file zone app/src", waitsOn: "whoever serves #1078, or the chef who sets it free" });
  assert.deepEqual(avec({ kind: "main-red" }), { label: "STOPPED", waitsFor: "main is red", waitsOn: "the repair of main" });
  assert.deepEqual(avec({ kind: "zone-held", pr: 4077, zone: "app/src" }), { label: "STOPPED", waitsFor: "zone held by PR 4077", waitsOn: "whoever serves PR 4077, or the chef who merges or closes it" });
  assert.deepEqual(avec({ kind: "unknown" }), { label: "STOPPED", waitsFor: "the cause is unknown", waitsOn: "the chef" });
});

test("le bandeau STOPPED d'une zone tenue nomme la PR, et les autres causes ne la nomment pas (#4244)", () => {
  const avec = (cause: unknown) => vueDeposee({ ...tableau, arretCuisine: { cause, since: "2026-11-24T10:00:00Z" } } as unknown as Tableau).banners[0]!;
  const tenue = avec({ kind: "zone-held", pr: 4077, zone: "app/src" });
  assert.match(tenue.waitsFor, /zone held by PR 4077/);
  assert.match(tenue.waitsOn, /PR 4077/);
  assert.equal(avec({ kind: "main-red" }).waitsFor, "main is red");
  assert.equal(avec({ kind: "unknown" }).waitsFor, "the cause is unknown");
  for (const cause of [{ kind: "main-red" }, { kind: "unknown" }, { kind: "frozen-zone", ticket: 5, zone: "app/src" }]) {
    assert.doesNotMatch(avec(cause).waitsOn, /PR /);
    assert.doesNotMatch(avec(cause).waitsFor, /zone held by PR/);
  }
});
