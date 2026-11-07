// Le rapport hebdomadaire de qualité du second au chef (#2681).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import type { Runtime } from "../src/runtime.ts";
import { partDansLesSeuils, type QualiteDuTicket } from "../src/mesure-qualite.ts";
import { brancherRapportHebdo, FICHIER_DU_RAPPORT, rapportHebdomadaire, semaineDe } from "../src/rapport-hebdo-qualite.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";

// Dix tickets, `lents` d'entre eux au-delà du seuil de 2 min de temps perdu.
const temps = (lents: number): TempsTicket[] => Array.from({ length: 10 }, (_, i) => ({ ticket: i + 1, cuisson: 300, perdu: { attente: i < lents ? 900 : 0, ratees: 0, renvois: 0 }, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));
// Dix tickets dont `premiers` livrés du premier coup.
const qualites = (premiers: number, reparations = 0) =>
  new Map<number, QualiteDuTicket>(Array.from({ length: 10 }, (_, i) => [i + 1, { renvois: i < premiers ? [] : ["tests missing"], cooksRates: 0, ...(i < reparations ? { reparation: ["ci"] } : {}) }]));
const dossierNeuf = () => mkdtempSync(join(tmpdir(), "rapport-"));
const lundi1 = new Date("2026-11-02T09:00:00Z");
const lundi2 = new Date("2026-11-09T09:00:00Z");

test("the share within thresholds counts the recent tickets at or under the max", () => {
  assert.equal(partDansLesSeuils(temps(1), 2), 0.9);
  assert.equal(partDansLesSeuils([], 2), null);
});

test("the report gives the share within thresholds, the first-try rate and the repairs per merged PR", () => {
  const envoyes: string[] = [];
  rapportHebdomadaire({ dossier: dossierNeuf(), temps: temps(1), qualites: qualites(8, 1), maintenant: lundi1, envoyer: (t) => envoyes.push(t) });
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0] ?? "", /within their time thresholds.*: 90%/);
  assert.match(envoyes[0] ?? "", /First-try rate: 80%/);
  assert.match(envoyes[0] ?? "", /Repairs of main per merged PR: 0\.10/);
  assert.doesNotMatch(envoyes[0] ?? "", /Threshold proposal/);
});

test("thresholds held at 90% while the first-try rate fell from 85% to 60%: the report proposes thresholds and says why", () => {
  const dossier = dossierNeuf();
  mkdirSync(join(dossier, ".claude/brigade"), { recursive: true });
  const avant = { semaine: "2026-W44", dansLesSeuils: 0.9, premierCoup: 0.85, reparationsParMerge: 0 };
  writeFileSync(join(dossier, FICHIER_DU_RAPPORT), JSON.stringify({ semaine: "2026-W44", historique: [avant] }));
  const texte = rapportHebdomadaire({ dossier, temps: temps(1), qualites: qualites(6), maintenant: lundi2, envoyer: () => {} }) ?? "";
  assert.match(texte, /Threshold proposal/);
  assert.match(texte, /first-try rate fell from 85% to 60%/);
  assert.match(texte, /only hold by lowering quality/);
  assert.match(texte, /premierCoupMinPourcent: 85/);
});

test("with stable or improving quality, the report has no threshold proposal", () => {
  for (const premiers of [8, 9]) {
    const dossier = dossierNeuf();
    rapportHebdomadaire({ dossier, temps: temps(1), qualites: qualites(8), maintenant: lundi1, envoyer: () => {} });
    const texte = rapportHebdomadaire({ dossier, temps: temps(1), qualites: qualites(premiers), maintenant: lundi2, envoyer: () => {} }) ?? "";
    assert.match(texte, /Weekly quality report/);
    assert.doesNotMatch(texte, /Threshold proposal/);
  }
});

test("the report goes out at most once a week: a second run in the same week sends nothing", () => {
  const dossier = dossierNeuf();
  const envoyes: string[] = [];
  const entrees = { dossier, temps: temps(0), qualites: qualites(10), envoyer: (t: string) => envoyes.push(t) };
  assert.notEqual(rapportHebdomadaire({ ...entrees, maintenant: lundi1 }), null);
  assert.equal(rapportHebdomadaire({ ...entrees, maintenant: new Date("2026-11-08T20:00:00Z") }), null);
  assert.equal(envoyes.length, 1);
  assert.notEqual(rapportHebdomadaire({ ...entrees, maintenant: lundi2 }), null);
  assert.equal(envoyes.length, 2);
});

test("a failed send is not recorded: the report is tried again", () => {
  const dossier = dossierNeuf();
  const entrees = { dossier, temps: temps(0), qualites: qualites(10), maintenant: lundi1 };
  assert.throws(() => rapportHebdomadaire({ ...entrees, envoyer: () => { throw new Error("down"); } }));
  assert.notEqual(rapportHebdomadaire({ ...entrees, envoyer: () => {} }), null);
});

test("the week is the ISO week", () => {
  assert.equal(semaineDe(new Date("2026-11-08T23:59:00Z")), "2026-W45");
  assert.equal(semaineDe(new Date("2026-11-09T00:00:00Z")), "2026-W46");
  assert.equal(semaineDe(new Date("2027-01-01T00:00:00Z")), "2026-W53");
});

test("only the week before counts: a slow slide over two months proposes nothing, a recent drop does", () => {
  const dossier = dossierNeuf();
  mkdirSync(join(dossier, ".claude/brigade"), { recursive: true });
  const semaines = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.62].map((premierCoup, i) => ({ semaine: `2026-W${37 + i}`, dansLesSeuils: 0.9, premierCoup, reparationsParMerge: 0 }));
  writeFileSync(join(dossier, FICHIER_DU_RAPPORT), JSON.stringify({ semaine: "2026-W43", historique: semaines }));
  const texte = rapportHebdomadaire({ dossier, temps: temps(1), qualites: qualites(6), maintenant: lundi2, envoyer: () => {} }) ?? "";
  assert.doesNotMatch(texte, /Threshold proposal/);
});

test("the second's pass is wired: a runtime wake-up writes the report to the journal once a week", () => {
  const clone = dossierNeuf();
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  const enregistrements = temps(1).map((t, i) => ({ ...t, mergedAt: new Date(Date.UTC(2026, 10, 2, i)).toISOString() }));
  writeFileSync(join(clone, ".claude/brigade/temps-tickets.json"), JSON.stringify(enregistrements));
  const journal = ouvrirJournal(dossierNeuf());
  let reveil = () => {};
  const runtime = { projet: "p", journal, surReveil: (f: () => void) => { reveil = f; return () => {}; } } as unknown as Runtime;
  brancherRapportHebdo(runtime, { clone, repertoireEtat: dossierNeuf(), maintenant: () => lundi1 });
  reveil();
  const dits = journal.tout().filter((e) => e.type === "quality.reported");
  journal.fermer();
  assert.equal(dits.length, 1);
  assert.match(JSON.stringify(dits[0]?.payload), /Weekly quality report — 2026-W45/);
});
